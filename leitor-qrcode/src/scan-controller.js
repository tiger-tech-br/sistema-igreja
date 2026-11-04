const MEMBER_ID = /^[1-9]\d{0,9}$/;

export function memberIdFromQr(raw, serverUrl) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  const value = raw.trim();
  if (value.startsWith('MEMBRO:')) {
    const id = value.slice(7).trim();
    return MEMBER_ID.test(id) ? id : null;
  }
  try {
    const base = new URL(serverUrl);
    const url = new URL(value, base);
    if (url.origin !== base.origin || url.pathname !== '/validar' || url.username || url.password || url.hash) return null;
    const ids = url.searchParams.getAll('id');
    return ids.length === 1 && MEMBER_ID.test(ids[0]) ? ids[0] : null;
  } catch { return null; }
}

// A camera permanece aberta. Somente o envio ao servidor é serializado.
export class ScanController {
  constructor({ serverUrl, register, onState = () => {}, now = Date.now, online = () => true }) {
    Object.assign(this, { serverUrl, register, onState, now, online });
    this.epoch = 0;
    this.active = false;
    this.busy = false;
    this.lastAttempt = null;
    this.lastSeen = 0;
    this.lastRaw = null;
    this.invalidAt = -Infinity;
  }

  activate() {
    this.epoch++;
    this.active = true;
    this.busy = false;
    this.lastAttempt = null;
    this.lastRaw = null;
  }

  deactivate() {
    this.epoch++;
    this.active = false;
    this.busy = false;
    this.lastRaw = null;
  }

  async read(raw, force = false) {
    if (!this.active) return 'inactive';
    const id = memberIdFromQr(raw, this.serverUrl);
    if (!id) {
      if (!this.busy && this.now() - this.invalidAt > 2000) {
        this.invalidAt = this.now();
        this.onState({ kind: 'invalid', message: 'QR Code não reconhecido. Apresente a credencial da igreja.' });
      }
      return 'invalid';
    }
    if (this.busy) {
      if (id === this.lastAttempt) this.lastSeen = this.now();
      return 'busy';
    }
    const now = this.now();
    if (!force && id === this.lastAttempt && now - this.lastSeen < 1200) {
      this.lastSeen = now;
      return 'held';
    }
    this.lastAttempt = id;
    this.lastSeen = now;
    this.lastRaw = raw;
    if (!this.online()) {
      this.onState({ kind: 'error', retryable: true, message: 'Sem conexão. A presença ainda não foi confirmada.' });
      return 'offline';
    }
    this.busy = true;
    const epoch = this.epoch;
    this.onState({ kind: 'sending', message: 'Confirmando presença…' });
    try {
      const attendance = await this.register(id);
      if (!this.active || epoch !== this.epoch) return 'stale';
      this.onState({ kind: 'confirmed', attendance });
      return 'confirmed';
    } catch (error) {
      if (!this.active || epoch !== this.epoch) return 'stale';
      if (error.status === 401) {
        this.deactivate();
        this.onState({ kind: 'expired', message: 'Seu acesso expirou. Entre novamente.' });
      } else {
        this.onState({ kind: 'error', retryable: !error.status || error.status >= 500 || error.status === 429,
          message: error.message || 'Não foi possível confirmar a presença. Tente novamente.' });
      }
      return 'error';
    } finally {
      if (epoch === this.epoch) this.busy = false;
    }
  }

  retry() { return this.lastRaw ? this.read(this.lastRaw, true) : Promise.resolve('empty'); }
}
