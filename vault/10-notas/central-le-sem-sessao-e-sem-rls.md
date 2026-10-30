---
title: O número central lê sem sessão, e o que a RLS recortava vira filtro explícito
aliases: [consultas do central, consultar_lead, quem_ligar_hoje, montarFilaDeTrabalho]
tags: [crm, armadilha]
type: armadilha
status: growing
custou: medio
codigo:
  - src/lib/central/tratadores/consultas.ts
  - src/lib/crm/filaDeTrabalho.ts
  - src/lib/crm/resumoDoLead.ts
  - src/lib/grupos/servicoComGrupo.test.ts
fonte: onda 1 do número central, frente A (consultas), 30/10/2026
created: 2026-10-30
updated: 2026-10-30
summary: As funções de leitura do painel confiam na RLS em pontos que não aparecem no código. Pela chave de serviço (número central), reaproveitadas como estão, a fila traria sugestões de todos os grupos e o resumo do lead mostraria ao gestor a conversa alheia (0134). A fila ganhou o miolo montarFilaDeTrabalho com semSessao; o resumo do lead não é reaproveitado.
---
# O central lê sem sessão: o recorte da RLS vira filtro explícito

O número central não tem cookie: roda com a chave de serviço, que enxerga
todos os grupos e ignora as policies. Reaproveitar uma leitura do painel
pede conferir, consulta por consulta, **o que a RLS recortava calada**.

## O que apareceu nas consultas da onda 1 (30/10/2026)

- **Fila do Início (`getFilaDeTrabalho`)**: dependia de `createClient()` da
  sessão. Virou `getFilaDeTrabalho` → `montarFilaDeTrabalho(cliente, …)`, sem
  mudar o painel. Todas as consultas já recortam pelo corretor (`dono`),
  menos a das **sugestões de mensagem** (`whatsapp_followups`, que não tem
  corretor): com sessão quem recorta é a RLS; sem sessão (`semSessao:
  { grupoId }`) ela filtra o grupo e `conversa.corretor_id`. Sem sessão e sem
  corretor a fila volta vazia: os lembretes sem destinatário seriam do banco
  inteiro.
- **Resumo do lead (`lerResumoDoLead`)**: lê a conversa SÓ pelo `lead_id` e
  conta com a 0134 para esconder do gestor a conversa de outro corretor.
  Pela chave de serviço o gestor veria a data do último contato alheio. O
  `consultar_lead` não o reaproveita: lê a ficha e o dossiê com `grupo_id` e
  a conversa com `corretor_id` = quem pergunta.
- `lerDocumentacaoDoLead` serve: o gestor lê documentos pela RLS (0118, 0179)
  e o id já vem resolvido no escopo por `resolverLead`.

## Regras que ficaram

- Gestor pede "quem eu ligo hoje": é a lista DELE, como corretor (a mesma
  régua do hotfix de 19/10 na fila do Início), não a da equipe.
- Consulta devolve rótulos prontos em São Paulo ("amanhã 10:00"), nunca ISO:
  o modelo erra o fuso quando converte.
- Da conversa sai só quem falou por último e quando; o texto do cliente
  nunca vai ao cérebro.
- "Lead quente" não existia na fila: vem do dossiê da IA
  (`lead_observacoes_ia.temperatura_label`), no máximo 2, depois da fila (6).

## Em aberto

- `situacaoDaTarefa` compara o dia no fuso do servidor (UTC na Vercel), no
  painel e no central: tarefa das 22h de SP já conta como "amanhã".

Ligações: [[crm-pelo-whatsapp-numero-central-com-ia]], [[fila-do-inicio-e-uma-fila]], [[a-ia-so-responde]].
