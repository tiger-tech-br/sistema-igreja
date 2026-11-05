# Leitor de presenças da igreja

Aplicativo exclusivo para administradores autorizados: entrar com a conta administrativa, ler o QR Code do membro e confirmar a presença no servidor do Sistema Igreja. A câmera permanece aberta entre as leituras para atender o próximo membro rapidamente.

Este é um projeto independente de interface e aplicativo Android, com `package.json`, dependências e compilação próprios. Ele está na subpasta `leitor-qrcode` do mesmo repositório para facilitar a entrega conjunta da API. Utiliza os cadastros e o banco existentes por meio do servidor; o APK não se conecta diretamente ao PostgreSQL.

**Gerar o APK não atualiza automaticamente o servidor.** A API `/api/leitor` precisa estar implantada no servidor escolhido para o APK autenticar e registrar presenças naquele endereço. Ao atualizar este projeto, publique também as alterações correspondentes no servidor.

## O que está incluído

- Tela de acesso com “Acesso autorizado”, parágrafo centralizado e botão “Entrar”.
- Tela inicial após o login, com botão dourado “Escanear QRCode”. A câmera só é aberta ao tocar nesse botão.
- Botão “Voltar” na câmera para retornar à tela inicial sem encerrar a sessão; “Sair” permanece nas duas telas autenticadas.
- Leitura contínua de QR Code com confirmação somente após resposta positiva do servidor.
- Identificação do membro e indicação de presença nova ou já confirmada no período.
- Último resultado confirmado visível enquanto a câmera prepara a próxima leitura.
- Lanterna quando o aparelho e a câmera oferecerem esse recurso.
- Avisos de QR inválido, conexão indisponível, demora do servidor e acesso expirado.
- Aplicativo Android e versão web que compartilham a mesma interface e regras de envio.

O leitor não contém gestão de membros nem substitui o painel administrativo. O aplicativo futuro do membro, que mostrará o próprio QR Code e abrirá a credencial após confirmação, é uma etapa separada. O aviso automático para esse aplicativo ainda não faz parte deste leitor.

## Ferramentas e requisitos no Windows

| Ferramenta | Para que serve | Requisito deste projeto |
| --- | --- | --- |
| Node.js e npm | Instalam as dependências e executam a compilação | Node.js 22 ou superior; nesta máquina foi encontrado Node.js 24 |
| Capacitor 8 | Empacota a interface web em um aplicativo Android e liga o JavaScript aos recursos nativos | Dependências locais do projeto; não precisa instalar o Capacitor globalmente |
| Android Studio | Abre e compila o projeto Android | Nesta máquina foi encontrado Android Studio 2026 |
| Android SDK | Fornece os componentes necessários para compilar e instalar no Android | Plataforma Android API 36, Build Tools e Platform Tools |
| JDK 21 | Executa a compilação Android | Pode ser usado o Java incluído na pasta `jbr` do Android Studio |

O aplicativo está configurado para Android 7.0/API 24 ou superior, com compilação e destino na API 36. A câmera deve estar disponível e ter permissão concedida.

Se precisar preparar outra máquina:

