---
title: A metragem da planta não tinha campo no editor
tags: [painel, crm]
type: armadilha
status: evergreen
custou: baixo
codigo:
  - src/app/corretor/(painel)/imoveis/_componentes/EditorTipologias.tsx
  - src/app/corretor/(painel)/imoveis/_componentes/EditorImovelClient.tsx
summary: O editor do imóvel salvava a área privativa, mas não tinha campo para ela; planta nova nascia com 80 m², 2 dorm, 2 suítes inventados.
updated: 2026-10-20
---

# A metragem da planta não tinha campo no editor

Relatado em 20/10/2026: "o campo de mudar a metragem dos imóveis não existe".

- A action salvava `area_privativa`, mas a tela só tinha "Nome / Metragem"
  (texto, gravado em `nome`) e "Dormitórios / Suítes", que editava só
  `suites`. Metragem, dormitórios e banheiros não tinham campo.
- Pior: "Adicionar planta" nascia com **80 m², 2 dorm, 2 suítes, 2
  banheiros, 2 vagas** de padrão, e como os campos não apareciam, isso ia
  para o cadastro como fato. Em produção sobrou um caso: Dom Parque, planta
  "sala ampliada 77m²" gravada com 80 m² e 2/2/2/2.
- Hoje: campos próprios para nome, metragem (m² privativos, aceita
  decimal), dormitórios, suítes, banheiros, vagas e preço; planta nova nasce
  em branco.

Régua: valor padrão em campo que a tela não mostra vira dado inventado.
