// Access activation and proof of email ownership are intentionally separate.
// Immediate app registration activates the account without claiming a verified email.
function memberHasAccess(member) {
    return Boolean(member && (member.email_verificado === true || member.cadastro_liberado === true));
}

module.exports = { memberHasAccess };
