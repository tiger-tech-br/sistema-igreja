const btnCancelar = document.getElementById('btnCancelar');
const btnIniciarScanner = document.getElementById('btnIniciarScanner');
const scannerEmbutido = document.body?.dataset.inlineScanner === 'true';
const html5QrCode = typeof Html5Qrcode === 'function' ? new Html5Qrcode('reader') : null;
const config = {
    fps: 10,
    qrbox: (width, height) => {
        const size = Math.min(250, Math.floor(Math.min(width, height) * .75));
        return { width: size, height: size };
    }
};
let processandoLeitura = false;
let iniciandoScanner = false;
let cameraSolicitada = false;
let cameraSelecionada = null;
let retomarLeitura;

function abrirPagina(url) { window.location.href = url; }

function mostrarFeedbackScanner(message, state = 'ready', details = '') {
    const status = document.getElementById('scannerStatus');
    const detail = document.getElementById('scannerDetalhes');
    if (status) { status.textContent = message; status.dataset.state = state; }
    if (detail) detail.textContent = details;
}

function controlesScanner(active) {
    if (!scannerEmbutido) return;
    if (btnIniciarScanner) btnIniciarScanner.disabled = active || iniciandoScanner;
    if (btnCancelar) btnCancelar.hidden = !active && !iniciandoScanner;
    const placeholder = document.getElementById('scannerPlaceholder');
    if (placeholder) placeholder.hidden = active;
}

function pararScanner() {
    return html5QrCode?.isScanning ? html5QrCode.stop() : Promise.resolve();
}

async function registrarEabrir(id) {
    const resposta = await fetch(`/api/membros/presenca/${id}`, { method: 'POST' });
    const resultado = await resposta.json();
    if (!resposta.ok || resultado.success === false || !resultado.data) {
        throw new Error(resultado.message || 'Não foi possível registrar a presença.');
    }
    if (scannerEmbutido) {
        const attendance = { ...resultado.data, id: String(id) };
        const period = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[attendance.periodo];
        const details = [attendance.nome, period, attendance.horario].filter(Boolean).join(' • ');
        mostrarFeedbackScanner(attendance.alreadyRecorded ? 'Presença já confirmada neste período.' : 'Presença registrada', attendance.alreadyRecorded ? 'warning' : 'success', details);
        document.dispatchEvent(new CustomEvent('dashboard:attendance', { detail: attendance }));
    } else {
        if (resultado.data.alreadyRecorded) alert('A presença já foi confirmada neste período.');
        abrirPagina(`/validar?id=${id}`);
    }
    return true;
}

async function abrirCredencialValidada(textoLido) {
    if (typeof textoLido !== 'string') return false;
    const text = textoLido.trim();
    let id;
    if (/^https?:\/\//.test(text) || text.startsWith('/validar?')) {
        try {
            const url = new URL(text, window.location.origin);
            if (url.pathname === '/validar') id = url.searchParams.get('id');
        } catch { return false; }
    } else if (text.startsWith('MEMBRO:')) id = text.slice('MEMBRO:'.length).trim();
    return /^\d+$/.test(id || '') ? registrarEabrir(id) : false;
}

function programarProximaLeitura() {
    if (scannerEmbutido && !cameraSolicitada) return;
    retomarLeitura = setTimeout(() => iniciarScanner(true), 1500);
}

async function sucesso(textoLido) {
    if (processandoLeitura) return;
    processandoLeitura = true;
    if (scannerEmbutido) mostrarFeedbackScanner('Registrando presença…', 'loading');
    try {
        await pararScanner();
        const accepted = await abrirCredencialValidada(textoLido);
        if (!accepted) {
            if (scannerEmbutido) mostrarFeedbackScanner('QR Code não reconhecido.', 'error', 'Apresente a credencial de um membro da igreja.');
            else alert('QR Code invalido.');
        }
        if (scannerEmbutido || !accepted) programarProximaLeitura();
    } catch (error) {
        if (scannerEmbutido) {
            cameraSolicitada = false;
            controlesScanner(false);
            mostrarFeedbackScanner(error.message || 'Não foi possível registrar a presença.', 'error', 'A presença não foi confirmada. Verifique a conexão e tente novamente.');
        } else {
            alert(error.message || 'Não foi possível registrar a presença.');
            processandoLeitura = false;
            iniciarScanner();
        }
    }
}

function erro() { /* Quadros sem um QR legível não são erros de registro. */ }

async function iniciarScanner(continuar = false) {
    if (iniciandoScanner || html5QrCode?.isScanning) return;
    cameraSolicitada = true;
    iniciandoScanner = true;
    processandoLeitura = false;
    controlesScanner(false);
    if (scannerEmbutido && !continuar) mostrarFeedbackScanner('Preparando câmera…', 'loading');
    try {
        if (!html5QrCode) throw new Error('O leitor não foi carregado. Atualize a página e tente novamente.');
        if (!cameraSelecionada) {
            const cameras = await Html5Qrcode.getCameras();
            if (!cameras.length) throw new Error('Nenhuma câmera encontrada neste dispositivo.');
            cameraSelecionada = (cameras.find(camera => /back|rear|environment|traseira/i.test(camera.label || '')) || cameras[0]).id;
        }
        if (scannerEmbutido && !cameraSolicitada) return;
        await html5QrCode.start(cameraSelecionada, config, sucesso, erro);
        if (scannerEmbutido && !cameraSolicitada) { await pararScanner(); return; }
        controlesScanner(true);
        if (scannerEmbutido && !continuar) mostrarFeedbackScanner('Aguardando leitura', 'ready', 'Aponte a câmera para o QR Code do membro.');
    } catch (error) {
        cameraSolicitada = false;
        cameraSelecionada = null;
        const message = error?.message?.includes('Nenhuma câmera') || error?.message?.includes('leitor não foi carregado')
            ? error.message : 'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
        if (scannerEmbutido) mostrarFeedbackScanner(message, 'error');
        else alert(message);
    } finally {
        iniciandoScanner = false;
        controlesScanner(Boolean(html5QrCode?.isScanning));
    }
}

btnIniciarScanner?.addEventListener('click', () => iniciarScanner());
btnCancelar?.addEventListener('click', () => {
    cameraSolicitada = false;
    clearTimeout(retomarLeitura);
    pararScanner().catch(() => {}).finally(() => {
        if (scannerEmbutido) {
            processandoLeitura = false;
            controlesScanner(false);
            mostrarFeedbackScanner('Leitor pausado', 'ready', 'Use “Escanear QR Code” para iniciar outra leitura.');
        } else abrirPagina('/dashboard');
    });
});
window.addEventListener('beforeunload', () => {
    cameraSolicitada = false;
    clearTimeout(retomarLeitura);
    pararScanner().catch(() => {});
});
document.addEventListener('DOMContentLoaded', () => {
    if (scannerEmbutido) {
        controlesScanner(false);
        mostrarFeedbackScanner('Leitor pronto', 'ready', 'Inicie a câmera para registrar presenças.');
    } else iniciarScanner();
});
