(() => {
    const byId = (id) => document.getElementById(id);
    const table = byId('tabelaUltimos');
    const errorStatus = byId('erroPresencas');
    let loading = false;
    let sessionExpired = false;
    let hasData = false;
    let attendance = [];
    let tableSignature = null;
    let displayedDay = null;

    function text(id, value) {
        const element = byId(id);
        if (element && element.textContent !== String(value)) element.textContent = value;
    }

    function showError(detail = '') {
        if (errorStatus) {
            errorStatus.textContent = detail;
            errorStatus.hidden = !detail;
        }
    }

    function initials(value) {
        const words = String(value || '').trim().split(/\s+/).filter(Boolean);
        return words.length ? (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toLocaleUpperCase('pt-BR') : '—';
    }

    function updateDate() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
        const date = Object.fromEntries(parts.map(part => [part.type, part.value]));
        const day = `${date.year}-${date.month}-${date.day}`;
        text('dataPresencas', new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: 'short', year: 'numeric' }).format(now));
        if (byId('dataPresencas')) byId('dataPresencas').dateTime = day;
        if (displayedDay !== day) {
            const changedDay = displayedDay !== null;
            displayedDay = day;
            if (changedDay) {
                attendance = [];
                hasData = false;
                tableSignature = null;
                renderAttendance();
                renderSummary();
            }
        }
    }

    function renderAttendance() {
        if (!table) return;
        const signature = JSON.stringify([attendance, hasData]);
        if (signature === tableSignature) return;
        tableSignature = signature;
        table.replaceChildren();
        text('totalRegistrosHoje', `${attendance.length} ${attendance.length === 1 ? 'registro' : 'registros'} hoje`);
        if (!attendance.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.className = 'empty-table';
            cell.textContent = hasData ? 'Nenhuma presença registrada hoje.' : 'Carregando presenças…';
            row.appendChild(cell);
            table.appendChild(row);
            return;
        }
        for (const record of attendance) {
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
            const time = document.createElement('td');
            time.textContent = record.horario || '—';
            row.appendChild(time);
            table.appendChild(row);
        }
    }

    function renderSummary() {
        const memberIds = new Set(attendance.map(record => String(record.id ?? '')).filter(id => /^[1-9]\d{0,9}$/.test(id)));
        text('totalMembrosPresentes', hasData ? memberIds.size : '—');
        text('resumoRegistrosHoje', hasData ? attendance.length : '—');
    }

    async function loadDashboard(force = false) {
        updateDate();
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
            showError();
        } catch (error) {
            showError(sessionExpired ? 'Sessão expirada. Entre novamente.' : error.message || 'Não foi possível atualizar o painel. Tentando novamente…');
            if (!hasData && table) {
                const cell = table.querySelector('td');
                if (cell) cell.textContent = sessionExpired ? 'Entre novamente para consultar as presenças.' : 'Não foi possível carregar as presenças. Tentando novamente…';
            }
        } finally { loading = false; }
    }

    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDashboard(); });
    document.addEventListener('DOMContentLoaded', () => {
        loadDashboard(true);
        window.setInterval(loadDashboard, 1000);
    });
})();
