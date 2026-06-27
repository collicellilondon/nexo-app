# Nexo

Protótipo instalável de mensageiro web com cadastro por telefone, conversas, anexos, gravação de áudio, temas, chamadas e atualizações.

## Teste do cadastro

1. Informe um número de telefone.
2. Use o código `123456` no modo de demonstração.

## Executar localmente

Sirva esta pasta em um servidor HTTPS ou local. Por exemplo:

```bash
python -m http.server 4187
```

O acesso ao microfone e a instalação como aplicativo requerem HTTPS (ou localhost).

## Produção

Antes de publicar para usuários reais, conecte um provedor de autenticação por SMS e um backend para sincronizar mensagens em tempo real. Nunca coloque chaves administrativas no código do navegador.
