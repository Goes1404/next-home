---
title: Fluxo de campanhas — da criação ao disparo espaçado
aliases: [disparo em massa]
tags: [campanhas, anti-ban, arquitetura]
type: nota
status: evergreen
custou: medio
codigo: [src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx, src/app/corretor/(painel)/campanhas/acoes.ts, src/lib/whatsapp/campaignQueue.ts, src/lib/whatsapp/campaignDispatcher.ts, src/app/api/cron/campanhas/route.ts]
created: 2026-09-05
updated: 2026-09-26
fonte: leitura do código + docs/MEMORIA.md
summary: Criação monta a fila com agendado_para; disparo é batido por pg_cron 1/min + botão + corrente; cada envio passa por trava de instância, cota/espaçamento no banco e variação por IA.
---
# Fluxo de campanhas

## Criação (`campaignQueue.ts` + assistente de 3 passos)

- Quem recebe → o que dizer → confirmar; título opcional (a action ainda exige
  título não-vazio — quem chamar `criarCampanha` de fora precisa mandar um).
- Em “Escolher um por um”, a carteira traz nome, telefone e etapa. Busca e
  filtro de etapa são combináveis; selecionar em lote atua só nos resultados
  visíveis e o resumo dos escolhidos é a revisão antes de avançar
  ([[selecao-manual-da-transmissao-e-a-ultima-revisao]]).
- Antes da prévia e novamente na criação, ficam fora leads com campanha
  entregue nos últimos 7 dias e leads já pendentes em outra lista do corretor
  ([[campanha-protege-quem-ja-foi-contatado]]).
- O início opcional vira o primeiro `agendado_para` da própria fila; não há
  tabela nem cron paralelo. Action valida futuro, fuso de Brasília e janela
  de segunda a sábado, 9h–20h59 ([[agendamento-comeca-na-propria-fila]]).
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

## O tique dos follow-ups (a cada 5 min) — ordem desde 26/09/2026

1. `varrerRespostasAtrasadas` — resposta a quem escreveu (antes da janela).
1b. `lerCaixasDoGmail(1, 4)` — e-mails de portal das caixas conectadas viram
   lead na carteira de quem conectou (0125; antes da janela, é entrada de
   lead, não contato).
2. `enviarResumosDoDia` — da hora escolhida pelo corretor (6h–11h, padrão
   8h) até 12h de SP; fim de semana só para quem pediu. Para o PRÓPRIO
   corretor (antes da janela). Traz o placar de ontem, as visitas sem
   retorno do cliente, imóvel novo que combina com a carteira e, às
   segundas, quem vale retomar.
3. `alertarLeadsSemContato` — lead de portal/anúncio sem mensagem nossa em
   30 min vira aviso ao corretor, uma vez (antes da janela, 0121).
4. `liberarReservasVencidas` — unidade com reserva vencida volta a
   disponível e o catálogo é revalidado (0121).
5. *(fora da janela 9h–20h59: para aqui)*
6. trava `followups` →
   `agendarLembretesDeVisita` → `agendarPosVisita` →
   `agendarPedidoDeIndicacao` (5 a 30 dias depois do fechamento, uma vez) →
   `abrirConversasDePortal` (2 por tique, com cota e espaçamento) →
   `avisarQuemPediuAlerta(1)` ("me avise quando surgir", só se o primeiro
   contato não gastou as duas vagas — cada um custa ~20s de IA) →
   `processarLembretesDeAnotacao` → follow-ups vencidos
   (`reengajamento`, `lembrete_visita`, `pos_visita`, `indicacao`).
   Reengajamento de lead que virou `fechado`/`perdido` é descartado ANTES
   da cota (a lista de compradores dispara para quem já comprou).

Público `compradores` (26/09): só quem fechou NO imóvel da campanha — a
única exceção à regra de que fechado não entra em campanha. Serve ao
avanço da obra e à entrega das chaves.

No disparador de campanhas, antes do primeiro item: `aplicarVencedoras`
(0121) decide o A/B quando o placar atinge a régua e reescreve os
pendentes da perdedora com o texto da vencedora. Ver
[[aprimoramentos-das-oito-funcionalidades]].

Tudo que fala com cliente por iniciativa nossa passa por
`reservarCotaCampanha` e olha `nao_contatar_em`. Ver
[[oito-funcionalidades-de-26-09]].

## Relacionadas
- [[fluxo-do-webhook-whatsapp]]
- [[aprimoramentos-das-oito-funcionalidades]]
- [[fechar-o-ciclo-e-ligar-a-plataforma]]
- [[a-conversa-fantasma-do-disparo-sem-ddi]]
- [[botoes-perigosos-atras-de-avancado]]
