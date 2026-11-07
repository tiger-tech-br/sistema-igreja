const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const bcrypt = require('bcrypt');
const { VERSION } = require('../config/privacy');
const { createMemberRegistrationService } = require('../services/memberRegistrationService');
const { memberHasAccess } = require('../services/memberAccessService');
const { memberCredentialResult } = require('../services/memberCredentialService');
const { createRememberSessionService } = require('../services/rememberSessionService');
const { createAppMembroRouter } = require('../routes/appMembroRoutes');
const gerarMatricula = require('../utils/matricula');

const config = () => ({ configured: true, version: VERSION, noticeText: 'Aviso de teste', consentText: 'Autorização de teste', controller: 'Igreja de teste', contact: 'privacidade@example.test' });
const input = () => ({ nome: 'Pessoa de Teste', email: ' PESSOA@example.test ', dataNascimento: '20/05/1990', senha: 'senha-de-teste-123', cienciaPrivacidade: true, consentimento: true, privacyVersion: VERSION });

test('shared registration generator always returns exactly eight numeric digits', () => {
    for (let i = 0; i < 500; i++) assert.match(gerarMatricula(), /^[1-9]\d{7}$/);
});

test('registration retries only matricula conflicts and keeps the same password, token and validity', async () => {
    const generated = ['12345678', '23456789', '34567890'];
    const attempts = [];
    let tokenCalls = 0, validityCalls = 0;
    const service = createMemberRegistrationService({ privacyConfig: config,
        generateRegistration: () => generated.shift(),
        randomToken: () => { tokenCalls++; return 'confirmation-secret'; },
        generateValidity: () => { validityCalls++; return '2028-12-31'; },
        createMember: async data => {
            attempts.push(data);
            if (attempts.length < 3) throw Object.assign(new Error('unique violation'), {
                code: '23505', constraint: attempts.length === 1 ? 'membros_matricula_key' : 'membros_matricula_unique'
            });
            return { id: 42, email: data.email };
        }
    });
    const result = await service.register(input());
    assert.equal(result.member.id, 42);
    assert.deepEqual(attempts.map(data => data.matricula), ['12345678', '23456789', '34567890']);
    assert.equal(tokenCalls, 1);
    assert.equal(validityCalls, 1);
    for (const data of attempts) {
        assert.equal(data.senha, input().senha);
        assert.equal(data.confirmationToken, 'confirmation-secret');
        assert.equal(data.validade, '2028-12-31');
    }
});

test('matricula retry is bounded and other unique or database errors do not become a false duplicate-email message', async () => {
    let attempts = 0;
    const exhausted = createMemberRegistrationService({ privacyConfig: config, generateRegistration: () => '12345678',
        createMember: async () => { attempts++; throw Object.assign(new Error('collision'), { code: '23505', constraint: 'membros_matricula_key' }); } });
    await assert.rejects(exhausted.register(input(), { immediate: true }), error => error.status === 503 && !error.message.includes('e-mail'));
    assert.equal(attempts, 10);
    for (const error of [Object.assign(new Error('other unique'), { code: '23505', constraint: 'membros_pkey' }),
        Object.assign(new Error('connection lost'), { code: '08006' })]) {
        const service = createMemberRegistrationService({ privacyConfig: config, createMember: async () => { throw error; } });
        await assert.rejects(service.register(input()), actual => actual === error);
    }
    let emailAttempts = 0;
    const duplicate = createMemberRegistrationService({ privacyConfig: config, createMember: async () => {
        emailAttempts++; throw Object.assign(new Error('email unique'), { code: '23505', constraint: 'membros_email_key' });
    } });
    await assert.rejects(duplicate.register(input()), { status: 409 });
    assert.equal(emailAttempts, 1);
});

test('registration shares minimal validation and server-controlled metadata without inventing verified email', async () => {
    const created = [];
    let tokenCount = 0;
    const service = createMemberRegistrationService({ privacyConfig: config,
        createMember: async data => { created.push(data); return { id: 42, nome: data.nome, email: data.email }; },
        randomToken: () => { tokenCount++; return 'confirmation-secret'; },
        generateRegistration: () => '12345678', generateValidity: () => '2027-12-31'
    });
    const immediate = await service.register({ ...input(), id: 99, cargo: 'Pastor', ministerio: 'Admin',
        auth_version: 100, email_verificado: true, cadastroLiberado: false, matricula: 'spoofed', validade: '2099-01-01' }, { immediate: true });
    assert.equal(immediate.confirmationToken, null);
    assert.equal(tokenCount, 0, 'immediate registration does not create an email confirmation/reset token');
    assert.equal(created[0].cadastroLiberado, true);
    assert.equal(created[0].email, 'pessoa@example.test');
    assert.equal(created[0].dataNascimento, '1990-05-20');
    assert.equal(created[0].matricula, '12345678');
    assert.equal(created[0].validade, '2027-12-31');
    for (const field of ['id', 'cargo', 'ministerio', 'auth_version', 'email_verificado']) assert.equal(field in created[0], false, field);
    for (const field of ['telefone', 'celular', 'endereco', 'sexo', 'estadoCivil']) assert.equal(created[0][field], null, field);
    await service.register({ ...input(), cadastroLiberado: true });
    assert.equal(created[1].cadastroLiberado, false, 'the existing website flow still waits for email confirmation');
    assert.equal(created[1].confirmationToken, 'confirmation-secret');
    assert.equal(tokenCount, 1);
});

