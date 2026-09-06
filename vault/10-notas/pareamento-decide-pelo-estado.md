---
title: A Evolution ignora o ?number= quando a instância está em connecting
aliases: [pairingCode nulo, pareamento por código]
tags: [whatsapp, armadilha]
type: nota
status: evergreen
custou: alto
codigo: [src/lib/whatsapp/pareamento.ts, src/lib/whatsapp/provider.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: docs/MEMORIA.md — conectar/desconectar o número
summary: O botão abria o QR primeiro, a instância ficava em connecting, e o pairingCode voltava nulo SEMPRE. Hoje o método é escolhido antes de qualquer chamada.
---
# A Evolution ignora o `?number=` em `connecting`

`GET /instance/connect/{nome}` sem parâmetro devolve QR; com
`?number=55DDNNNNNNNNN` devolve `pairingCode` (8 caracteres para digitar em
Aparelhos conectados → Conectar com número de telefone) — o caminho de quem
abre o painel pelo próprio celular que vai parear.

Só que o comportamento depende do **estado**:

| estado | o que faz com `?number=` |
|---|---|
| `open` | ignora — devolve o estado da conexão |
| `connecting` | **ignora o número e devolve o QR em cache** |
| `close` | chama `requestPairingCode` → devolve `pairingCode` |

Como o botão "Conectar" abria o QR primeiro (`/instance/create` com
`qrcode: true`), a instância já estava em `connecting` quando o corretor pedia
o código — e o `pairingCode` voltava **nulo sempre**.

## Hoje (`pareamento.ts`, com a tabela acima como teste)

- O método é escolhido **antes** de qualquer chamada.
- O create leva o `number` junto.
- Um `connecting` pendente é derrubado com `logout` antes do connect.
- Estado `open` **nunca** é derrubado por iniciativa do sistema — quem
  desconecta é o corretor.

## Falha calada é pior que erro

A tela devolvia formulário vazio quando `codigoPareamento` vinha nulo sem
`erro`. Todo caminho agora carrega um `desfecho`
(`codigo | qr | ja_conectado | sem_codigo`) com uma frase para cada.

## O fim do pareamento acontece fora do nosso alcance

Quem sabe que o código foi digitado é a Evolution. A tela pergunta a cada 5s
(`verificarConexaoWhatsapp` → `sincronizarConexaoInstancia`, teto ~2 min) —
sem isso, pareamento bem-sucedido segue mostrando "Aguardando Leitura".

## Relacionadas
- [[trocar-numero-zera-reputacao]]
- [[falha-calada-e-a-pior]]
