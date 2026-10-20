---
title: Dados do grupo saem em planilha, o titular apaga tudo e o grupo cancelado some depois de 90 dias
tags: [lgpd, banco, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0202_dados_do_grupo_e_titular.sql, src/lib/grupos/planilhasDoGrupo.ts, src/lib/grupos/exportacaoDoGrupo.ts, src/lib/grupos/encerramento.ts, src/lib/grupos/arquivosPrivados.ts, src/lib/grupos/encerramentoRegras.ts, src/app/corretor/(painel)/leads/[id]/titularAcoes.ts, src/app/plataforma/grupos/[id]/exportar/route.ts]
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
  Vão junto as OUTRAS fichas do grupo com o mesmo `telefone_e164` ou o mesmo
  e-mail (sem diferença de caixa e espaço): a pessoa é uma, as fichas podem
  ser várias (planilha reimportada, dois corretores). Outra imobiliária com o
  mesmo número não é tocada. Fica a venda (obrigação fiscal), sem o lead mas
  com o nome e o CPF do comprador em `venda_fiscal`, e o clique do link. A
  função devolve os ids apagados, e a pasta `documentos-clientes/<lead>/` de
  cada um sai pela chave de serviço. O evento `titular_apagado` não leva nome,
  telefone nem id do lead.
- **Cancelamento** (tela do grupo na plataforma): `cancelado_em` + `encerrado`.
  Só o SITE sai do ar (0201); o painel segue aberto para a equipe baixar os
  dados. Desfaz dentro dos 90 dias, voltando à situação de antes
  (`situacao_antes_do_cancelamento`: suspenso continua suspenso); depois dos
  90, com a rotina ligada, não desfaz. A Next Home não cancela (CHECK). A
  plataforma só baixa a planilha **24 horas depois** do cancelamento: sem a
  espera, cancelar, baixar e desfazer em um minuto tornaria a exceção ao §4
  só disciplina.
- **Rotina dos 90 dias** no tique diário `/api/cron/limpar-artes-ia`
  (`maxDuration` 60). Um grupo por execução: cópia no bucket privado
  `exportacoes-de-grupos` → `exportacao_final_caminho` e
  `exportacao_final_em` → logins e quais são administradores da plataforma
  (erro aqui PARA tudo) → arquivos privados (`documentos-clientes/<lead>/`
  dos leads do grupo e `contabilidade/<grupo>/`) → `apagar_dados_do_grupo` →
  logins do Auth (menos administrador) → evento da plataforma
  `dados_do_grupo_apagados`.
  - Falha fica em `grupos.falha_ao_apagar` / `tentativa_de_apagar_em` (a tela
    do grupo mostra) e no evento `falha_ao_apagar_dados_do_grupo`. A fila
    (`ordemDeApagar`) põe antes quem nunca falhou: um grupo que falha sempre
    não trava os outros.
  - O banco recusa (`entrou_dado_depois_da_copia`) se entrou lead ou venda
    depois da cópia: grupo cancelado continua recebendo pelo webhook.
  - A cópia final guardada é apagada **30 dias depois dos dados**
    (`copia_final_apagada_em`; decisão de 20/10 sem resposta do dono: cópia
    eterna desfaria o "apagados de vez" da resposta 7). Cada download dela
    grava `copia_final_baixada` (evento da plataforma) ANTES de entregar.

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
- **Erro de leitura que decide se algo é APAGADO tem de parar a ação.** A
  primeira versão lia `count` de administradores e ignorava o `error`: numa
  piscada do banco o administrador perdia o login.
- **`storage.list` devolve no máximo `limit` itens e não pagina sozinho.**
  Sem `offset`, pasta com mais de 1000 arquivos ficava pela metade e a ação
  dizia "apagado" (`itensDaPasta`).
- **Arquivo privado sai ANTES das linhas**: depois do delete não há mais
  como saber de quem é cada pasta. Pasta de lead excluído antes do
  cancelamento continua órfã (pendência).

## Fica para depois

Arquivos do grupo no Storage público (fotos, artes), pastas de
`documentos-clientes` de leads excluídos antes do cancelamento (não há mais
como ligá-las ao grupo), confirmar com o dono o prazo de 30 dias da cópia
final, instâncias da Evolution,
bloquear IA e listas do grupo cancelado, lixeira de 30 dias (resposta 8),
retenção por tipo de dado (L82) e exportação para o próprio titular.
