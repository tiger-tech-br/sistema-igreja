const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const model = require('../models/membroModel');
const { enviarTemplate } = require('../services/emailService');
const qr = require('../services/qrCodeService');
const { passwordValid, tokenValid } = require('../utils/security');
const { createMemberRegistrationService } = require('../services/memberRegistrationService');
const { memberHasAccess } = require('../services/memberAccessService');
const pool = require('../database/connection');
const { memberCredentialResult } = require('../services/memberCredentialService');
const text = (value,max=300) => typeof value === 'string' && value.length <= max ? value.trim() : '';
const emailOf = value => text(value,150).toLowerCase();
const emailValid = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const fail = (res,message,status=400) => res.status(status).json({ success:false,message });
const ok = (res,data,message) => res.json({ success:true,data,message });
const safe = fn => async (req,res,next) => { try { await fn(req,res); } catch(error) { next(error); } };
const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/,'');
const genericRecovery = 'Se existir uma conta vinculada a este e-mail, você receberá as instruções. Confira também a pasta de spam.';
const registration = createMemberRegistrationService();
function sessionLogin(req,res,member) {
    req.session.regenerate(error => {
        if (error) return fail(res,'Não foi possível iniciar a sessão.',503);
        req.session.membro = { id:member.id,nome:member.nome.split(' ')[0],authVersion:member.auth_version };
        req.session.save(error => error ? fail(res,'Não foi possível salvar a sessão.',503) : ok(res,{ id:member.id,nome:member.nome },'Login realizado com sucesso.'));
    });
}
async function confirmationMail(member,token) {
    await enviarTemplate({ para:member.email,assunto:'Confirme seu cadastro',template:'email-confirmar-cadastro.html',
        dados:{nome:member.nome,link:appUrl()+'/confirmar-email?token='+token} });
}
exports.criar = safe(async (req,res) => {
    try {
        const { member, confirmationToken } = await registration.register(req.body);
        await confirmationMail(member,confirmationToken).catch(() => console.error('[EMAIL_CONFIRMATION_FAILED]'));
    } catch(error) {
        if (error.status !== 409) {
            if ([400,503].includes(error.status)) return fail(res,error.message,error.status);
            throw error;
        }
    }
    res.status(202).json({ success:true,message:'Se o cadastro puder ser realizado, enviaremos a confirmação por e-mail. Para reenviar, use Esqueci minha senha.' });
});
exports.login = safe(async (req,res) => {
    const email=emailOf(req.body?.email), senha=req.body?.senha;
    if (!emailValid(email) || typeof senha !== 'string' || Buffer.byteLength(senha)>72 || !senha.length) return fail(res,'E-mail ou senha inválidos.',401);
    const member = await model.buscarPorEmail(email);
    if (!member?.senha || !await bcrypt.compare(senha,member.senha)) return fail(res,'E-mail ou senha inválidos.',401);
    if (!memberHasAccess(member)) return fail(res,'Confirme seu e-mail. Para reenviar a confirmação, use Esqueci minha senha.',403);
    sessionLogin(req,res,member);
});
exports.esqueciSenha = safe(async (req,res) => {
    const email=emailOf(req.body?.email);
    if (!emailValid(email)) return fail(res,'Informe um e-mail válido.');
    const member = await model.buscarPorEmail(email);
    if (member) {
        const token=crypto.randomBytes(32).toString('hex');
        if (!memberHasAccess(member)) {
            await model.novoTokenConfirmacao(member.id,token);
            await confirmationMail(member,token).catch(() => console.error('[EMAIL_CONFIRMATION_FAILED]'));
        } else {
            await model.salvarTokenRecuperacao(member.id,token,new Date(Date.now()+3600000));
            await enviarTemplate({para:member.email,assunto:'Recuperação de senha',template:'email-redefinir-senha.html',
                dados:{nome:member.nome,link:appUrl()+'/redefinir-senha?token='+token}}).catch(() => console.error('[EMAIL_RECOVERY_FAILED]'));
        }
    }
    ok(res,undefined,genericRecovery);
});
exports.redefinirSenha = safe(async (req,res) => {
    if (!tokenValid(req.body?.token) || !passwordValid(req.body?.senha)) return fail(res,'Token inválido ou senha fora do limite de 12 caracteres a 72 bytes.');
    const member=await model.consumirToken(req.body.token,req.body.senha);
    if (!member) return fail(res,'Link inválido, expirado ou já utilizado.');
    await enviarTemplate({para:member.email,assunto:'Senha alterada',template:'email-senha-alterada.html',dados:{nome:member.nome}}).catch(() => console.error('[EMAIL_NOTIFICATION_FAILED]'));
    ok(res,undefined,'Senha alterada. Entre novamente; as sessões anteriores foram revogadas.');
});
exports.confirmarEmail = safe(async (req,res) => {
    if (!tokenValid(req.body?.token) || !passwordValid(req.body?.senha)) return fail(res,'Informe um token válido e uma senha de 12 caracteres a 72 bytes.');
    if (!await model.confirmarEmail(req.body.token,req.body.senha)) return fail(res,'Link inválido, expirado ou já utilizado.');
    ok(res,undefined,'E-mail confirmado. Entre com a senha que você acabou de definir.');
});
exports.sessao = (req,res) => res.json(req.session.membro ? {logado:true,nome:req.session.membro.nome,id:req.session.membro.id} : {logado:false});
async function getProfile(id) {
    const member=await model.buscarPorId(id);
    if (member) member.qr_code = member.consent_revoked_at ? null : '/qrcodes/membro-'+member.id+'.png';
    return member;
}
exports.perfil = safe(async (req,res) => ok(res,await getProfile(req.session.membro.id)));
exports.buscarPorId = safe(async (req,res) => {
    const member=await getProfile(req.params.id);
    if (!member) return fail(res,'Membro não encontrado.',404);
    ok(res,member);
});
exports.listar = safe(async (req,res) => ok(res,await model.listar()));
exports.listarNomes = safe(async (req,res) => ok(res,await model.listarNomes()));
exports.atualizar = safe(async (req,res) => {
    const d={};
    for (const field of ['cargo','ministerio']) {
        if (req.body?.[field] != null && (typeof req.body[field] !== 'string' || req.body[field].length>100)) return fail(res,'Campo administrativo inválido.');
        d[field]=text(req.body?.[field],100)||null;
    }
    const member=await model.atualizarDadosAdministrativos(req.params.id,d);
    if (!member) return fail(res,'Membro não encontrado.',404);
    await pool.query("INSERT INTO security_audit(actor_id,action,target_id) VALUES ($1,'member_updated',$2)",[req.session.admin.id,member.id]);
    ok(res,member,'Dados atualizados.');
});
exports.excluir = safe(async (req,res) => {
    if (!await model.excluir(req.params.id,req.session.admin.id)) return fail(res,'Membro não encontrado.',404);
    ok(res,undefined,'Cadastro excluído. As sessões não podem mais acessar a conta.');
});
exports.validar = safe(async (req,res) => {
    const member=await model.buscarPorId(req.params.id);
    // O administrador pode consultar a credencial dos membros que escaneia.
    if (req.session.admin) {
        if (!member) return fail(res,'Membro não encontrado.',404);
        return ok(res,{id:member.id,nome:member.nome,cargo:member.cargo,matricula:member.matricula,validade:member.validade});
    }
    const credential = memberCredentialResult(member);
    if (!credential.success) return fail(res,credential.message,credential.status);
    ok(res,credential.data);
});
exports.presenca = safe(async (req,res) => {
    const attendance = await model.registrarAcesso(req.params.id,req.session.admin.id);
    if (!attendance) return fail(res,'Membro não encontrado. Este QR Code não corresponde a um cadastro existente.',404);
    ok(res,attendance,attendance.alreadyRecorded ? 'A presença já foi confirmada neste período.' : 'Presença registrada.');
});
exports.ultimos = safe(async (req,res) => ok(res,await model.listarUltimos()));
exports.listarPresencas = safe(async (req,res) => ok(res,await model.listarPresencas()));
exports.dashboard = safe(async (req,res) => ok(res,await model.dashboard()));
exports.baixarQRCode = safe(async (req,res) => {
    const member=await model.buscarPorId(req.params.id);
    if (!member) return fail(res,'Membro não encontrado.',404);
    if (!memberHasAccess(member)) return fail(res,'Para liberar o QR Code, o membro precisa confirmar seu e-mail. Para reenviar a confirmação, use Esqueci minha senha.',403);
    if (member.consent_revoked_at) return fail(res,'O membro revogou o consentimento. Se desejar autorizar novamente, ele deve entrar na própria conta e acessar Privacidade e seus dados.',403);
    // A rota exige administrador e permite imprimir QR Codes de cadastros antigos
    // sem consentimento registrado. A validação e a presença mantêm suas regras.
    res.type('png').attachment('qrcode-'+member.id+'.png').send(await qr.gerarQRCodeBuffer(member.id));
});
