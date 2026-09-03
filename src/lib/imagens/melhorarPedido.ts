import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { receitaPor, type Receita } from "./receitas";

/**
 * Escreve o pedido de imagem no lugar do corretor — o degrau de cima da
 * receita.
 *
 * A receita já resolve a espinha técnica por código. O que ela NÃO resolve é o
 * assunto pobre: "sala moderna" continua sendo três palavras, e três palavras
 * mandam o modelo escolher sozinho o sofá, a hora do dia, a paleta e a
 * varanda. O que este módulo faz é a parte que exige linguagem — transformar
 * "sala moderna" em uma cena decidida.
 *
 * Roda no MESMO motor de texto do atendimento (`llm.ts` → `gpt-4.1-mini`), que
 * é barato e rápido perto de uma geração de imagem: alguns centavos de milhar
 * contra dezenas de centavos, e ~2s contra 15 a 37s. É o degrau mais barato
 * que existe aqui.
 *
 * **Falha é degradação, nunca bloqueio.** Sem motor, com timeout ou com JSON
 * torto, o pedido original segue para a geração exatamente como o corretor
 * escreveu — a receita ainda vale, porque ela é código. Falhar fechado aqui
 * seria trocar uma imagem pior por imagem nenhuma.
 */

/** Teto curto de propósito: isto acontece com a pessoa olhando para a tela. */
const ORCAMENTO_MS = 12_000;

export type PedidoMelhorado = {
  texto: string;
  /** `false` quando o motor não respondeu e o texto voltou como veio. */
  melhorado: boolean;
};

/**
 * O que a IA pode e o que ela não pode inventar.
 *
 * As proibições de FATO (metragem, andar, nome, preço) não são estética: o
 * texto daqui vira imagem, e imagem com número vira promessa na frente do
 * cliente. A cláusula anti-letreiro do `gerarImagem.ts` corta a escrita NA
 * ARTE; esta corta o fato inventado antes disso — dupla defesa, como já se faz
 * com prazo de entrega e acabamento.
 */
function montarPromptDoMotor(pedido: string, receita: Receita): string {
  return `Você reescreve pedidos de imagem para uma imobiliária. Recebe a frase
curta de um corretor e devolve UMA descrição visual completa, em português.

O corretor escreveu: "${pedido}"

Trabalho escolhido: ${receita.rotulo} — ${receita.ajuda}

Como reescrever:
- Descreva a CENA: o que aparece, de que ângulo, com que luz, em que hora do dia,
  com que materiais e cores. Concreto, não adjetivo solto.
- Mantenha o assunto que o corretor pediu. Você detalha o que ele disse; não
  troca de assunto nem acrescenta cômodo que ele não pediu.
- Um parágrafo corrido, entre 200 e 400 caracteres. Sem lista, sem título.

O que NUNCA entra:
- Metragem, número de dormitórios, andar, preço ou condição de pagamento. Você
  não sabe esses dados e imagem com número vira promessa ao cliente.
- Nome de empreendimento, de construtora ou de bairro.
- Qualquer texto, placa, letreiro ou logotipo dentro da cena.
- Pessoas com rosto reconhecível.

Responda apenas com JSON: {"pedido": "a descrição reescrita"}`;
}

export async function melhorarPedido(
  pedidoDoCorretor: string,
  chaveDaReceita: string,
): Promise<PedidoMelhorado> {
  const original = pedidoDoCorretor.trim();
  if (!original) return { texto: original, melhorado: false };

  const receita = receitaPor(chaveDaReceita);
  const r = await chamarLlmJson(montarPromptDoMotor(original, receita), {
    temperature: 0.7,
    orcamentoMs: ORCAMENTO_MS,
  });

  if (!r.ok) return { texto: original, melhorado: false };

  const texto = textoDoJson(r.json);
  return texto ? { texto, melhorado: true } : { texto: original, melhorado: false };
}

/**
 * Tira o texto do JSON e RECUSA o que não presta.
 *
 * Um modelo que devolve `{"pedido": null}`, uma string vazia ou duas palavras
 * não melhorou nada — e substituir o que o corretor escreveu por isso seria
 * pior que não ter tentado. O piso de 40 caracteres existe para isso: abaixo
 * dele não há descrição de cena nenhuma.
 *
 * O teto de 1200 corta o modelo que resolveu escrever um ensaio: prompt de
 * imagem gigante dilui o assunto, que é justamente o que viemos consertar.
 */
function textoDoJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const bruto = (json as { pedido?: unknown }).pedido;
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim().replace(/\s+/g, " ");
  if (texto.length < 40) return null;
  return texto.slice(0, 1200);
}
