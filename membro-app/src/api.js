export class MemberApi {
  constructor(serverUrl, fetcher = (input, init) => globalThis.fetch(input, init)) {
    this.serverUrl = new URL(serverUrl).origin;
    this.fetcher = fetcher;
    this.token = null;
    this.requests = new Set();
  }

  clear() {
    this.token = null;
    for (const request of this.requests) request.abort();
    this.requests.clear();
  }

  async request(path, { method = 'GET', body, authenticated = true, signal } = {}) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    if (signal?.aborted) abort.abort();
    else signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => abort.abort(), 12000);
    this.requests.add(abort);
    try {
      const response = await this.fetcher(this.serverUrl + '/api/app-membro' + path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(authenticated ? { Authorization: `Bearer ${this.token || ''}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true || !result.data) {
        const error = new Error(result?.message || (response.status === 404 ? 'O aplicativo do membro ainda não foi disponibilizado no servidor.' : 'Não foi possível concluir a solicitação.'));
        error.status = response.status;
        const retry = Number(response.headers?.get('Retry-After'));
        if (Number.isFinite(retry) && retry > 0) error.retryAfterMs = Math.min(retry, 900) * 1000;
        throw error;
      }
      return result.data;
    } catch (error) {
      if (signal?.aborted) throw Object.assign(new Error('Solicitação cancelada.'), { name: 'AbortError' });
      if (error.name === 'AbortError') throw new Error('O servidor demorou para responder. Verifique a conexão e tente novamente.');
      if (error instanceof TypeError) throw new Error('Não foi possível acessar o servidor. Verifique a conexão.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      this.requests.delete(abort);
    }
  }

  login(email, senha, rememberMe = false) { return this.request('/login', { method: 'POST', body: { email, senha, rememberMe }, authenticated: false }); }
  refresh(refreshToken) { return this.request('/refresh', { method: 'POST', body: refreshToken ? { refreshToken } : {}, authenticated: false }); }
  logout(refreshToken) { return this.request('/logout', { method: 'POST', body: refreshToken ? { refreshToken } : {}, authenticated: false }); }
  registrationConfig(options = {}) { return this.request('/cadastro/config', { ...options, authenticated: false }); }
  registerMember(data, options = {}) { return this.request('/cadastro', { ...options, method: 'POST', body: data, authenticated: false }); }
  deleteAccount(senha, options = {}) { return this.request('/excluir-conta', { ...options, method: 'POST', body: { senha } }); }
  profile({ signal } = {}) { return this.request('/perfil', { signal }); }
  qrCode() { return this.request('/qrcode', { method: 'POST', body: {} }); }
  presence(cursor) { return this.request('/presenca?after=' + encodeURIComponent(cursor)); }
  credential() { return this.request('/credencial'); }
}
