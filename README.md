# Nexo

Protótipo instalável de mensageiro web com cadastro por telefone, conversas, anexos, gravação de áudio, temas, chamadas e atualizações.

## Cadastro por telefone

O app funciona em dois modos:

1. **Modo teste local/preview:** informe um número e use o código `123456`.
2. **SMS real no GitHub Pages/celular:** já configurado com o projeto Firebase `KidSafe ColliDev Security`.
3. **SMS com marca NexoApp:** preparado via backend `/api/request-code` e `/api/verify-code` usando Twilio Verify + Firebase Custom Token.

Configuração feita:

1. App Web `Nexo` registrado no Firebase.
2. Authentication > Sign-in method > Phone ativado.
3. Domínio `collicellilondon.github.io` autorizado.
4. `firebase-config.js` preenchido com a configuração pública do Web App.

No site publicado, o Nexo não aceita o código demo. Se o Firebase não carregar ou o SMS falhar, o cadastro fica bloqueado até corrigir domínio, cota ou telefone.

Para testar SMS real localmente, prefira `http://localhost:4187`. Em `127.0.0.1`, o Firebase pode retornar domínio não autorizado se esse domínio não estiver liberado no Console.

Observação: para SMS real via Firebase Phone Authentication, o projeto precisa estar vinculado a uma conta de faturamento do Google Cloud/Plano Blaze. Se aparecer `auth/billing-not-enabled`, o app está correto, mas o Firebase está bloqueando o envio até o faturamento ser ativado. Depois disso, ainda podem existir limites e cobranças por SMS.

Não coloque service account, chave privada, senha ou segredo no navegador.

## SMS com nome NexoApp

O Firebase Phone Auth não permite controlar livremente o remetente do SMS. Para que o usuário veja `NexoApp` como remetente, o fluxo profissional usa Twilio Verify com Alphanumeric Sender ID e depois autentica no Firebase com `signInWithCustomToken`.

Arquivos preparados:

- `api/request-code.js`: envia o OTP pelo Twilio Verify.
- `api/verify-code.js`: valida o OTP e gera um Firebase Custom Token.
- `api/contacts-lookup.js`: verifica quais telefones já possuem conta Nexo no Firebase Auth.
- `api/_shared.js`: CORS, validação e inicialização segura do Firebase Admin.
- `.env.example`: lista das variáveis secretas necessárias.

Variáveis obrigatórias no Vercel:

```bash
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
FIREBASE_PROJECT_ID=kidsafe-collidev-securit-74307
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
NEXO_ALLOWED_ORIGINS=https://collicellilondon.github.io,http://localhost:4187,http://127.0.0.1:4187
```

Para o Reino Unido, o Sender ID alfanumérico precisa seguir as regras do provedor/operadoras. Use `NexoApp` porque tem 7 caracteres, contém letras e fica abaixo do limite comum de 11 caracteres. Quando o backend Vercel estiver publicado, preencha `window.NEXO_AUTH_API_BASE` em `firebase-config.js` com a URL do backend se o app continuar hospedado no GitHub Pages.

## Contatos reais

O Nexo não inclui mais conversas ou mensagens fictícias no estado inicial. A lista começa vazia e o usuário pode:

- buscar contatos pela agenda nativa em navegadores compatíveis, como Chrome no Android;
- adicionar manualmente nome e telefone no iPhone/Safari ou em navegadores sem Contact Picker API;
- salvar contatos e conversas somente no armazenamento local do aparelho;
- verificar, quando o backend estiver ativo, quais telefones já possuem conta Nexo pelo endpoint `/api/contacts-lookup`.

Por privacidade, a versão web/PWA não varre a agenda inteira automaticamente. O sistema abre o seletor nativo e o usuário escolhe quais contatos compartilhar com o Nexo.

## Banco local

Neste início, o Nexo é local-first:

- conversas ficam no armazenamento local do celular;
- fotos, vídeos e áudios anexados são preservados localmente;
- nome, status, avatar e foto de perfil ficam no próprio aparelho;
- o app cria um snapshot local de segurança antes da autenticação por telefone;
- o backup manual pode ser baixado em Configurações > Conversas > Baixar backup local.

## Executar localmente

Sirva esta pasta em um servidor HTTPS ou local. Por exemplo:

```bash
python -m http.server 4187
```

O acesso ao microfone e a instalação como aplicativo requerem HTTPS (ou localhost).

## Produção completa

Para mensagens entre dois celulares de verdade, chamadas entre usuários e sincronização, ainda será necessário um backend realtime. O banco local atual preserva o histórico de cada aparelho, mas não sincroniza conversas entre dispositivos.
