export class ReaderApi {
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

  async request(path, body, authenticated = false, { method = 'POST' } = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 10000);
    this.requests.add(abort);
    try {
      const response = await this.fetcher(this.serverUrl + path, {
        method, credentials: 'same-origin', cache: 'no-store', signal: abort.signal,
        headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}), ...(authenticated ? { Authorization: `Bearer ${this.token || ''}` } : {}) },
        ...(method !== 'GET' ? { body: JSON.stringify(body ?? {}) } : {})
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true || !result.data) {
        const error = new Error(result?.message || (response.status === 404 ? 'O servidor ainda não disponibilizou o leitor. Verifique a atualização do sistema.' : 'Não foi possível concluir a solicitação.'));
        error.status = response.status;
        throw error;
      }
      return result.data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(method === 'GET' ? 'O servidor demorou para atualizar a conexão. Tente novamente.' : 'A resposta demorou. A presença pode ter sido recebida; tente novamente para confirmar sem duplicar.');
      if (error instanceof TypeError) throw new Error('Não foi possível acessar o servidor. Verifique a conexão.');
      throw error;
    } finally {
      clearTimeout(timer);
      this.requests.delete(abort);
    }
  }

  login(email, senha, rememberMe = false) { return this.request('/api/leitor/login', { email, senha, rememberMe }); }
  refresh(refreshToken) { return this.request('/api/leitor/refresh', refreshToken ? { refreshToken } : {}); }
  logout(refreshToken) { return this.request('/api/leitor/logout', refreshToken ? { refreshToken } : {}); }
  register(id) { return this.request(`/api/leitor/presenca/${id}`, {}, true); }
  status() { return this.request('/api/leitor/sessao', undefined, true, { method: 'GET' }); }
}
