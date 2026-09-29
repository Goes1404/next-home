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
  - src/app/corretor/(painel)/_componentes/useArrastarParaOrdenar.ts
  - src/app/corretor/(painel)/_componentes/useSalvarSozinho.ts
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
- **(Substituído no mesmo dia pelo salvamento automático, ver abaixo.)** Salvar era por botão, não a cada toque. Arrumar a lista leva umas dez
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

## Arrastar (24/09/2026)

Nas duas telas, **Ordem no site** e **galeria de fotos do imóvel**, dá para
arrastar pela alça ⠿. Isso vale para o mouse e para o dedo, porque usa
pointer events. O HTML5 drag-and-drop não dispara em toque, e foi por isso
que o kanban de 02/09 ficou sem arrasto no celular. O hook é
`useArrastarParaOrdenar`:
- A lista se rearruma **durante** o arrasto, assim a pessoa vê onde o item
  vai cair sem precisar de fantasma.
- O alvo é achado com `elementFromPoint` e `data-ordenavel`, então a mesma
  conta serve para coluna e para grade.
- Só a alça tem `touch-none`, para o resto continuar rolando a página.
- Com o dedo parado perto da borda, um laço de quadro rola a tela.

**Arrastar atravessa o destaque; as setas não.** Soltar um imóvel no meio
dos destaques o torna destaque (`arrastarPara`). Um toque em "subir" não
deveria mudar o destaque de ninguém. Arrastar é um gesto de "quero este
aqui", e o grupo acompanha.

**O `aoMover` tem de usar atualização funcional.** Dois movimentos podem sair
no mesmo quadro, antes de a tela renderizar. Ler a lista do fechamento
aplicaria o segundo movimento sobre a lista velha.

Verificado num navegador de verdade, com uma página de teste temporária e
dados falsos: arrasto com mouse e com toque (CDP `Input.dispatchTouchEvent`)
nas duas telas, sem rolagem lateral. Os tipos gerados pelo `next dev` para a
página de teste apagada quebram o `tsc` até alguém rodar `rm -rf .next/dev`.

## Salva sozinho (24/09/2026)

As duas telas perderam o botão "Salvar ordem" e passaram a usar
`useSalvarSozinho`:
- A gravação sai **900ms depois da última mudança**, e só depois que o dedo
  solta o item. Durante o arrasto a lista muda a cada quadro e só o ponto
  onde o item cai interessa.
- A espera resolve o motivo do botão: dez trocas seguidas viram uma gravação
  só, e o cache do site é derrubado uma vez.
- Se a pessoa mexer enquanto a gravação está em andamento, as duas versões
  continuam diferentes quando ela termina, e o ciclo roda de novo.
- **Em falha, não tenta de novo sozinho.** Um erro de permissão repetido a
  cada segundo seria barulho. A tela mostra "Tentar de novo" e "Voltar à
  ordem salva".
- Fechar a aba com mudança não gravada pede confirmação (`beforeunload`).

Verificado no navegador: segurando o item por 1,5s, zero POST; depois de
soltar, um POST só; sem sessão, o erro apareceu com os dois botões e não
houve nova tentativa.

Ligada em [[MOC — CRM e Painel]] e [[MOC — Front Público]].
