---
title: CRM pelo WhatsApp — o número central com IA (desenho aprovado)
aliases: [número central da plataforma, 11 96867-1127, comandos pelo WhatsApp, CRM pelo WhatsApp]
tags: [whatsapp, ia]
type: decisao
status: budding
custou: medio
codigo:
  - docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md
  - docs/superpowers/plans/2026-10-30-crm-pelo-whatsapp-onda-0-fundacao.md
  - supabase/migrations/0249_central_da_plataforma.sql
  - src/lib/central/
  - src/app/plataforma/central/
  - scripts/eval/rodarEvalDoCentral.ts
  - src/lib/agenda/comandos/
  - src/lib/crm/retornoPeloGrupo/
fonte: conversa de desenho com o dono, 30/10/2026 (skill doc-coauthoring, dois testes com leitor sem contexto)
created: 2026-10-30
updated: 2026-10-30
summary: Um número de WhatsApp da plataforma (11 96867-1127) com uma IA que deixa corretores e gestores operarem o CRM inteiro em linguagem natural (texto, áudio, foto), sempre com proposta e "sim" antes de mudar algo. 33 capacidades, piloto na Next Home em 4 ondas. Onda 0 (fundação) construída em 30/10/2026; só a ajuda funciona, o resto responde "ainda não sei".
---
# CRM pelo WhatsApp — o número central com IA

Desenho completo: `docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md`.
Plano da onda 0: `docs/superpowers/plans/2026-10-30-crm-pelo-whatsapp-onda-0-fundacao.md`.

## Decisões do dono

- Um número para a plataforma inteira; quem escreve é reconhecido pelo
  WhatsApp do perfil. Desconhecido: silêncio.
- Mesmas permissões do painel. **Sempre** proposta e "sim" antes de gravar,
  enviar ou apagar; consulta responde direto.
- O que vai para cliente sai do número do corretor, com as regras
  anti-bloqueio de hoje. O central só conversa com a equipe.
- Modelo de IA de primeira linha com chamada de ferramentas; sem PIN; registro
  só interno; desfazer até 24 h; proposta válida por 1 h.
- Piloto na Next Home, em ondas sem tempo mínimo: 0 fundação → 1 leads e
  agenda → 2 imóveis, relatórios, avisos e grupos → 3 listas e imagens.
  Lançamento é decisão do dono.
- Os comandos contam na cota mensal de IA da imobiliária e podem suspendê-la.
- Cada pessoa escolhe no painel o horário do resumo e a antecedência do aviso
  de visita (padrão 8h e 1 h). Registro guarda o texto por 30 dias.
- O central pode ficar em grupos só da equipe e responde quando mencionado;
  dado de lead vai para o privado de quem pediu.

## Para lembrar (achados do desenho)

- **Laço**: o WhatsApp de cada corretor também está ligado ao sistema. A
  conversa dele com o central apareceria como "cliente" na instância dele, e
  as duas IAs se responderiam. Toda instância de corretor tem de ignorar o
  número central.
- A IA de hoje (`chamarLlmJson`) é JSON de prompt único, sem histórico nem
  ferramentas: o central precisa de um cliente novo.
- As server actions do painel dependem de cookie; as ferramentas do central
  conferem a permissão por conta própria (como `montarDependencias` da agenda).
- O áudio hoje é transcrito depois do canal de comandos da agenda; no central
  tem de vir antes.

## Onda 0 construída (30/10/2026)

- Código em `src/lib/central/`. O webhook desvia para `tratarWebhookDoCentral`
  logo depois de ler `instanceName` (o central não é instância de corretor;
  `resolverInstancia` daria 404). A guarda de ordem é `centralInvisivel.test.ts`.
- Na instância de corretor, mensagem DO número central sai com
  `ignored: "central"` antes de `tratarConversaComOSistema` (o laço).
- `pensar` (`cerebro.ts`) é o primeiro uso de `tools` da OpenAI no repo:
  até 4 voltas, 25 s, nunca lança; registra o consumo por volta com
  finalidade `comando`. Modelo em `CENTRAL_MODELO` (padrão `gpt-4.1`).
- Catálogo em `ferramentas.ts`: 35 ferramentas para as 33 capacidades, cada
  uma com `onda`; `ONDA_ATUAL = 0`. Ação nunca roda direto: vira proposta
  (1 h) e só o "sim" executa. Guarda: nada em `src/lib/central/` escreve em
  `leads`, `visitas`, `whatsapp_conversas` ou `whatsapp_mensagens`.
- Telas: `/plataforma/central` (conectar por código ou QR), interruptor
  "Comandos pelo WhatsApp" em WhatsApp da equipe (só gestor, coluna
  `grupos.central_whatsapp_ativo`) e bloco com o link no WhatsApp do corretor.
