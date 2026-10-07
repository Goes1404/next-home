---
title: Perfil de demonstração do corretor
aliases: [perfil fake, perfil demo, Lucas Andrade]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["scripts/demo/semearPerfilDemo.sql", "scripts/demo/apagarPerfilDemo.sql", "src/lib/catalogo/cache.ts"]
summary: Corretor fictício "Lucas Andrade" (slug demo-lucas-andrade), desativado e sem WhatsApp, com 49 leads, 30 conversas, visitas e 4 vendas, para apresentar o painel cheio. Apagar com scripts/demo/apagarPerfilDemo.sql.
updated: 2026-10-07
---

# Perfil de demonstração do corretor

Criado em 07/10/2026 para a apresentação. O login é
`demo@nexthomeimoveis.com`; a senha não está no repositório.

**Isolado da operação real:**
- `ativo = false`: fora da roleta, dos avisos e do site público. Para isso,
  `corretoresPublicos` passou a filtrar `ativo` (antes listava todo corretor
  com slug, e sem slug o painel não abre). A página `/corretores/<slug>` dá 404.
- Sem instância de WhatsApp: o porteiro `/wa` não o sorteia e nada sai em nome
  dele.
- A última fala de cada conversa é da IA ou do corretor, e quem tem visita
  marcada não tem conversa: nenhuma varredura nem lembrete de véspera age.

**O que contamina até ser apagado:** os números da equipe que o ADM vê
(leads, funil, caixa, DRE) e o ranking (R$ 1,87 milhão de VGV fictício).

**Armadilha:** `leads_visita_sem_conflito_idx` recusa duas visitas do mesmo
corretor no mesmo instante. Gerar visitas em lote precisa de horários únicos.

Para apagar: rodar `scripts/demo/apagarPerfilDemo.sql` no editor SQL (o MCP
recusa `delete`).
