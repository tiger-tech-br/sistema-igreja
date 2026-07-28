-- =====================================
-- TABELA DE ADMINISTRADORES
-- =====================================

CREATE TABLE administradores (

    id SERIAL PRIMARY KEY,

    nome VARCHAR(100) NOT NULL,

    email VARCHAR(150) NOT NULL UNIQUE,

    senha VARCHAR(255) NOT NULL,

    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =====================================
-- TABELA DE MEMBROS
-- =====================================

CREATE TABLE membros (

    id SERIAL PRIMARY KEY,

    nome VARCHAR(150) NOT NULL,

    data_nascimento DATE,

    telefone VARCHAR(20),

    email VARCHAR(150) NOT NULL UNIQUE,

    senha VARCHAR(255) NOT NULL,

    email_verificado BOOLEAN DEFAULT FALSE,

    token_confirmacao VARCHAR(255),

    token_redefinicao VARCHAR(255),

    token_expira_em TIMESTAMP,

    endereco TEXT,

    cargo VARCHAR(100),

    ministerio VARCHAR(100),

    sexo VARCHAR(20),

    estado_civil VARCHAR(30),
    matricula VARCHAR(30) NOT NULL UNIQUE,

    validade DATE NOT NULL,

    qr_code TEXT,

    ultimo_login TIMESTAMP,

    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);

-- =====================================
-- TABELA DE ACESSOS
-- =====================================

CREATE TABLE acessos (

    id SERIAL PRIMARY KEY,

    membro_id INTEGER NOT NULL REFERENCES membros(id) ON DELETE CASCADE,

    data DATE NOT NULL DEFAULT CURRENT_DATE,

    horario TIME NOT NULL DEFAULT CURRENT_TIME,

    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

);
