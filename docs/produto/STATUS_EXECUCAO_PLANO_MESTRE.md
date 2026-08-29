# Acompanhamento da execução — Plano Mestre Next Home

**Atualizado em:** 29 de agosto de 2026  
**Fase ativa:** V1.1 — Fundação dos dados  
**Estado geral:** implementação local validada; homologação bloqueada por ausência de projeto/credenciais identificados

## Resumo da V1.1

| Entrega | Status | Evidência |
|---|---|---|
| Plano mestre versionado | Concluído | `docs/produto/Plano_Mestre_*.md` |
| Captura de UTMs e click IDs | Concluído localmente | Formulários, API de leads e testes de atribuição |
| Touchpoint inicial do lead | Concluído localmente | Migration `0064` e ficha do lead |
| Campanha canônica | Concluído localmente | Migration `0065`, integrada às métricas Meta existentes |
| Taxonomia e eventos idempotentes | Concluído localmente | `marketing_eventos`, chave estável e testes |
| Outbox transacional | Concluído localmente | Migrations `0065` e `0066` |
| Monitor de eventos | Concluído localmente | `/corretor/admin/eventos` |
| Consentimentos e preferências | Concluído localmente | Migrations `0067`/`0069`, visualização e opt-out por canal |
| SLA de primeira resposta | Concluído localmente | Migration `0068` e `/corretor/admin/sla` |
| Venda como entidade formal | Bloqueado por decisão | DEC-001 e DEC-002 |
| Auditoria sensível | Pendente | Depende do primeiro fluxo de venda |
| Baseline de origem/SLA | Pendente | Depende das migrations remotas e de dados reais |
| Runbook e smoke test de homologação | Concluído | `RUNBOOK_HOMOLOGACAO_V11.md` e `scripts/smoke_v11_fundacao.sql` |

## Migrations da iniciativa

| Migration | Finalidade | Aplicação remota |
|---|---|---|
| `0064_fundacao_atribuicao_marketing.sql` | UTMs, click IDs e touchpoints | Pendente |
| `0065_campanhas_eventos_outbox.sql` | Campanhas, eventos e outbox | Pendente |
| `0066_processador_outbox_interno.sql` | Consumidor interno concorrente | Pendente |
| `0067_consentimentos_preferencias.sql` | Histórico de consentimento e preferência por canal | Pendente |
| `0068_sla_primeira_resposta.sql` | SLA automático/humano e backfill conservador | Pendente |
| `0069_optout_por_canal.sql` | Alteração auditável de preferência por canal | Pendente |

## Decisões que bloqueiam o próximo eixo

- **DEC-001:** operação interna, SaaS ou interna agora/SaaS depois.
- **DEC-002:** fato operacional que confirma uma venda.
- Responsáveis por Product Owner, Tech Lead e usuários-piloto ainda não registrados.
- Aplicação das migrations e baseline exigem acesso/execução no Supabase remoto.
- Não há `supabase/config.toml`, project ref de homologação ou credenciais de gestão no ambiente local; o ref legado encontrado não foi tratado como homologação.

## Próxima ordem de execução

1. Configurar/identificar o projeto Supabase de homologação.
2. Aplicar migrations em homologação e executar o smoke test transacional.
3. Registrar baseline de origem desconhecida, eventos e SLA.
4. Resolver DEC-001 e DEC-002 antes de criar `vendas`.
5. Especificar a entidade `vendas` somente após as decisões.

## Verificações locais acumuladas

- TypeScript sem erros.
- ESLint sem erros nos arquivos alterados.
- Testes de marketing passando.
- Build compila e passa pelo TypeScript; coleta estática depende do Supabase acessível.
