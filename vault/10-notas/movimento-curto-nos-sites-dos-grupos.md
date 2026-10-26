---
title: Movimento curto nos sites dos outros grupos (Aretz escura e rápida)
tags: [front, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - src/app/s/[site]/layout.tsx
  - src/components/motion/ritmo.ts
  - src/components/motion/Reveal.tsx
  - src/components/motion/TituloEditorial.tsx
  - src/lib/sites/coresDoSite.ts
  - src/lib/corretores/cadastroPendente.ts
  - src/components/corretores/CardCorretor.tsx
  - src/components/home/MosaicoDoHeroi.tsx
fonte: pedido do Matheus para a Aretz, 26/10/2026
summary: Site de grupo ≠ 1 sai com as mesmas animações, mais curtas (onda 360 ms, entrada 220 ms, GSAP a 60%); a Aretz ficou só no escuro por cor fixa no banco.
updated: 2026-10-26
---

# Movimento curto nos sites dos outros grupos

Pedido (26/10/2026, Aretz): "deixe o site mais rápido, as transições".

- O layout `src/app/s/[site]/layout.tsx` injeta, só quando a marca não é a
  Next Home, um `<style>` fora de `@layer` que ENCURTA (não remove) as
  animações: onda entre páginas 360 ms, página nova 220 ms, `nav-forward`
  240 ms e `--ritmo-do-movimento:0.6`. Decisão do dono: "continue com as
  animações, mas mais rápido" (a primeira versão tirou a onda e foi revista).
- `ritmoDoMovimento()` lê essa variável; `Reveal` e `TituloEditorial`
  multiplicam duração, atraso e cascata por ela. Sem a variável (Next Home)
  o ritmo é 1: nada muda lá, e o teste do layout trava isso.
- O movimento reduzido continua vencendo: o `!important` dele está em camada.

## Aretz só no tema escuro (sem código)

- Cores da Aretz vivem em `grupos.site_cor*` (o editor "Meu site" foi
  removido em 22/10, então a mudança é por SQL). O fundo do logo é
  `#0e1a10` (verde quase preto) e o dourado `#c49c4e`.
- Para travar no escuro e sumir o seletor de tema: pôr a paleta escura nas
  cores do CLARO (`site_cor`, `_secundaria`, `_fundo`, `_texto`) e zerar as
  `_escuro`. Com fundo/texto fixos e sem cor do escuro, `cssDasCoresDoSite`
  esconde o `radiogroup` "Tema" sozinho.
- **Armadilha:** mudar cor direto no banco não derruba o cache de rota (os
  layouts do site têm `revalidate = 3600` e só as actions chamam
  `revalidarSitePublico`). O visitante segue vendo a cor velha até uma hora;
  um deploy novo zera o cache.

## Celular "feio" e computador bonito: era o `data-tema`

- Sintoma (26/10/2026): "no desktop está muito bonito, mas no celular está
  tudo feio". Causa: cor fixa troca as VARIÁVEIS, mas várias superfícies do
  `globals.css` são escritas por `data-tema` (vidro dos cartões, faixa da
  planta, cabeçalho). Sem cookie o HTML nasce `claro`: no celular saía vidro
  claro e texto apagado sobre o fundo escuro. No computador de quem testou, o
  cookie `tema=escuro` (escolhido antes) escondia o defeito.
- **Diagnóstico sem cookie é obrigatório**: abrir em janela anônima ou
  renderizar sem cookie antes de dizer "está igual no celular".
- Correção: `temaFixoDoSite` + `scriptDoTemaFixo` (`coresDoSite.ts`). Fundo
  fixo escuro e sem cores do escuro → o layout `s/[site]` emite um script
  inline que põe `data-tema="escuro"`, a barra do navegador na cor do fundo e
  `color-scheme: dark`. Fundo claro ou com cores do escuro: nada muda.
- Como medi sem acesso ao domínio: HTML e CSS de produção via
  `web_fetch_vercel_url` (MCP da Vercel) e Playwright com `@sparticuz/chromium`
  servindo os arquivos por `page.route`, em 390 px, com e sem `data-tema`.

## CRECI de cadastro incompleto aparecia no site

- A carga da Aretz (23/10) gravou `PREENCHER-ARETZ-<NOME>` no CRECI e nomes
  com acento corrompido (`Andr?`, `F?bio`). Nomes corrigidos no banco; o site
  agora passa todo CRECI de corretor por `creciParaExibir` (nulo para
  `PENDENTE-`, `PREENCHER-` ou sem número) nos cartões, no perfil e nas
  páginas de token.

## Destaques no celular e escuro menos marrom (26/10/2026)

- O mosaico do herói é `hidden lg:grid`: no celular não havia nenhuma foto
  de prédio no topo. `FaixaDoHeroiNoCelular` (mesmo arquivo) mostra os
  destaques numa faixa de deslizar com encaixe, `lg:hidden`, só nos sites de
  outros grupos (a home da Next Home fica igual).
- "Muito marrom e muito verde": fundo da Aretz passou a `#0a0f0b` (o verde
  do logo misturado com preto) e texto `#f5f5f2`. `CSS_DO_ESCURO_FIXO`
  (só com tema travado) baixa o dourado das faixas (`--percurso-tom:5%`,
  `secao-banda` = superfície) e põe a planta em cinza: o SVG dela tem traço
  `#003d36` FIXO, o verde-petróleo da Next Home.

## Aretz em preto e branco (26/10/2026, 14h30)

- Decisão do dono: "ao invés desse marrom, preto e branco". Paleta no banco:
  principal `#f5f5f5`, secundária `#a3a3a3`, fundo `#0a0a0a`, texto
  `#f5f5f2`→`#f5f5f5`. Os botões com `text-white` fixo saem em cinza
  (`brand-500` = `#6e6e6e`), porque `paraTextoBranco` escurece o branco até o
  texto branco ler — é o limite do mecanismo de cores, não defeito.
- Lembrete: cor trocada por SQL só aparece depois de um deploy ou de o cache
  de rota vencer (1 h).

## Nome de corretor corrigido por SQL não aparece (26/10/2026)

- `corretoresPublicos` fica no cache de dados da Vercel, que SOBREVIVE ao
  deploy; `invalidate_by_tags` do MCP da Vercel responde 404 ("CDN Cache
  Namespace not found") e não limpa esse cache. O caminho é subir a chave do
  `unstable_cache` (`corretores-publicos-v6`) e publicar.
- Slugs da Aretz também corrigidos: `andr` → `andre`, `f-bio` → `fabio`,
  `mois-s` → `moises`.
- O gestor da Aretz NÃO edita o front do site: cores, logo e textos do site
  só mudam por `/plataforma` (administrador da plataforma) ou SQL. Decisão
  do dono: o cliente depende da manutenção da Astro.

## Relacionadas
- [[meu-site-da-imobiliaria]]
- [[MOC — Front Público]]