test('registration rejects invalid input and missing authorizations before persistence and maps duplicates', async () => {
    let creates = 0;
    const service = createMemberRegistrationService({ privacyConfig: config, createMember: async () => { creates++; } });
    for (const changed of [
        { nome: '<script>' }, { email: 'invalid' }, { dataNascimento: '31/02/1990' }, { dataNascimento: '01/01/2020' },
        { senha: 'short' }, { senha: 'á'.repeat(37) }, { consentimento: false }, { cienciaPrivacidade: false },
        { privacyVersion: 'stale' }, { telefone: {} }, { celular: '123' }, { sexo: 'other' }, { estadoCivil: 'other' }
    ]) await assert.rejects(service.register({ ...input(), ...changed }, { immediate: true }), { status: 400 });
    assert.equal(creates, 0);
    const unavailable = createMemberRegistrationService({ privacyConfig: () => ({ configured: false }), createMember: () => { throw new Error('must not persist'); } });
    await assert.rejects(unavailable.register(input(), { immediate: true }), { status: 503 });
    const duplicate = createMemberRegistrationService({ privacyConfig: config, createMember: async () => { throw Object.assign(new Error('private database detail'), { code: '23505' }); } });
    await assert.rejects(duplicate.register(input(), { immediate: true }), error => error.status === 409 && !error.message.includes('private'));
});

test('activation permits credentials and remembered access while email verification remains false', async () => {
    const member = { id: 42, auth_version: 1, nome: 'Pessoa de Teste', email_verificado: false, cadastro_liberado: true,
        consent_at: '2026-11-06', consent_revoked_at: null, validade: '31/12/2027', matricula: 'TEST-42' };
    assert.equal(memberHasAccess(member), true);
    assert.equal(memberCredentialResult(member).success, true);
    assert.equal(memberCredentialResult({ ...member, consent_at: null }).success, false);
    assert.equal(memberCredentialResult({ ...member, consent_revoked_at: '2026-11-06' }).success, false);
    assert.equal(memberHasAccess({ ...member, cadastro_liberado: false }), false);
    assert.equal(memberHasAccess({ ...member, cadastro_liberado: 'true' }), false, 'activation cannot be a truthy string');
    let remembered;
    const sessions = createRememberSessionService({ pool: { async query(sql, args) {
        if (sql.startsWith('INSERT')) remembered = { membro_id: args[3], auth_version: args[4], expires_at: args[7], revoked_at: null };
        if (sql.startsWith('UPDATE')) remembered.revoked_at = args[2];
        return { rows: sql.startsWith('SELECT') && !remembered.revoked_at ? [remembered] : [] };
    } } });
    const saved = await sessions.issue('membro', member);
    assert.equal((await sessions.restore('membro', saved.refreshToken, async () => member)).identity.email_verificado, false);
    assert.equal(await sessions.restore('membro', saved.refreshToken, async () => ({ ...member, cadastro_liberado: false })), null);
});

