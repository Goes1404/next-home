---
title: Eval de 28/09 e a v41 — o que 17 conversas mostraram sobre voz, contexto e coleta
aliases: [v41, taxonomia v40, next home vira home, vrita]
tags: [ia, prompt, medicao]
type: nota
status: growing
custou: alto
codigo:
  - src/lib/whatsapp/focoDaConversa.ts
  - src/lib/whatsapp/jogada.ts
  - src/lib/whatsapp/ehPergunta.ts
  - src/lib/whatsapp/vozHumana.ts
  - src/lib/whatsapp/repeticao.ts
  - src/lib/whatsapp/semValores.ts
  - src/lib/whatsapp/afirmacoesSemLastro.ts
  - src/lib/whatsapp/promessaDeRetorno.ts
  - src/lib/whatsapp/turnoDeAtendimento.ts
  - src/lib/whatsapp/guardrails.ts
  - src/app/api/webhooks/whatsapp/route.ts
  - scripts/traces/traceAldeia.ts
created: 2026-09-28
updated: 2026-09-29
fonte: pedido do usuário ("parecer humano, acertar o que o cliente quis dizer e coletar dados") + 16 personas simuladas + a conversa real do Matheus (9d731b8a)
summary: A abertura "da Next Home" travava o foco no "Breeze Home Clube"; a guarda anti-eco respondia 17% dos turnos com frase enlatada; a renda foi perguntada em 1 de 17 conversas; e a IA confirmava visita que ninguém aceitou. Dez categorias, corrigidas por código na v41.
---
# Eval de 28/09 e a v41

Taxonomia completa: `eval/resultados/taxonomia-2026.09-v40-2026-09-28.md`.
Trace da conversa real: `scripts/traces/traceAldeia.ts`.

## O que valeu a pena saber

- **O nome da imobiliária virava foco.** "Aqui é a Lia, da Next **Home**"
  cita o token distintivo de "Breeze **Home** Clube". A oferta solitária da
  IA ([[o-foco-precisava-da-oferta-solitaria]]) transformou a abertura em
  oferta, e o cliente que pediu a Aldeia recebeu o Breeze (Jardim Júlio)
  três vezes. As palavras de `site.nome` saíram do índice de
  [[foco-da-conversa]]; vale para qualquer instalação.
- **A guarda anti-eco era a maior fonte de voz robótica**: 27 frases
  enlatadas em 10 de 16 conversas simuladas, inclusive "quantos
  dormitórios?" a quem tinha dito "3 dorm" e "me conta um pouco mais" a quem
  pedia o endereço. Agora a saída olha a fala do cliente.
- **O campo estruturado mentia junto com o texto.** O modelo preencheu
  `confirmadaPeloCliente: true` e escreveu "visita confirmada terça 10h" sem
  aceite nenhum; no webhook isso grava a visita e avisa o corretor. Quem
  decide agora é o planner (`aceiteDeVisitaValido`).
- **Capacidade perguntada em 1 de 17 conversas.** Duas portas novas: pergunta
  de financiamento pede a renda; visita confirmada pede a renda uma vez,
  "pra levar a simulação". "Dá pra financiar?" deixou de contar como renda
  respondida.
- **"Confirmo com o corretor" não avisava o corretor** (7 conversas). Mesma
  lição de `pedidoDeLigacao.ts`: promessa em código, alerta `duvida_pendente`.
- **TPM de 200k no `gpt-4.1-mini`**: o prompt gasta ~10k tokens por
  resposta, então a conta inteira aguenta ~20 respostas por minuto, e o
  eval usa a MESMA chave do atendimento. 8 simulações em paralelo derrubaram
  9 conversas com 429. Simular com no máximo 3 em paralelo.
- Uma rodada é descrição, não veredito ([[score-so-compara-com-a-mesma-regua]]):
  a v41 foi verificada persona a persona, não por comparação de números.

Ligações: [[memoria-da-conversa-e-ficha-viva]] · [[foco-da-conversa]]
