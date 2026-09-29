import type { ParametrosCredito } from "./tipos";

/**
 * O seed da 0102, em código e sem dependência de servidor.
 *
 * Mora sozinho porque `parametros.ts` é `server-only` e usa `unstable_cache`,
 * que não existe fora do Next: o atendimento do WhatsApp no eval (tsx) e os
 * testes puros precisam do padrão sem arrastar o cache junto. Mesma pedra do
 * `limitesPdf.ts`: constante compartilhada mora sozinha.
 */
export const PARAMETROS_PADRAO: ParametrosCredito = {
  faixas: [
    { nome: "Faixa 1", rendaMax: 2850, subsidioMaximo: 55000, taxaAnual: 0.045 },
    { nome: "Faixa 2", rendaMax: 4700, subsidioMaximo: 29000, taxaAnual: 0.06 },
    { nome: "Faixa 3", rendaMax: 8000, subsidioMaximo: 0, taxaAnual: 0.0766 },
    { nome: "Faixa 4", rendaMax: 12000, subsidioMaximo: 0, taxaAnual: 0.1 },
  ],
  tetoFgtsImovel: 350000,
  taxaSbpeAnual: 0.1149,
  prazoMaximoMeses: 420,
  comprometimentoMaximo: 0.3,
  itbiPorCidade: { Barueri: 0.02, Osasco: 0.02, "Santana de Parnaiba": 0.02, "Sao Paulo": 0.03 },
  conferidoEm: "2026-09-09",
};