async function apiFixture(t) {
    let member;
    let deletes = 0;
    const app = express();
    app.use(express.json());
    app.use('/api/app-membro', createAppMembroRouter({
        appUrl: 'https://igreja.example', secret: crypto.randomBytes(48).toString('hex'), privacyConfig: config,
        registrationOptions: { generateValidity: () => '2027-12-31' },
        createMember: async data => {
            if (member) throw Object.assign(new Error('duplicate'), { code: '23505' });
            member = { ...data, id: 42, email_verificado: false, cadastro_liberado: data.cadastroLiberado, auth_version: 1,
                senha: await bcrypt.hash(data.senha, 4), validade: '31/12/2027', consent_at: '2026-11-06', consent_revoked_at: null };
            return { id: member.id, nome: member.nome, email: member.email };
        },
        findMemberByEmail: async email => member?.email === email ? member : null,
        findMemberById: async id => String(member?.id) === String(id) ? member : null,
        generateQrDataUrl: async () => 'data:image/png;base64,dGVzdA==', readScanState: async () => ({ revision: '0', attendance: null }),
        deleteOwn: async ({ id, senha }) => {
            assert.equal(String(id), '42', 'only the authenticated identity reaches account deletion');
            if (!member || !await bcrypt.compare(senha, member.senha)) throw Object.assign(new Error('Senha incorreta.'), { status: 401 });
            member = null; deletes++; return { deleted: true };
        },
        limit: () => (req, res, next) => next(), pollLimiter: (req, res, next) => next()
    }));
    app.use((error, req, res, next) => res.status(500).json({ success: false, message: 'Erro no teste.' }));
    const server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { member: () => member, deletes: () => deletes,
        request: (path, { headers = {}, originHeader = 'https://localhost', ...options } = {}) => fetch(origin + '/api/app-membro' + path, {
            ...options, headers: { ...(originHeader ? { Origin: originHeader } : {}), ...headers }
        }) };
}
const jsonPost = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('app registration returns to login, then exposes only its own QR and credential and supports account deletion', async t => {
    const state = await apiFixture(t);
    const privacy = await state.request('/cadastro/config');
    assert.deepEqual((await privacy.json()).data, config());
    const response = await state.request('/cadastro', jsonPost(input()));
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('set-cookie'), null);
    assert.deepEqual((await response.json()).data, { registered: true, email: 'pessoa@example.test' });
    assert.equal(state.member().email_verificado, false);
    assert.equal(state.member().cadastro_liberado, true);
    assert.equal((await state.request('/qrcode', jsonPost({}))).status, 401, 'registration never auto-authenticates');
    const duplicate = await state.request('/cadastro', jsonPost(input()));
    assert.equal(duplicate.status, 409);
    const login = await state.request('/login', jsonPost({ email: 'pessoa@example.test', senha: input().senha }));
    assert.equal(login.status, 200);
    const access = (await login.json()).data;
    const auth = { Authorization: `Bearer ${access.token}`, 'Content-Type': 'application/json' };
    const qr = await state.request('/qrcode', { method: 'POST', headers: auth, body: JSON.stringify({ id: 99 }) });
    assert.equal(qr.status, 200);
    assert.equal((await qr.json()).data.membro.id, '42');
    const credential = await state.request('/credencial', { headers: auth });
    assert.equal(credential.status, 200);
    assert.equal((await credential.json()).data.id, 42);
    assert.equal((await state.request('/excluir-conta', { method: 'POST', headers: auth, body: JSON.stringify({ senha: 'wrong', id: 99 }) })).status, 401);
    assert.equal(state.deletes(), 0);
    assert.equal((await state.request('/credencial', { headers: auth })).status, 200, 'wrong password does not delete or end the active account');
    const deletion = await state.request('/excluir-conta', { method: 'POST', headers: auth, body: JSON.stringify({ senha: input().senha, id: 99 }) });
    assert.equal(deletion.status, 200);
    assert.deepEqual((await deletion.json()).data, { deleted: true });
    assert.equal(state.deletes(), 1);
    assert.equal((await state.request('/credencial', { headers: auth })).status, 401, 'the old access token cannot use a deleted account');
    assert.equal((await state.request('/login', jsonPost({ email: 'pessoa@example.test', senha: input().senha }))).status, 401);
});

test('registration and account deletion enforce their own origins, content type and authentication', async t => {
    const state = await apiFixture(t);
    for (const path of ['/cadastro', '/excluir-conta']) {
        assert.equal((await state.request(path, { ...jsonPost(input()), originHeader: 'https://evil.example' })).status, 403);
        assert.equal((await state.request(path, { ...jsonPost(input()), originHeader: null })).status, 403);
    }
    assert.equal((await state.request('/cadastro', { method: 'POST', body: 'nome=Teste' })).status, 415);
    assert.equal((await state.request('/excluir-conta', jsonPost({ senha: input().senha }))).status, 401);
    assert.equal(state.member(), undefined);
    assert.equal(state.deletes(), 0);
});

