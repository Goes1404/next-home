# CRM pelo WhatsApp — frentes em paralelo (painel de retomada)

Pedido do dono (30/10/2026): adiantar a construção com agentes em frentes
paralelas e, se os créditos da sessão acabarem, retomar sozinho quando
voltarem. Este arquivo é a fonte da retomada: a tarefa agendada lê daqui o
que falta. **Atualize a coluna Estado a cada frente juntada.**

Desenho: `docs/superpowers/specs/2026-10-30-crm-pelo-whatsapp-design.md`.
Migration do central renumerada para **0249** (a 0248 de `main` é a IA no
atendimento, de outra sessão). Base de todas as frentes: commit `ec5c9dfc` (contrato `preparar` → "sim" →
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
| A · Consultas | `tratadores/consultas.ts` | `consultar_lead`, `quem_ligar_hoje` (reaproveitar `getFilaDeTrabalho`/`montarResumoDoDia` sem sessão) | juntada (30/10) |
| B · Leads | `tratadores/leads.ts` | `cadastrar_lead` (telefone inteiro; regra de lead de outro corretor; desfazer arquiva), `atualizar_lead` (desfazer restaura) | juntada (30/10) |
| C · Agenda | `tratadores/agenda.ts` | `visita` (marcar/remarcar/cancelar; datas da agenda por WhatsApp; desfazer restaura), `agenda_pessoal` (reunião só gestor; desfazer remove) | juntada (30/10) |
| D · Controle | `tratadores/controle.ts` | `ia_do_cliente` (resumo é leitura; ligar/desligar com desfazer), `desfazer` (último comando confirmado em 24 h, ordem inversa, marca `desfeito_em`) | juntada (30/10) |
| E · Foto | `tratadores/foto.ts` + conversa/webhook/cerebro | `cadastrar_lead_da_foto` delegando a `ACOES_LEADS.cadastrar_lead`; imagem ao cérebro só com a onda ligada | juntada (30/10) |

## Onda 2 (próximas; a onda 1 está juntada e verde desde 30/10: pode abrir)

| Frente | Arquivo | Ferramentas | Estado |
|---|---|---|---|
| F · Imóveis | `tratadores/imoveis.ts` | `informacao_de_imovel`, `imoveis_para_o_lead`, `leads_para_o_imovel`, `simular_financiamento`, `atualizar_imovel` (gestor) | juntada (30/10) |
| G · Relatórios | `tratadores/relatorios.ts` | `relatorio_do_corretor`, `meta_e_comissao`, `relatorio_da_equipe` (gestor), `resultado_do_mes` (gestor), `whatsapp_da_equipe` (gestor) | em andamento (30/10) |
| H · Financeiro e gestão | `tratadores/financeiro.ts` | `registrar_venda`, `lancar_no_caixa` (gestor), `informar_gasto_de_anuncio`, `redistribuir_leads` (gestor) | em andamento (30/10) |
| I · Documentos, lembretes e planilha | `tratadores/documentos.ts` | `documentos_do_lead`, `lembrete` (precisa de envio agendado pelo central), `importar_planilha` | em andamento (30/10) |

Cada frente nova: criar o arquivo com `CONSULTAS_X`/`ACOES_X` e ligá-lo em
`tratadores/index.ts` ANTES de lançar os agentes (como em `ec5c9dfc`), para
nenhum agente editar o índice. Os avisos espontâneos (4.7), a escolha de
horário no painel e o central em grupos da equipe (4.1) também são da onda 2,
mas mexem em cron, telas e webhook: ficam para a sessão principal, depois de
F a I.

## Fases seguintes, em sequência automática (pedido do dono, 30/10/2026)

O dono pediu que cada fase comece sozinha quando a anterior estiver juntada e
verde. Continua valendo: nada liga `ONDA_ATUAL`, nada vai para produção sem o
dono; tudo fica pronto e desligado.

### Fase 2b (depois de F a I juntadas)

| Frente | Onde | O quê | Estado |
|---|---|---|---|
| J · Avisos espontâneos | cron + `src/lib/central/` + tela do perfil | Resumo do dia, lead novo, visita na próxima hora e lembrete (gravado pela Frente I) saindo pelo central (4.7), com o horário do resumo e a antecedência do aviso escolhidos por pessoa no painel (padrão 8h e 1 h). Migration provável (preferências): criar com o próximo número livre e NÃO aplicar (o dono roda no SQL Editor). Respeita `central_whatsapp_ativo` e a cota. | a fazer |
| K · Central em grupos da equipe | `webhook.ts`/`conversa.ts` do central | Grupo só da equipe (4.1): responde quando mencionado; dado de lead vai no privado de quem pediu; grupo com cliente é ignorado. | a fazer |

J e K mexem em `conversa.ts`/`webhook.ts`: lançar J primeiro e K depois de J
juntada, ou dividir os arquivos antes de lançar as duas juntas.

### Onda 3 (depois da fase 2b juntada)

| Frente | Arquivo | Ferramentas | Estado |
|---|---|---|---|
| L · Listas | `tratadores/listas.ts` | `montar_lista` (quantos, quantos nunca falaram, quantos cabem hoje no primeiro contato; sai do número de quem pediu; fila de hoje), `acompanhar_lista` (ver, pausar, retomar) | a fazer |
| M · Arte e vídeo | `tratadores/estudio.ts` | `gerar_arte` (Estúdio), `criar_video` (criador de vídeo); devolver como arquivo exige envio de mídia pelo central | a fazer |
| N · O que vai ao cliente | `tratadores/cliente.ts` | `mandar_material`, `selecao_ou_proposta`, `meu_link_e_mensagens` (sai do número do corretor, com as travas anti-bloqueio de hoje) | a fazer |
| O · Saúde do número | `tratadores/saude.ts` | `saude_do_numero` (conexão e limite atual; níveis 10→15→20 ainda não existem) | a fazer |

Como na onda 1 e 2: criar os arquivos vazios e ligá-los em `tratadores/index.ts`
antes de lançar os agentes. A onda 3 mexe em envio ao cliente e no risco de
bloqueio: as travas de primeiro contato e de cota de hoje valem integralmente.

Ao fim da onda 3: avisar o dono com o resumo de tudo e o que falta para ligar
(0249 aplicada, chip conectado, eval com chave real, `ONDA_ATUAL`).
