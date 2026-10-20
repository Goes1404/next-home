---
title: Tela de trabalho mostra a carteira de quem abriu o painel
tags: [crm, painel, admin, armadilha, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/lib/carteiraDaVisao.ts
  - src/lib/corretorSessao.ts
  - src/lib/crm/filaDeTrabalho.ts
  - src/lib/crm/pessoas.ts
  - src/lib/crm/dadosLead.ts
  - src/app/corretor/(painel)/leads/page.tsx
  - src/lib/carteiraNaTelaDeTrabalho.test.ts
  - src/lib/carteiraDaVisao.test.ts
fonte: incidente em produção relatado pelo dono, 19/10/2026
created: 2026-10-19
updated: 2026-10-19
summary: As telas de trabalho (Início, Lista, Funil, Visitas, tarefas, anotações, gráficos de Marketing e Imóveis) confiavam na RLS para recortar, e a RLS abre a equipe inteira ao gestor — o ADM não conseguia trabalhar como corretor. Agora toda consulta de lista ou contagem exige o corretor_id do usuário logado (getCarteiraDaVisao / recorteDaVisao). Só o gestor muda de carteira, pedindo pela URL (?corretor=<id> ou ?corretor=equipe), e a lista diz isso numa faixa. Os links da Administração passam corretor=equipe.
---

# Tela de trabalho mostra a carteira de quem abriu o painel

Relatado em produção (19/10/2026): "está misturando os leads de todos os
corretores na conta do ADM, aí o ADM não consegue usar como corretor".

## Causa

As consultas das telas de trabalho não tinham `.eq("corretor_id", …)`: o
comentário de `corretorSessao.ts` dizia que "a policy decide se 'os meus'
são sete leads ou setecentos". Para o corretor comum isso funciona. Para o
gestor a policy da 0007 abre a equipe inteira, e Início, Lista, Funil,
Visitas, tarefas e anotações viravam a carteira de todo mundo.

A RLS continua sendo a SEGURANÇA. O que mudou é a VISÃO.

## Regra

- Tela de trabalho mostra os leads do usuário logado, qualquer que seja o
  papel. A decisão mora em `decidirCarteira` (puro) e
  `getCarteiraDaVisao` / `recorteDaVisao` (sessão).
- Só o gestor muda de carteira, e só pedindo pela URL: `?corretor=<id>`
  (aquele corretor) ou `?corretor=equipe` (todos). `?dono=sem` implica
  equipe. A lista mostra a faixa "Você está vendo a carteira de …".
- Os números da Administração passam `corretor=equipe` nos links para a
  lista; sem isso o número da equipe abriria só os leads do gestor.
- Leitura por chave (`id`, `lead_id`, telefone na checagem de duplicado)
  não é recortada: o gestor abre a ficha de um colega a partir da carteira
  dele.

## Exceções declaradas na guarda

`carteiraNaTelaDeTrabalho.test.ts` lê o código e reprova leitura de
`leads`, `pessoas_do_corretor`, `lead_tarefas` ou `anotacoes` fora de
`/corretor/admin` sem recorte. Exceções, com motivo: contagem por corretor
da tela de Contas, o placar da equipe (só montado na Administração), a busca
de lead ao registrar venda e o relatório de Anúncios pagos.

## Custo declarado

O gráfico "Onde meu dinheiro rende?" (Marketing) deixou de somar o gasto da
conta da Meta: é gasto da imobiliária, e dividi-lo pelos leads de uma
pessoa daria um custo por lead que não existe. O gasto da conta segue na
Administração.

Ver também [[adm-nao-le-conversa-alheia]].
