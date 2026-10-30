---
title: Avisos espontâneos pelo número central
aliases: [avisos pelo central, avisoPeloCentral, canalDoAviso, antecedência do lembrete de visita, 0250]
tags: [crm, whatsapp, decisao]
type: decisao
status: seedling
custou: medio
codigo:
  - src/lib/central/avisos.ts
  - src/lib/central/historico.ts
  - src/lib/crm/avisoAoCorretor.ts
  - src/lib/crm/enviarResumoDoDia.ts
  - src/lib/crm/lembretesDeAnotacao.ts
  - src/lib/notificacoes/leadNovo.ts
  - src/lib/notificacoes/lembreteDeVisita.ts
  - src/lib/notificacoes/regrasDeVisita.ts
  - src/app/corretor/(painel)/perfil/AjusteDoAvisoDeVisita.tsx
  - supabase/migrations/0250_antecedencia_do_aviso_de_visita.sql
fonte: fase 2b do número central, Frente J (30/10/2026)
created: 2026-10-30
updated: 2026-10-30
summary: Resumo do dia, lead novo, visita na próxima hora e lembrete da anotação saem pelo central só com onda >= 2, central conectado, central_whatsapp_ativo e pessoa ativa com WhatsApp; um único ponto decide (avisoPeloCentral) e devolve false para o chamador seguir como hoje. O aviso entra no histórico do central como fala do central. A antecedência do lembrete de visita é por pessoa (0250, padrão 60; sem a coluna, 60). Nenhum aviso chama IA.
---
# Avisos espontâneos pelo número central

Spec 4.7. Antes, o resumo do dia e o lembrete da anotação saíam do número
do PRÓPRIO corretor para ele mesmo (cai na conversa "Você", não toca); lead
novo e visita na próxima hora eram só notificação no celular. Pelo central,
chega de outro número: toca, e a pessoa responde ali mesmo.

## Um ponto só decide o canal

`src/lib/central/avisos.ts`:

- `canalDoAviso` (puro): `"central"` só com **onda ≥ 2** (`ONDA_ATUAL`),
  **central conectado** (`lerCentral`), **`grupos.central_whatsapp_ativo`** e
  **pessoa ativa com `whatsapp`** no perfil. Qualquer falta → `"hoje"`.
- `avisoPeloCentral(supabase, corretorId, texto)`: `true` = saiu pelo
  central e entrou no histórico; `false` = o chamador segue o caminho de
  hoje. Com a onda < 2 **não lê nada** (produção na onda 0: zero consulta a
  mais). Envio pelo central que falha também devolve `false` → canal de hoje.
- Chamadores, uma linha cada: `avisarCorretor(..., { espontaneo: true })` no
  resumo (central OU o número próprio; a notificação continua); lead novo e
  visita (notificação de sempre + `avisoPeloCentral`); lembrete da anotação
  (`avisoPeloCentral`, senão o número próprio; o claim
  `lembrete_enviado_em` é o mesmo). O gancho que a Frente I deixou
  ([[documentos-lembrete-e-planilha-pelo-central]]) está feito: o lembrete
  pedido ao central é esta mesma anotação.

## Só os avisos do desenho (anti-objetivo "avisos demais")

`avisarCorretor` sem `espontaneo` NÃO muda: alertas de conversa (lead
quente, cliente sem resposta, evolução do dossiê), reuniões e relatório
semanal ficam no canal de hoje. Pelo central eles fariam o celular tocar a
cada fala do cliente. Lead parado: o push de hora em hora (0236) segue só
push; pelo central ele só vai dentro do resumo, que já é só do dono.

## O aviso vai ao histórico do central

`registrarAvisoNoHistorico` acrescenta `{ papel: "central", texto }` a
`central_estado.historico` (cria a linha se a pessoa nunca escreveu; o grupo
vem do gatilho da 0249). A conversa grava o estado inteiro de uma vez, então
a escrita é **condicional em `atualizado_em`** (duas tentativas). Janela e
teto do histórico (30 min, 20 falas) moram em `central/historico.ts`, usado
pelos dois lados: importar `conversa.ts` no cron carregaria o executor com
todos os tratadores.

**Limite**: a resposta só tem o contexto do aviso dentro de 30 min (a janela
da conversa). "Marca com ele" às 11h sobre o resumo das 8h chega sem
contexto, e o cérebro pergunta de quem.

## Horário por pessoa

- Resumo: a hora já existia (`resumo_hora`, 0121, 6h–11h, padrão 8h, fuso
  SP) com a marca `resumo_diario_em` (uma vez por dia, qualquer canal). Com o
  central, quem está sem o próprio número conectado também entra na lista
  (`corretoresComAvisoPeloCentral`): é quem mais precisa do aviso.
- Visita: **0250** `corretores.antecedencia_visita_min` (15, 30, 60, 90 ou
  120; padrão 60), no perfil (`AjusteDoAvisoDeVisita`, ação com
  `getCorretorLogado`). O tique lê as visitas até 120 min e confere cada uma
  contra a escolha de quem a faz. **Sem a coluna** (42703) todo mundo fica
  em 60 calado, e o ajuste some da tela. Vale também para a notificação,
  com a onda 0.

## Custo

Nenhum aviso chama IA: não conta na cota nem em `registrarConsumoDaIa`
(4.8).

## Relacionadas
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[documentos-lembrete-e-planilha-pelo-central]]
- [[fluxo-de-campanhas]]
- [[MOC — IA e Atendimento]]
