# Sites por endereço — o que o dono precisa fazer

A partir da fase 3 (20/10/2026) o site público é do grupo do ENDEREÇO que o
visitante digitou. O código já sabe fazer isso; o que falta é ligar cada
endereço na Vercel, no DNS e no banco. Nenhum desses passos foi feito pelo
código nem por agente — são todos seus.

## Como o site escolhe o grupo

1. O visitante abre `https://imobiliariasol.com.br/sobre`.
2. O `proxy.ts` leva a página para `/s/imobiliariasol.com.br/sobre`, sem
   consultar o banco.
3. O layout do site pergunta ao banco (`site_do_endereco`) de que grupo é o
   endereço, e guarda a resposta por 5 minutos.
4. Endereço de nenhum grupo (ou de grupo **encerrado**) mostra uma página
   neutra de 404, sem marca de ninguém. Grupo **suspenso** continua com o
   site no ar.

Os endereços da Next Home não passam pelo banco (são fixos no código):
`www.nexthomeimoveis.com`, `nexthomeimoveis.com` e
`next-home-drab.vercel.app`, além de `localhost` e dos previews da Vercel.

## Antes de publicar esta fase

1. Aplicar a migration `supabase/migrations/0201_enderecos_do_site.sql` em
   produção **antes** do deploy (skill `aplicar-migration-producao`). Sem ela
   o site da Next Home funciona igual, mas qualquer outro endereço apontado
   para a Vercel dá erro 500 em vez da página neutra.
2. Conferir depois do deploy:
   - `curl -sI https://www.nexthomeimoveis.com/` → `200` e
     `x-vercel-cache: HIT` na segunda vez;
   - `curl -s https://www.nexthomeimoveis.com/robots.txt` → termina com
     `Sitemap: https://www.nexthomeimoveis.com/sitemap.xml`;
   - `curl -s https://www.nexthomeimoveis.com/googleecdb70d74ecd3e26.html`
     → a linha de verificação do Google (agora é uma rota; o arquivo saiu de
     `public/`).

## Ligar o domínio próprio de um cliente

Exemplo: a Imobiliária Sol (grupo já criado no painel da plataforma) quer o
site em `imobiliariasol.com.br`.

1. **Vercel** → projeto `next-home` → Settings → Domains → Add. Adicione
   `imobiliariasol.com.br` **e** `www.imobiliariasol.com.br`. A Vercel mostra
   os registros de DNS que faltam (em geral um registro `A` para o domínio sem
   `www` e um `CNAME` para o `www`).
2. **DNS do cliente** (no registrador dele — Registro.br, Hostinger, etc.):
   criar exatamente os registros que a Vercel mostrou. O certificado HTTPS sai
   sozinho em alguns minutos depois que o DNS propaga.
3. **Banco** (editor SQL do Supabase, produção):

   ```sql
   insert into public.enderecos_do_site (host, grupo_id, principal) values
     ('imobiliariasol.com.br', '<id do grupo>', true),
     ('www.imobiliariasol.com.br', '<id do grupo>', false);
   ```

   - `host` em minúsculas, sem `https://`, sem barra e sem porta (o banco
     recusa o que não for nome de domínio).
   - `principal = true` em UM endereço por grupo: é para ele que apontam o
     link canônico, o sitemap, o Open Graph e o JSON-LD de todos os endereços
     do grupo.
   - Um endereço só pode ser de um grupo (a chave é o próprio endereço).
4. Esperar até 5 minutos (o cache da resposta) e abrir o site. Se o endereço
   já tinha sido visitado antes de cadastrar, a página neutra pode ficar em
   cache por esse mesmo tempo.

**Antes de ligar o site de um cliente, saiba o que ele ainda NÃO tem** (fase 3
enxuta): o site mostra o catálogo, a equipe e o nome do grupo, e o WhatsApp
sorteia entre os corretores dele. Mas os textos fixos das páginas ainda falam
de Alphaville e Barueri, não há logotipo, foto de fundo, cor, endereço do
escritório, CRECI da imobiliária nem redes sociais do grupo (o site mostra
só o que tem, e esconde o resto), e a política de privacidade ainda é a
genérica. Isso é o "portfólio editável", que fica para a próxima etapa.

## Endereço gratuito `<slug>.<domínio da plataforma>`

Fica para quando o domínio da plataforma for comprado (decisão de 19/10:
depois do primeiro pagamento). O código já atende: com a variável ligada,
`imobiliaria-sol.<domínio>` abre o site do grupo de slug `imobiliaria-sol`,
sem nenhuma linha no banco. Slugs reservados (`www`, `app`, `painel`,
`next-home`...) nunca viram site.

Quando o domínio existir:

1. **Hostinger** (onde o domínio for comprado) → DNS / Nameservers → trocar
   para os nameservers da Vercel (`ns1.vercel-dns.com` e
   `ns2.vercel-dns.com`). Subdomínio curinga (`*.`) com certificado
   automático só funciona com o DNS na Vercel.
2. **Vercel** → projeto `next-home` → Settings → Domains → Add
   `*.<domínio>` (e o próprio `<domínio>`, se ele também for servir algo).
3. **Vercel** → Settings → Environment Variables → Production:
   `DOMINIO_DA_PLATAFORMA = <domínio>` (sem `https://`). Variável nova só vale
   depois de um **Redeploy**.
4. Conferir: `curl -sI https://<slug-de-um-grupo>.<domínio>/` → `200`; e
   `curl -sI https://naoexiste.<domínio>/` → `404`.

Quando o grupo tiver domínio próprio marcado como `principal`, o endereço
gratuito continua abrindo o site, e o link canônico aponta para o próprio
(o redirecionamento permanente do gratuito para o próprio é pendência).

## O que continua sendo da Next Home em qualquer endereço

- O painel (`/corretor`), o login e a área da plataforma: abrem em qualquer
  endereço apontado para a Vercel, com a marca da Next Home. Painel no
  domínio da plataforma é pendência (lacuna L46).
- O Pixel da Meta e a verificação do Search Console: só no site da Next Home
  (`integracaoLiberada`); nos outros sites ficam desligados.
- Links que a IA e o painel mandam por WhatsApp (página do imóvel, seleção,
  agenda) ainda usam `NEXT_PUBLIC_SITE_URL`, o endereço da Next Home
  (lacuna L45, pendência).

## Plano da Vercel

O projeto está no plano Hobby, que não permite uso comercial: antes do
primeiro cliente externo, migrar para o Pro (o Pro também é o que dá os
limites de domínios por projeto que um site por cliente pede).
