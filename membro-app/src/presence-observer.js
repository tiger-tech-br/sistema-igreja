const validCursor = value => typeof value === 'string' && /^(0|[1-9]\d{0,29})$/.test(value);

// Consultas somente de leitura. Uma presença antiga nunca confirma uma apresentação nova.
export class PresenceObserver {
  constructor({ read, onState = () => {}, online = () => true, schedule = setTimeout, unschedule = clearTimeout, interval = 2000 }) {
    Object.assign(this, { read, onState, online, schedule, unschedule, interval });
    this.generation = 0;
    this.enabled = false;
    this.busy = false;
    this.cursor = null;
    this.timer = null;
    this.failures = 0;
  }

  arm(cursor) {
    if (!validCursor(cursor)) throw new Error('O servidor devolveu uma confirmação de leitura inválida.');
    this.stop();
    this.cursor = cursor;
    this.enabled = true;
    this.failures = 0;
    this.queue(0);
  }

  pause() {
    this.enabled = false;
    this.clearTimer();
  }

  resume() {
    if (this.cursor === null) return;
    this.enabled = true;
    this.queue(0);
  }

  stop() {
    this.generation++;
    this.pause();
    this.cursor = null;
  }

  clearTimer() {
    if (this.timer !== null) this.unschedule(this.timer);
    this.timer = null;
  }

  queue(delay) {
    if (!this.enabled || this.busy || this.timer !== null) return;
    this.timer = this.schedule(() => { this.timer = null; this.poll(); }, delay);
  }

  async poll() {
    if (!this.enabled || this.busy || this.cursor === null) return;
    this.busy = true;
    const generation = this.generation;
    const cursor = this.cursor;
    let delay = this.interval;
    try {
      if (!this.online()) throw new Error('Sem conexão. Aguardando o servidor para confirmar a leitura.');
      const result = await this.read(cursor);
      if (!this.enabled || generation !== this.generation) return;
      if (!validCursor(result?.cursor) || typeof result.confirmed !== 'boolean' || BigInt(result.cursor) < BigInt(cursor)) throw new Error('Não foi possível conferir a confirmação desta leitura.');
      if (result.confirmed) {
        if (BigInt(result.cursor) <= BigInt(cursor) || !result.attendance || typeof result.attendance !== 'object') throw new Error('O servidor ainda não confirmou uma nova leitura.');
        this.cursor = result.cursor;
        this.pause();
        this.onState({ kind: 'confirmed', attendance: result.attendance });
      } else {
        this.failures = 0;
        this.onState({ kind: 'waiting' });
      }
    } catch (error) {
      if (!this.enabled || generation !== this.generation) return;
      if (error.status === 401 || error.status === 403) {
        this.stop();
        this.onState({ kind: 'expired', message: error.message || 'Seu acesso expirou. Entre novamente.' });
      } else {
        this.failures++;
        delay = Math.max(Math.min(this.interval * 2 ** Math.min(this.failures - 1, 4), 30000), error.retryAfterMs || 0);
        this.onState({ kind: 'error', status: error.status, message: error.message || 'Não foi possível conferir a leitura. Tentaremos novamente.' });
      }
    } finally {
      this.busy = false;
      this.queue(generation === this.generation ? delay : 0);
    }
  }
}