test('the persistence transaction separates immediate activation from email verification and stores password/token hashes', async t => {
    const pool = require('../database/connection');
    const model = require('../models/membroModel');
    const originalConnect = pool.connect;
    const queries = [];
    pool.connect = async () => ({ release() {}, async query(sql, args) {
        queries.push({ sql, args });
        return { rows: sql.includes('INSERT INTO membros') ? [{ id: 42, nome: 'Pessoa de Teste', email: 'pessoa@example.test' }] : [], rowCount: 1 };
    } });
    t.after(() => { pool.connect = originalConnect; });
    const service = createMemberRegistrationService({ privacyConfig: config });
    await service.register(input(), { immediate: true });
    const first = queries.find(query => query.sql.includes('INSERT INTO membros'));
    assert.match(first.sql, /\$6,FALSE/, 'activation does not fabricate verified email');
    assert.match(first.args[5], /^\$2[aby]\$12\$/);
    assert.equal(await bcrypt.compare(input().senha, first.args[5]), true);
    assert.equal(first.args[14], null, 'an immediately activated member has no email confirmation token');
    assert.equal(first.args[15], true);
    assert.equal(queries.filter(query => query.sql.includes('INSERT INTO privacy_consents')).length, 1);
    assert.equal(queries.at(-1).sql, 'COMMIT');
    queries.length = 0;
    const deferred = await service.register(input());
    const second = queries.find(query => query.sql.includes('INSERT INTO membros'));
    assert.equal(second.args[15], false);
    assert.notEqual(second.args[14], deferred.confirmationToken);
    assert.equal(second.args[14], crypto.createHash('sha256').update(deferred.confirmationToken).digest('hex'));
    queries.length = 0;
    pool.connect = async () => ({ release() {}, async query(sql, args) {
        queries.push({ sql, args });
        return { rows: sql.includes('SELECT id FROM membros WHERE LOWER(email)') ? [{ id: 99 }] : [] };
    } });
    await assert.rejects(service.register(input(), { immediate: true }), { status: 409 });
    assert.ok(queries.some(query => query.sql.includes('pg_advisory_xact_lock')));
    assert.ok(queries.some(query => query.sql.includes('LOWER(email)=LOWER($1)')));
    assert.equal(queries.some(query => query.sql.includes('INSERT INTO membros')), false, 'a legacy address with different casing cannot receive a second registration');
    assert.equal(queries.at(-1).sql, 'ROLLBACK');
});

test('an immediately activated member can use website login, QR download, PDF and normal password recovery', async t => {
    const model = require('../models/membroModel');
    const mail = require('../services/emailService');
    const qr = require('../services/qrCodeService');
    const pdf = require('../services/credencialService');
    const original = { buscarPorEmail: model.buscarPorEmail, buscarPorId: model.buscarPorId,
        salvarTokenRecuperacao: model.salvarTokenRecuperacao, novoTokenConfirmacao: model.novoTokenConfirmacao,
        enviarTemplate: mail.enviarTemplate, gerarQRCodeBuffer: qr.gerarQRCodeBuffer, gerarCredencial: pdf.gerarCredencial };
    const member = { id: 42, nome: 'Pessoa de Teste', email: 'pessoa@example.test', senha: await bcrypt.hash(input().senha, 4),
        auth_version: 1, email_verificado: false, cadastro_liberado: true, consent_at: '2026-11-06', consent_revoked_at: null };
    const messages = [], recoveries = [], generated = [];
    model.buscarPorEmail = async () => member;
    model.buscarPorId = async () => member;
    model.salvarTokenRecuperacao = async (...args) => recoveries.push(args);
    model.novoTokenConfirmacao = async () => { throw new Error('an active account must not receive a new confirmation token'); };
    mail.enviarTemplate = async message => messages.push(message);
    qr.gerarQRCodeBuffer = async id => { generated.push(['qr', id]); return Buffer.from('fake-qr'); };
    pdf.gerarCredencial = async (data, res) => { generated.push(['pdf', data.id]); res.send('fake-pdf'); };
    delete require.cache[require.resolve('../controllers/membroController')];
    const controller = require('../controllers/membroController');
    const pdfController = require('../controllers/credencialController');
    t.after(() => {
        for (const key of ['buscarPorEmail', 'buscarPorId', 'salvarTokenRecuperacao', 'novoTokenConfirmacao']) model[key] = original[key];
        mail.enviarTemplate = original.enviarTemplate;
        qr.gerarQRCodeBuffer = original.gerarQRCodeBuffer;
        pdf.gerarCredencial = original.gerarCredencial;
        delete require.cache[require.resolve('../controllers/membroController')];
    });
    function response() { return { statusCode: 200, status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; }, type() { return this; }, attachment() { return this; }, send(value) { this.body = value; return this; } }; }
    const session = { regenerate(done) { done(); }, save(done) { done(); } };
    const login = response();
    await controller.login({ body: { email: member.email, senha: input().senha }, session }, login, error => { throw error; });
    assert.equal(login.body.success, true);
    assert.equal(session.membro.id, 42);
    const recovery = response();
    await controller.esqueciSenha({ body: { email: member.email } }, recovery, error => { throw error; });
    assert.equal(recovery.body.success, true);
    assert.equal(recoveries.length, 1);
    assert.match(recoveries[0][1], /^[a-f0-9]{64}$/);
    assert.equal(messages[0].template, 'email-redefinir-senha.html');
    await controller.baixarQRCode({ params: { id: '42' } }, response(), error => { throw error; });
    await pdfController.gerar({ params: { id: '42' } }, response(), error => { throw error; });
    assert.deepEqual(generated, [['qr', 42], ['pdf', 42]]);
});
