---
title: A palavra-chave do corretor cadastra o lead
tags: [whatsapp, crm, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/api/webhooks/whatsapp/route.ts
  - src/lib/whatsapp/repositorio.ts
  - src/lib/whatsapp/palavraChaveDiscreta.ts
  - src/lib/whatsapp/historicoDoChat.ts
  - src/lib/whatsapp/importarHistorico.ts
  - src/lib/crm/filaDeTrabalho.ts
  - supabase/migrations/0146_palavra_chave_cadastra_o_lead.sql
fonte: plano de ativação da IA, Fase 1 (03/10/2026)
created: 2026-10-03
updated: 2026-10-03
summary: Num número sem lead, o porteiro da 0111 descartava a mensagem do corretor antes de ler a palavra-chave. Agora a palavra é lida antes do porteiro e cadastra o número na carteira de quem digitou, com o histórico do chat quando a Evolution o tiver. Número que já é lead de outro corretor não muda de carteira, a IA fica calada e só quem digitou recebe aviso. A palavra nova precisa ser discreta (6+ caracteres, fora da lista de expressões comuns).
---

# A palavra-chave do corretor cadastra o lead

**O defeito:** desde a 0111, número sem lead é ignorado no porteiro do
webhook, e a palavra-chave só era lida DEPOIS dele. Em número novo, o
corretor digitava a palavra e nada acontecia.

**Hoje (0146):** a mensagem do corretor (`fromMe`) com a palavra de teste ou
de ativação é lida antes do porteiro (`cadastrarPelaPalavraChave`). O
telefone é procurado em todas as carteiras, com e sem o nono dígito:

| onde está | o que acontece |
|---|---|
| na carteira de quem digitou | segue como sempre: libera a IA |
| em nenhuma | nasce na carteira dele, origem `whatsapp/ativado_pelo_corretor`, nome `WhatsApp 1234` até o cliente falar |
| na de outro corretor (N6) | nada é criado; linha em `ativacoes_em_lead_alheio`; aviso na fila do Início só para quem digitou, sem o nome do dono |

- **Nome:** o pushName de uma mensagem `fromMe` é o do CORRETOR. Por isso o
  lead nasce com o placeholder e a primeira fala do cliente preenche.
- **Palavra de teste:** o lead nasce ARQUIVADO (origem
  `whatsapp/teste_do_corretor`). Arquivado já é o recorte que todas as
  telas, relatórios e campanhas respeitam; uma coluna `e_teste` em `leads`
  exigiria lembrar o filtro em cada consulta.
- **Histórico:** `importarHistoricoDoChat` pede o chat à Evolution
  (`/chat/findMessages`), grava até 50 mensagens de 30 dias e transcreve os 5
  áudios mais recentes, depois da resposta (`after`). A instância desta base
  provavelmente não guarda mensagens (ver
  [[audio-do-cliente-era-arquivo-cifrado]]); sem nada, a conversa mostra
  "Histórico anterior à ativação não foi importado" (`historico_anterior`).
- **Palavra discreta (N8):** o cliente lê a mensagem. Palavra NOVA precisa
  de 6+ caracteres, não pode ser só expressão comum ("ok", "bom dia",
  "obrigado.."), e emoji sozinho só se não for de todo dia. A que já estava
  salva continua valendo, com aviso na tela pedindo a troca (a da Bruna tem
  3 caracteres).

## Decidido com o Matheus em 03/10
- Lead de outro corretor: aviso só na fila do Início, sem criar conversa no
  painel de quem digitou (mantém a regra da 0111).
- Primeira fala de número novo em áudio ou foto continua ignorada sem
  gravar; só a etiqueta de anúncio da Meta cadastra (isso já funcionava:
  `anuncioDaEtiqueta` lê o `contextInfo` do `audioMessage`).

## Relacionadas
- [[trava-de-palavra-chave-e-cliente-conhecido]]
- [[conversa-casa-com-lead-por-telefone]]
- [[fluxo-do-webhook-whatsapp]]
