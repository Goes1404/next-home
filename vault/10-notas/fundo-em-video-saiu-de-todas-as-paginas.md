---
title: O fundo em vídeo (vinheta congelada) saiu de todas as páginas
aliases: [FundoVideoIntro como fundo, papel de parede da vinheta, fundo-aurora]
tags: [front, decisao]
type: decisao
status: growing
custou: baixo
codigo: [src/app/(institucional)/layout.tsx, src/app/(vitrine)/layout.tsx, src/components/motion/FundoVideoIntro.tsx, src/app/globals.css]
created: 2026-09-13
updated: 2026-09-15
fonte: pedido do usuário com print do celular (13/09/2026)
summary: A vinheta parada no último quadro era o fundo padrão dos dois layouts públicos; no celular ela aparecia inteira entre a CTA final e o rodapé e lia como imagem aleatória. Saiu de todo o site — e a remoção foi AMPLA DEMAIS: em 15/09 o vídeo do celular voltou, agora esmaecendo com a rolagem. Ver [[a-remocao-levou-a-peca-errada-junto]].
---
# O fundo em vídeo (vinheta congelada) saiu de todas as páginas

Print do usuário: no celular, entre o cartão "Receber ofertas no WhatsApp"
e o rodapé, o quadro parado do logotipo 3D ocupava a tela inteira. Pedido:
*"remova ele de todas as páginas, especificamente esse"*.

## O que era

`FundoVideoIntro` montado como FUNDO nos dois layouts de grupo — no
institucional em todo tamanho (com fonte vertical própria no celular,
congelada em 1,5s e deslocada 26%), na vitrine só abaixo de 768px. A peça
era a mesma do `Preloader`: a abertura recuava e virava papel de parede.

## O que fica

- **A aurora em CSS** (`.fundo-aurora`, três manchas de luz nas cores da
  marca) — já era o fundo da vitrine no desktop desde 10/09, custo zero de
  rede, e agora cobre os dois grupos em todo tamanho.
- **A vinheta continua no `Preloader`**: uma vez por sessão, como abertura.
- **Foto ou vídeo PRÓPRIO do corretor** seguem tendo precedência (é
  personalização feita no painel).

## O que não quebrou, e por quê

- `AberturaHome` procura `[data-fundo-video]` e já tratava a ausência
  (`if (video)`): a timeline segue só com os `[data-abertura]`.
- `ParallaxFundoHome` escreve no invólucro `[data-fundo-parallax]`, que
  ficou.
- `fundoEncaixa.test.ts` lê o componente e o CSS, não os layouts — o
  componente continua no repositório (`EnvioImediato` do painel o usa, e o
  Preloader usa a mesma peça).
- O véu do institucional era calibrado para o VÍDEO (70% no desktop, para o
  h1 centrado não sumir atrás da logo). Sobre a aurora só precisa fechar a
  base: `from-fundo/0 via-fundo/10 to-fundo/90`.

## A remoção foi ampla demais, e 15/09 desfez metade dela

Dois dias depois, o usuário: *"saiu a imagem do background que tínhamos —
tínhamos um vídeo que fica só no mobile, não sei em qual momento isso foi
removido"*.

Ele estava certo, e o erro desta decisão está na própria frase acima: eram
**duas peças diferentes** montadas pelo mesmo componente, e o que a queixa de
13/09 apontava era uma só.

| | desktop | celular |
|---|---|---|
| peça | vinheta do LOGOTIPO (`intro`) | prédios abrindo para a marca (`fundo-home`) |
| queixa de 13/09 | era esta | levada junto |
| hoje | aurora em CSS | o vídeo VOLTOU |

E a queixa nem era sobre a peça: era sobre **onde ela aparecia**. O pedido
literal foi *"remova ele de todas as páginas, especificamente esse"*, com
print do quadro parado ocupando a tela entre o CTA final e o rodapé — e o
que põe o quadro ali não é a peça, é o fundo ser `position: fixed`, atrás da
página INTEIRA. Removê-lo do herói foi tratar o sintoma no lugar errado.

Hoje: `somenteMobile` devolve só a peça do celular, e
`.fundo-sai-do-caminho` esmaece o fundo ao longo da primeira tela por
`animation-timeline: scroll(root)` — o mesmo mecanismo de
`.barra-progresso`, zero JavaScript, dentro de `@supports`. O véu do celular
voltou aos valores medidos (`0/0/85`); o desktop ficou como esta decisão o
deixou.

**A lição fica**: [[a-remocao-levou-a-peca-errada-junto]].

## Relacionadas
- [[a-remocao-levou-a-peca-errada-junto]] — a reversão parcial, e por quê
- [[fundo-16-9-em-tela-mais-larga-vira-faixa]]
- [[fundo-fixo-no-celular-usa-lvh]]
- [[MOC — Front Público]]
