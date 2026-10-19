---
title: Perfil de demonstração do corretor
aliases: [perfil fake, perfil demo, Lucas Andrade]
tags: [crm, painel, decisao]
type: decisao
status: ativo
custou: baixo
codigo: ["scripts/demo/semearPerfilDemo.sql", "scripts/demo/apagarPerfilDemo.sql", "src/lib/catalogo/cache.ts"]
summary: Corretor fictício "Lucas Andrade" (slug demo-lucas-andrade), desativado e sem WhatsApp, com 49 leads, 30 conversas, visitas e 4 vendas, para apresentar o painel cheio. Apagar com scripts/demo/apagarPerfilDemo.sql.
updated: 2026-10-12
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

## A conta ADM de demonstração (12/10/2026)

Criada para fotografar a Administração na apresentação comercial:
`admdemo@nexthomeimoveis.com`, cadastro "Admin Demonstração", slug
`demo-adm`, papel `gestor`, `ativo = false` (fica fora da roleta e do site).
A senha foi entregue ao dono da conta e não está no repositório. O evento
`conta_criada` está em `admin_eventos`, com ator nulo e o motivo escrito.

**Risco aceito pelo dono da conta:** não existe ADM "de demonstração".
`eh_gestor()` só olha `papel`, então esta conta enxerga toda a equipe real:
911 leads com nome e telefone, as contas e o WhatsApp de cada corretor.
Quem usar essa senha numa demonstração vê dados de clientes reais. Para
desfazer: `update corretores set papel = 'corretor' where slug = 'demo-adm'`
(ou apagar o usuário do Auth). Ela some sozinha quando o multi-empresa
(`empresa_id` + RLS) existir.

As fotos da Administração na apresentação foram tiradas com nomes,
telefones e e-mails da equipe borrados por script (filtro de CSS na hora da
captura), porque o link da apresentação é público.

