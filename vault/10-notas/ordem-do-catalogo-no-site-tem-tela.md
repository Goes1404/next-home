---
title: A ordem do catálogo no site ganhou tela ("Ordem no site")
aliases: [ordem dos imóveis, sequência dos imóveis, reordenar catálogo, destaque]
tags: [painel, front, decisao]
type: nota
status: growing
custou: baixo
codigo:
  - src/lib/imoveis/ordemDaVitrine.ts
  - src/lib/imoveis/ordemDaVitrine.test.ts
  - src/app/corretor/(painel)/imoveis/ordem/page.tsx
  - src/app/corretor/(painel)/imoveis/ordem/OrdemNoSite.tsx
  - src/app/corretor/(painel)/imoveis/actions.ts
created: 2026-09-24
updated: 2026-09-24
fonte: pedido do usuário em 24/09/2026 ("mudar a sequência dos imóveis exibidos")
summary: A vitrine ordena por destaque e depois por empreendimentos.ordem, e ordem nunca teve tela. Imóveis → Ordem no site sobe, desce e marca destaque; os 6 primeiros são os "Selecionados" da home.
---

# A ordem do catálogo no site ganhou tela

**O que o site faz** (`ordenar(…, "destaque")` em `src/lib/queries.ts`): os
imóveis com `destaque = true` primeiro e depois o resto. Dentro de cada grupo
vale `empreendimentos.ordem`, que a consulta já aplica com `.order("ordem")`.
A home pega os **6 primeiros** dessa lista para "Selecionados".

**O que faltava:** `ordem` não tinha tela nenhuma. A lista seguia a ordem em
que o seed a deixou. A única ordem editável era a do **link pessoal**
(`corretor_destaques`, em Links por imóvel), que só vale para quem chega
pelo link do corretor.

## Decisões

- **A lista tem dois grupos, e mover não atravessa a fronteira.** Se a tela
  deixasse um imóvel comum subir acima de um destaque, o site o devolveria
  para baixo e a lista mentiria para o corretor. Para passar para o outro
  grupo, marca-se ou desmarca-se o destaque (★). O imóvel fica encostado na
  fronteira, perto de onde estava.
- **Salvar é por botão, não a cada toque.** Arrumar a lista leva umas dez
  trocas seguidas. Gravar cada uma seria dez idas ao banco e derrubaria o
  cache do site dez vezes no meio do arranjo.
- **Só entram os publicados.** Rascunho não aparece no site.
- **`ordem` é gravada em passos de 10.** Cadastro novo nasce com `ordem = 0`
  e por isso aparece primeiro no seu grupo, que é onde quem acabou de criar
  espera vê-lo.
- **Um update por imóvel, com a contagem de linhas conferida.** Um update
  barrado pela RLS afeta zero linhas sem erro, e a tela diria "salvo" para
  uma ordem que o site nunca viu.
- **Uma conta só.** `ordemDoSite` tem teste que a compara com o `ordenar` do
  site, e `paraGravar` é usada pela action. Assim tela e vitrine não podem
  discordar.

Ligada em [[MOC — CRM e Painel]] e [[MOC — Front Público]].
