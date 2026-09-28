---
title: Fila de cadastro pelo site da construtora
tags: [midia, banco, decisao, medicao]
type: nota
status: stable
custou: medio
codigo: supabase/migrations/0128_fila_de_cadastro_pelo_site_da_construtora.sql
created: 2026-09-28
updated: 2026-09-28
summary: Os 14 candidatos "cadastrar" viraram rascunhos lidos da página de cada construtora; o apto.vc só serviu para achar quem constrói. Fotos ficam para a aba Importar, com o link já gravado.
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
  blur, dedup por hash), que roda no painel. Em cada rascunho, Importar →
  Site da construtora já abre com o link, e o corretor escolhe as fotos.
  Vídeos do YouTube e tours (Kuula, 3D Explora) entraram, como faz
  `adicionarMidiaExterna`.
- **Vitta Barueri é loteamento** (`tipo = terreno`, lotes a partir de
  126 m²), não apartamento.
- **Plantas com dado incompleto** no site (vagas e suítes por planta nem
  sempre aparecem) ficaram com 0, que o prompt omite. Conferir antes de
  publicar.