- Aviso de queda do número do corretor sai também pelo central (antes era só
  e-mail, e quem não tinha e-mail ficava sem aviso); a volta também avisa.
- Retenção: texto dos comandos e tentativas somem em 30 dias, de carona em
  `/api/cron/limpar-artes-ia`.
- Eval: `npm run eval:central` (100 casos em `eval/golden/central.json`). Ainda
  não rodou: o container não tem `OPENAI_API_KEY`. A escolha do modelo sai dele.
- Para ligar: aplicar a 0249, pôr o chip num celular, conectar em
  `/plataforma/central`, e o gestor ligar o interruptor. Sem a 0249 o código
  não quebra (o central só não existe).

## Onda 1 construída, desligada (30/10/2026)

Cinco frentes em paralelo (painel em
`docs/superpowers/plans/2026-10-30-crm-pelo-whatsapp-frentes.md`), todas
juntadas e verdes; `ONDA_ATUAL` segue 0, então tudo responde "ainda não sei"
até o dono ligar.

- Contrato da ação: `preparar` (resolve o lead, devolve resumo + ids ou uma
  pergunta; nunca grava) → "sim" → `executar` (só os dados resolvidos) →
  `desfazer` (24 h, gravado em `central_comandos.desfazer`).
- Consultas: [[central-le-sem-sessao-e-sem-rls]]. Leads:
  [[central-cadastra-e-atualiza-lead]]. Agenda: [[agenda-pelo-numero-central]].
  IA do cliente e desfaz: [[central-ia-do-cliente-e-desfazer]]. Foto:
  [[foto-no-numero-central]].
- A migration do central virou **0249** (a 0248 de `main` é a IA no
  atendimento, de outra sessão no mesmo dia).
- Armadilha: rodar `vitest` com filtro de pasta (`src/lib/grupos`) também pega
  as cópias em `.claude/worktrees/`; use `--dir src`.

## Ondas 2, 2b e 3 construídas, desligadas (30/10/2026)

As 33 capacidades têm tratador; `ONDA_ATUAL` segue 0. Notas das frentes:
[[central-imoveis-do-catalogo]], [[relatorios-pelo-numero-central]],
[[financeiro-e-gestao-pelo-numero-central]],
[[documentos-lembrete-e-planilha-pelo-central]],
[[avisos-espontaneos-pelo-numero-central]],
[[numero-central-em-grupos-da-equipe]],
[[lista-de-transmissao-pelo-numero-central]],
[[arte-e-video-pelo-numero-central]],
[[o-que-vai-ao-cliente-pelo-numero-central]], [[saude-do-numero-pelo-central]].

Para ligar: rodar 0249 e 0250 no SQL Editor, conectar o chip em
`/plataforma/central`, rodar `npm run eval:central` com chave real e escolher
`CENTRAL_MODELO`, o gestor ligar o interruptor, e subir `ONDA_ATUAL` uma onda
por vez.

**30/10/2026:** publicado em produção e `ONDA_ATUAL` = 3 a pedido do dono
(testa depois). Com isso, o que liga o central de fato é o interruptor
"Comandos pelo WhatsApp" (`grupos.central_whatsapp_ativo`) e o chip conectado
em `/plataforma/central`. Para recuar uma onda: baixar `ONDA_ATUAL` e
publicar. A guarda de `ferramentas.test.ts` passou a cobrar que toda
ferramenta ligada tenha tratador, e que na onda 0 nada rode.

## Primeiro dia no ar (30/10/2026): o central caiu em minutos

- O dono conectou o chip e ligou a Next Home; o central respondeu as
  boas-vindas às 11:05:50 e o WhatsApp **fechou a conexão às 11:05:56**
  (`central_da_plataforma.status_conexao = desconectado`). Depois disso nada
  chega: mensagens sem registro nem tentativa = o número caiu, não o código.
- Armadilha achada no diagnóstico: 4 corretores com o WhatsApp caído desde
  9–23/10 nunca tiveram o aviso de queda marcado (o e-mail não sai sem
  `RESEND_API_KEY`, e o tique tenta a cada minuto). Com o central ligado, ele
  mandaria na hora 4 avisos velhos, de número novo, a quem nunca falou com
  ele. Correção: só queda das últimas 24 h vai pelo central
  (`quedaRecenteParaOCentral`).
- Regra nova dos avisos espontâneos (`canalDoAviso.jaConversou`): o central
  só fala por conta própria com quem já escreveu a ele (tem linha em
  `central_estado`). Os outros recebem pelo canal de hoje.
- Número novo: reconectar e usar devagar (conversas iniciadas pela equipe)
  antes de qualquer envio por conta própria em volume.

Ligações: [[primeiro-contato-tem-teto-proprio]], [[fluxo-do-webhook-whatsapp]].
