import type { Empreendimento, StatusObra } from "@/lib/types";

/**
 * As duas maneiras de comprar — chave na mão agora, ou pagar durante a obra.
 *
 * ## Por que este eixo existe
 *
 * É a PRIMEIRA pergunta que um comprador responde, antes de bairro e antes
 * de preço: "eu preciso morar já ou posso esperar?". As duas respostas levam
 * a pessoas diferentes, com dinheiro diferente na mão — quem compra pronto
 * precisa do valor inteiro agora; quem compra na planta paga em parcelas
 * durante a obra e entra com bem menos.
 *
 * A home só oferecia o eixo do LUGAR (as regiões). Quem chegava sabendo o
 * prazo, e não o bairro, não tinha por onde entrar.
 *
 * ## Dois grupos para seis estágios
 *
 * Só `pronto_para_morar` promete chave na mão. Todo o resto — pré, breve,
 * lançamento, em construção e **últimas unidades** — é obra por vir.
 *
 * `ultimas_unidades` é a que engana, e por isso está escrita aqui: ela
 * descreve o estágio da VENDA, não o da obra. No catálogo de hoje, o único
 * imóvel nesse estado tem entrega prevista para 2027 — ou seja, "últimas
 * unidades" e "pronto" são coisas diferentes, e agrupá-las prometeria chave
 * na mão para quem vai receber daqui a anos. O erro aqui é assimétrico:
 * chamar de "em obra" algo que já está pronto custa uma visita a mais;
 * chamar de "pronto" algo em obra quebra a conversa na frente do cliente.
 *
 * A mesma régua do selo de estágio (`statusCor.ts`): a interface nunca
 * afirma mais do que o cadastro diz.
 */
export type EstagioDeCompra = "pronto" | "obra";

export const ESTAGIOS: EstagioDeCompra[] = ["pronto", "obra"];

/** O rótulo curto — o do chip de filtro e o do select da listagem. */
export const ESTAGIO_LABEL: Record<EstagioDeCompra, string> = {
  pronto: "Pronto para morar",
  obra: "Na planta ou em obra",
};

export function ehEstagio(valor: string | undefined): valor is EstagioDeCompra {
  return valor === "pronto" || valor === "obra";
}

export function estagioDe(status: StatusObra): EstagioDeCompra {
  return status === "pronto_para_morar" ? "pronto" : "obra";
}

/** Quantos imóveis publicados há de cada lado. Zero é resposta legítima. */
export function contarPorEstagio(catalogo: Empreendimento[]): Record<EstagioDeCompra, number> {
  return catalogo.reduce(
    (conta, e) => {
      conta[estagioDe(e.status)] += 1;
      return conta;
    },
    { pronto: 0, obra: 0 },
  );
}
