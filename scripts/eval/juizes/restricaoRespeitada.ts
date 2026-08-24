/**
 * Juiz binário: a resposta RESPEITOU a restrição que o cliente acabou de dar?
 *
 * UM modo de falha, um juiz. Veio da análise de erro de 23/08/2026 sobre os
 * traces reais — não de uma lista imaginada de qualidades. É a categoria F3,
 * e a própria corretora a descreveu no chat, sem que ninguém pedisse:
 * "a conversa não está desenrolando para o pré entendimento do cliente".
 *
 * POR QUE JUIZ E NÃO CÓDIGO. A regra do skill é esgotar a checagem
 * determinística antes de gastar um modelo. Aqui ela não fecha: dá para
 * detectar em código que o cliente disse "menor" e que a resposta repetiu o
 * mesmo slug (e `repeticao.ts` já pega o caso extremo, o texto idêntico),
 * mas não dá para decidir se "o Terra Alta é de 1 dormitório" foi uma
 * RECUSA HONESTA ("não fecha com o que você precisa, o Viva tem 3") ou uma
 * ficha empurrada como se a restrição não existisse. A diferença entre as
 * duas é a conversa inteira, e é semântica.
 *
 * BINÁRIO, sem escala. A rubrica atual do eval dá 0-2 por eixo, e isso é o
 * que permitiu ao juiz "concordar" com o humano em 100% dos casos sem
 * distinguir nada: com tolerância de ±1 numa escala de três pontos, um juiz
 * que responda "1" para tudo acerta sempre.
 *
 * O QUE AINDA NÃO DÁ PARA FAZER COM ELE: confiar. A validação pede ~20
 * exemplos Pass e ~20 Fail rotulados à mão; o corpus tem 5 falhas desta
 * categoria em 80 mensagens do bot. Até `validate-evaluator` medir TPR/TNR
 * sobre uma amostra decente, este juiz é instrumento de diagnóstico, não
 * porteiro de release.
 */

/**
 * Os exemplos são o SPLIT DE TREINO: saíram da conversa …8216 de 22/08 e
 * NÃO podem entrar no conjunto usado para medir o juiz depois — few-shot
 * que também serve de gabarito infla o alinhamento e esconde a falha real.
 */
