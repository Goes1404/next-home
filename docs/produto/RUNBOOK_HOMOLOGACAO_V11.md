# Runbook de homologação — V1.1 Fundação dos dados

## Pré-condições

- Projeto Supabase separado de produção e identificado como homologação.
- Backup ou ponto de restauração confirmado.
- Acesso via Supabase CLI ou SQL Editor com papel administrativo.
- Mesma versão principal de Postgres do ambiente operacional.

## Aplicação

Aplicar, nesta ordem:

1. `0064_fundacao_atribuicao_marketing.sql`
2. `0065_campanhas_eventos_outbox.sql`
3. `0066_processador_outbox_interno.sql`
4. `0067_consentimentos_preferencias.sql`
5. `0068_sla_primeira_resposta.sql`
6. `0069_optout_por_canal.sql`

Não selecionar somente algumas migrations: `0065` depende das colunas de `0064`, e as telas foram tipadas para o conjunto completo.

## Smoke test

Executar `scripts/smoke_v11_fundacao.sql`. O resultado final deve ser:

```text
SMOKE_V11_OK
```

O teste roda dentro de uma transação e termina com `ROLLBACK`. Qualquer requisito ausente gera uma exceção identificando a migration responsável.

## Verificação pela aplicação

1. Abrir um formulário público com UTMs e enviar um lead de teste autorizado.
2. Confirmar “Origem e jornada” e “Contato autorizado” na ficha.
3. Abrir Administração → Eventos e confirmar `lead.criado` entregue.
4. Gerar uma resposta da Sofia e uma resposta humana no WhatsApp.
5. Abrir Administração → SLA e confirmar as duas medições.
6. Transferir o lead entre corretores e confirmar que a origem permaneceu inalterada.
7. Bloquear e reativar um canal na ficha; confirmar preferência atual e dois eventos históricos.

## Rollback

Antes do piloto, o rollback preferencial é restaurar o snapshot de homologação. Não apagar eventos ou consentimentos individualmente para “voltar”, pois são históricos append-only.

Em produção, a liberação deve ser aditiva: ocultar as novas telas/rotas se necessário, interromper o cron da outbox e corrigir por migration subsequente. Não reverter destrutivamente migrations que já receberam dados reais.
