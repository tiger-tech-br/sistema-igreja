const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { VERSION } = require('../config/privacy');
const { createMemberRegistrationService } = require('../services/memberRegistrationService');

// Only an explicitly configured test database is used. TEMP tables shadow the
// application tables for this connection and vanish when it closes.
test('PostgreSQL registers both flows with eight-digit matriculas, recovers their collisions and preserves email/token rules', {
    skip: !process.env.REGISTRATION_TEST_DATABASE_URL
}, async t => {
    const client = new Client({ connectionString: process.env.REGISTRATION_TEST_DATABASE_URL });
    await client.connect();
    const pool = require('../database/connection');
    const model = require('../models/membroModel');
    const originalConnect = pool.connect;
    pool.connect = async () => ({ query: client.query.bind(client), release() {} });
    t.after(async () => { pool.connect = originalConnect; await client.end(); });
    await client.query(`CREATE TEMP TABLE membros (
        id SERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, data_nascimento DATE,
        telefone VARCHAR(20), celular VARCHAR(20), email VARCHAR(150) NOT NULL UNIQUE,
        senha VARCHAR(255) NOT NULL, email_verificado BOOLEAN NOT NULL DEFAULT FALSE,
        endereco TEXT, cargo VARCHAR(100), ministerio VARCHAR(100), sexo VARCHAR(20),
        estado_civil VARCHAR(30), matricula VARCHAR(30) NOT NULL UNIQUE, validade DATE NOT NULL,
        privacy_notice_version VARCHAR(30), privacy_notice_text TEXT, privacy_notice_at TIMESTAMPTZ,
        consent_version VARCHAR(30), consent_text TEXT, consent_at TIMESTAMPTZ,
        token_confirmacao VARCHAR(255), confirmation_expires_at TIMESTAMPTZ,
        cadastro_liberado BOOLEAN NOT NULL DEFAULT FALSE
    )`);
    await client.query(`CREATE TEMP TABLE privacy_consents (
        id BIGSERIAL PRIMARY KEY, membro_id INTEGER NOT NULL REFERENCES membros(id) ON DELETE CASCADE,
        version VARCHAR(30) NOT NULL, notice_text TEXT, texto TEXT NOT NULL
    )`);
    const generated = ['12345678', '12345678', '23456789'];
    const collisions = [];
    const service = createMemberRegistrationService({
        privacyConfig: () => ({ configured: true }), generateValidity: () => '2028-12-31',
        generateRegistration: () => generated.shift() || '34567890',
        createMember: async data => {
            try { return await model.criar(data); }
            catch (error) { collisions.push({ code: error.code, constraint: error.constraint }); throw error; }
        }
    });
    const data = {
        nome: 'Pessoa de Teste', dataNascimento: '20/05/1990', email: 'immediate@example.invalid',
        senha: 'senha-de-teste-123', cienciaPrivacidade: true, consentimento: true, privacyVersion: VERSION
    };
    const immediate = await service.register(data, { immediate: true });
    const deferred = await service.register({ ...data, email: 'email@example.invalid' });
    const rows = (await client.query(`SELECT id,email_verificado,cadastro_liberado,token_confirmacao,
        confirmation_expires_at,telefone,celular,endereco,sexo,estado_civil,matricula FROM membros ORDER BY id`)).rows;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].id, immediate.member.id);
    assert.equal(rows[0].matricula, '12345678');
    assert.equal(rows[1].matricula, '23456789');
    for (const row of rows) assert.match(row.matricula, /^[1-9]\d{7}$/);
    assert.deepEqual(collisions, [{ code: '23505', constraint: 'membros_matricula_key' }]);
    assert.equal(rows[0].cadastro_liberado, true);
    assert.equal(rows[0].email_verificado, false);
    assert.equal(rows[0].token_confirmacao, null);
    assert.equal(rows[0].confirmation_expires_at, null);
    for (const field of ['telefone', 'celular', 'endereco', 'sexo', 'estado_civil']) assert.equal(rows[0][field], null);
    assert.equal(rows[1].id, deferred.member.id);
    assert.equal(rows[1].cadastro_liberado, false);
    assert.equal(rows[1].email_verificado, false);
    assert.equal(rows[1].token_confirmacao, crypto.createHash('sha256').update(deferred.confirmationToken).digest('hex'));
    assert.ok(rows[1].confirmation_expires_at > new Date());
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM privacy_consents')).rows[0].count), 2);
    await assert.rejects(service.register({ ...data, email: 'IMMEDIATE@example.invalid' }, { immediate: true }), { status: 409 });
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM membros')).rows[0].count), 2);
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM privacy_consents')).rows[0].count), 2);
});
