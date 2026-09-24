const crypto = require('node:crypto');
function passwordValid(value) {
    return typeof value === 'string' && value.length >= 12 && Buffer.byteLength(value, 'utf8') <= 72;
}
function hashToken(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function tokenValid(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function adultDate(value, today = new Date()) {
    if (typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return null;
    const [day, month, year] = value.split('/').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(today).map(p => [p.type, p.value]));
    const age = Number(parts.year) - year - (Number(parts.month) < month || (Number(parts.month) === month && Number(parts.day) < day) ? 1 : 0);
    return age >= 18 ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}
function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
module.exports = { passwordValid, hashToken, tokenValid, adultDate, escapeHtml };
