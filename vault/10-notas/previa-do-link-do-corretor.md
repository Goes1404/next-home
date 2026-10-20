---
title: A prévia do link do corretor diz de quem é o portfólio
aliases: [prévia do link, og do portfólio, chamada do link, texto da prévia, alto padrão no link]
tags: [front, seo, banco, painel, armadilha, decisao]
type: nota
status: growing
custou: medio
codigo:
  - src/lib/previaDoLink.ts
  - src/lib/previaDoLink.test.ts
  - src/proxy.ts
  - src/app/(vitrine)/portfolio/page.tsx
  - src/lib/catalogo/cache.ts
  - src/app/corretor/(painel)/perfil/TextoDaPrevia.tsx
  - src/app/corretor/(painel)/perfil/previaAcoes.ts
  - supabase/migrations/0188_chamada_do_link_do_corretor.sql
created: 2026-10-19
updated: 2026-10-19
fonte: pedido do dono em 19/10/2026 ("aparece uma mensagem sobre imóveis de alto padrão")
summary: O link /?corretor=<slug> vira /portfolio e a prévia era fixa ("Portfólio de Imóveis de Alto Padrão em Alphaville"). Agora é "Portfólio de <nome>" + "Portfólio de produtos" ou o texto que o corretor escreve em Meu perfil (corretores.chamada_do_link, 0188). O redirect do proxy passou a levar a query, porque o robô do WhatsApp não guarda cookie.
---

# A prévia do link do corretor diz de quem é o portfólio

**O link que o corretor manda** é `/?corretor=<slug>` (tela Meus links). O
`proxy.ts` grava o cookie de atribuição e redireciona para `/portfolio`. O robô
do WhatsApp segue o redirecionamento e lê as metatags de `/portfolio`, que eram
**fixas e iguais para todo corretor**: "Portfólio de Imóveis de Alto Padrão em
Alphaville | Next Home".

**A armadilha:** o redirect soltava a query, e o robô não guarda o cookie que o
próprio redirect grava. Então nenhuma metadata por corretor seria possível
olhando só o cookie. Hoje o redirect leva a query inteira
(`/portfolio?corretor=<slug>`, e de quebra o `origem=ig` do carrossel, que se
perdia). `generateMetadata` lê o slug da URL e, sem ele, o do cookie.

**O texto:** título "Portfólio de <nome>" (sem corretor ou slug inválido:
"Portfólio da Next Home"), descrição "Portfólio de produtos". `title.absolute`
para o template do layout não acrescentar " · Next Home".

**Texto próprio:** em Meu perfil, "Texto da prévia do seu link", até 160
caracteres, vazio = padrão. Coluna `corretores.chamada_do_link` (0188) com
CHECK de tamanho, `grant update` só nela para `authenticated` (a tabela tem
grant por coluna desde a 0006; sem ele o update afeta 0 linhas calado) e
`grant select` para `anon`. Salvar chama `revalidarCorretores()` — a prévia lê
`corretoresPublicos()`, em cache por etiqueta (chave subiu para `-v4`).

**Tolerante à coluna ausente:** o cache lê `chamada_do_link` numa consulta à
parte e ignora o erro; Meu perfil mostra o campo travado. O código pode subir
antes da migration, mas o campo só salva depois dela.

**Achado, não corrigido:** a imagem de compartilhamento do site inteiro
(`OG_IMAGEM`, `marca/og-image.jpg` no Storage) responde **404**. A prévia sai
sem imagem em toda página.

Relacionados: [[o-imovel-nao-tem-mais-corretor-dono]] · [[MOC — Front Público]]
