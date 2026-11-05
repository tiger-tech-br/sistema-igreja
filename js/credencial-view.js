// Campos de identificação compartilhados pela consulta pública e pelo aplicativo.
// A autorização e a validade da credencial continuam sendo verificadas no servidor.
export function formatCredentialDate(value) {
  if (!value) return 'Não informada';
  const text = String(value);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

export function renderCredential(member, fields) {
  fields.name.textContent = member.nome || 'Membro não informado';
  fields.roleArea.hidden = !member.cargo;
  fields.role.textContent = member.cargo || '';
  fields.registration.textContent = member.matricula || 'Não informada';
  fields.validity.textContent = formatCredentialDate(member.validade);
}