export const PROMPT_JUIZ_RESTRICAO = `Você avalia UMA coisa só: se a resposta da assistente imobiliária respeitou a restrição que o cliente declarou na última mensagem dele.

Não avalie tom, tamanho, simpatia, gramática ou se a resposta vendeu bem. Só a restrição.

## Definições

PASS — a resposta faz UMA destas coisas:
- atende à restrição (indica imóvel ou informação que cabe no que foi pedido);
- não atende, MAS diz claramente que não atende e oferece uma alternativa ou pergunta o que dá para flexibilizar;
- não tem a informação no catálogo e diz que vai confirmar, sem afirmar nada que contrarie a restrição;
- a última mensagem do cliente não trazia restrição nenhuma (nesse caso, PASS por vacuidade).

FAIL — a resposta faz QUALQUER destas coisas:
- reapresenta o mesmo imóvel que o cliente acabou de recusar, como se ele não tivesse dito nada;
- devolve a ficha de um imóvel que NÃO atende à restrição sem reconhecer que não atende;
- responde a uma pergunta ANTERIOR do cliente e ignora a restrição mais recente;
- muda de assunto para agendamento, foto ou apresentação sem tratar a restrição.

Uma restrição é qualquer limite que o cliente impôs: tamanho ("algo menor"), quantidade ("3 dormitórios"), região ("só em Barueri"), estágio ("pronto para morar"), teto de orçamento, prazo, ou a recusa explícita de uma opção já mostrada.

## Exemplos

### Exemplo 1: FAIL
Última mensagem do cliente: "Quero algo menor"
Contexto: a assistente tinha acabado de apresentar o Eternity Alphaville, de 100m².
Resposta: "O Eternity Alphaville tem 3 dormitórios com 2 suítes, 100m² e 2 vagas. Quer ver as fotos ou agendar uma visita?"
Crítica: O cliente pediu algo MENOR do que o que acabou de ver. A resposta devolve exatamente o mesmo imóvel, com a mesma metragem de 100m², sem uma palavra sobre a restrição. Do ponto de vista do cliente, é como se ele não tivesse escrito nada. Além disso, oferece foto e visita de um imóvel já recusado.
Resultado: Fail

### Exemplo 2: FAIL
Última mensagem do cliente: "Tem 3 dormitórios?"
Contexto: a conversa está no Terra Alta, que tem 1 dormitório.
Resposta: "O Terra Alta tem 1 dormitório, 52m² e 2 vagas. Quer ver as fotos ou agendar uma visita?"
Crítica: A informação está correta e vem do catálogo, mas a resposta não RECONHECE que o imóvel não atende ao que foi perguntado. O cliente pediu 3 dormitórios e recebeu a ficha de um imóvel de 1, seguida de um convite para visitar esse mesmo imóvel — como se a resposta fosse "sim". Faltou dizer que não fecha e oferecer uma alternativa.
Resultado: Fail

### Exemplo 3: PASS
Última mensagem do cliente: "Tem 3 dormitórios?"
Contexto: a conversa está no Terra Alta, que tem 1 dormitório.
Resposta: "O Terra Alta é de 1 dormitório só, não fecha com o que você precisa. --- O Viva Vila do Conde tem 3 com suíte, no Parque Viana. --- Quer ver?"
Crítica: A resposta encara a restrição de frente: diz que o imóvel em pauta não atende, com o dado do catálogo, e imediatamente oferece uma opção que atende. O cliente sai da mensagem sabendo exatamente onde está.
Resultado: Pass

### Exemplo 4: PASS (limítrofe)
Última mensagem do cliente: "Quero até 450 mil"
Resposta: "Anotei. --- O valor depende da unidade e das condições, que a gente conversa na visita. --- Nessa faixa, prefere Barueri ou Alphaville?"
Crítica: A assistente não pode falar valores por regra de negócio, então não confirma nem nega o teto — mas também não contraria a restrição nem empurra um imóvel qualquer. Reconhece o limite ("anotei", "nessa faixa") e avança o funil com uma pergunta pertinente. Não atender à letra da restrição aqui é a política da casa, não descuido: PASS.

### Exemplo 5: PASS (vacuidade)
Última mensagem do cliente: "Onde fica o Terra Alta?"
Resposta: "Fica no Jardim Tupanci, em Barueri. --- Quer conhecer no sábado de manhã?"
Crítica: A última mensagem do cliente é uma pergunta de informação, não uma restrição. Não há restrição a respeitar, e a resposta é pertinente à pergunta feita.
Resultado: Pass

## Saída

Responda EXCLUSIVAMENTE um JSON:
{"critique": "avaliação detalhada, citando o que na resposta atende ou contraria a restrição", "result": "Pass" ou "Fail"}

A crítica vem ANTES do veredito e precisa ser específica — cite o trecho da resposta que sustenta a decisão. Crítica genérica ("a resposta foi adequada") não serve.`;

export type VeredictoRestricao = { critique: string; result: "Pass" | "Fail" };

/**
 * Monta a entrada do juiz.
 *
 * Recebe só o que ele precisa decidir: as últimas trocas (para saber qual é
 * a restrição e a que ela se opõe) e a resposta avaliada. Mandar a conversa
 * inteira ou o catálogo completo aumentaria o custo e daria ao juiz espaço
 * para julgar outra coisa que não a restrição.
 */
export function montarEntradaJuizRestricao(params: {
  historico: { remetente: string; texto: string }[];
  mensagemCliente: string;
  resposta: string;
}): string {
  const contexto = params.historico
    .slice(-4)
    .map((m) => `${m.remetente === "cliente" ? "CLIENTE" : "ASSISTENTE"}: ${m.texto}`)
    .join("\n");

  return [
    contexto ? `TRECHO ANTERIOR DA CONVERSA:\n${contexto}` : "CONVERSA NOVA (sem trecho anterior).",
    `ÚLTIMA MENSAGEM DO CLIENTE: ${params.mensagemCliente}`,
    `RESPOSTA DA ASSISTENTE: ${params.resposta}`,
  ].join("\n\n");
}
