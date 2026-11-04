---
title: Prospecção da Astro, fase 1
tags: [crm, painel, banco, front, decisao, arquitetura]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0253_prospeccao.sql, supabase/migrations/0254_equipe_da_prospeccao.sql, src/lib/prospeccao, src/app/astro/amostra, src/app/api/prospeccao/visita, src/app/plataforma/prospeccao, scripts/prospeccao]
created: 2026-11-02
updated: 2026-11-04
fonte: pedido do dono em 02/11/2026 ("vamos unir tudo isso no nosso app da astro"), doc "Plano: módulo de Prospecção no astroimob"
summary: A Astro prospecta comércios dentro do astroimob — lojas em prospeccao_leads (global), amostra de site em /astro/amostra/<slug> montada do banco, rastreio de abertura sem IP e funil em /plataforma/prospeccao. Envio manual por wa.me na fase 1.
---
# Prospecção da Astro, fase 1

A Astro vende site, clube de fidelidade e o próprio CRM a comércios da
região. A prospecção mora no astroimob, na área do administrador da
plataforma, e segue o desenho do [[crm-pelo-whatsapp-numero-central-com-ia]]:
tabelas GLOBAIS (a loja ainda não é cliente, não tem grupo).

## Peças

| peça | onde |
|---|---|
| Loja, raio-X, amostra (jsonb) e etapa | `prospeccao_leads` (0253) |
| Cada abertura da amostra, sem IP nem user-agent | `prospeccao_visitas` (0253) |
| Página da amostra, HTML inteiro montado do banco | `/astro/amostra/<slug>` → `renderizarAmostra` |
| Molde da página | `src/lib/prospeccao/amostra/molde.html` → `molde.ts` (gerado por `scripts/prospeccao/gerarMolde.mjs`; teste reprova se divergirem) |
| Padrões por modelo (varejo, serviços, alimentação, crm) | `src/lib/prospeccao/modelos.ts` |
| Rastreio | `/api/prospeccao/visita`: abertura só depois de 3 s visível, tempo a cada 15 s |
| Funil, ficha e envio manual | `/plataforma/prospeccao` e `/plataforma/prospeccao/[id]` |
| Importar lojas | `scripts/prospeccao/sqlDasLojas.ts` gera o SQL (`on conflict (slug) do nothing`) |

## Decisões

- **Só a equipe de vendas vê a prospecção (0254, 03/11).** Administrador da
  plataforma E linha em `prospeccao_equipe` (hoje Eduardo e Matheus); a
  conta compartilhada `adm@` não vê. A lista fica no banco porque o repo é
  público. Falha ao ler a lista = fora da equipe (a aba some, a ação recusa).
  Quem entra: `insert into prospeccao_equipe (user_id, nome)` pelo SQL.

- **O robô da prévia do link não conta como abertura.** O WhatsApp busca a
  URL ao montar a prévia; o registro sai do script da página depois de 3 s
  visível, e robô não roda script nem espera.
- **`?previa=1` não rastreia**: é o botão "Ver amostra" do painel.
- **O número central (11 96867-1127) NÃO prospecta.** Se for banido por
  denúncia de spam, o CRM pelo WhatsApp cai para todas as imobiliárias. A
  fase 3 usa outro número, com nome do vendedor (Eduardo) no perfil.
- **Envio manual na fase 1**: o botão abre o WhatsApp de quem está no
  painel com a mensagem pronta (`window.open` no clique, antes da ação,
  senão o navegador bloqueia) e marca a loja como abordada.
- **Ação do painel nunca rejeita para o React (04/11).** No celular, abrir o
  WhatsApp põe o navegador em segundo plano e corta a requisição; a ação
  que rejeitava dentro de `startTransition` subia até o erro global do
  Next ("This page couldn't load", tela preta sem menu). Agora
  `semDerrubar()` em `Componentes.tsx` vira a falha em mensagem, o
  "marcar como abordada" tenta de novo no `visibilitychange` ao voltar, e
  `src/app/plataforma/error.tsx` segura qualquer outro erro dentro do
  painel (com `unstable_retry`, a API desta versão do Next).
- **Texto do banco é de terceiros**: a amostra escapa HTML, aceita só cor
  hexadecimal e formas/ícones da lista fechada, e o `CFG` que o script do
  molde injeta como HTML perde `< > " ' \` & \`.

## Gestão automática (04/11/2026, 0256)

- **Régua**: abordagem → follow-up (3º dia, ou 1º se abriu a amostra) →
  4 dias sem resposta depois do follow-up = `perdido` automático
  ("sem resposta"). `followup_em` (0256) registra o follow-up; o botão do
  painel vira "Enviar follow-up" só na hora certa (`followupDevido`).
- **Aviso "abriu a amostra"**: `api/prospeccao/visita` → `after()` →
  `avisoDeAbertura` → push só para `prospeccao_equipe` ∩ admins
  (`notificarEquipeDaProspeccao`). Só loja já abordada; 1 aviso por 12 h.
- **Rotina da manhã**: `/api/cron/prospeccao` (cron da Vercel, 10:40 UTC,
  seg–sex): encerra as sem resposta e manda o plano do dia
  (`resumoDoDia`). Push precisa do aparelho ativado na aba Prospecção.
- **Captação diária** (5 lojas por dia útil): tarefa agendada do Claude,
  fora do app; grava em `prospeccao_leads` com etapa `novo`.
- **Envio continua manual** (decisão do dono, 04/11): disparo automático
  só com chip separado, depois de medir a taxa de resposta.

## Abordagem curta (04/11/2026)

- Medido: 32 lojas com a mensagem longa + link → 4 abriram, 2 responderam.
  Link de número desconhecido parece golpe. Daqui em diante a primeira
  mensagem é curta, sem link, terminando em "Posso te mandar?"
  (`mensagemCurta`). Quem responde recebe o link pelo botão "Respondeu?
  Mandar a amostra" (`mensagemComAmostra`, tipo `amostra` em
  `marcarEnviado`: move para "Respondeu"). O follow-up da curta já leva o
  link. `temLinkDaAmostra` separa as abordagens antigas das novas.
- Imobiliárias entram na captação diária (modelo `crm`): produto pronto,
  ticket maior e prova (Next Home).

## Próximas fases

2. Captação semanal (tarefa agendada do Claude grava no banco pelo MCP).
3. Número de prospecção, fila com aprovação, envio pelo disparador anti-ban.
4. Base de respostas e bot de resposta, com evals.
5. São Paulo e Sorocaba, vídeo da amostra, relatório por segmento.

## Relacionadas
- [[crm-pelo-whatsapp-numero-central-com-ia]]
- [[o-que-vai-ao-cliente-pelo-numero-central]]
- [[trocar-numero-zera-reputacao]]
