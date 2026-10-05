# Nexo

Protótipo instalável de mensageiro web com cadastro por telefone, conversas, anexos, gravação de áudio, temas, chamadas e atualizações.

## Cadastro por telefone

O app funciona em dois modos:

1. **Modo teste local/preview:** informe um número e use o código `123456`.
2. **SMS real no GitHub Pages/celular:** já configurado com o projeto Firebase `KidSafe ColliDev Security`.

Configuração feita:

1. App Web `Nexo` registrado no Firebase.
2. Authentication > Sign-in method > Phone ativado.
3. Domínio `collicellilondon.github.io` autorizado.
4. `firebase-config.js` preenchido com a configuração pública do Web App.

No site publicado, o Nexo não aceita o código demo. Se o Firebase não carregar ou o SMS falhar, o cadastro fica bloqueado até corrigir domínio, cota ou telefone.

Para testar SMS real localmente, prefira `http://localhost:4187`. Em `127.0.0.1`, o Firebase pode retornar domínio não autorizado se esse domínio não estiver liberado no Console.

Observação: no plano Spark, o Firebase informou cota inicial de 10 SMS/dia para novos projetos. Para aumentar esse limite, será necessário adicionar faturamento no projeto.

Não coloque service account, chave privada, senha ou segredo no navegador.

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
