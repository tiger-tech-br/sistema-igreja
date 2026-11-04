(() => {
    const byId = (id) => document.getElementById(id);
    const table = byId('tabelaUltimos');
    const status = byId('dashboardStatus');
    const automatic = byId('atualizacaoAutomatica');
    const periodButtons = Array.from(document.querySelectorAll('[data-periodo]'));
    const periodNames = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
    let loading = false;
    let sessionExpired = false;
    let hasData = false;
    let selectedPeriod = null;
    let attendance = [];
    let tableSignature = null;
    let displayedDay = null;

    function text(id, value) {
        const element = byId(id);
        if (element && element.textContent !== String(value)) element.textContent = value;
    }

    function message(value, state = 'neutral') {
        if (status) {
            status.textContent = value;
            status.dataset.state = state;
        }
        if (automatic) {
            automatic.dataset.state = state;
            automatic.textContent = state === 'success' ? 'Atualização automática' : state === 'error' ? 'Atualização interrompida' : 'Conectando…';
        }
    }

    function initials(value) {
        const words = String(value || '').trim().split(/\s+/).filter(Boolean);
        return words.length ? (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toLocaleUpperCase('pt-BR') : '—';
    }

    function updatePeriod() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const day = `${date.year}-${date.month}-${date.day}`;
        const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(now));
        const period = hour < 12 ? 'manha' : hour < 18 ? 'tarde' : 'noite';
        text('periodoAtual', periodNames[period]);
        text('periodoHorario', { manha: '00h às 11h59', tarde: '12h às 17h59', noite: '18h às 23h59' }[period]);
        text('dataPresencas', new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' }).format(now));
        if (byId('dataPresencas')) byId('dataPresencas').dateTime = day;
        if (displayedDay !== day) {
            const changedDay = displayedDay !== null;
            displayedDay = day;
            selectedPeriod = period;
            if (changedDay) {
                attendance = [];
                hasData = false;
                tableSignature = null;
                renderAttendance();
                renderSummary();
            }
            updateButtons();
        }
    }

    function updateButtons() {
        for (const button of periodButtons) button.setAttribute('aria-pressed', String(button.dataset.periodo === selectedPeriod));
    }

    function renderAttendance() {
        if (!table) return;
        const records = attendance.filter(record => record.periodo === selectedPeriod);
        const signature = JSON.stringify([selectedPeriod, records, hasData]);
        if (signature === tableSignature) return;
        tableSignature = signature;
        table.replaceChildren();
        text('totalPeriodo', `${records.length} ${records.length === 1 ? 'registro' : 'registros'} no período`);
        if (!records.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'empty-table';
            cell.textContent = hasData ? `Nenhuma presença registrada no período da ${String(periodNames[selectedPeriod] || '').toLocaleLowerCase('pt-BR')}.` : 'Carregando presenças…';
            row.appendChild(cell);
            table.appendChild(row);
            return;
        }
        for (const record of records) {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const id = String(record.id ?? '');
            const validId = /^[1-9]\d{0,9}$/.test(id);
            const member = document.createElement(validId ? 'a' : 'span');
            member.className = 'member-cell';
            if (validId) {
                member.href = `/admin/perfil?id=${id}`;
                member.setAttribute('aria-label', `Consultar perfil e credencial de ${record.nome || 'membro'}`);
            }
            const avatar = document.createElement('span');
            avatar.className = 'avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = initials(record.nome);
            const name = document.createElement('span');
            name.className = 'member-name';
            name.textContent = record.nome || 'Nome não informado';
            member.append(avatar, name);
            nameCell.appendChild(member);
            row.appendChild(nameCell);
            for (const value of [record.cargo, record.ministerio]) {
                const cell = document.createElement('td');
                cell.textContent = value || '—';
                row.appendChild(cell);
            }
            const periodCell = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'period-badge';
            badge.textContent = periodNames[record.periodo] || '—';
            periodCell.appendChild(badge);
            row.appendChild(periodCell);
            const time = document.createElement('td');
            time.textContent = record.horario || '—';
            row.appendChild(time);
            table.appendChild(row);
        }
    }

    function renderSummary() {
        const counts = { manha: 0, tarde: 0, noite: 0 };
        for (const record of attendance) if (Object.hasOwn(counts, record.periodo)) counts[record.periodo]++;
        const largest = Math.max(1, ...Object.values(counts));
        for (const [period, count] of Object.entries(counts)) {
            text(`quantidade-${period}`, hasData ? count : '—');
            const progress = byId(`barra-${period}`);
            if (progress) { progress.max = largest; progress.value = count; }
        }
    }

    async function loadDashboard(force = false) {
        updatePeriod();
        if (loading || sessionExpired || (!force && document.hidden)) return;
        loading = true;
        try {
            const response = await fetch('/api/membros/dashboard', { cache: 'no-store' });
            if (response.status === 401) sessionExpired = true;
            const result = await response.json();
            if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Não foi possível atualizar o painel.');
            const data = result.data;
            attendance = Array.isArray(data.ultimosAcessos) ? data.ultimosAcessos : [];
            hasData = true;
            if (data.totalMembros != null && Number.isFinite(Number(data.totalMembros))) text('totalMembros', Number(data.totalMembros));
            const total = data.totalPresencas ?? attendance.length;
            if (Number.isFinite(Number(total))) text('totalPresencas', Number(total));
            renderAttendance();
            renderSummary();
            message('Atualizado agora', 'success');
        } catch (error) {
            message(sessionExpired ? 'Sessão expirada. Entre novamente.' : error.message || 'Não foi possível atualizar o painel. Tentando novamente…', 'error');
            if (!hasData && table) {
                const cell = table.querySelector('td');
                if (cell) cell.textContent = sessionExpired ? 'Entre novamente para consultar as presenças.' : 'Não foi possível carregar as presenças. Tentando novamente…';
            }
        } finally { loading = false; }
    }

    for (const button of periodButtons) button.addEventListener('click', () => {
        selectedPeriod = button.dataset.periodo;
        updateButtons();
        renderAttendance();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDashboard(); });
    document.addEventListener('DOMContentLoaded', () => {
        loadDashboard(true);
        window.setInterval(loadDashboard, 1000);
    });
})();
