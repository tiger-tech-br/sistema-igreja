# Acesso salvo dos aplicativos

Os dois aplicativos usam o checkbox **Mantenha-me conectado**, desmarcado inicialmente. Quando marcado, uma credencial opaca permite abrir novamente e renovar o acesso por até **30 dias**, com prazo fixo a partir do login. O aplicativo não grava a senha nem conserva o token temporário de duas horas em armazenamento persistente.

No **Android**, o plugin local `SecureSession` protege o registro com AES-GCM e chave Android Keystore. O registro fica em SharedPreferences privado, criptografado, com IV novo por gravação e autenticação vinculada ao pacote. Os aplicativos possuem chaves e registros separados. Não há dependência nova nem permissão adicional. O código nativo compartilhado é incluído pelos dois projetos Gradle.

Na **web**, a credencial fica exclusivamente em cookie HttpOnly, SameSite Strict, Secure em HTTPS e limitado à API de cada aplicativo. O JavaScript recebe somente o prazo e grava um marcador sem segredo no armazenamento web. As APIs continuam exigindo origem autorizada. A renovação não regrava o cookie nem estende o prazo de 30 dias.

O servidor guarda somente o hash de uma credencial aleatória. A migração `006_remembered_mobile_sessions.sql` cria as sessões persistentes com vínculo ao administrador ou membro e sua versão de autenticação. Uma senha alterada, identidade excluída, acesso revogado ou prazo vencido impede restaurar. **Sair** remove o registro local e solicita a revogação da credencial persistente. A validade do token temporário continua seguindo a regra anterior de até duas horas.

Uma falha de conexão não apaga o login salvo. A restauração e os dados atualizados ainda precisam de internet; não há promessa de funcionamento offline. No leitor, a restauração abre a tela inicial e a câmera continua dependendo de **Escanear QRCode**. No membro, a restauração prepara seu QR Code novamente, sem transformar uma presença antiga em confirmação nova.

`session.js` serializa leitura, gravação e remoção para que uma saída solicitada durante uma gravação pendente prevaleça. Dados de outro aplicativo, outro servidor, vencidos ou corrompidos são descartados. O plugin não usa armazenamento de texto como alternativa caso a criptografia falhe.

Os testes Java em `test/br/com/assembleiadedeus/shared/SessionCipherTest.java` verificam o cifrador com a JVM local. Os testes JavaScript cobrem armazenamento, restauração, rede, saída e respostas pendentes. A gravação e recuperação pelo Keystore ainda devem ser validadas nos aparelhos reais após instalar os novos APKs.
