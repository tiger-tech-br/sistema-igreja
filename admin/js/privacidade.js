async function carregar() {
    const lista = document.getElementById('lista');

    try {
        const response = await fetch('/api/privacidade/admin/solicitacoes');
        const data = await response.json();

        if (!response.ok) {
            throw new Error('Não foi possível carregar as solicitações.');
        }

        lista.replaceChildren();
        const solicitacoes = data.data || [];

        if (solicitacoes.length === 0) {
            const vazio = document.createElement('p');
            vazio.className = 'empty-state';
            vazio.textContent = 'Nenhuma solicitação de privacidade no momento.';
            lista.appendChild(vazio);
            return;
        }

        for (const item of solicitacoes) {
            const card = document.createElement('section');
            const texto = document.createElement('p');
            texto.textContent = `${item.criado_em} — ${item.tipo} — ${item.status} — ${item.nome || 'cadastro excluído'} — protocolo ${item.id}: ${item.mensagem}`;
            card.appendChild(texto);

            if (item.status === 'pendente') {
                const area = document.createElement('textarea');
                area.maxLength = 2000;
                area.placeholder = 'Providência e justificativa';

                const button = document.createElement('button');
                button.textContent = 'Concluir';
                button.addEventListener('click', async () => {
                    const r = await fetch('/api/privacidade/admin/solicitacoes/' + item.id, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ resposta: area.value })
                    });
                    const d = await r.json();
                    alert(d.message);
                    if (r.ok) carregar();
                });
                card.append(area, button);
            } else {
                const resposta = document.createElement('p');
                resposta.textContent = 'Resposta: ' + (item.resposta || '');
                card.appendChild(resposta);
            }

            lista.appendChild(card);
        }
    } catch (error) {
        lista.replaceChildren();
        const mensagem = document.createElement('p');
        mensagem.className = 'empty-state';
        mensagem.setAttribute('role', 'alert');
        mensagem.textContent = 'Não foi possível carregar as solicitações de privacidade. Atualize a página para tentar novamente.';
        lista.appendChild(mensagem);
    }
}

carregar();
