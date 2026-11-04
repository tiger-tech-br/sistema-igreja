(() => {
    const byId = (id) => document.getElementById(id);
    const table = byId('tabelaUltimos');
    const status = byId('dashboardStatus');
    const profileCache = new Map();
    const profileRequests = new Map();
    let loading = false;
    let sessionExpired = false;
    let tableSignature = null;
    let selectedMemberId = null;
    let latestAttendanceId = null;
    let manualSelection = false;

    function text(id, value) {
        const element = byId(id);
        if (element && element.textContent !== String(value)) element.textContent = value;
    }

    function message(value, state = 'neutral') {
        if (!status) return;
        if (status.textContent !== value) status.textContent = value;
        status.dataset.state = state;
    }

    function memberId(value) {
        const id = String(value ?? '');
        return /^[1-9]\d{0,9}$/.test(id) ? id : null;
    }

    function initials(value) {
        const words = String(value || '').trim().split(/\s+/).filter(Boolean);
        return words.length ? (words[0][0] + (words.length > 1 ? words.at(-1)[0] : '')).toLocaleUpperCase('pt-BR') : '—';
    }

    function currentDay() {
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function validity(value) {
        const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || ''));
        if (!match) return null;
        const iso = `${match[3]}-${match[2]}-${match[1]}`;
        const date = new Date(`${iso}T12:00:00Z`);
        return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
    }

    function updatePeriod() {
        const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
        const period = hour < 12 ? ['Manhã', '00h às 11h59'] : hour < 18 ? ['Tarde', '12h às 17h59'] : ['Noite', '18h às 23h59'];
        text('periodoAtual', period[0]);
        text('periodoHorario', period[1]);
    }

    function credentialMessage(value, state = 'neutral') {
        text('credencialStatus', value);
        const element = byId('credencialStatus');
        if (element) element.dataset.state = state;
    }

    function hideCredential(messageText) {
        const empty = byId('credencialVazia');
        if (empty) {
            empty.hidden = false;
            const label = empty.querySelector('p') || empty;
            label.textContent = messageText;
        }
        if (byId('credencialConteudo')) byId('credencialConteudo').hidden = true;
        const qr = byId('credencialQRCode');
        if (qr) { qr.hidden = true; qr.removeAttribute('src'); }
        const pdf = byId('btnCredencialPDF');
        if (pdf) { pdf.hidden = true; pdf.removeAttribute('href'); }
    }

    function renderCredential(member) {
        const id = memberId(member.id);
        if (!id || id !== selectedMemberId) return;
        if (byId('credencialVazia')) byId('credencialVazia').hidden = true;
        if (byId('credencialConteudo')) byId('credencialConteudo').hidden = false;
        text('credencialNome', member.nome || 'Nome não informado');
        text('credencialCargo', member.cargo || 'Membro');
        text('credencialMatricula', member.matricula || 'Não informada');
        text('credencialValidade', member.validade || 'Não informada');
        text('credencialIniciais', initials(member.nome));

        const expires = validity(member.validade);
        const authorized = Boolean(member.email_verificado && member.consent_at && !member.consent_revoked_at);
        const valid = authorized && expires && expires >= currentDay();
        const qr = byId('credencialQRCode');
        const pdf = byId('btnCredencialPDF');
        if (qr) {
            qr.hidden = !valid;
            qr.onerror = () => {
                if (selectedMemberId !== id) return;
                qr.hidden = true;
                credentialMessage('Não foi possível carregar o QR Code.', 'error');
            };
            if (valid) {
                qr.alt = `QR Code da credencial de ${member.nome || 'membro'}`;
                qr.src = `/qrcodes/membro-${id}.png`;
            } else qr.removeAttribute('src');
        }
        if (pdf) {
            pdf.hidden = !valid;
            if (valid) pdf.href = `/credencial/${id}`;
            else pdf.removeAttribute('href');
        }

        if (member.consent_revoked_at) credentialMessage('Credencial indisponível: consentimento revogado.', 'warning');
        else if (!member.email_verificado) credentialMessage('Confirmação de e-mail pendente.', 'warning');
        else if (!member.consent_at) credentialMessage('Autorização do membro pendente.', 'warning');
        else if (!expires) credentialMessage('Validade não informada.', 'neutral');
        else if (expires < currentDay()) credentialMessage('Credencial vencida.', 'warning');
        else credentialMessage('Credencial válida', 'success');
    }

    async function selectCredential(value, force = false) {
        const id = memberId(value);
        if (!id) return;
        const changed = selectedMemberId !== id;
        selectedMemberId = id;
        const cached = profileCache.get(id);
        if (changed) {
            if (cached?.member) renderCredential(cached.member);
            else hideCredential('Carregando credencial do membro…');
        }
        if (!force && cached && Date.now() - cached.loadedAt < 60000) {
            if (changed && !cached.member) hideCredential('Não foi possível carregar a credencial. Tente novamente em instantes.');
            return;
        }
        if (profileRequests.has(id)) return profileRequests.get(id);
        if (changed || !cached?.member) hideCredential('Carregando credencial do membro…');
        const request = (async () => {
            try {
                const response = await fetch(`/api/membros/${id}`, { cache: 'no-store' });
                const result = await response.json();
                if (!response.ok || !result.success || !result.data) throw new Error(result.message || 'Não foi possível carregar a credencial.');
                profileCache.set(id, { member: result.data, loadedAt: Date.now() });
                renderCredential(result.data);
            } catch (error) {
                profileCache.set(id, { member: cached?.member, loadedAt: Date.now() - 45000 });
                if (selectedMemberId === id) {
                    if (!cached?.member) hideCredential(error.message || 'Não foi possível carregar a credencial.');
                    else credentialMessage('Não foi possível atualizar a credencial.', 'warning');
                }
            } finally { profileRequests.delete(id); }
        })();
        profileRequests.set(id, request);
        return request;
    }

    function renderAttendance(accesses) {
        if (!table) return;
        const signature = JSON.stringify(accesses);
        if (signature === tableSignature) return;
        tableSignature = signature;
        table.replaceChildren();
        if (!accesses.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.className = 'empty-table';
            cell.textContent = 'Nenhuma presença registrada hoje.';
            row.appendChild(cell);
            table.appendChild(row);
            return;
        }
        const periods = { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
        for (const attendance of accesses) {
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            const id = memberId(attendance.id);
            const member = document.createElement(id ? 'button' : 'span');
            member.className = 'member-cell';
            if (id) {
                member.type = 'button';
                member.setAttribute('aria-label', `Consultar credencial de ${attendance.nome || 'membro'}`);
                member.addEventListener('click', () => { manualSelection = true; selectCredential(id); });
            }
            const avatar = document.createElement('span');
            avatar.className = 'avatar';
            avatar.setAttribute('aria-hidden', 'true');
            avatar.textContent = initials(attendance.nome);
            const name = document.createElement('span');
            name.className = 'member-name';
            name.textContent = attendance.nome || 'Nome não informado';
            member.append(avatar, name);
            nameCell.appendChild(member);
            row.appendChild(nameCell);
            for (const value of [attendance.cargo, attendance.ministerio]) {
                const cell = document.createElement('td');
                cell.textContent = value || '—';
                row.appendChild(cell);
            }
            const periodCell = document.createElement('td');
            const badge = document.createElement('span');
            badge.className = 'period-badge';
            badge.textContent = periods[attendance.periodo] || '—';
            periodCell.appendChild(badge);
            row.appendChild(periodCell);
            const time = document.createElement('td');
            time.textContent = attendance.horario || '—';
            row.appendChild(time);
            table.appendChild(row);
        }
    }

    async function loadDashboard(force = false) {
        updatePeriod();
        if (loading || sessionExpired || (!force && document.hidden)) return;
        loading = true;
        try {
            const response = await fetch('/api/membros/dashboard', { cache: 'no-store' });
            const result = await response.json();
            if (!response.ok || !result.success || !result.data) {
                if (response.status === 401) sessionExpired = true;
                throw new Error(result.message || 'Não foi possível atualizar o painel.');
            }
            const data = result.data;
            const accesses = Array.isArray(data.ultimosAcessos) ? data.ultimosAcessos : [];
            if (data.totalMembros != null && Number.isFinite(Number(data.totalMembros))) text('totalMembros', Number(data.totalMembros));
            const total = data.totalPresencas ?? accesses.length;
            if (Number.isFinite(Number(total))) text('totalPresencas', Number(total));
            renderAttendance(accesses);
            message('Atualizado agora', 'success');
            const lastId = memberId(accesses[0]?.id);
            if (!manualSelection && !lastId && selectedMemberId) {
                selectedMemberId = null;
                latestAttendanceId = null;
                hideCredential('Selecione um membro ou escaneie uma credencial para consultar o QR Code.');
            }
            if (!manualSelection && lastId && latestAttendanceId !== lastId) {
                latestAttendanceId = lastId;
                selectCredential(lastId);
            } else if (selectedMemberId) selectCredential(selectedMemberId);
        } catch (error) {
            message(error.message || 'Não foi possível atualizar o painel. Tente novamente.', 'error');
        } finally { loading = false; }
    }

    document.addEventListener('dashboard:attendance', (event) => {
        const id = memberId(event.detail?.id);
        if (id) { manualSelection = true; selectCredential(id, true); }
        loadDashboard(true);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadDashboard(); });
    document.addEventListener('DOMContentLoaded', () => {
        loadDashboard(true);
        window.setInterval(loadDashboard, 1000);
    });
})();
