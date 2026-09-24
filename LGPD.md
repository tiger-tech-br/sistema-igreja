# Operação de privacidade e LGPD

O sistema implementa controles técnicos, mas a conformidade também depende da operação da igreja. A filiação a organização religiosa é dado pessoal sensível. Antes de publicar, a igreja deve definir e documentar o controlador, as finalidades, as bases legais, os operadores contratados, os prazos de retenção e quem atende os titulares.

## Antes da publicação

1. Preencha `PRIVACY_CONTROLLER`, `PRIVACY_EMAIL`, `APP_URL` com HTTPS, `SESSION_SECRET` aleatório e as credenciais do banco no ambiente da hospedagem. No Railway, deixe `TRUST_PROXY_HOPS` vazio para detectar automaticamente o único proxy da plataforma. Cadastros novos ficam bloqueados enquanto o controlador e o contato não estiverem configurados.
2. Faça um backup protegido e teste em homologação. O Railway executará `npm run migrate` automaticamente antes de `npm start`. A migração não inventa aceite ou consentimento para cadastros antigos. O novo fluxo vale para novos cadastros; a igreja deve documentar separadamente a base legal aplicada aos dados históricos e comunicar alterações materiais do aviso aos titulares.
3. Crie ou rotacione o administrador com variáveis temporárias `ADMIN_NAME`, `ADMIN_EMAIL` e `ADMIN_PASSWORD`, usando `npm run criar-admin` ou `npm run criar-admin -- --rotate`. Depois, remova `ADMIN_PASSWORD` do ambiente.
4. Restrinja o banco e os backups, use TLS, limite os acessos administrativos e revise os contratos da hospedagem, banco e Resend. O arquivo `igreja-db.sql` distribuído foi sanitizado; cópias históricas devem ser tratadas separadamente.
5. Defina por escrito os prazos para cadastros pendentes, presenças, sessões, auditoria, solicitações e backups. A exclusão deve observar obrigações legais justificadas e também alcançar cópias de segurança ao final do prazo definido.

## Atendimento ao titular

O membro pode baixar seus dados e registrar acesso, correção, exclusão, revogação, informação ou oposição em `/privacidade`. O administrador consulta os protocolos em `/admin/privacidade`, verifica a identidade fora do campo de mensagem, executa a providência aplicável e registra a resposta. Marcar um protocolo como concluído não apaga dados automaticamente.

A revogação suspende a credencial e novos registros de presença, mas preserva o acesso à conta para o exercício de direitos. A igreja deve avaliar exclusão ou retenção com base legal e informar a decisão ao titular.

## Novos cadastros

O formulário apresenta duas confirmações independentes e inicialmente desmarcadas: ciência do Aviso de Privacidade e consentimento específico para o dado sensível de vínculo religioso. O servidor valida ambas, fornece a versão oficial do texto e registra versão, conteúdo e data/hora. Alterar a versão ou as finalidades exige atualizar `config/privacy.js`, o aviso público e, quando a mudança afetar o consentimento, obter nova manifestação do titular.

## Incidentes

Preserve evidências sem divulgar dados, contenha o acesso, identifique categorias e titulares afetados, avalie risco ou dano relevante e registre decisões. Quando aplicável, o controlador deve comunicar a ANPD e os titulares em até três dias úteis, conforme a regulamentação vigente: https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis

## Limites

Este repositório não comprova a configuração da hospedagem, contratos, rotinas humanas, bases legais ou retenção real. Faça revisão jurídica e operacional adequada à igreja antes da publicação. Referência legal: https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm
