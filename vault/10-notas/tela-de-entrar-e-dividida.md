---
title: A tela de entrar virou duas metades
aliases: [login do corretor, tela de entrar]
tags: [painel, front, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/entrar/page.tsx
  - src/app/corretor/entrar/FormularioLogin.tsx
created: 2026-09-09
updated: 2026-09-09
fonte: pedido do usuário em 09/09/2026 + captura nos dois temas
summary: Marca sobre a foto de um lado, cartão de entrada do outro, botão de voltar ao site dentro do cartão. Sobre foto, cor de tema não vale — o texto tem de ser fixo.
---
# A tela de entrar virou duas metades

## Contexto

Pedido: "parecido com a tela de login do Facebook", mantendo a imagem de
fundo que já existia, mais um botão de voltar para a home.

A versão anterior punha a foto atrás de TUDO com três camadas apagando a mesma
imagem: `opacity-50`, `mix-blend-overlay` e um véu `bg-fundo/70` por cima. O
resultado era fundo cinza-lavado com uma sombra de prédio — a foto pagava o
peso (757 KB) sem entregar imagem.

## Decisão

Split: foto à esquerda com a marca e uma frase, cartão de entrada à direita.
No celular, faixa de foto de `34svh` no topo e o cartão subindo `-mt-8` para
encostar nela. A foto aparece inteira, com UM gradiente escuro que existe só
para o texto ter contraste.

Botão "Voltar para o site" dentro do cartão, depois de um filete — o mesmo
lugar em que o Facebook põe o "Criar nova conta".

## A armadilha

**Sobre foto, cor de tema não vale.** O véu tinha de ser `black/…` e não
`bg-fundo/70`: no tema claro o véu clarearia e a letra branca sumiria na
nuvem. Escrevi isso no comentário e **mordi a mesma pedra três linhas abaixo**
— o "Home" do logotipo continuava em `text-acento-suave`, que no claro é
escuro, e desaparecia dentro do prédio. Só a captura no tema CLARO mostrou;
no escuro estava perfeito. Hoje é `brand-200`, tinta fixa.

## Consequências

- O `<Footer />` do site continua aparecendo abaixo (é do layout raiz, vale
  para toda rota). Não foi tocado: mexer ali muda o site inteiro.
- Não existe link de "esqueci minha senha" porque não existe esse fluxo — a
  senha é redefinida pelo gestor. Link que não leva a lugar nenhum é pior que
  a ausência dele.
- Campos e botão ficaram maiores (`text-fluid-base`): a senha costuma ser
  temporária, copiada de outro aplicativo, digitada no celular.

## Relacionadas
- [[navegacao-do-painel-tem-regua]]
- [[rampa-de-etapa-e-o-teto-da-gama]]
