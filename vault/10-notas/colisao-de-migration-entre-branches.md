---
title: A colisão de migration entre branches, e a guarda que não a vê
tags: [banco, processo, defeito]
type: nota
status: estavel
custou: 30min
codigo: supabase/migrations, src/lib/migrations.test.ts
summary: Duas branches criaram uma 0101 diferente cada. As duas aplicadas no banco, só o git colidia. A guarda de numeração só enxerga a própria branch.
updated: 2026-09-10
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
