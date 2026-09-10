import { STATUS_LABEL, TIPO_LABEL, type StatusObra, type TipoImovel } from "@/lib/types";

/**
 * O pedido de imagem montado a partir do CADASTRO do imóvel.
 *
 * Módulo PURO, sem `server-only`: o formulário é `"use client"` e mostra o
 * pedido montado antes de gastar a geração — e a mesma função roda na rota,
 * que é quem de fato manda para o modelo. Duas montagens do mesmo pedido
 * divergiriam, e o corretor aprovaria um texto e pagaria por outro. É a mesma
 * pedra de `pessoasTipos.ts` e `limitesPdf.ts`.
 *
 * ## O que ele junta, e por quê
 *
 * O corretor escreve o ASSUNTO ("fachada ao entardecer, vista da rua"). O
 * cadastro dá o CONTEXTO que ele não deveria ter de redigitar: o tipo, o
 * estágio da obra, o bairro e a cidade. Sem esse contexto o modelo desenha um
 * prédio genérico — e "apartamento em construção em Alphaville" não se parece
 * com "casa pronta em Itu".
 *
 * ## Rótulo humano, nunca o enum
 *
 * `em_construcao` no prompt já fez o modelo afirmar que o imóvel estava
 * "pronto para morar" (MEMORIA, agosto/2026). O que entra é `STATUS_LABEL` e
 * `TIPO_LABEL` — as mesmas palavras que a tela mostra.
 *
 * ## As ressalvas vão por CÓDIGO, no fim
 *
 * "Perspectiva ilustrativa" e "sem pessoas com rosto reconhecível" são as
 * mesmas restrições que `restricoesDuras` aplica no estúdio, e pela mesma
 * razão: instrução de prompt escrita à mão some no dia em que alguém edita o
 * texto: função determinística vale sempre. Elas vêm no FIM porque o que vem
 * por último num prompt de imagem é lido como ajuste, e não como tema — a
 * mesma ordem que `montarPedido` já usa.
 *
 * Imóvel que ainda não foi entregue não pode gerar peça que pareça foto do
 * pronto: quem visita confere.
 */

export type CadastroParaImagem = {
  /** O que o corretor escreveu, com as palavras dele. */
  pedido: string;
  nome: string;
  bairro: string;
  cidade: string;
  construtora?: string;
  status: StatusObra;
  tipo: TipoImovel;
};

/** Estágios em que a obra ainda NÃO existe para ser fotografada. */
const NAO_ENTREGUE: StatusObra[] = [
  "breve_lancamento",
  "pre_lancamento",
  "lancamento",
  "em_construcao",
];

export function ehIlustrativo(status: StatusObra): boolean {
  return NAO_ENTREGUE.includes(status);
}

/**
 * O texto que vai ao modelo. Devolve `""` quando o corretor não escreveu
 * nada — sem assunto não há o que gerar, e montar contexto em volta do vazio
 * produziria uma foto de catálogo aleatória.
 */
export function pedidoDeImagemDoCadastro(c: CadastroParaImagem): string {
  const pedido = c.pedido.trim();
  if (!pedido) return "";

  const lugar = [c.bairro.trim(), c.cidade.trim()].filter(Boolean).join(", ");
  const contexto = [
    `${TIPO_LABEL[c.tipo]} chamado "${c.nome.trim()}"`,
    lugar && `em ${lugar}`,
    `no estágio "${STATUS_LABEL[c.status]}"`,
    c.construtora?.trim() && `da construtora ${c.construtora.trim()}`,
  ]
    .filter(Boolean)
    .join(" ");

  const ressalvas = [
    ehIlustrativo(c.status) && "Perspectiva ilustrativa de obra não entregue.",
    "Sem pessoas com rosto reconhecível.",
    "Sem texto, logotipo ou marca d'água na imagem.",
  ].filter(Boolean);

  return `${pedido}. Contexto do imóvel: ${contexto}. ${ressalvas.join(" ")}`;
}
