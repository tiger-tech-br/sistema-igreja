const tabela = document.getElementById('presencas');
const statusPresencas = document.getElementById('status');
const atualizar = document.getElementById('atualizar');
let carregando = false;
let sessaoExpirada = false;

async function carregarPresencas() {
    if (carregando || sessaoExpirada) return;
    carregando = true;
    atualizar.disabled = true;
    try {
        const response = await fetch('/api/membros/presencas', { cache: 'no-store' });
        if (response.status === 401) sessaoExpirada = true;
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error(result.message || 'Não foi possível carregar as presenças.');
        tabela.replaceChildren();
        for (const presenca of result.data) {
            const linha = document.createElement('tr');
            for (const valor of [presenca.nome, presenca.cargo, presenca.ministerio, presenca.data, presenca.horario]) {
                const celula = document.createElement('td');
                celula.textContent = valor || '—';
                linha.appendChild(celula);
            }
            tabela.appendChild(linha);
        }
        statusPresencas.textContent = result.data.length
            ? `${result.data.length} presença(s) registrada(s) hoje.`
            : 'Nenhuma presença registrada hoje.';
    } catch (error) {
        statusPresencas.textContent = sessaoExpirada ? 'Sessão expirada. Entre novamente.' : error.message || 'Não foi possível carregar as presenças.';
    } finally {
        carregando = false;
        atualizar.disabled = sessaoExpirada;
    }
}

atualizar.addEventListener('click', carregarPresencas);
carregarPresencas();
setInterval(() => { if (!document.hidden) carregarPresencas(); }, 15000);
