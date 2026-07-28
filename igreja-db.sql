--
-- PostgreSQL database dump
--

\restrict iev7mLgskyjxFogCTJ0G7Zr8cs7ggZCBdEuKQyGBTn8W2EP6wGEbubBC8jusqbp

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-07-10 22:14:15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 222 (class 1259 OID 16430)
-- Name: administradores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.administradores (
    id integer NOT NULL,
    nome character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    senha character varying(255) NOT NULL,
    criado_em timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.administradores OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 16429)
-- Name: administradores_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.administradores_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.administradores_id_seq OWNER TO postgres;

--
-- TOC entry 4928 (class 0 OID 0)
-- Dependencies: 221
-- Name: administradores_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.administradores_id_seq OWNED BY public.administradores.id;


--
-- TOC entry 220 (class 1259 OID 16402)
-- Name: membros; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.membros (
    id integer NOT NULL,
    nome character varying(150) NOT NULL,
    data_nascimento date,
    telefone character varying(20),
    email character varying(150),
    endereco text,
    cargo character varying(100),
    ministerio character varying(100),
    sexo character varying(20),
    estado_civil character varying(50),
    status character varying(20),
    qr_code text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    observacoes text,
    matricula character varying(8),
    validade date
);


ALTER TABLE public.membros OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 16401)
-- Name: membros_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.membros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.membros_id_seq OWNER TO postgres;

--
-- TOC entry 4929 (class 0 OID 0)
-- Dependencies: 219
-- Name: membros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.membros_id_seq OWNED BY public.membros.id;


--
-- TOC entry 4762 (class 2604 OID 16433)
-- Name: administradores id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administradores ALTER COLUMN id SET DEFAULT nextval('public.administradores_id_seq'::regclass);


--
-- TOC entry 4760 (class 2604 OID 16405)
-- Name: membros id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.membros ALTER COLUMN id SET DEFAULT nextval('public.membros_id_seq'::regclass);


--
-- TOC entry 4922 (class 0 OID 16430)
-- Dependencies: 222
-- Data for Name: administradores; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.administradores (id, nome, email, senha, criado_em) FROM stdin;
1	Administrador	admin@igreja.com	$2b$10$3ge.YE1Wrws4PirMlfubiONfrCZ5/TFd0bjBuEeSmfiB9renBw8RG	2026-07-04 18:43:23.555508
2	Pastor João	pastor@igreja.com	$2b$10$tmt3XR45w2NNSwm7KUR0uedP1Unn5OaAu.BkvfXe2YqlRF4yYwj4u	2026-07-04 18:51:09.448335
\.


--
-- TOC entry 4920 (class 0 OID 16402)
-- Dependencies: 220
-- Data for Name: membros; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.membros (id, nome, data_nascimento, telefone, email, endereco, cargo, ministerio, sexo, estado_civil, status, qr_code, created_at, observacoes, matricula, validade) FROM stdin;
3	Ana Paula	\N	11912345678			Evangelista	Casais	Feminino	Divorciado(a)	Ativo	/qrcodes/membro-3.png	2026-06-27 15:04:29.821849		42414178	2028-07-04
9	Itamar Gonçalves Viana	1976-03-31	11976613245	itamar@email.com	Rua São Caetano, 325, Santo André	Pastor	Outro	Masculino	Casado(a)	Ativo	/qrcodes/membro-9.png	2026-06-28 10:34:49.560014	novo pastor	51090677	2028-07-04
1	José Andrey	\N	(11)94122-5138		Rua Brasilio Machado, 40, VP	Presbítero	Casais	Masculino	Solteiro(a)	Ativo	/qrcodes/membro-1.png	2026-06-27 00:02:09.485763		41249512	2028-07-04
8	Leticia Pereira	1984-02-23	11973198843	lety@email.com	Rua das Hortências, 41, Santo André	Membro	Infantil	Feminino	Solteiro(a)	Ativo	/qrcodes/membro-8.png	2026-06-28 00:08:49.013438	novo(a) membro	64036590	2028-07-04
4	Viviani Pereira dos Santos	\N	11932674127		\N	Missionário	Intercessão	\N	\N	\N	/qrcodes/membro-4.png	2026-06-27 15:06:23.088336	\N	57492577	2028-07-04
5	Felipe Da Silva	1996-02-22	11943215167	felipe@email.com	Rua Taipas, 321, São Caetano do Sul	Diácono	Mídia	Masculino	Divorciado(a)	Ativo	/qrcodes/membro-5.png	2026-06-27 15:58:28.974057	novo membro	40015303	2028-07-04
10	Marcela Silva	1970-09-11	(11) 94321-5678	marcela@email.com	Rua Aimoré, 40, Santo André	Membro	Louvor	Feminino	Divorciado(a)	\N	/qrcodes/membro-10.png	2026-07-09 19:55:45.377911	nova integrante	14464515	2028-07-09
\.


--
-- TOC entry 4930 (class 0 OID 0)
-- Dependencies: 221
-- Name: administradores_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.administradores_id_seq', 3, true);


--
-- TOC entry 4931 (class 0 OID 0)
-- Dependencies: 219
-- Name: membros_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.membros_id_seq', 10, true);


--
-- TOC entry 4769 (class 2606 OID 16444)
-- Name: administradores administradores_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_email_key UNIQUE (email);


--
-- TOC entry 4771 (class 2606 OID 16442)
-- Name: administradores administradores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.administradores
    ADD CONSTRAINT administradores_pkey PRIMARY KEY (id);


--
-- TOC entry 4765 (class 2606 OID 16428)
-- Name: membros membros_matricula_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.membros
    ADD CONSTRAINT membros_matricula_key UNIQUE (matricula);


--
-- TOC entry 4767 (class 2606 OID 16412)
-- Name: membros membros_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.membros
    ADD CONSTRAINT membros_pkey PRIMARY KEY (id);


-- Completed on 2026-07-10 22:14:15

--
-- PostgreSQL database dump complete
--

\unrestrict iev7mLgskyjxFogCTJ0G7Zr8cs7ggZCBdEuKQyGBTn8W2EP6wGEbubBC8jusqbp

