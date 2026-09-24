const VERSION = '2026-09-23';
const NOTICE_TEXT = 'Confirmo que li o Aviso de Privacidade e sei como meus dados serão usados, protegidos e por quanto tempo poderão ser mantidos, bem como onde exercer meus direitos.';
const CONSENT_TEXT = 'Autorizo, de forma livre, informada, específica e destacada, o tratamento do dado sensível sobre meu vínculo religioso para administrar meu cadastro, emitir minha credencial e registrar minhas presenças. Sei que posso revogar este consentimento a qualquer momento pela área de privacidade.';

function privacyConfig() {
    const controller = (process.env.PRIVACY_CONTROLLER || '').trim();
    const contact = (process.env.PRIVACY_EMAIL || '').trim();
    return { version: VERSION, noticeText: NOTICE_TEXT, consentText: CONSENT_TEXT, controller, contact,
        configured: controller.length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) };
}
module.exports = { VERSION, NOTICE_TEXT, CONSENT_TEXT, privacyConfig };
