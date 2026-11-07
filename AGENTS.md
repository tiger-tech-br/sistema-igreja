# Preferências do Sistema Igreja

## Campos de data

- Não usar `input type="date"`, calendários nativos ou `showPicker()` nos formulários do projeto. O usuário prefere digitar a data diretamente, sem navegar por meses ou anos.
- Usar campo de texto no formato **DD/MM/AAAA**, com `inputmode="numeric"`, limite de 10 caracteres e barras inseridas automaticamente durante a digitação.
- Aplicar o mesmo padrão no site, no navegador responsivo, nas versões web/PWA e nos APKs.
- Preservar a validação de datas reais, anos bissextos e as regras de idade existentes, tanto na interface quanto no servidor.
