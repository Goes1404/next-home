---
title: Plataforma Astro Soluções e barra da empresa
tags: [painel, decisao]
type: decisao
status: growing
custou: baixo
codigo:
  - src/lib/marcaDaPlataforma.ts
  - src/components/marca/SeloAstro.tsx
  - src/app/corretor/entrar/page.tsx
  - src/app/corretor/(painel)/layout.tsx
  - src/app/plataforma/layout.tsx
  - src/lib/marcaDoCrm/icones.ts
  - scripts/marca/gerarIconeAstroimob.mjs
  - src/app/astro/page.tsx
  - src/proxy.ts
  - src/app/globals.css
summary: A plataforma passou de AstroImob para Astro Soluções; o login é sempre da Astro e o topo do painel mostra "Astro Soluções | <imobiliária ou corretor autônomo>", como TOTVS e SAP.
created: 2026-10-28
updated: 2026-10-28
---

# Plataforma Astro Soluções e barra da empresa

**Decisão do dono (28/10/2026):** o CRM é vendido pela Astro Soluções a
imobiliárias e a corretores autônomos. Não se copia o CRM para outro projeto:
o multi-grupo já existe ([[marca-do-grupo-no-crm]]), e um segundo projeto na
Vercel rodaria as rotinas em dobro. Muda só a marca da PLATAFORMA.

- **Fonte única:** `src/lib/marcaDaPlataforma.ts` (nome, wordmark, frase,
  cores azul-marinho/azul acinzentado, `rotuloDaConta`).
- **Login:** sempre Astro Soluções, em qualquer endereço. O endereço só decide
  o rodapé ("Voltar para o site" no site de um cliente; aviso do convite em
  `astroimob.vercel.app`).
- **Barra da empresa no painel:** selo da Astro (+ "Astro Soluções" no
  computador) | logo ou nome do grupo da sessão + selo "Imobiliária" ou
  "Corretor autônomo". Vale para todos os grupos, inclusive a Next Home. O
  `botoesComPista` tolera 3 links sem pista no layout por causa dos dois logos.
- **Ícone:** o selo (A aberto, órbita e estrela) em ladrilho marinho. Os
  arquivos continuam `astroimob-*` (atalhos instalados não quebram); a cor do
  manifesto sem cor do grupo virou `#0f2547`.
- **Textos:** convite ("acesso ao CRM da Astro Soluções") e suporte nos
  limites do plano.
- **Não mudou:** endereço `astroimob.vercel.app`, nomes de constantes
  (`ICONES_ASTROIMOB`, `COR_DA_ASTROIMOB`) e a marca de cada grupo.

## Página de vendas e cores do painel (28/10/2026, segunda leva)

- **`/astro`** é a página de vendas da Astro Soluções. Em `astroimob.vercel.app`
  a raiz é REESCRITA para ela (o endereço fica limpo); o resto do site ainda
  vai para `/corretor`. `/astro` está em `FORA_DO_SITE` do proxy, então abre
  igual em qualquer endereço. Fontes só dela (Bricolage Grotesque e Figtree).
- Preços e limites da página vêm de `tiposDeConta.ts` e `limitesDoPlano.ts`:
  mudou a cobrança, muda a página.
- O botão de WhatsApp depende de `NEXT_PUBLIC_WHATSAPP_DA_ASTRO` (dígitos com
  DDI) na Vercel; sem ela a página mostra "Ver planos" e "Entrar".
- **Início e Administração trocaram de cor**: o Início, primeira tela de todo
  mundo, ficou no azul (combina com a marca da Astro); Administração herdou o
  violeta. Os valores são os mesmos que a guarda já media, só trocados.
- Os neutros do painel passaram da matiz 275/278 (violeta) para 258/260
  (azul-marinho), com luminosidade e croma iguais.
- `npm run paleta` neste ambiente acusa 188 "classes mortas" também no código
  de produção (o postcss local não compila tudo): compare as MEDIDAS de
  contraste e matiz, não o total. Antes e depois: 123 "ok" iguais.
- O item do menu "Home" virou "Início".

