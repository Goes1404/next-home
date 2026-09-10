---
title: Vídeo 16:9 com `object-contain` vira faixa escura em janela de desktop
aliases: [fundo-encaixa-na-tela, FundoVideoIntro, pillarbox]
tags: [front, armadilha]
type: armadilha
status: evergreen
custou: medio
codigo: [src/components/motion/FundoVideoIntro.tsx, src/app/globals.css, src/components/motion/fundoEncaixa.test.ts]
created: 2026-09-06
updated: 2026-09-06
fonte: relato do usuário + medição no ar em next-home-drab.vercel.app
summary: A vinheta é 1280x720 (1,778) e a viewport de um navegador maximizado fica em ~2,11 — a barra de endereço come altura. Com contain sobravam 143px vazios de cada lado, e o degrau de luz contra a camada desfocada desenhava duas linhas retas.
---
# Vídeo 16:9 com `object-contain` vira faixa escura em janela de desktop

Relatado assim: *"em algumas partes do pc esse fundo fica feio, fica cortando
uma parte, não fica 100%"*.

## A conta

`public/video/intro.mp4` é **1280x720** = 1,778. Um monitor 1920x1080
maximizado dá viewport de **1920x910** = **2,11**, porque a barra de endereço
come altura. Medido no ar em 06/09, na camada da marca:

| | valor |
|---|---|
| caixa do elemento | 1905 x 910 |
| quadro pintado | **1618** de largura |
| faixa vazia | **143px de cada lado** |

Nessas faixas só existia a camada de preenchimento — o MESMO vídeo,
desfocado, a **60% de opacidade**. O degrau de luz entre ela e o quadro
nítido desenha duas linhas verticais retas. É a mesma régua que a máscara da
base já registrava para o celular: **linha reta no meio de uma imagem não se
lê como composição, se lê como defeito.**

## A correção

`.fundo-encaixa-na-tela` troca `contain` por `cover` **só acima de 16:9**:

```css
@media (min-aspect-ratio: 16 / 9) { .fundo-encaixa-na-tela { object-fit: cover } }
```

Acima dessa proporção o corte é em CIMA e EMBAIXO — 8,8% de cada lado em
1920x910 —, e a marca mora no meio do quadro. Abaixo dela (celular em pé,
janela dividida) o `contain` continua valendo: ali `cover` cortaria as
LATERAIS, que é onde "Next Home" se escreve.

Medido com o CSS de produção, sem `!important`: 1920x910 resolve `cover`,
390x844 resolve `contain`. A regra fica FORA de `@layer`, então ganha do
`object-contain` do Tailwind, que é uma utility em camada.

## O que a guarda trava

`fundoEncaixa.test.ts` lê o cabeçalho do MP4 e compara com o número da
consulta: trocar a vinheta por uma de outra proporção sem mexer no CSS traz a
faixa de volta, e traz **calada**. Quatro mordidas provocadas; a primeira
versão passou numa delas por comparar substring (`.fundo-encaixa-na-telaXX`
contém `.fundo-encaixa-na-tela`) — a armadilha que [[atualizar-o-vault-e-obrigatorio]]
já registra para guardas de código-fonte. Hoje o seletor é casado com
fronteira.

Ver também [[barra-fixa-que-estoura-a-largura]] e
[[capa-de-empreendimento-nunca-e-nula]] — a mesma família: layout que o
navegador resolve de um jeito que ninguém conferiu.
