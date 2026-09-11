---
title: Fluxo de campanhas — da criação ao disparo espaçado
aliases: [disparo em massa]
tags: [campanhas, anti-ban, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/lib/whatsapp/campaignQueue.ts, src/lib/whatsapp/campaignDispatcher.ts, src/app/api/cron/campanhas/route.ts]
created: 2026-09-05
updated: 2026-09-05
fonte: leitura do código + docs/MEMORIA.md
summary: Criação monta a fila com agendado_para; disparo é batido por pg_cron 1/min + botão + corrente; cada envio passa por trava de instância, cota/espaçamento no banco e variação por IA.
---
# Fluxo de campanhas

## Criação (`campaignQueue.ts` + assistente de 3 passos)

- Quem recebe → o que dizer → confirmar; título opcional (a action ainda exige
  título não-vazio — quem chamar `criarCampanha` de fora precisa mandar um).
- Fila gravada com `agendado_para` espaçado (35-75s) e guarda de
  monotonicidade ([[e2e-contra-producao|flake didático]]).
- **Sem chamada de IA na criação** — a variação anti-ban acontece no ENVIO
  (`variarMensagemComIA`), um item por vez ([[fila-parada-tres-causas]]).

## Disparo (`campaignDispatcher.ts`)

Batido por: pg_cron 1/min ([[pg-cron-e-o-relogio-de-verdade]]) · botão
"Processar fila agora" · corrente de auto-encadeamento (até 60 elos) · cron
diário da Vercel.

Cada envio passa por:

1. `travar_disparo` por instância ([[travar-disparo-e-por-instancia]]);
2. `conectado_em` + sincronização ativa ([[fila-parada-tres-causas]]);
3. janela 9h-20h59, exceto `ignorar_janela`
   ([[quatro-protecoes-anti-ban-defendem-coisas-diferentes]]);
4. cota + espaçamento no MESMO update atômico
   ([[espacamento-anti-ban-so-existia-no-papel]]);
5. telefone normalizado no provedor ([[envio-mandava-telefone-sem-ddi]])
   **e também ao abrir a conversa** — com o telefone cru ela nascia sem
   lead, em paralelo à orgânica ([[a-conversa-fantasma-do-disparo-sem-ddi]]);
6. destinatário inexistente = erro definitivo + cota devolvida
   ([[numero-sem-whatsapp-nao-e-falha-nossa]]);
7. gravação na conversa + avanço de etapa
   ([[campanha-tambem-mexe-no-funil]]) + tentativa de contato
   ([[tentativas-de-contato-sao-duas-contagens]]).

Follow-ups seguem o mesmo funil de cota ([[followups-consomem-cota]]).

## Relacionadas
- [[fluxo-do-webhook-whatsapp]]
- [[a-conversa-fantasma-do-disparo-sem-ddi]]
- [[botoes-perigosos-atras-de-avancado]]
