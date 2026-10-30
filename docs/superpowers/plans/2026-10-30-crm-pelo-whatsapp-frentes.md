# CRM pelo WhatsApp — frentes em paralelo (painel de retomada)

Pedido do dono (30/10/2026): adiantar a construção com agentes em frentes
paralelas e, se os créditos da sessão acabarem, retomar sozinho quando
voltarem. Este arquivo é a fonte da retomada: a tarefa agendada lê daqui o
que falta. **Atualize a coluna Estado a cada frente juntada.**

Desenho: `docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md`.
Base de todas as frentes: commit `ec5c9dfc` (contrato `preparar` → "sim" →
`executar` → `desfazer` em `src/lib/central/executar.ts`; `resolverLead`;
um arquivo por frente em `src/lib/central/tratadores/`).

## Regras de toda frente

- Um agente por frente, em worktree isolado (`isolation: "worktree"`); se
  faltar `node_modules` no worktree: `ln -s /home/user/next-home/node_modules node_modules`.
- Só mexe no arquivo da frente em `src/lib/central/tratadores/`, nos testes
  dele, em funções de domínio fora de `src/lib/central/` (quando faltarem) e
  nas linhas do MAPA de `src/lib/grupos/servicoComGrupo.test.ts` (logo abaixo
  de `resolverLead.ts`). Não edita executar.ts, proposta.ts, ferramentas.ts,
  tratadores/index.ts, resolverLead.ts, bancoFalso.ts nem migrations (a Frente
  E é a única que mexe em conversa.ts, webhook.ts e cerebro.ts).
- Escrita no CRM só por função de domínio (guarda em `ferramentas.test.ts`).
  Contexto (corretor, grupo, papel) vem da identificação, nunca da IA.
- Não muda `ONDA_ATUAL`, não aplica migration, não publica, não abre PR, não
  roda `prettier --write` em arquivo existente nem `next build`.
- Verifica com `npx tsc --noEmit -p .`, `npx vitest run` nas pastas tocadas e
  `npx eslint` nos arquivos mudados; commit em português com o trailer da
  sessão; sem nome de modelo.
- Quem junta (a sessão principal): merge do branch do worktree na
  `ccr-c2c56589-a2yhl2`, `tsc` + `vitest --dir src` + `lintTeto`, push na
  branch. Produção só com o dono (migration 0249 ainda pendente).

## Onda 1 (lançadas em 30/10/2026)

| Frente | Arquivo | Ferramentas | Estado |
|---|---|---|---|
| A · Consultas | `tratadores/consultas.ts` | `consultar_lead`, `quem_ligar_hoje` (reaproveitar `getFilaDeTrabalho`/`montarResumoDoDia` sem sessão) | em andamento |
| B · Leads | `tratadores/leads.ts` | `cadastrar_lead` (telefone inteiro; regra de lead de outro corretor; desfazer arquiva), `atualizar_lead` (desfazer restaura) | em andamento |
| C · Agenda | `tratadores/agenda.ts` | `visita` (marcar/remarcar/cancelar; datas da agenda por WhatsApp; desfazer restaura), `agenda_pessoal` (reunião só gestor; desfazer remove) | em andamento |
| D · Controle | `tratadores/controle.ts` | `ia_do_cliente` (resumo é leitura; ligar/desligar com desfazer), `desfazer` (último comando confirmado em 24 h, ordem inversa, marca `desfeito_em`) | em andamento |
| E · Foto | `tratadores/foto.ts` + conversa/webhook/cerebro | `cadastrar_lead_da_foto` delegando a `ACOES_LEADS.cadastrar_lead`; imagem ao cérebro só com a onda ligada | em andamento |

## Onda 2 (próximas; abrir só depois de a onda 1 estar juntada e verde)

| Frente | Arquivo | Ferramentas |
|---|---|---|
| F · Imóveis | `tratadores/imoveis.ts` | `informacao_de_imovel`, `imoveis_para_o_lead`, `leads_para_o_imovel`, `simular_financiamento`, `atualizar_imovel` (gestor) |
| G · Relatórios | `tratadores/relatorios.ts` | `relatorio_do_corretor`, `meta_e_comissao`, `relatorio_da_equipe` (gestor), `resultado_do_mes` (gestor), `whatsapp_da_equipe` (gestor) |
| H · Financeiro e gestão | `tratadores/financeiro.ts` | `registrar_venda`, `lancar_no_caixa` (gestor), `informar_gasto_de_anuncio`, `redistribuir_leads` (gestor) |
| I · Documentos, lembretes e planilha | `tratadores/documentos.ts` | `documentos_do_lead`, `lembrete` (precisa de envio agendado pelo central), `importar_planilha` |

Cada frente nova: criar o arquivo com `CONSULTAS_X`/`ACOES_X` e ligá-lo em
`tratadores/index.ts` ANTES de lançar os agentes (como em `ec5c9dfc`), para
nenhum agente editar o índice. Os avisos espontâneos (4.7), a escolha de
horário no painel e o central em grupos da equipe (4.1) também são da onda 2,
mas mexem em cron, telas e webhook: ficam para a sessão principal, depois de
F a I.

A onda 3 (listas, imagens, o que vai ao cliente) só com o dono.
