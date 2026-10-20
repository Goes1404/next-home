---
title: Dados do grupo saem em planilha, o titular apaga tudo e o grupo cancelado some depois de 90 dias
tags: [lgpd, banco, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0202_dados_do_grupo_e_titular.sql, src/lib/grupos/planilhasDoGrupo.ts, src/lib/grupos/exportacaoDoGrupo.ts, src/lib/grupos/encerramento.ts, src/lib/grupos/encerramentoRegras.ts, src/app/corretor/(painel)/leads/[id]/titularAcoes.ts, src/app/plataforma/grupos/[id]/exportar/route.ts]
created: 2026-10-20
updated: 2026-10-20
summary: Operação enxuta (20/10/2026, 0202) — o gestor baixa a planilha do grupo, registra o pedido do titular na ficha, e a plataforma registra o cancelamento; uma rotina diária DESLIGADA por padrão apaga o grupo 90 dias depois, com cópia gravada antes.
---

# Encerramento do grupo e pedido do titular

Parte da [[plataforma-multi-grupo]] (desenho §18 "Operação", resposta 7 do
dono). Plano: `docs/superpowers/plans/2026-10-20-fase-op-dados-do-grupo.md`.

## O que existe

- **Planilha do grupo** (`.xlsx`, abas Leads, Imóveis, Corretores, Vendas). A
  aba de leads é a ficha (`fichasDoCorretor.ts`). Fora: conversa, mensagem,
  dossiê, anotação, `leads.mensagem`, WhatsApp/e-mail/login dos corretores,
  CPF do comprador e a observação da venda. Toda consulta filtra `grupo_id`
  (guarda `exportacaoDoGrupo.test.ts` lê o código).
  - Gestor: Administração → Visão geral → "Baixar planilha com todos os
    dados" (`/api/painel/dados-do-grupo`), pela sessão.
  - Plataforma: `/plataforma/grupos/<id>/exportar`, **só com cancelamento
    registrado**. É a exceção declarada ao §4 (o administrador não lê
    ficha): o caso é a entrega ao cliente que saiu.
  - Todo download grava `dados_do_grupo_exportados` no grupo, com as contagens.
- **Pedido do titular** (ficha do lead, só gestor):
  `apagar_dados_do_titular(lead)` apaga o lead e as sobras das FKs
  `set null` (envios, e-mail de portal, fila de lista, eventos de marketing,
  ativações, anotações do lead, telemetria e correções da IA das conversas).
  Fica a venda (obrigação fiscal), sem o lead, e o clique do link. Depois do
  banco, a pasta `documentos-clientes/<lead>/` sai pela chave de serviço.
  O evento `titular_apagado` não leva nome, telefone nem id do lead.
- **Cancelamento** (tela do grupo na plataforma): `cancelado_em` + `encerrado`.
  Só o SITE sai do ar (0201); o painel segue aberto para a equipe baixar os
  dados. Desfaz dentro dos 90 dias. A Next Home não cancela (CHECK).
- **Rotina dos 90 dias** no tique diário `/api/cron/limpar-artes-ia`
  (`maxDuration` 60). Um grupo por execução: cópia no bucket privado
  `exportacoes-de-grupos` → `exportacao_final_caminho` →
  `apagar_dados_do_grupo` → logins do Auth (menos administrador da
  plataforma) → evento da plataforma `dados_do_grupo_apagados`.

## Para ligar a rotina (decisão do dono)

Na Vercel, `APAGAR_GRUPOS_CANCELADOS=1` em Production e um redeploy. Valor
diferente de `1` exato (inclusive `true`) deixa desligada. A tela do grupo
cancelado avisa quando está desligada. O banco recusa sozinho antes dos 90
dias, sem a cópia, o grupo 1 e grupo já apagado.

## Armadilhas

- **`apagar_dados_do_grupo` não tem a ordem das tabelas escrita.** Ela varre
  toda tabela do `public` com `grupo_id` e repete as passadas até as FKs
  deixarem; passada sem progresso desfaz tudo. Tabela nova entra sozinha.
- **Evento sem grupo não sai de dentro de `security definer`**: ali o papel é
  `postgres`, e a marca `origem = 'plataforma'` só vale para `service_role`.
  O evento final é gravado pelo código.
- **Teste de banco com `comoUsuario`/`comoServico` desfaz o que gravou**: o
  efeito de uma função se confere DENTRO do callback, depois de `reset role`.

## Fica para depois

Arquivos do grupo no Storage público (fotos, artes), instâncias da Evolution,
bloquear IA e listas do grupo cancelado, lixeira de 30 dias (resposta 8),
retenção por tipo de dado (L82) e exportação para o próprio titular.
