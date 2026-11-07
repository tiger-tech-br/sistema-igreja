const crypto = require('node:crypto');
const { passwordValid, adultDate } = require('../utils/security');
const { VERSION, privacyConfig } = require('../config/privacy');
const gerarValidade = require('../utils/validade');

const text = (value, max = 300) => typeof value === 'string' && value.length <= max ? value.trim() : '';
function registrationError(message, status = 400) {
    return Object.assign(new Error(message), { status });
}

function createMemberRegistrationService(options = {}) {
    const config = options.privacyConfig || privacyConfig;
    const createMember = options.createMember || (data => require('../models/membroModel').criar(data));
    const randomToken = options.randomToken || (() => crypto.randomBytes(32).toString('hex'));
    const generateRegistration = options.generateRegistration || (() => crypto.randomBytes(12).toString('hex'));
    const generateValidity = options.generateValidity || gerarValidade;

    async function register(input, { immediate = false } = {}) {
        if (!config().configured) throw registrationError('Cadastro temporariamente indisponível: o responsável deve configurar o contato de privacidade.', 503);
        const d = input || {};
        const nome = text(d.nome, 150);
        const email = text(d.email, 150).toLowerCase();
        const birth = adultDate(d.dataNascimento);
        if (!/^[A-Za-zÀ-ÿ\s]{3,150}$/.test(nome) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw registrationError('Informe nome e e-mail válidos.');
        if (!birth) throw registrationError('O cadastro é exclusivo para maiores de 18 anos. Informe uma data válida.');
        if (!passwordValid(d.senha)) throw registrationError('Use uma senha com pelo menos 12 caracteres e no máximo 72 bytes.');
        if (d.cienciaPrivacidade !== true || d.consentimento !== true || d.privacyVersion !== VERSION) throw registrationError('Confirme a leitura do Aviso de Privacidade e autorize especificamente o tratamento do vínculo religioso.');
        const optional = {};
        for (const field of ['telefone', 'celular', 'endereco', 'sexo', 'estadoCivil']) {
            if (d[field] != null && (typeof d[field] !== 'string' || d[field].length > 300)) throw registrationError('Campo opcional inválido.');
            optional[field] = text(d[field]) || null;
        }
        if (optional.celular && optional.celular.replace(/\D/g, '').length !== 11) throw registrationError('Celular inválido.');
        if (optional.telefone && optional.telefone.replace(/\D/g, '').length !== 10) throw registrationError('Telefone inválido.');
        if (optional.sexo && !['Masculino', 'Feminino'].includes(optional.sexo)) throw registrationError('Sexo inválido.');
        if (optional.estadoCivil && !['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)'].includes(optional.estadoCivil)) throw registrationError('Estado civil inválido.');
        const confirmationToken = immediate ? null : randomToken();
        try {
            const member = await createMember({
                ...optional, nome, email, senha: d.senha, dataNascimento: birth,
                matricula: generateRegistration(), validade: generateValidity(),
                confirmationToken, cadastroLiberado: immediate === true
            });
            return { member, confirmationToken };
        } catch (error) {
            if (error.code === '23505') throw registrationError('Já existe um cadastro com este e-mail. Entre na sua conta ou use a recuperação de senha.', 409);
            throw error;
        }
    }

    return { register };
}

module.exports = { createMemberRegistrationService };
