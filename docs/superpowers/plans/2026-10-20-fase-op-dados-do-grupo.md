# Operação enxuta — dados do grupo e LGPD (20/10/2026)

Escopo decidido com o dono: exportar os dados de um grupo, atender o pedido
do titular (LGPD art. 18) e registrar o cancelamento do grupo com retenção de
90 dias. O resto do "Operação e ciclo de vida" (§18 do desenho) fica de fora
e vai como pendência.

Branch: `fase-op-dados-do-grupo` (a partir de `fase-3-site-por-endereco`).

## Decisões tomadas sem o dono (registradas no relatório)

1. **A /plataforma só exporta grupo com cancelamento registrado.** O §4 do
   desenho é firme: o administrador da plataforma não lê ficha. O caso em que
   a plataforma precisa da planilha é a entrega ao cliente que cancelou
   (pergunta 7). O gestor exporta o próprio grupo a qualquer hora. Toda
   exportação grava `dados_do_grupo_exportados` em `admin_eventos`, no grupo
   (o gestor vê quando a plataforma baixou).
2. **Uma planilha só (.xlsx) com quatro abas**: Leads (a ficha, as mesmas
   colunas de `fichasDoCorretor.ts` + corretor), Imóveis, Corretores (nome,
   CRECI, papel, situação; sem WhatsApp, e-mail nem login) e Vendas (sem o
   CPF/CNPJ de `venda_fiscal`). Nada de conversa, mensagem, dossiê, nota ou
   `leads.mensagem`.
3. **Pedido do titular apaga o lead e o que sobra dele** (FKs `set null`):
   `historico_envios`, `inbound_logs`, `whatsapp_campanhas_fila`,
   `marketing_eventos`, `ativacoes_em_lead_alheio`, `anotacoes` do lead,
   `ia_interacoes` e `ia_correcoes` das conversas dele, e a pasta
   `documentos-clientes/<lead>/` no Storage. **Fica**: `vendas` e
   `venda_fiscal` (obrigação fiscal, LGPD art. 16, I) e `cliques_whatsapp`
   (sem dado pessoal, o lead vira nulo). Só o gestor do grupo pede.
4. **Cancelar marca `cancelado_em` e põe o grupo em `encerrado`** (o site sai
   do ar pela 0201). Desfazer volta a `ativo` dentro dos 90 dias. A Next Home
   (grupo 1) não pode ser cancelada (CHECK no banco).
5. **A rotina mora no tique diário `/api/cron/limpar-artes-ia`** e só age com
   `APAGAR_GRUPOS_CANCELADOS=1`. Um grupo por execução (teto de 30 s). A
   cópia vai para o bucket privado `exportacoes-de-grupos` antes; sem cópia
   gravada, nada é apagado. A função do banco recusa grupo com menos de 90
   dias, sem cópia ou já apagado.
6. **A linha de `grupos` fica** (com `dados_apagados_em`), e o evento final é
   da plataforma (sem grupo), gravado pelo código com a chave de serviço.

## Arquivos

- `supabase/migrations/0202_dados_do_grupo_e_titular.sql`: colunas de
  `grupos`, ações novas de `admin_eventos`, bucket privado,
  `apagar_dados_do_titular(uuid)` e `apagar_dados_do_grupo(uuid)`.
- `src/lib/grupos/planilhasDoGrupo.ts` (puro) + teste.
- `src/lib/grupos/exportacaoDoGrupo.ts` (leitura paginada, recebe o cliente).
- `src/app/api/painel/dados-do-grupo/route.ts` (gestor) + botão na Visão
  geral da Administração.
- `src/app/plataforma/grupos/[id]/exportar/route.ts` (administrador).
- `src/app/plataforma/acoes.ts`: `registrarCancelamento`,
  `desfazerCancelamento`; cartão na página do grupo.
- `src/app/corretor/(painel)/leads/[id]/titularAcoes.ts` + componente na
  ficha (só gestor).
- `src/lib/grupos/encerramento.ts` (rotina) e a chamada no cron diário.
- Guardas: `servicoComGrupo.test.ts` (mapa), `funcoesSeguras.ts`,
  `supabase/types.ts` à mão.

## Testes

- Puros: planilhas (abas, colunas, nada sensível), prazo dos 90 dias, flag.
- Banco (`dadosDoGrupo.db.test.ts`): titular só pelo gestor do grupo,
  limpeza das sobras, evento sem dado pessoal; apagar grupo recusa < 90 dias,
  sem cópia, grupo 1, e apaga tudo do grupo sem tocar no vizinho.
- Guarda de código: a exportação não lê tabela de conversa.
