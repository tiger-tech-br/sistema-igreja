const path = require('node:path');
const { unlink } = require('node:fs/promises');

function accountError(status, message) {
    return Object.assign(new Error(message), { status });
}

async function removeStoredQr(id) {
    const directory = path.resolve(__dirname, '..', 'qrcodes');
    const file = path.resolve(directory, `membro-${id}.png`);
    if (path.dirname(file) !== directory) throw new Error('Caminho de QR Code inválido.');
    try { await unlink(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function createMemberAccountService(options = {}) {
    const pool = options.pool || require('../database/connection');
    const comparePassword = options.comparePassword || require('bcrypt').compare;
    const removeQrFile = options.removeQrFile || removeStoredQr;

    async function deleteOwn({ id, senha } = {}) {
        if (!/^[1-9]\d{0,9}$/.test(String(id ?? '')) || typeof senha !== 'string' || !senha.length || Buffer.byteLength(senha) > 72) {
            throw accountError(400, 'Informe sua senha atual para excluir o cadastro.');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // The same row lock used by attendance serializes deletion with a pending scan.
            // Password changes must finish before the password is checked under this lock.
            const found = await client.query('SELECT id,senha FROM membros WHERE id=$1 FOR UPDATE', [id]);
            const member = found.rows[0];
            if (!member?.senha || !await comparePassword(senha, member.senha)) {
                throw accountError(401, 'Senha incorreta. Confira sua senha atual e tente novamente.');
            }
            // Requests may contain personal text and their FK otherwise only clears the member ID.
            await client.query('DELETE FROM privacy_requests WHERE membro_id=$1', [id]);
            await client.query('DELETE FROM membros WHERE id=$1', [id]);
            // No name, e-mail, member ID or password is retained in this audit event.
            await client.query("INSERT INTO security_audit(action) VALUES('member_self_deleted')");
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally { client.release(); }
        // Current QR images are generated in memory. This only removes a legacy local file.
        // A cleanup failure cannot undo a committed deletion or make the QR valid again.
        await Promise.resolve().then(() => removeQrFile(String(id))).catch(() => console.error('[MEMBER_QR_CLEANUP_FAILED]'));
        return { deleted: true };
    }

    return { deleteOwn };
}

module.exports = { createMemberAccountService };
