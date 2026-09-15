---
title: A base de produção foi zerada em 12/09/2026 — e o catálogo ficou
aliases: [limpeza total, base zerada, wipe de 12/09]
tags: [banco, crm, medicao]
type: nota
status: evergreen
custou: medio
codigo:
  - supabase/migrations/0111_conversa_exige_lead.sql
  - scripts/observatorio.ts
created: 2026-09-13
updated: 2026-09-13
summary: Em 12/09 17h28 UTC o dono da conta apagou leads, conversas, mensagens e linha do tempo — 131 leads, 110 conversas, 8.125 mensagens — antes do teste com os corretores. O catálogo ficou inteiro. Toda linha de base de atendimento anterior a essa data deixou de ser verificável.
fonte: admin_eventos (leads_redistribuidos, 2026-09-12 17:28:04 UTC) + pg_stat_user_tables
---
# A base de produção foi zerada em 12/09/2026

Descoberto em 13/09 ao rodar `npm run observatorio` para a medição final da
0110: ele devolveu **0 conversas mensuráveis**. Não era defeito do script.

## O que aconteceu

`admin_eventos` guarda o registro, e ele é explícito:

```json
{
  "acao": "leads_redistribuidos",
  "created_at": "2026-09-12 17:28:04+00",
  "detalhes": {
    "leads": 131, "conversas": 110, "mensagens": 8125,
    "operacao": "limpeza total antes do teste com corretores",
    "origem": "operacao manual fora do painel",
    "autorizado_por": "dono da conta, sem exportacao previa"
  }
}
```

**Foi deliberado e autorizado.** Não é incidente, e não há o que restaurar por
decisão de quem apagou — a nota registra o FATO porque ele muda o que é
mensurável daqui para trás.

## O que morreu e o que ficou

Medido em `pg_stat_user_tables` (`n_live_tup` / `n_tup_del`):

| tabela | vivas | apagadas |
|---|---|---|
| `leads` | 0 | 268 |
| `whatsapp_conversas` | 0 | 310 |
| `whatsapp_mensagens` | 0 | 16.329 |
| `lead_interacoes` | 0 | 265 |
| `whatsapp_followups` | 0 | — |
| `empreendimentos` | **26** | 7 |
| `midias` | **339** | 255 |
| `ia_interacoes` | **5.461** | 12 |
| `whatsapp_campanhas_fila` | **113** | 212 |

O catálogo inteiro sobreviveu — empreendimentos, mídias, lazer, candidatos.

## O cascade da 0111 fez o resto, e fez certo

A 0111 tornou `whatsapp_conversas.lead_id` obrigatório e trocou a FK para
`on delete cascade`. Foi ela que levou conversa, mensagem, follow-up e linha do
tempo junto com o lead. Conferido depois: **zero órfãos** —
`whatsapp_campanhas_fila` não tem uma linha apontando para lead inexistente, e
`ia_interacoes` não tem uma apontando para conversa inexistente. A fila também
não tem nada `pendente` (104 enviados, 8 erro, 1 respondido), então não há
disparo pendurado para um cadastro que não existe mais.

`ia_interacoes` sobreviveu porque não é filha do lead: virou telemetria órfã,
útil para contar modelo e latência, inútil para reconstituir conversa.

## O que isso custa a quem vier depois

- **`npm run observatorio` devolve zero, e isso é o dado certo.** Antes de
  procurar defeito no script, conferir `select count(*) from
  whatsapp_mensagens`.
- **Toda linha de base de atendimento anterior a 12/09 deixou de ser
  verificável**: 21% de cobertura, mediana de 9s, 2.431 falas em branco, 16
  dossiês para 131 leads, 0 nome / 0 renda / 1 orçamento em 55. Os números
  continuam válidos como HISTÓRIA (estão na MEMORIA e nas notas), e não como
  algo que se possa reconferir.
- **A próxima medição começa do zero**, com o atendimento dos corretores de
  verdade. É a primeira vez que este projeto mede uma safra limpa: nada de
  conversa pessoal do corretor no meio, nada de lead nascido de webhook.

## Relacionadas
- [[memoria-da-conversa-e-ficha-viva]]
- [[MOC — Banco de Dados]]
- [[MOC — Evals e Medição]]
