const VERSION = '2026-09-23';
const CONSENT_TEXT = 'Autorizo, de forma específica e destacada, o tratamento dos meus dados e do meu vínculo religioso para administrar meu cadastro, emitir minha credencial e registrar minhas presenças. Sei que posso revogar este consentimento e exercer meus direitos pela área de privacidade.';

function privacyConfig() {
    const controller = (process.env.PRIVACY_CONTROLLER || '').trim();
    const contact = (process.env.PRIVACY_EMAIL || '').trim();
    return { version: VERSION, consentText: CONSENT_TEXT, controller, contact,
        configured: controller.length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) };
}
module.exports = { VERSION, CONSENT_TEXT, privacyConfig };
