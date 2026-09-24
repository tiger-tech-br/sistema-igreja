const router = require('express').Router();
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const pool = require('../database/connection');
const model = require('../models/membroModel');
const member = require('../middlewares/authMembro');
const admin = require('../middlewares/auth');
const limit = require('../middlewares/accountLimiter');
const { VERSION, NOTICE_TEXT, CONSENT_TEXT, privacyConfig } = require('../config/privacy');
const { adultDate } = require('../utils/security');
const safe = fn => async (req,res,next) => { try { await fn(req,res); } catch(error) { next(error); } };
const invalid = (res,message) => res.status(400).json({success:false,message});
router.get('/config',(req,res) => res.json(privacyConfig()));
router.get('/meus-dados',member,limit('export',10),safe(async (req,res) => {
    const id=req.session.membro.id;
    const [profile, accesses, consents, requests] = await Promise.all([
        model.buscarPorId(id), pool.query('SELECT data,horario FROM acessos WHERE membro_id=$1 ORDER BY data DESC',[id]),
        pool.query('SELECT version,notice_text,texto,criado_em,revoked_at FROM privacy_consents WHERE membro_id=$1 ORDER BY id',[id]),
        pool.query('SELECT id,tipo,mensagem,status,resposta,criado_em,concluido_em FROM privacy_requests WHERE membro_id=$1 ORDER BY criado_em',[id])
    ]);
    res.attachment('meus-dados.json').json({ cadastro:profile,presencas:accesses.rows,consentimentos:consents.rows,solicitacoes:requests.rows });
}));
router.get('/solicitacoes',member,safe(async (req,res) => {
    const result=await pool.query('SELECT id,tipo,mensagem,status,resposta,criado_em,concluido_em FROM privacy_requests WHERE membro_id=$1 ORDER BY criado_em DESC',[req.session.membro.id]);
    res.json({success:true,data:result.rows});
}));
router.post('/solicitacoes',member,limit('privacy-request',5,3600),safe(async (req,res) => {
    const { tipo,mensagem }=req.body || {};
    if (!['acesso','correcao','exclusao','revogacao','informacao','oposicao'].includes(tipo) || typeof mensagem !== 'string' || mensagem.trim().length<3 || mensagem.length>2000) return invalid(res,'Selecione o direito e descreva a solicitação em até 2.000 caracteres.');
    const id=crypto.randomUUID(), client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('INSERT INTO privacy_requests(id,membro_id,tipo,mensagem) VALUES($1,$2,$3,$4)',[id,req.session.membro.id,tipo,mensagem.trim()]);
        if (tipo==='revogacao') {
            await client.query('UPDATE membros SET consent_revoked_at=NOW() WHERE id=$1',[req.session.membro.id]);
            await client.query('UPDATE privacy_consents SET revoked_at=NOW() WHERE membro_id=$1 AND revoked_at IS NULL',[req.session.membro.id]);
        }
        await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    res.status(201).json({success:true,protocolo:id,message:tipo==='revogacao' ? 'Consentimento revogado. Credencial e registro de presença suspensos. A conta permanece acessível para exercer seus direitos; a retenção será analisada pelo responsável.' : 'Solicitação registrada. Acompanhe a resposta nesta página.'});
}));
router.post('/consentimento',member,limit('consent',5),safe(async (req,res) => {
    if (!privacyConfig().configured) return res.status(503).json({success:false,message:'Responsável e contato de privacidade ainda não configurados.'});
    if (req.body?.cienciaPrivacidade!==true || req.body?.consentimento!==true || req.body?.privacyVersion!==VERSION) return invalid(res,'Confirme a leitura do aviso e autorize o tratamento de forma específica.');
    const m=await model.buscarPorId(req.session.membro.id);
    if (!adultDate(m.data_nascimento)) return invalid(res,'O cadastro deve ter uma data de nascimento válida e idade mínima de 18 anos. Solicite a correção ao responsável.');
    const client=await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE membros SET privacy_notice_version=$1,privacy_notice_text=$2,privacy_notice_at=NOW(),consent_version=$1,consent_text=$3,consent_at=NOW(),consent_revoked_at=NULL WHERE id=$4',[VERSION,NOTICE_TEXT,CONSENT_TEXT,m.id]);
        await client.query('INSERT INTO privacy_consents(membro_id,version,notice_text,texto) VALUES($1,$2,$3,$4)',[m.id,VERSION,NOTICE_TEXT,CONSENT_TEXT]);
        await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    res.json({success:true,message:'Consentimento registrado. Você pode revogá-lo nesta área a qualquer momento.'});
}));
router.get('/admin/solicitacoes',admin,safe(async (req,res) => {
    const result=await pool.query(`SELECT r.id,r.membro_id,r.tipo,r.mensagem,r.status,r.resposta,r.criado_em,r.concluido_em,m.nome,m.email
        FROM privacy_requests r LEFT JOIN membros m ON m.id=r.membro_id ORDER BY r.criado_em DESC LIMIT 500`);
    res.json({success:true,data:result.rows});
}));
router.patch('/admin/solicitacoes/:id',admin,safe(async (req,res) => {
    if (!/^[a-f0-9-]{36}$/.test(req.params.id)) return invalid(res,'Protocolo inválido.');
    const resposta=req.body?.resposta;
    if (typeof resposta!=='string' || resposta.trim().length<10 || resposta.length>2000) return invalid(res,'Registre a providência tomada e a justificativa (10 a 2.000 caracteres).');
    const result=await pool.query("UPDATE privacy_requests SET status='concluida',resposta=$1,concluido_em=NOW() WHERE id=$2 AND status='pendente' RETURNING id",[resposta.trim(),req.params.id]);
    if (!result.rowCount) return res.status(404).json({success:false,message:'Solicitação não encontrada ou já concluída.'});
    await pool.query("INSERT INTO security_audit(actor_id,action) VALUES($1,'privacy_request_resolved')",[req.session.admin.id]);
    res.json({success:true,message:'Resposta registrada. Concluir a solicitação não altera nem exclui automaticamente o cadastro.'});
}));
// Corrections are performed by the operator after identity verification; email changes require separate verification.
router.patch('/admin/cadastro/:id',admin,safe(async (req,res) => {
    if (!/^[1-9]\d{0,9}$/.test(req.params.id)) return invalid(res,'ID inválido.');
    const allowed=['nome','dataNascimento','telefone','celular','endereco','sexo','estadoCivil'];
    const mapping={nome:'nome',dataNascimento:'data_nascimento',telefone:'telefone',celular:'celular',endereco:'endereco',sexo:'sexo',estadoCivil:'estado_civil'};
    const values=[], assignments=[];
    for (const key of allowed) {
        if (!Object.hasOwn(req.body || {},key)) continue;
        let value=req.body[key];
        if (typeof value!=='string' || value.length>300) return invalid(res,'Campo inválido.');
        value=value.trim();
        if (key==='nome' && !/^[A-Za-zÀ-ÿ\s]{3,150}$/.test(value)) return invalid(res,'Nome inválido.');
        if (key==='dataNascimento') { value=adultDate(value); if (!value) return invalid(res,'Informe uma data válida de pessoa maior de 18 anos.'); }
        values.push(value || null); assignments.push(mapping[key]+'=$'+values.length);
    }
    if (!values.length) return invalid(res,'Nenhuma correção informada.');
    values.push(req.params.id);
    const result=await pool.query('UPDATE membros SET '+assignments.join(',')+' WHERE id=$'+values.length+' RETURNING id',values);
    if (!result.rowCount) return res.sendStatus(404);
    await pool.query("INSERT INTO security_audit(actor_id,action,target_id) VALUES($1,'privacy_correction',$2)",[req.session.admin.id,req.params.id]);
    res.json({success:true,message:'Dados corrigidos.'});
}));
module.exports=router;
