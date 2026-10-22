---
title: Marca do grupo no CRM
tags: [painel, decisao]
type: decisao
status: growing
custou: medio
codigo:
  - supabase/migrations/0208_logo_do_grupo.sql
  - src/lib/marcaDoCrm/marca.ts
  - src/lib/marcaDoCrm/ler.ts
  - src/lib/marcaDoCrm/doPainel.ts
  - src/lib/marcaDoCrm/gravarLogo.ts
  - src/lib/marcaDoCrm/logo.ts
  - src/lib/marcaDoCrm/semMarcaFixaNoCrm.test.ts
  - src/app/corretor/(painel)/layout.tsx
  - src/app/corretor/(painel)/_componentes/NomeDaCasa.tsx
  - src/app/corretor/(painel)/admin/marca/acoes.ts
  - src/components/grupos/FormularioDeLogo.tsx
  - src/lib/enderecosDoPainel.ts
  - src/proxy.ts
summary: Quem entra pelo CRM de outra imobiliária vê o nome e a logo dela, e todo link para o corretor ou para o cliente sai no endereço certo; a Next Home (grupo 1) fica igual, travada por teste.
created: 2026-10-21
updated: 2026-10-21
---

# Marca do grupo no CRM

> [!warning] Editor removido em 22/10/2026
> A identidade já gravada continua sendo usada pelo CRM, mas a rota
> administrativa Marca e suas actions foram retiradas do painel.

Pedido do dono (21/10/2026): o cliente que entra por `astroimob.vercel.app`
não pode ver "Next Home" nem `nexthomeimoveis.com` depois do login. Plano:
`docs/superpowers/plans/2026-10-21-marca-do-grupo-no-crm.md`.

- **Nome:** `grupos.ia_nome_da_casa` se preenchido, senão `grupos.nome`;
  leitura com falha cai em "Imobiliária", nunca na Next Home. **Logo:**
  `grupos.logo_url` (0208) ou o nome escrito. O grupo 1 não consulta nada: é
  a marca de `site.ts`, e `textosDaNextHome.test.ts` / `marca.test.ts`
  travam as palavras e os links.
- **Dois endereços, duas funções** (`marcaDoCrm/marca.ts`):
  `enderecoDoPainel(grupo)` leva o CORRETOR ao painel (grupo 1 `site.url`;
  outros `PAINEL_URL`, padrão `https://astroimob.vercel.app`);
  `enderecoDoCliente(grupo, host)` leva o CLIENTE (grupo 1 `site.url`; outros
  o site principal em `enderecos_do_site`, senão o painel). Link do painel
  montado com `site.url` reprova em `semMarcaFixaNoCrm.test.ts`.
- **Cache de 60 s por grupo** em `ler.ts` (processo, não requisição): um cron
  que avisa 40 corretores lê o grupo uma vez. Quem grava a logo limpa o cache.
- **Token do cliente no endereço do painel:** o `proxy.ts` deixa abrir
  `/selecao`, `/documentos`, `/proposta`, `/portal`, `/contador`, `/parceiro`
  (`ROTAS_DE_TOKEN_DO_CLIENTE`). `siteDaPagina` devolve um site NEUTRO para
  esse endereço (antes dava 404: `resolverSite` não conhece o host).
- **Logo:** PNG/JPEG/WebP até 1 MB, SEM SVG (script), formato lido dos bytes.
  Bucket público `empreendimentos`, `grupos/<id>/logo-<hash>.<ext>`. Quem
  grava é Server Action com chave de serviço (gestor: só o próprio grupo;
  plataforma: `exigirAdminDaPlataformaNaAcao`); `logo_do_grupo_alterada` em
  `admin_eventos`.
- **Armadilha:** a regex do CHECK de `admin_eventos` precisa repetir a lista
  INTEIRA da última migration (0207); omitir uma ação a derruba.
- **Ficou de fora de propósito:** links do cliente dentro da conversa da IA
  (`resolverMidia`, `apresentacaoDigital`), manifesto/favicon.ico de arquivo,
  e-mail de convite (já usava o nome do grupo). Ver o relatório no handoff.
