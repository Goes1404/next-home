---
title: Anúncios pagos virou cinco abas com endereço, e os botões ganharam fundo sólido
tags: [painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/app/corretor/(painel)/marketing/impulsionamentos/page.tsx
  - src/app/corretor/(painel)/marketing/impulsionamentos/AbasDosAnuncios.tsx
  - src/app/globals.css
  - src/app/corretor/(painel)/marketing/impulsionamentos/DistribuicaoDaEquipe.tsx
  - src/app/corretor/(painel)/marketing/impulsionamentos/EditorDaRoleta.tsx
fonte: docs/MEMORIA.md — Anúncios pagos em abas (26/10/2026)
created: 2026-10-26
updated: 2026-10-26
summary: A tela empilhava indicadores, campanhas, roleta, clique e conta da Meta numa rolagem só e os tópicos não se achavam. Virou cinco abas por `?aba=` (Resumo, Campanhas, Roleta, Do clique à conversa, Conta da Meta só para gestor), desenhadas antes num mockup do Claude Design. Dois estilos novos no globals.css, `botao-solido` e `botao-aba`, porque o `botao-secundario` (6% de tinta) ainda lia como texto sobre o cartão de vidro.
---

# Anúncios pagos em abas

**Queixa:** "a navegação está feia, identificação difícil dos tópicos", e os
botões não pareciam botões. A tela tinha cinco blocos empilhados.

## O que ficou

- Cinco abas por endereço (`?aba=resumo|campanhas|roleta|clique|meta`); a
  `meta` só existe para gestor e um endereço desconhecido cai no Resumo
  (`abaDoEndereco`). Cada aba tem cabeçalho com ícone, título e uma frase.
- Só Resumo e Campanhas leem campanhas, clientes e conversas (a leitura
  pesada). Roleta, clique e Meta abrem sem esperar por ela.
- "Nova campanha" no cabeçalho é link para `?aba=campanhas&nova=1`, que abre
  o formulário já aberto.
- Links antigos: `/admin/anuncios` redireciona para `?aba=meta` (era a
  âncora `#conta-da-meta`) e o atalho "configurar roleta" vai para `?aba=roleta`.
- Roleta e "Do clique à conversa" deixaram de sumir quando vazias: agora são a
  aba inteira e mostram uma frase.

## A aba Roleta reúne toda a distribuição

Pedido do dono: tudo da distribuição de leads num lugar só, e depois que
"quem entra na distribuição" e "quem recebe na ordem" ficassem juntos.
Desenho aprovado no canvas (quadro "Aba Roleta — redesenho"). Para o gestor:

- **Três cartões-resumo** no topo (roleta, escala, grupos), cada um leva à
  sua parte. Mostram o que está salvo, não o rascunho.
- **Uma tabela de corretores** dentro do cartão da roleta: ordem (setas),
  WhatsApp, grupo, "Recebe/Incluir" (roleta dos anúncios) e "Na escala/Em
  pausa" (escala geral, só gestor). Quem está fora da roleta aparece embaixo,
  tracejado. Ordem e quem recebe só valem ao **salvar**; pausa e a regra do
  WhatsApp conectado salvam **na hora** — a barra de baixo diz isso.
- **Grupos de WhatsApp** em passos: 1 número central, 2 nome dos grupos, e
  "Sincronizar grupos" em destaque.

WhatsApp & IA ficou com um cartão-link. `ConfigurarGruposDeLeads` e as
ações continuam em `admin/whatsapp/` (as ações têm teste lá) e revalidam as
duas telas. `naEscala: null` = sem `slug`: a distribuição (0011) pula.

## Por que estilos novos

- `botao-secundario` tinge o fundo com 6% da cor do texto. Sobre o cartão de
  vidro e a aurora, isso ainda lia como texto com moldura. `botao-solido` tem
  superfície cheia, contorno da cor do texto a 45% e sombra. Serve para
  acento (`text-acento`) e perigo (`text-perigo`).
- `botao-aba`: cada aba é um botão parado; a aberta (`aria-current="page"`)
  fica cheia na cor do módulo.
- O nome precisa começar com `botao-`: a guarda `botoesComPista.test.ts`
  reconhece a pista pelo prefixo (o primeiro nome, `aba-botao`, reprovou).

## Armadilhas

- As abas **quebram linha**, não rolam de lado (`naoRolaDeLado.test.ts`). O
  mockup tinha rolagem lateral no celular; no código são duas colunas.
- `bg-acento-lavado` é da cor do módulo dentro do painel (`[data-modulo]`),
  mas fora dele é o verde do site.
- O mockup só bate com produção quando copia o fundo inteiro do painel: tinta
  no topo, aurora, bolhas e grão (`FundoDoPainel`). Só as cores não bastam.

## Relacionadas

- [[botoes-que-parecem-botoes]]
- [[roleta-dos-anuncios]]
