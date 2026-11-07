# Minha credencial — aplicativo do membro

Aplicativo Android exclusivo do membro, separado do **Leitor de presenças** do administrador. Nome no aparelho: **Minha credencial**. Pacote: `br.com.assembleiadedeus.membro`. O ícone claro com cartão de identificação diferencia este aplicativo do leitor escuro. Os dois podem ser instalados juntos.

**Atualização 1.2.0, código Android 5:** cadastro pelo próprio aplicativo, com formulário de nome, nascimento, e-mail, senha e autorizações. Após o cadastro, a conta fica liberada e o aplicativo volta ao login, sem pedir aprovação da administração ou confirmação por e-mail. Depois de entrar, o membro apresenta seu QR Code e continua com o fluxo de confirmação e credencial existente. A área **Minha conta** permite excluir o próprio cadastro mediante senha atual.

**Atualização 1.1.1, código Android 4:** nome da igreja padronizado para **Assembléia de Deus** nas telas e no manifesto web. A regra interna das presenças e o fluxo QR Code → confirmação → credencial permanecem iguais, sem indicação de períodos nas telas.

**Atualização 1.1.0, código Android 3:** checkbox **Mantenha-me conectado**. Ao marcar e entrar, o aplicativo restaura o acesso por até 30 dias quando for aberto novamente, sem pedir e-mail e senha. **Sair** apaga o acesso salvo. A correção do QR Code da versão anterior permanece incluída.

**Atualização 1.0.1:** corrige o erro “Illegal invocation” ao iniciar o acompanhamento da leitura depois de carregar a imagem do QR Code. A chamada aos temporizadores do navegador mantém o contexto correto. O APK tem código de versão 2 e pode ser instalado por cima da versão de testes anterior com a mesma assinatura.

## Fluxo

1. Quem ainda não tem conta usa **Cadastre-se como membro**, preenche os dados e autorizações e volta ao login após a confirmação do servidor. Quem já tem cadastro entra normalmente com o mesmo e-mail e senha da área do membro do Sistema Igreja.
2. O aplicativo prepara e mostra somente o QR Code desse membro.
3. O administrador escaneia pelo leitor existente; o servidor registra a presença pela mesma regra de data e período.
4. Uma confirmação nova do servidor abre a tela verde com um ✓ branco desenhado em SVG e efeito breve. Não usa o emoji com quadrado verde.
5. Após cerca de 1,3 segundo, o aplicativo busca e apresenta a credencial, validada pelo servidor.
6. **Voltar ao meu QR Code** inicia uma nova apresentação. **Sair** encerra o acesso e limpa os dados locais da sessão.

O aplicativo não tem scanner, não pede câmera e não registra presença sozinho. A credencial compartilha os campos e o renderer da página pública existente (`/validar`) e a mesma regra do servidor; a interface fica dentro do aplicativo para preservar os botões e a sessão. Consultar a credencial não registra presença.

## Confirmação entre os dois aplicativos

A migração `database/migrations/005_member_scan_state.sql` cria uma linha de confirmação por membro, com contador crescente e referência à presença. O contador é atualizado na mesma transação que registra a presença, inclusive quando a leitura confirma um registro já existente. O primeiro horário da presença continua preservado.

Antes de mostrar o QR Code, o aplicativo recebe o contador atual como referência. Uma presença antiga não dispara a animação; somente uma leitura posterior à apresentação atual pode confirmar. Não há histórico adicional ilimitado de leituras.

Enquanto o QR estiver visível e o aplicativo estiver em primeiro plano, ele consulta a própria confirmação a cada dois segundos. As consultas são serializadas, com espera progressiva em falhas de conexão e nos limites do servidor. O estado é guardado no PostgreSQL existente e funciona também com mais de uma instância do servidor. Não depende de um aviso em memória de uma única instância.

Uma falha de rede nunca produz confirmação. Ao ir para segundo plano, as consultas param e a referência é mantida. **Voltar ao meu QR Code** obtém uma referência nova. A tela verde respeita a preferência do aparelho por reduzir movimento.

## Servidor obrigatório

**O APK exige a atualização correspondente do Sistema Igreja no servidor.** Gerar ou instalar o APK não instala a API nem a migração no Railway.

Arquivos do servidor desta etapa incluem:

- `routes/appMembroRoutes.js`: API exclusiva de leitura da própria identificação e confirmação.
- `services/appMembroTokenService.js`: token de membro separado do token do leitor e das sessões administrativas.
- `services/memberCredentialService.js`: validação da credencial compartilhada.
- `models/membroModel.js`: confirmação persistente, atômica com a presença.
- `database/migrations/005_member_scan_state.sql`: tabela com uma linha por membro.
- `database/migrations/007_member_registration_access.sql`: liberação do cadastro independente da verificação de e-mail. O endereço não é registrado como verificado sem ter sido conferido.
- Integração em `app.js`, compilação em `package.json` e renderer compartilhado em `js/credencial-view.js`.

As rotas próprias são:

