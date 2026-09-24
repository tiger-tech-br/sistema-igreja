const pool = require('../database/connection');
const bcrypt = require('bcrypt');
const { hashToken } = require('../utils/security');
const { VERSION, CONSENT_TEXT } = require('../config/privacy');
const profile = `id, nome, TO_CHAR(data_nascimento, 'DD/MM/YYYY') AS data_nascimento,
    telefone, celular, email, endereco, cargo, ministerio, sexo, estado_civil, matricula,
    TO_CHAR(validade, 'DD/MM/YYYY') AS validade, qr_code, email_verificado,
    consent_version, consent_at, consent_revoked_at`;
const one = async (sql, args) => (await pool.query(sql, args)).rows[0];
module.exports = {
    async criar(d) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query(`INSERT INTO membros
                (nome,data_nascimento,telefone,celular,email,senha,email_verificado,endereco,cargo,ministerio,
                 sexo,estado_civil,matricula,validade,consent_version,consent_text,consent_at,token_confirmacao,confirmation_expires_at)
                VALUES ($1,$2,$3,$4,$5,$6,FALSE,$7,NULL,NULL,$8,$9,$10,$11,$12,$13,NOW(),$14,NOW()+INTERVAL '24 hours')
                RETURNING id, nome, email`,
                [d.nome,d.dataNascimento,d.telefone,d.celular,d.email,await bcrypt.hash(d.senha,12),
                 d.endereco,d.sexo,d.estadoCivil,d.matricula,d.validade,VERSION,CONSENT_TEXT,hashToken(d.confirmationToken)]);
            await client.query(`INSERT INTO privacy_consents (membro_id,version,texto) VALUES ($1,$2,$3)`,
                [result.rows[0].id,VERSION,CONSENT_TEXT]);
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    },
    buscarPorEmail: email => one('SELECT * FROM membros WHERE LOWER(email) = $1 LIMIT 1', [email]),
    buscarPorId: id => one('SELECT ' + profile + ' FROM membros WHERE id = $1', [id]),
    buscarPorMatricula: value => one('SELECT id FROM membros WHERE matricula = $1', [value]),
    listar: async () => (await pool.query('SELECT ' + profile + ' FROM membros WHERE email_verificado = TRUE AND consent_revoked_at IS NULL ORDER BY nome')).rows,
    listarNomes: async () => (await pool.query('SELECT id,nome FROM membros WHERE email_verificado = TRUE AND consent_revoked_at IS NULL ORDER BY nome')).rows,
    atualizarQRCode: (id, qr) => one('UPDATE membros SET qr_code = $1 WHERE id = $2 RETURNING id', [qr,id]),
    atualizarDadosAdministrativos: (id,d) => one('UPDATE membros SET cargo = $1, ministerio = $2 WHERE id = $3 AND consent_revoked_at IS NULL RETURNING ' + profile, [d.cargo,d.ministerio,id]),
    async excluir(id, actorId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const result = await client.query('DELETE FROM membros WHERE id = $1 RETURNING id', [id]);
            if (result.rowCount) await client.query("INSERT INTO security_audit (actor_id,action,target_id) VALUES ($1,'member_deleted',$2)", [actorId,id]);
            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    },
    salvarTokenRecuperacao: (id,token,expires) => pool.query('UPDATE membros SET token_redefinicao=$1,token_expira_em=$2 WHERE id=$3', [hashToken(token),expires,id]),
    async consumirToken(token, senha) {
        return one(`UPDATE membros SET senha=$1,token_redefinicao=NULL,token_expira_em=NULL,auth_version=auth_version+1
            WHERE token_redefinicao=$2 AND token_expira_em > NOW() RETURNING id,nome,email`,
            [await bcrypt.hash(senha,12),hashToken(token)]);
    },
    async confirmarEmail(token, senha) {
        return one(`UPDATE membros SET email_verificado=TRUE,senha=$1,token_confirmacao=NULL,confirmation_expires_at=NULL,auth_version=auth_version+1
            WHERE token_confirmacao=$2 AND confirmation_expires_at>NOW() AND email_verificado=FALSE RETURNING id`,
            [await bcrypt.hash(senha,12),hashToken(token)]);
    },
    novoTokenConfirmacao: (id,token) => pool.query("UPDATE membros SET token_confirmacao=$1,confirmation_expires_at=NOW()+INTERVAL '24 hours' WHERE id=$2 AND email_verificado=FALSE", [hashToken(token),id]),
    async registrarAcesso(id, actor) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const member = await client.query(`SELECT id FROM membros WHERE id=$1 AND email_verificado=TRUE
                AND consent_at IS NOT NULL AND consent_revoked_at IS NULL
                AND validade >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE FOR UPDATE`, [id]);
            if (!member.rowCount) { await client.query('ROLLBACK'); return null; }
            // Row lock serializes attendance for this member across application instances.
            await client.query(`INSERT INTO acessos (membro_id,data,horario)
                SELECT $1,(NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE,(NOW() AT TIME ZONE 'America/Sao_Paulo')::TIME
                WHERE NOT EXISTS (SELECT 1 FROM acessos WHERE membro_id=$1 AND data=(NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE)`, [id]);
            await client.query("INSERT INTO security_audit(actor_id,action,target_id) VALUES ($1,'attendance_recorded',$2)", [actor,id]);
            await client.query('COMMIT');
            return { id };
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    },
    listarUltimos: async (limit=5) => (await pool.query('SELECT id,nome,cargo FROM membros WHERE email_verificado=TRUE AND consent_revoked_at IS NULL ORDER BY id DESC LIMIT $1', [limit])).rows,
    async dashboard() {
        const total = await one('SELECT COUNT(*) AS total FROM membros WHERE email_verificado=TRUE AND consent_revoked_at IS NULL');
        const accesses = await pool.query(`SELECT m.nome,TO_CHAR(a.data,'DD/MM/YYYY') AS data,TO_CHAR(a.horario,'HH24:MI') AS horario
            FROM acessos a JOIN membros m ON m.id=a.membro_id WHERE a.data=(NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
            AND m.consent_revoked_at IS NULL ORDER BY a.id DESC LIMIT 10`);
        return { totalMembros: Number(total.total), ultimosAcessos: accesses.rows };
    },
    listarSemMatricula: async () => (await pool.query('SELECT id,nome FROM membros WHERE matricula IS NULL OR validade IS NULL')).rows,
    atualizarMatriculaValidade: (id,matricula,validade) => pool.query('UPDATE membros SET matricula=$1,validade=$2 WHERE id=$3',[matricula,validade,id])
};
