---
title: A IA fala com o nome, a região e o tom do grupo do número, e o grupo 1 continua igual
tags: [prompt, ia, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0199_identidade_da_ia_do_grupo.sql, src/lib/whatsapp/casa.ts, src/lib/whatsapp/casaDoGrupo.ts, src/lib/whatsapp/aiAgent.ts, src/lib/whatsapp/jogada.ts, src/lib/whatsapp/focoDaConversa.ts, src/lib/whatsapp/turnoDeAtendimento.ts, src/app/corretor/(painel)/admin/assistente/page.tsx]
created: 2026-10-20
updated: 2026-10-20
fonte: fase 4 enxuta da plataforma multi-grupo (20/10/2026)
summary: Nome da imobiliária, região, nome da assistente e tom vêm de grupos.ia_* (0199). Vazio no grupo 1 = o prompt de antes letra por letra; vazio em outro grupo = o nome do grupo e nenhuma menção à Next Home, Barueri ou Alphaville. Nome e tom do grupo ganham dos da instância.
---

# A IA fala com o nome, a região e o tom do grupo do número

Parte de [[plataforma-multi-grupo]] (fase 4 enxuta). Plano em
`docs/superpowers/plans/2026-10-20-fase-4-ia-do-grupo.md`.

## O que estava errado

A assistente de todo grupo se apresentava "da Next Home em Alphaville",
perguntava "em qual região de Barueri você procura?" (prompt e planner),
dava exemplos com Barueri, e o índice de foco tirava do índice só as
palavras de `site.nome`. Num segundo grupo, ela falaria da Next Home.

## A regra que fica

- **Uma fonte: `casa.ts`** (`IdentidadeDaCasa`). O prompt (`aiAgent.ts`), o
  planner (`jogada.ts`), o foco (`focoDaConversa.ts`) e a variação de lista
  leem dela. `CASA_NEXT_HOME` reproduz os literais de antes: "Alphaville" na
  apresentação e "Barueri" na pergunta são dois valores, e os dois ficam.
- **O grupo 1 sem configuração gera o mesmo prompt**: o instantâneo de
  `casaNoPrompt.test.ts` foi gravado ANTES da mudança. `PROMPT_VERSAO` não
  mudou.
- **Outro grupo nunca herda a Next Home**: sem configuração, usa
  `grupos.nome`; sem a linha (leitura falhou), fica sem nome.
- **Precedência (decisão do construtor):** nome e tom fixados pelo gestor
  ganham dos da instância; vazio deixa valer o do corretor. A tela Minha IA
  avisa quando o gestor fixou.
- **O turno EXIGE a casa** (`IdentidadeDoAtendimento.casa`): com padrão, um
  chamador esquecido falaria como a Next Home no WhatsApp de outro grupo. O
  eval passa `CASA_NEXT_HOME` por escrito. O `ContextoAtendimento` do prompt
  aceita sem casa só para os testes antigos.
- **O nome da casa sai do índice de foco por grupo** (`nomeDaCasa` em
  `imoveisCitados`, `detectarFoco`, `palpiteDeNome`...). `undefined` = marca
  do site (eval, traces). Guarda `casaNoTurno.test.ts` lê o turno.
- **Escrita só por `atualizar_identidade_da_ia`** (gestor ativo; o grupo sai
  da sessão), com evento `identidade_da_ia_alterada`. O logado lê as quatro
  colunas (a 0196 recorta `grupos` por coluna; precisou de grant).

## Como diagnosticar

- "A IA de um grupo falou de outra casa": conferir `grupos.ia_*` e
  `grupos.nome` do grupo da INSTÂNCIA (não do corretor da sessão).
- Antes da 0199 aplicada, `lerCasaDoGrupo` recebe 42703, lê só o nome e a IA
  fala como antes.

## Ficou para depois

Segmento ("alto padrão"), fala preço ou não, regras da casa, fuso por grupo,
exemplos de estilo próprios do grupo, dossiê/aviso ao corretor/marketing e
evals por grupo (L64–L68).
