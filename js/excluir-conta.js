(() => {
    if (!document.querySelector('[data-member-deletion]')) return;
    const byId = id => document.getElementById(id);
    const form = byId('formExclusao');
    const start = byId('abrirExclusao');
    const password = byId('senhaExclusao');
    const confirm = byId('confirmarExclusao');
    const cancel = byId('cancelarExclusao');
    const result = byId('resultadoExclusao');
    let submitting = false;
    let deleted = false;
    start.addEventListener('click', () => {
        start.hidden = true;
        form.hidden = false;
        result.textContent = '';
        password.focus();
    });
    cancel.addEventListener('click', () => {
        if (submitting) return;
        form.reset();
        form.hidden = true;
        start.hidden = false;
        result.textContent = '';
        start.focus();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (submitting) return;
        if (!password.value) { result.textContent = 'Informe sua senha atual.'; password.focus(); return; }
        submitting = true;
        confirm.disabled = cancel.disabled = true;
        result.textContent = 'Excluindo seu cadastro…';
        try {
            const response = await fetch('/api/privacidade/excluir-conta', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senha: password.value })
            });
            const data = await response.json();
            if (!response.ok || !data.success || data.data?.deleted !== true) throw new Error(data.message || 'Não foi possível excluir seu cadastro.');
            deleted = true;
            form.reset();
            byId('exclusaoAutenticada').hidden = true;
            byId('exclusaoLogin').hidden = true;
            byId('exclusaoConcluida').hidden = false;
            result.textContent = 'Cadastro excluído. Seu QR Code foi desativado e você saiu da conta.';
            document.dispatchEvent(new CustomEvent('member:deleted'));
        } catch (error) {
            password.value = '';
            result.textContent = error.message || 'Não foi possível acessar o servidor. Confira a conexão e tente novamente.';
            password.focus();
        } finally { submitting = false; confirm.disabled = cancel.disabled = false; }
    });
    fetch('/api/membros/sessao').then(response => response.json()).then(session => {
        if (deleted) return;
        byId('exclusaoAutenticada').hidden = !session.logado;
        byId('exclusaoLogin').hidden = Boolean(session.logado);
    }).catch(() => { result.textContent = 'Não foi possível conferir seu acesso. Atualize a página e tente novamente.'; });
})();
