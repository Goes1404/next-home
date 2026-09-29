---
title: Fila de cadastro pelo site da construtora
tags: [midia, banco, decisao, medicao]
type: nota
status: stable
custou: medio
codigo: supabase/migrations/0128_fila_de_cadastro_pelo_site_da_construtora.sql
created: 2026-09-28
updated: 2026-09-28
summary: Os 14 candidatos "cadastrar" viraram rascunhos lidos da página de cada construtora; o apto.vc só serviu para achar quem constrói. As fotos vieram depois, por um workflow do GitHub Actions que usa o mesmo caminho da aba Importar.
---

# Fila de cadastro pelo site da construtora

Migration: `0128`. Os 14 candidatos com `decisao = 'cadastrar'` viraram
imóveis RASCUNHO (`publicado = false`), cada um ligado ao candidato
(`empreendimento_id`) e com `site_construtora` preenchido.

- **O link da fila é do agregador, não da construtora.** Todos os 14 vinham
  do apto.vc. A página do apto traz a construtora em `companySections` (no
  `__NEXT_DATA__`); o site dela foi achado por busca e lido com
  `lerPaginaDaConstrutora`, o mesmo leitor do importador. Os 14 sites
  entregam HTML (nenhum montado por JavaScript).
- **O agregador diverge da construtora, e a construtora vence.** Liv Stay:
  apto dizia Av. Piraíba e 35 m²; a RSF diz Av. Mackenzie, 730, de 32 a
  112 m². Dellagio: entrega em 2028 no apto, primeiro semestre de 2027 na
  imprensa. Por isso **preço e entrega ficaram vazios**, e coordenada só
  entrou quando a rua do apto bate com a da construtora (fora: Liv Stay e
  Square).
- **Fotos não entram por migration**: precisam de `registrarMidia` (medida,
  blur, dedup por hash). Vieram por `scripts/catalogo/trazerFotos0128.ts`,
  rodando no GitHub Actions (`fotos-da-fila.yml`), onde está a chave de
  serviço. A seleção curada fica em `scripts/catalogo/fotos-0128.json`: sem
  banner, foto de obra, "conheça também" e fotos da região.
- **O leitor para em 60 imagens** (`TETO_IMAGENS_SITE`), e no NID isso
  cortou todas as plantas, que vêm no fim da página. Elas foram tiradas do
  HTML à parte. Página com galeria grande perde o que vem depois.
- **`parecePlanta` erra nos dois sentidos**: no Serenne marcou as fotos do
  lazer como planta; no Oásis marcou "Suíte" e "Suíte master". Conferir o
  tipo antes de gravar.
  Vídeos do YouTube e tours (Kuula, 3D Explora) entraram, como faz
  `adicionarMidiaExterna`.
- **Vitta Barueri é loteamento** (`tipo = terreno`, lotes a partir de
  126 m²), não apartamento.
- **Plantas com dado incompleto** no site (vagas e suítes por planta nem
  sempre aparecem) ficaram com 0, que o prompt omite. Conferir antes de
  publicar.
- **Tours e vídeos que o leitor não achou** vieram depois
  (`scripts/catalogo/trazerVideos0128.ts`, `videos-da-fila.yml`): o leitor
  conhece Kuula, Matterport e 3D Explora, mas não tourmkr, Tour Brasil 360
  e Instacasa, e não lê `<video><source>`. Tour entra como link; `.mp4` do
  site da construtora sobe para o nosso Storage.
- **Tour de outro prédio na página certa**: os dois tours da página do Liv
  Stay se chamam "Beyond Residence" (28 m², planta que o Liv Stay nem tem).
  Conferir o `<title>` do tour antes de cadastrar.
- **Publicados em 29/09** (`scripts/catalogo/operacao0129.ts`, junto com o
  Arbórea Alphagran), e a duplicata `serenne-barueri-2` apagada com os
  arquivos dela no Storage.
- **Publicar direto no banco não aparece no site na hora.** O catálogo
  público fica em `unstable_cache` por até 1 h (`REVALIDA_EM_SEGUNDOS`), e só
  as actions do painel chamam `revalidarCatalogo`. As páginas novas mostram
  "não encontrado" até o cache virar. `invalidate_by_tags` do MCP da Vercel
  não alcança esse cache ("CDN Cache Namespace not found"). Para ver na hora:
  salvar qualquer imóvel no painel.
