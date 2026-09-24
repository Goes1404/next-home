---
title: A planta chega como foto, e o botão "É planta" a reclassifica
aliases: [marcar como planta, definir planta, tipo da mídia]
tags: [midia, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/app/corretor/(painel)/imoveis/actions.ts
  - src/app/corretor/(painel)/imoveis/_componentes/EditorFotos.tsx
  - src/app/corretor/(painel)/imoveis/_componentes/EditorFotos.test.ts
  - src/app/corretor/(painel)/imoveis/_componentes/EditorTipologias.tsx
  - src/app/corretor/(painel)/imoveis/_componentes/EditorTipologias.test.ts
created: 2026-09-24
updated: 2026-09-24
fonte: pedido do usuário em 24/09/2026 ("definir a foto do catálogo como planta")
summary: Book em PDF, pasta do Drive e câmera gravam tudo como `foto`. O botão "É planta" em cada cartão da galeria troca foto ↔ planta, e é isso que faz a assistente conseguir mandar a planta e o checklist parar de dizer "sem imagem da planta".
---
# A planta chega como foto

`midias.tipo` decide tudo o que acontece com uma imagem: `foto` vai para a
galeria e pode ser capa; `planta` vai para `imovel.plantas`, que é de onde
`resolverMidia` tira o anexo quando o cliente pede a planta e de onde o
checklist do catálogo conta "imagem da planta" (9 de 26 em 16/09).

Só que quase todo caminho de entrada grava `foto`: o upload da galeria, a
curadoria do PDF, o Drive. A planta ficava ali na tela, invisível para a IA.

## O que o botão faz

- `definirTipoDaMidia(midiaId, "foto" | "planta", slug)`: o filtro
  `.in("tipo", ["foto","planta"])` mora NA CONSULTA, então um id de vídeo ou
  tour nunca vira planta. **Zero linhas afetadas é erro**, não sucesso — a
  tela não pode anunciar "virou planta" sobre algo que continuou foto.
- A capa é a primeira **FOTO** (o mesmo que o mapper faz: `capa: fotos[0]`).
  Antes o editor tratava a primeira mídia da lista como capa, de qualquer
  tipo.
- Vídeo e tour saíram da grade de fotos — têm aba própria, e `next/image`
  com link do YouTube não é imagem.

## Achado de passagem

"Definir Capa" **nunca gravou nada**: a action estava importada e nenhum
handler a chamava; a tela reordenava e anunciava "Capa atualizada", e no
reload a capa antiga voltava. Mesmo defeito que a remoção de foto tinha tido.
E a foto recém-enviada entrava no estado SEM `id`, então não podia ser
removida nem reclassificada até recarregar. `EditorFotos.test.ts` lê o
código e exige a chamada ao servidor antes da mudança na tela — provocada.

## Relacionadas
- [[o-checklist-do-catalogo-e-as-categorias-sem-leitor]]
- [[midia-por-slug-nunca-por-url]]
- [[falha-calada-e-a-pior]]

## Escolher do catálogo, na aba de plantas (24/09/2026)

Ao lado de "Enviar imagem da planta" agora há um botão **"Escolher do
catálogo"**. Ele abre uma grade com as fotos e plantas do imóvel. Tocar numa
imagem faz duas coisas: **reclassifica a imagem como planta**
(`definirTipoDaMidia`) e **liga a URL dela a esta planta**.

A ordem importa. Se a reclassificação falha, nada é ligado. Ligar só a URL
faria a tela mostrar a planta enquanto a assistente continuaria sem ela,
porque a assistente só manda imagem com `tipo = 'planta'`. Isso é travado em
`EditorTipologias.test.ts`, e a guarda foi provocada para confirmar que falha.

Depois de reclassificar, a tela chama `router.refresh()`. Sem isso, a aba de
fotos voltaria a montar com o imóvel antigo e ainda mostraria a imagem como
foto.
