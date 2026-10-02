---
title: O Pixel da Meta fica fora das páginas de token, e o Lead sai no clique
aliases: [pixel, fbq, NEXT_PUBLIC_META_PIXEL_ID, evento Lead]
tags: [front, lgpd]
type: nota
status: stable
custou: baixo
codigo:
  - src/components/analytics/PixelMeta.tsx
  - src/components/analytics/pixelMeta.ts
  - src/app/(institucional)/layout.tsx
  - src/app/(vitrine)/layout.tsx
  - src/app/(institucional)/privacidade/page.tsx
summary: A ferramenta "Configurar eventos" da Meta não achava pixel porque o site não tinha pixel e o link colado era o atalho /wa, que só redireciona. Hoje o pixel roda nos dois layouts públicos, com PageView, ViewContent na ficha do imóvel e Lead no clique de WhatsApp, e fica desligado nas páginas de token e sem NEXT_PUBLIC_META_PIXEL_ID.
updated: 2026-10-02
---

# O Pixel da Meta fica fora das páginas de token

**Dois motivos para a Meta "não detectar o pixel".** O site não tinha pixel
nenhum, e o link testado era `/wa/<imóvel>`, que responde 302 direto para o
`wa.me`, sem página. Na ferramenta da Meta, testar a página do imóvel.

**O Lead sai no CLIQUE do link de WhatsApp**, por um ouvinte único na fase de
captura (`a[href]` para `/wa`, `wa.me` ou `api.whatsapp.com`), porque depois do
redirecionamento não há onde o pixel rodar. Assim nenhum botão precisa lembrar
de chamar o pixel.

**Página de token leva a credencial no endereço**, e todo evento do pixel manda
o endereço para a Meta. Por isso:
- o pixel não carrega em `/portal`, `/selecao`, `/proposta`, `/documentos`,
  `/parceiro` (nem em `/corretor` e `/wa`);
- `fbq.disablePushState = true`: sem isso o pixel dispara PageView sozinho a
  cada troca de rota, inclusive para essas páginas;
- `autoConfig` desligado: os eventos automáticos de botão não passam pela
  lista.

**Sem `NEXT_PUBLIC_META_PIXEL_ID` nada carrega**, e cada instalação tem o seu.
A variável é inlinada no build: trocar exige redeploy.

**A política de privacidade dizia que o site não usa cookies de rastreamento**
e passou a descrever o pixel. Quem liga rastreio de terceiro muda a política
junto.

Verificado com o build de produção, trocando o `fbevents.js` por um vazio e
lendo `window.fbq.queue`: home → PageView; ficha → PageView + ViewContent;
clique → Lead com o slug; portal em aba nova → pixel não carrega.

## Relacionados
- [[MOC — Front Público]] · [[botoes-do-site-mandavam-texto-que-o-porteiro-nao-reconhecia]] · [[o-imovel-nao-tem-mais-corretor-dono]]
