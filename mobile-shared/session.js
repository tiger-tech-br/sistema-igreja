const validToken = value => typeof value === 'string' && /^rs1\.[A-Za-z0-9_-]{43}$/.test(value);

// Android stores the secret through Keystore. Browsers keep only a non-secret
// marker here; their refresh credential is held in a server HttpOnly cookie.
export class SavedSession {
  constructor({ app, serverUrl, native = false, secure, storage, now = () => Date.now() }) {
    if (!['leitor', 'membro'].includes(app)) throw new Error('Aplicativo inválido.');
    this.app = app;
    this.serverUrl = new URL(serverUrl).origin;
    this.native = native;
    this.secure = secure;
    this.storage = storage;
    this.now = now;
    this.key = `igreja.${app}.remember.v1`;
    this.pending = Promise.resolve();
  }

  serialize(action) {
    const operation = this.pending.then(action);
    this.pending = operation.catch(() => {});
    return operation;
  }

  browserStorage() {
    return this.storage || globalThis.localStorage;
  }

  async removeRecord() {
    if (this.native) await this.secure.remove();
    else this.browserStorage().removeItem(this.key);
  }

  load() {
    return this.serialize(async () => {
      const raw = this.native ? (await this.secure.get()).value : this.browserStorage().getItem(this.key);
      if (!raw) return null;
      let record;
      try { record = JSON.parse(raw); } catch { await this.removeRecord(); return null; }
      const expiration = new Date(record?.refreshExpiresAt).getTime();
      if (record?.version !== 1 || record.app !== this.app || record.serverUrl !== this.serverUrl ||
          !Number.isFinite(expiration) || expiration <= this.now() ||
          (this.native && !validToken(record.refreshToken))) {
        await this.removeRecord();
        return null;
      }
      return {
        refreshExpiresAt: record.refreshExpiresAt,
        ...(this.native ? { refreshToken: record.refreshToken } : {})
      };
    });
  }

  save(access) {
    return this.serialize(async () => {
      const expiration = new Date(access?.refreshExpiresAt).getTime();
      if (!Number.isFinite(expiration) || expiration <= this.now() ||
          (this.native && !validToken(access.refreshToken))) {
        throw new Error('Não foi possível salvar o acesso. Entre novamente.');
      }
      const record = {
        version: 1, app: this.app, serverUrl: this.serverUrl,
        refreshExpiresAt: access.refreshExpiresAt,
        ...(this.native ? { refreshToken: access.refreshToken } : {})
      };
      try {
        const value = JSON.stringify(record);
        if (this.native) await this.secure.set({ value });
        else this.browserStorage().setItem(this.key, value);
      } catch {
        throw new Error('Não foi possível salvar o acesso neste aparelho. Tente novamente ou desmarque Mantenha-me conectado.');
      }
      return { refreshExpiresAt: record.refreshExpiresAt, ...(this.native ? { refreshToken: record.refreshToken } : {}) };
    });
  }

  clear() {
    return this.serialize(() => this.removeRecord());
  }
}
