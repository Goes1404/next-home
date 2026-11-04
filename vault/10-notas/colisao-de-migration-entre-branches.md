---
title: A colisão de migration entre branches, e a guarda que não a vê
tags: [banco, processo, defeito]
type: nota
status: estavel
custou: 30min
codigo: supabase/migrations, src/lib/migrations.test.ts
summary: Duas branches criaram uma 0101 diferente cada. As duas aplicadas no banco, só o git colidia. A guarda de numeração só enxerga a própria branch.
updated: 2026-11-04
---

# A colisão de migration entre branches

Em 10/09/2026, ao subir `ingestao-de-midia` para produção, apareceram **duas
migrations `0101` diferentes**:

| branch | arquivo |
|---|---|
| produção (`claude/modernizar-...`) | `0101_arte_de_ia_por_imovel.sql` (07/09, outro autor) |
| `ingestao-de-midia` | `0101_consultor_conversas.sql` (09/09) |

**As duas estavam aplicadas no banco.** Conferido antes de mexer: a coluna
`imagens_geradas.empreendimento_id` e o índice da primeira existem; as
tabelas `consultor_conversas`, `consultor_mensagens` e `parametros_credito`
da segunda também. Ou seja, o banco estava certo — **só o git mentia**.

Renumeradas as desta branch para `0102`–`0104`, mantendo o `0101` de quem
chegou primeiro.

## O que é novo aqui

A lição de que "colisão de número é pior que buraco" já estava na
[[memoria-operacional]]. O que esta rodada acrescenta é sobre a **guarda**:

`migrations.test.ts` reprova prefixo duplicado — mas lê `readdirSync` do
diretório da branch atual. Ela **não enxerga a branch vizinha**, então passa
verde nas duas ao mesmo tempo enquanto a colisão existe. A guarda protege
contra a colisão dentro de uma sessão e é cega para a colisão entre sessões,
que é justamente o caso quando duas pessoas (ou dois agentes) trabalham em
paralelo.

**Régua:** com trabalho paralelo, o próximo número livre se confere contra
`git ls-tree origin/main supabase/migrations/`, nunca contra o `ls` local.

## Renumerar é mais que renomear

O número está escrito por extenso em cinco lugares além do nome do arquivo:
o cabeçalho da própria migration, o `comment on column` que ela grava no
banco, dois arquivos de `src/lib/consultor/` e a `docs/MEMORIA.md`. Arquivo
renumerado com comentário velho é a forma mais barata de mandar o
diagnóstico para o lugar errado — o defeito recorrente nº 5 deste projeto.

Relacionadas: [[consultor-imobiliario-no-painel]]

## De novo em 03/11/2026: a 0254

A API oficial da Meta nasceu `0254_whatsapp_oficial.sql` na branch
`ccr-7424dca4-4nynlp`, depois de conferir `origin/*` (só a 0253 da prospecção
existia, numa branch própria). Horas depois outra sessão publicou na `main`
a 0253 **e** uma `0254_equipe_da_prospeccao.sql`. Só se viu no CI da `main`,
pelo título do commit. Resolvido no merge da `main` na branch: a nossa virou
**0255** (`git mv` + troca das menções só nos arquivos dela — na `main`,
"0254" continua sendo a da prospecção).

Lição: conferir `origin/*` vale para o momento em que se confere. Antes de
cada push de migration nova, `git fetch` e conferir de novo; quando duas
sessões trabalham no mesmo dia, o número só fica firme quando a branch
recebe a `main`.

## E de novo em 04/11/2026: a 0255

Um dia depois, a mesma branch perdeu a 0255. Outra sessão, consertando a queda
do site por limite da Vercel ([[vercel-hobby-pausou-a-conta-inteira]]), criou
na `main` a `0255_disparo_so_com_campanha_ativa.sql` e já a **aplicou em
produção** (15:46 UTC). A do número oficial virou **0256**, depois **0257** e,
no fim do dia, **0258**: a sessão da prospecção publicou e aplicou a
`0256_followup_da_prospeccao` (16:50 UTC) e a correção da
`configurar_disparo_automatico` ficou com a 0257. Sempre de novo com
`git mv` + troca das menções só nos arquivos dela; as frases de história (como
esta) ficam com o número da época.

As duas não mexem no mesmo objeto: a da `main` só refaz o comando do
`cron.job` `disparo-campanhas`; a do número oficial cria tabelas e colunas. A condição nova
do tique (`fila.status = 'pendente'` em `campanhas.status = 'em_andamento'`)
também vale para a lista oficial, que usa as mesmas duas tabelas.

Lição que se repete: numa semana com duas sessões publicando, o número de uma
migration fora de produção é provisório até ela ser aplicada. E avisar uma
sessão não basta: a terceira colisão do dia veio da sessão que não tinha sido
avisada. Antes de publicar migration, avisar **todas** as sessões que publicam
na `main` e reservar os números na mensagem.

