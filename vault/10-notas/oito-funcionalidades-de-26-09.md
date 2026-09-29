---
title: As oito funcionalidades de 26/09 — o que cada uma faz e onde mora
tags: [crm, whatsapp, arquitetura]
type: nota
status: growing
custou: medio
codigo:
  - supabase/migrations/0118_oito_funcionalidades.sql
  - supabase/migrations/0119_unidade_por_planta.sql
  - supabase/migrations/0120_unidades_disponiveis_na_vitrine.sql
  - src/lib/crm/compatibilidade.ts
  - src/lib/crm/resumoDoDia.ts
  - src/lib/crm/enviarResumoDoDia.ts
  - src/lib/crm/linksDoCliente.ts
  - src/lib/crm/linkPublico.ts
  - src/lib/marketing/aberturaSugerida.ts
  - src/lib/whatsapp/aberturaPelaIA.ts
  - src/lib/imoveis/unidades.ts
  - src/app/api/cron/followups/route.ts
created: 2026-09-26
updated: 2026-09-26
summary: Imóvel encontra quem procurava, resumo do dia no WhatsApp, aberturas A/B sugeridas pela IA, primeiro contato automático com lead de portal, documentos pelo link, pós-visita, seleção personalizada e unidades disponíveis. Quase tudo roda no tique dos follow-ups; nada precisa de cron novo.
---

# As oito funcionalidades de 26/09

Pedidas juntas ("aplique todas"). A 3 e a 4 **já existiam pela metade** — o
placar A/B (0084) e o webhook de e-mail dos portais (nunca recebeu um e-mail:
0 linhas em `inbound_logs`). Antes de construir, medir o que já está lá.

| # | O quê | Onde |
|---|---|---|
| 1 | Imóvel publicado lista os leads da carteira que combinam e leva à lista de transmissão já marcada (`?imovel=&leads=`) | `compatibilidade.ts`, `LeadsQueCombinam.tsx` |
| 2 | Resumo às 8h no WhatsApp do PRÓPRIO corretor: visitas, quem espera, leads novos, lembretes | `resumoDoDia.ts`, `enviarResumoDoDia.ts` |
| 3 | IA sugere duas aberturas (A e B) na régua medida da casa | `aberturaSugerida.ts`, `sugerirAberturas` |
| 4 | Lead de portal ou formulário de anúncio recebe a primeira mensagem sozinho | `abrirConversasDePortal` |
| 5 | Link de documentos do financiamento; arquivos no bucket PRIVADO | `/documentos/[token]`, `LinksDoCliente.tsx` |
| 6 | Pós-visita: 18h depois, a IA pergunta o que ele achou | `agendarPosVisita`, tipo `pos_visita` |
| 7 | Seleção com os 3 imóveis que mais combinam + simulador | `/selecao/[token]` |
| 8 | Unidades por imóvel (disponível/reservada/vendida); vitrine e IA contam delas | `EditorUnidades.tsx`, `unidadesDaPlanta` |

## Decisões que valem mais que o código

- **Compatibilidade só com o que o lead DISSE.** Critério não declarado não
  pontua nem reprova; lead sem critério nenhum não combina com nada — "combina
  com tudo" é o disparo que ninguém responde. Critério declarado e não
  atendido reprova. Orçamento com 10% de folga.
- **Tudo pendurado no tique dos follow-ups**, não em cron novo: resumo (antes
  da janela — é mensagem para o corretor), pós-visita e primeiro contato
  (depois da janela — é iniciativa nossa com cliente). Esta base tem quatro
  recursos que nunca rodaram por falta de `configurar_*`.
- **Primeiro contato não sai de dentro do webhook de e-mail.** Um e-mail pode
  trazer dezenas de leads, cada abertura custa ~20s de IA, e lead que chega às
  3h não recebe mensagem de madrugada. Varredura com claim
  (`primeiro_contato_auto_em`) antes do envio e teto de 2 por tique.
- **O miolo de envio saiu de `acoesIA.ts`** para `aberturaPelaIA.ts`
  (`server-only`): arquivo "use server" transforma toda função exportada em
  endpoint HTTP, e uma que envia sem conferir sessão seria porta aberta. As
  guardas que liam `acoesIA.ts` passaram a ler os dois arquivos.
- **Link para o cliente: o token é a credencial.** `links_do_cliente` sem
  acesso do `anon`, página lida pelo servidor, expira em 30 dias, `noindex`,
  e só o primeiro nome do cliente aparece. A renda NÃO vai no link (ele é
  feito para ser encaminhado). A prévia do corretor usa `?previa=1` e não
  carimba `aberto_em`.
- **Documento pessoal nunca tem URL pública.** Bucket `documentos-clientes`
  privado, sem policy em `storage.objects`; o corretor abre por URL assinada
  de 30 min. A página pública mostra só QUE o item foi enviado.
- **Unidades: uma fonte do número.** `tipologias.unidades_disponiveis` era
  contador manual que nenhuma tela editava (0 de 24). Com unidade ligada à
  planta (0119), o número sai da lista; o `anon` lê só as `disponivel` (0120).
  A IA diz "restam N de X dorm" (prompt v37), nunca preço.
- **Campanha continua excluindo `fechado` e `perdido`.** Perdidos que combinam
  com o imóvel aparecem só como contagem — reabrir é decisão do corretor.

## Limites conhecidos

- O resumo sai da instância do corretor para o número dele: quem não tem
  WhatsApp conectado (hoje 6 de 7) não recebe.
- As páginas públicas não rodam na máquina local sem a chave de serviço.

## Relacionadas
- [[plantas-do-editor-nunca-eram-salvas]]
- [[link-de-anuncio-e-rodizio-aleatorio]]
- [[MOC — CRM e Painel]] · [[MOC — Campanhas e Anti-ban]]
