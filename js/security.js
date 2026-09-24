(function () {
    const originalFetch = window.fetch.bind(window);
    let csrfToken;
    async function getToken() {
        if (csrfToken) return csrfToken;
        const response = await originalFetch('/api/csrf', { credentials: 'same-origin' });
        if (!response.ok) throw new Error('Não foi possível preparar a sessão segura.');
        csrfToken = (await response.json()).token;
        return csrfToken;
    }
    window.fetch = async function secureFetch(input, options = {}) {
        const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        const method = String(options.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
        if (url.origin === window.location.origin && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
            const headers = new Headers(options.headers || (typeof input !== 'string' ? input.headers : undefined));
            headers.set('X-CSRF-Token', await getToken());
            options = { ...options, headers, credentials: 'same-origin' };
        }
        const response = await originalFetch(input, options);
        if (response.status === 403 && !['GET', 'HEAD', 'OPTIONS'].includes(method)) csrfToken = undefined;
        return response;
    };
})();
