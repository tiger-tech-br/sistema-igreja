# Preferências do Sistema Igreja

## Campos de data

- Não usar `input type="date"`, calendários nativos ou `showPicker()` nos formulários do projeto. O usuário prefere digitar a data diretamente, sem navegar por meses ou anos.
- Usar campo de texto no formato **DD/MM/AAAA**, com `inputmode="numeric"`, limite de 10 caracteres e barras inseridas automaticamente durante a digitação.
- Aplicar o mesmo padrão no site, no navegador responsivo, nas versões web/PWA e nos APKs.
- Preservar a validação de datas reais, anos bissextos e as regras de idade existentes, tanto na interface quanto no servidor.

## Matrículas dos membros

- Gerar matrículas com exatamente **8 dígitos numéricos aleatórios**, sem letras, prefixos ou separadores.
- As matrículas devem ser únicas. Se houver colisão, gerar outro número sem tratar o caso como e-mail duplicado.
- Preservar as matrículas existentes que já seguem esse padrão.

## Atualização dos APKs

- Todos os APKs atuais e futuros deste projeto devem oferecer o gesto de puxar a tela de cima para baixo para atualizar.
- O gesto deve atualizar os dados ou conferir a conexão mantendo o login, com indicação visual discreta de carregamento.
- Não reenviar registros de presença nem executar outras gravações como efeito da atualização. Preservar ações em andamento e evitar interferência em formulários, confirmações e leitura da câmera.
- Reutilizar o comportamento compartilhado dos aplicativos e impedir atualizações simultâneas.