1. Instale uma versão compatível do [Node.js](https://nodejs.org/en/download).
2. Instale o [Android Studio](https://developer.android.com/studio) e conclua o assistente inicial.
3. No Android Studio, abra **Tools > SDK Manager**. Instale a plataforma Android API 36 e os componentes Android SDK Build-Tools, Android SDK Platform-Tools e Android SDK Command-line Tools.
4. Confira as licenças solicitadas pelo SDK. A primeira compilação também precisa de internet para baixar as dependências do Android.

O script de geração procura o SDK em `%LOCALAPPDATA%\Android\Sdk` e o Java em `C:\Program Files\Android\Android Studio\jbr`. As variáveis `ANDROID_HOME`/`ANDROID_SDK_ROOT` e `JAVA_HOME`, quando definidas, têm preferência.

## Instalar as dependências

Abra o PowerShell na pasta do sistema e entre no projeto do leitor:

```powershell
Set-Location 'C:\Users\andre\Desktop\gemini-cursos\front-end\tiger-tech\projetos\sistema-igreja\leitor-qrcode'
node --version
npm --version
npm ci
```

`npm ci` instala exatamente as versões registradas no `package-lock.json`. As principais dependências são:

- `@capacitor/core`, `@capacitor/android` e `@capacitor/cli`: execução, projeto Android e comandos do Capacitor 8.
- `@capacitor/app`: avisa quando o aplicativo vai para segundo plano ou volta à tela.
- `@capacitor-mlkit/barcode-scanning`: leitura nativa de QR Code no Android.
- `html5-qrcode`: leitura pela câmera na versão web, incluindo o caminho previsto para Safari.
- Vite: prepara os arquivos web que serão incluídos no APK ou servidos pelo Sistema Igreja. Não exige React.

## Configurar o endereço do servidor

O arquivo `.env.example` contém somente a configuração pública de endereço. Para personalizar o destino, copie-o para `.env` dentro de `leitor-qrcode`:

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
```

Exemplo de conteúdo:

```dotenv
VITE_SERVER_URL=https://sistema-igreja-production.up.railway.app
```

Não coloque senhas, chaves, `SESSION_SECRET`, credenciais do banco ou outros segredos nesse arquivo. Valores `VITE_` entram nos arquivos distribuídos com o aplicativo.

Quando `VITE_SERVER_URL` fica vazio:

- **No APK Android:** o endereço padrão é `https://sistema-igreja-production.up.railway.app`.
- **No navegador:** é usado o mesmo domínio que está servindo o leitor.

Mantenha o endereço público do servidor coerente com o `APP_URL` configurado no Sistema Igreja. O leitor aceita os QR Codes atuais no formato `/validar?id=ID` desse servidor, além do formato `MEMBRO:ID`. URLs de outros domínios são rejeitadas pelo leitor.

O servidor deve usar HTTPS. Um endereço `localhost` no Android aponta para o próprio telefone, não para o computador. A configuração atual do APK não permite tráfego HTTP sem proteção; para o teste integrado no aparelho, utilize um servidor HTTPS com a API atualizada.

Se alterar `.env`, compile novamente a versão web e sincronize/recompile o APK. Alterar o arquivo depois da instalação não muda o aplicativo já instalado.

## Compilar a interface web

Dentro de `leitor-qrcode`:

```powershell
npm run build:web
```

Os arquivos prontos são gravados em `leitor-qrcode/dist`. Eles não contêm o servidor nem o banco.

Para desenvolver apenas a interface, existe `npm run dev`. O Vite possui um encaminhamento local de `/api/leitor` para `http://127.0.0.1:3000`, mas isso não elimina a conferência de origem da API. Para testar autenticação e presença sem alterar essas proteções, use a versão compilada no caminho `/leitor/` do próprio servidor, como descrito abaixo.

## Abrir o projeto no Android Studio

A pasta `android` já foi criada neste projeto. **Não é necessário executar `cap add android` novamente.** Somente em uma cópia que ainda não tenha a plataforma Android, depois da compilação web, utilize:

```powershell
npx cap add android
```

Para atualizar os arquivos incluídos no projeto Android:

```powershell
npm run sync:android
```

Esse comando compila a interface e executa a sincronização do Capacitor. Em seguida, abra o Android Studio:

```powershell
npm run open:android
```

No Android Studio, aguarde a sincronização do Gradle. Para executar diretamente em um telefone, conecte-o por USB, habilite a depuração USB nas opções de desenvolvedor e autorize o computador no aparelho. Selecione o telefone na lista de dispositivos e use **Run**.

## Gerar o APK de testes

Dentro de `leitor-qrcode`:

```powershell
npm run build:apk
```

O script `scripts/build-android.mjs`:

1. Localiza o SDK e o Java do Android Studio.
2. Atualiza `android/local.properties` com o caminho local do SDK.
3. Compila os arquivos web e sincroniza o Capacitor.
4. Executa a compilação Android `assembleDebug`.
5. Copia o APK para `leitor-qrcode/artifacts/igreja-leitor-debug.apk`.

Se a instalação do SDK ou do Studio estiver em outro local, ajuste as variáveis para aquela sessão do PowerShell e repita a geração:

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
npm run build:apk
```

O arquivo gerado é um **APK de testes, assinado com chave de depuração**. Serve para instalar e validar nos aparelhos; não é uma versão final de distribuição.

## Instalar o APK no Android

1. Transfira `artifacts/igreja-leitor-debug.apk` para o telefone.
2. Abra esse arquivo pelo aplicativo de arquivos do aparelho.
3. Se o Android pedir permissão para instalar dessa origem, permita apenas ao aplicativo usado para abrir esse APK conhecido. Depois da instalação, essa permissão pode ser desativada novamente.
4. Abra **Leitor de presenças** e use **Entrar** com uma conta administrativa autorizada.
5. Na tela inicial, toque em **Escanear QRCode** e conceda a permissão da câmera, quando solicitada.
6. Apresente um QR Code de membro e aguarde a confirmação enviada pelo servidor. A câmera continua aberta para o próximo membro.
7. Use **Voltar** para fechar a câmera e retornar à tela inicial mantendo a conta conectada. **Sair**, disponível na tela inicial e na câmera, encerra o acesso e retorna ao login.

Esta atualização Android é a versão **1.1**, código **2**. O identificador do aplicativo e a assinatura de testes permanecem os mesmos, permitindo atualizar a instalação anterior com essa assinatura.

Como alternativa, com telefone conectado por USB e depuração autorizada, o APK pode ser instalado pelo Platform Tools:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" install -r '.\artifacts\igreja-leitor-debug.apk'
```

A versão final deverá usar uma chave de assinatura própria, mantida em local privado, com cópia de segurança e senhas fora do repositório. Esse preparo será feito em uma etapa posterior; não compartilhe a chave nem a senha no aplicativo. Atualizações do mesmo aplicativo devem manter a assinatura correspondente. Consulte a [documentação de assinatura Android](https://developer.android.com/studio/publish/app-signing).

## Usar a versão web pelo Sistema Igreja

O servidor principal está preparado para servir os arquivos compilados em `/leitor/`. Na raiz de `sistema-igreja`, é possível preparar somente o leitor:

```powershell
npm run build:leitor
```

Ou compilar os estilos do sistema e o leitor juntos:

```powershell
npm run build
```

Depois, execute o servidor pelo fluxo normal do Sistema Igreja, com suas configurações válidas. No ambiente local padrão, o endereço é `http://localhost:3000/leitor/`. No servidor publicado, será `https://SEU-DOMINIO/leitor/`.

O comando de compilação não publica o sistema. A publicação da API e dos arquivos web precisa ocorrer antes do teste nesse endereço remoto.

No iPhone, o caminho previsto é abrir a versão web HTTPS no Safari e permitir a câmera. O usuário também pode adicionar o site à tela inicial pelo menu de compartilhamento do Safari. A validação no Safari e no modo aberto pela tela inicial deve ser feita em um iPhone real. Esta etapa não gera aplicativo iOS nativo nem requer compilação com Xcode.

O projeto atual oferece a versão web compartilhada. Recursos completos de PWA, como política própria de cache e comportamento offline, devem ser definidos em uma etapa específica. A presença continua dependendo da confirmação online do servidor.

## Como a leitura rápida funciona

No Android, o método usado é `BarcodeScanner.startScan()`, configurado somente para QR Code, câmera traseira e resolução de 1280 × 720. Ele usa o modelo ML Kit incluído no APK; não precisa baixar um modelo do Google Play na primeira leitura. Não utiliza o método `scan()`, que tem requisitos diferentes.

Entre dois membros, a câmera não é fechada nem reiniciada e a página não é recarregada. O envio ao servidor é feito uma vez por vez. Assim que a resposta chega, o leitor fica disponível para outro QR Code. O tempo final depende também do foco, da iluminação, da rede e da resposta do servidor; a velocidade precisa ser medida no aparelho real.

Manter o mesmo QR Code diante da câmera não dispara uma sequência de pedidos. Uma leitura diferente pode seguir assim que o pedido em andamento terminar. O último resultado confirmado continua visível e não é apagado apenas porque outro QR Code inválido entrou no enquadramento.

Ao ir para segundo plano, a câmera é pausada. O aplicativo tenta retomar o uso quando volta à tela. A lanterna aparece somente quando for suportada pela câmera.

O retorno do segundo plano respeita a tela escolhida: se estiver na tela inicial, a câmera continua fechada. **Voltar** também desliga a câmera e a lanterna, sem apagar a última presença confirmada. Uma solicitação que já tenha sido enviada ao servidor pode concluir depois desse retorno; seu resultado fica disponível ao abrir o leitor novamente. O botão Voltar do próprio Android tem o mesmo comportamento na câmera; nas outras telas, coloca o aplicativo em segundo plano.

## Acesso e confirmação de presença

- O login usa uma conta de administrador já existente no Sistema Igreja.
- A API do leitor fornece um token com escopo exclusivo de registro de presença e validade de duas horas.
- Esse token fica apenas na memória do aplicativo. Ao encerrar/reabrir o aplicativo, ou ao recarregar a página, é necessário entrar novamente. Ir para segundo plano não equivale necessariamente a encerrar o processo.
- O leitor não cria uma sessão administrativa do painel e não usa cookies para autorizar a leitura.
- O servidor verifica se o administrador ainda existe e se sua versão de autenticação continua válida antes de registrar.
- Sair elimina o token local. A validade de uma eventual cópia do token termina com sua expiração ou revogação da identidade no servidor.

As rotas novas são `POST /api/leitor/login`, `GET /api/leitor/sessao` e `POST /api/leitor/presenca/:id`. A API permite a origem web de `APP_URL` e a origem Android do Capacitor, `https://localhost`, sem liberar todas as origens e sem desativar as proteções do painel.

A presença reutiliza `registrarAcesso` do sistema: uma por membro, data e período, segundo o horário de São Paulo. Repetições retornam a presença já existente e preservam seu primeiro horário. O painel consulta o servidor automaticamente e pode exibir os registros feitos pelo aplicativo.

### Sem conexão ou resposta demorada

Sem resposta positiva do servidor, o leitor não mostra uma nova confirmação. Se a solicitação demorar mais que o limite, ela pode ter sido recebida antes da perda da resposta. Use **Tentar novamente** ou reapresente o QR Code para conferir; a regra do servidor impede duplicação no mesmo período.

Não existe uma fila de presenças offline nesta versão. O último resultado confirmado pode continuar na tela, mas os avisos identificam a tentativa atual que ainda não foi confirmada.

### Regra existente a alinhar

O registro de presença atual exige um membro existente, mas não aplica todos os requisitos da consulta pública de credencial. A consulta pública também verifica confirmação do e-mail, consentimento e validade. Essa diferença já existia no sistema e foi preservada nesta etapa: o leitor não introduz silenciosamente um bloqueio novo por credencial vencida ou consentimento. O alinhamento dessas regras precisa ser decidido antes do uso definitivo.

## Testes e validação em aparelhos

Os testes do leitor usam simulações de respostas e não substituem a câmera real. Dentro de `leitor-qrcode`:

```powershell
npm test
```

Na raiz do Sistema Igreja, rode os testes da API e do sistema:

```powershell
npm test
```

O teste de integração dos períodos depende de um banco de testes explicitamente configurado em `ATTENDANCE_TEST_DATABASE_URL`; sem ele, esse teste é ignorado. Não use o banco real da igreja como banco de testes.

Antes de considerar a leitura pronta para uso, valide:

- [ ] Login de administrador válido, senha incorreta, saída e acesso expirado.
- [ ] Após entrar, a tela inicial aparece sem abrir a câmera; “Escanear QRCode” abre o leitor.
- [ ] “Voltar” fecha a câmera sem pedir novo login, inclusive durante a abertura ou confirmação de uma leitura.
- [ ] Abrir o leitor novamente mantém a última presença confirmada e permite continuar as leituras.
- [ ] “Sair” encerra o acesso tanto na tela inicial quanto na câmera.
- [ ] Câmera permitida e negada em um Android real.
- [ ] QR Code válido na tela e em uma credencial impressa.
- [ ] QR inválido, domínio diferente e membro inexistente, sem presença confirmada.
- [ ] Mesmo QR mantido diante da câmera, sem repetição de pedidos contínuos.
- [ ] Releitura no mesmo período, preservando o primeiro horário e sem duplicação.
- [ ] Leitura em períodos diferentes, registrando cada período permitido.
- [ ] Rede desligada e resposta perdida/demorada, sem falso sucesso.
- [ ] Nova tentativa depois da conexão voltar, sem duplicar o registro.
- [ ] Sequência de membros diferentes, medindo leitura e tempo para o próximo QR.
- [ ] Painel aberto em outro dispositivo recebendo as presenças do leitor.
- [ ] Lanterna, ida para segundo plano e retorno no Android.
- [ ] Safari em um iPhone real, por HTTPS, incluindo permissão da câmera e retorno à tela.
- [ ] Versão adicionada à tela inicial do iPhone, quando utilizada dessa forma.

Esta lista é um roteiro de validação; não afirma que os testes físicos já foram realizados.

## Documentação das ferramentas

- [Capacitor: preparação do ambiente](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor: fluxo de desenvolvimento](https://capacitorjs.com/docs/basics/workflow)
- [Plugin ML Kit Barcode Scanning](https://capawesome.io/docs/sdks/capacitor/mlkit/barcode-scanning/)
- [Capawesome: leitura com modelo embutido, sem Google Play Services](https://capawesome.io/blog/capacitor-barcode-scanning-without-google-play-services/)
- [Google: leitura de códigos com ML Kit no Android](https://developers.google.com/ml-kit/vision/barcode-scanning/android)
- [Android: assinatura do aplicativo](https://developer.android.com/studio/publish/app-signing)
- [Apple: adicionar um site como aplicativo na tela inicial](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios)