| Método e rota | Função |
| --- | --- |
| `GET /api/app-membro/cadastro/config` | Obter as informações atuais de privacidade e as autorizações do formulário |
| `POST /api/app-membro/cadastro` | Criar a conta com acesso liberado, sem iniciar sessão |
| `POST /api/app-membro/login` | Acessar com a conta existente do membro |
| `POST /api/app-membro/excluir-conta` | Excluir somente o próprio cadastro autenticado, após conferir a senha atual |
| `POST /api/app-membro/qrcode` | Preparar o QR próprio e sua referência de leitura |
| `GET /api/app-membro/presenca?after=...` | Consultar somente a confirmação do próprio membro |
| `GET /api/app-membro/credencial` | Consultar a credencial própria validada |

Nenhuma dessas rotas permite escolher outro membro ou alterar cadastros. O token temporário fica somente na memória, dura duas horas e é conferido contra `auth_version` em cada solicitação. Sem marcar **Mantenha-me conectado**, fechar o processo ou recarregar exige novo login. Com a opção marcada, uma credencial separada permite restaurar e renovar o acesso por até 30 dias sem salvar a senha. Falhas temporárias de conexão preservam a opção; expiração, senha alterada, exclusão e revogação do acesso exigem entrar novamente.

O segredo persistente fica protegido pelo Android Keystore e AES-GCM, isolado do leitor. Na web, fica em cookie HttpOnly; o armazenamento web guarda somente um marcador. A migração adicional é `006_remembered_mobile_sessions.sql`; as rotas de renovação e saída são `POST /api/app-membro/refresh` e `POST /api/app-membro/logout`. Consulte `mobile-shared/README.md`.

QR e credencial exigem e-mail confirmado, consentimento ativo e validade vigente. O cadastro e a recuperação de senha continuam pelos fluxos existentes do site. O registro de presença do leitor mantém suas regras anteriores; esta etapa não altera silenciosamente quem pode ter presença registrada.

O limite de consultas é por membro para permitir o uso do Wi-Fi compartilhado da igreja. O login admite oito tentativas por conta e 300 por IP em 15 minutos. As regras das outras rotas existentes continuam com seus próprios limites.

## Requisitos e configuração no Windows

Usa as mesmas ferramentas já instaladas para o leitor: Node.js 22 ou superior, Capacitor 8, Vite 7, Android Studio, Java 21 e Android SDK API 36. O APK atende Android 7/API 24 ou superior.

O Capacitor empacota a interface web e integra o ciclo de vida do Android. O Android Studio e seu SDK fornecem a compilação e as ferramentas de instalação. Este projeto não depende das bibliotecas de câmera do leitor.

Na pasta `membro-app`, instale as versões registradas:

```powershell
npm ci
```

O servidor padrão do Android é `https://sistema-igreja-production.up.railway.app`. Para outro endereço HTTPS, copie `.env.example` para `.env` nesta pasta e ajuste `VITE_SERVER_URL`. É uma configuração pública: não inclua senhas, chaves ou dados de banco. Alterações nesse endereço exigem recompilar o aplicativo.

O SDK é procurado em `%LOCALAPPDATA%\Android\Sdk` e o Java em `C:\Program Files\Android\Android Studio\jbr`. `ANDROID_HOME`/`ANDROID_SDK_ROOT` e `JAVA_HOME` têm preferência quando configurados.

## Compilar

Dentro de `membro-app`:

```powershell
npm test
npm run build:apk
```

O comando compila a interface, sincroniza o projeto Android, executa `assembleDebug` e entrega:

`artifacts/minha-credencial-v1.2.0-debug.apk`

Para abrir o projeto Android existente:

```powershell
npm run sync:android
npm run open:android
```

A pasta Android já está criada; não execute `cap add android` novamente nesta cópia.

O arquivo é um APK de testes, assinado com chave de depuração. Uma futura distribuição definitiva precisa de chave própria protegida e mantida para as próximas atualizações. Não inclua a chave nem suas senhas no repositório.

## Instalar e validar

Transfira o APK para o Android e abra-o pelo aplicativo de arquivos. Se o aparelho solicitar, autorize essa origem para instalar o APK conhecido. O membro usa sua própria conta; a conta de administrador pertence ao leitor.

Valide em dois aparelhos:

- Login do membro e QR correspondente, com administrador usando o APK leitor já existente.
- Leitura válida: confirmação no leitor, atualização do painel, tela verde no membro e credencial correta.
- Releitura no mesmo período: primeiro horário preservado e nova confirmação para uma nova apresentação do QR.
- Abrir o app depois de uma presença antiga: QR continua aguardando uma leitura nova.
- Sem conexão: nenhuma confirmação falsa; depois da recuperação, resposta real do servidor.
- Sair durante solicitação ou animação: dados limpos, sem reabrir credencial.
- Segundo plano, retorno, expiração e botão Voltar do Android.
- Credencial expirada ou consentimento revogado: dados não exibidos como válidos.
- Ícone e nome diferentes, com os dois aplicativos instalados juntos.

Os testes automatizados usam dados simulados e não comprovam instalação, foco da câmera do outro aparelho ou comunicação real entre dois telefones.

## Versão web

O servidor também serve os mesmos arquivos em `/minha-credencial/`. O comando de compilação do sistema prepara os dois aplicativos. A presença depende de conexão; esta etapa não implementa funcionamento offline nem um aplicativo iOS nativo.
