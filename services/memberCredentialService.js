// Shared by the public credential page and the member application.
// A credential read never registers attendance.
function memberCredentialResult(member, { now = Date.now } = {}) {
    if (!member || !member.email_verificado || member.consent_revoked_at || !member.consent_at) {
        return { success: false, status: 404, message: 'Credencial indisponível.' };
    }
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(member.validade || '');
    if (!match) return { success: false, status: 404, message: 'Credencial indisponível.' };
    const [, day, month, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() + 1 !== Number(month) || date.getUTCDate() !== Number(day)) {
        return { success: false, status: 404, message: 'Credencial indisponível.' };
    }
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(now())).map(part => [part.type, part.value]));
    if (`${year}-${month}-${day}` < `${parts.year}-${parts.month}-${parts.day}`) {
        return { success: false, status: 403, message: 'Credencial expirada.' };
    }
    return { success: true, data: {
        id: member.id, nome: member.nome, cargo: member.cargo,
        matricula: member.matricula, validade: member.validade
    } };
}

module.exports = { memberCredentialResult };
