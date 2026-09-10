import type { Tipologia } from "@/lib/types";

/**
 * A linha de ficha que faltava no cartão do catálogo: "2 e 3 dorm · 55–78 m²".
 *
 * ## Por que ela importa mais que qualquer enfeite
 *
 * O cartão mostrava nome, bairro e preço. Só que ninguém escolhe imóvel por
 * nome: escolhe por quantos quartos cabem na família e por quanto espaço tem
 * — e para descobrir isso era preciso ABRIR cada ficha e voltar. Numa
 * listagem de 25, isso são 25 idas e voltas para montar de cabeça uma
 * comparação que a grade poderia dar de graça.
 *
 * O dado já vem na consulta da listagem (`tipologias(*)` em `queries.ts`),
 * então isto não custa uma requisição a mais — só deixou de ser mostrado.
 *
 * ## As decisões de formato
 *
 * - **Dormitórios são um CONJUNTO, não uma faixa.** Um imóvel com plantas de
 *   2 e 4 dormitórios não tem "3" — escrever "2 a 4 dorm" prometeria uma
 *   planta que não existe. Dois valores viram "2 e 4"; três ou mais viram
 *   faixa com reticências ("2 a 5"), porque aí a lista fica longa demais
 *   para um cartão e a faixa deixa de mentir sobre um caso específico.
 * - **Área é uma FAIXA**, porque metragem é contínua e ninguém lê "55, 62 e
 *   78 m²" num cartão. Valores iguais colapsam num número só.
 * - **Ausência é silêncio.** Sem tipologia cadastrada, ou sem área em
 *   nenhuma delas, a metade correspondente simplesmente não aparece — a
 *   régua da casa: o que não está no cadastro, a interface não inventa.
 */
export function resumoTipologias(tipologias: Tipologia[]): string | null {
  if (tipologias.length === 0) return null;

  const partes = [dormitorios(tipologias), area(tipologias)].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

function dormitorios(tipologias: Tipologia[]): string | null {
  const valores = [...new Set(tipologias.map((t) => t.dormitorios).filter((d) => d > 0))].sort(
    (a, b) => a - b,
  );
  if (valores.length === 0) return null;

  const rotulo = valores.at(-1)! > 1 ? "dorms" : "dorm";
  if (valores.length === 1) return `${valores[0]} ${rotulo}`;
  if (valores.length === 2) return `${valores[0]} e ${valores[1]} ${rotulo}`;
  return `${valores[0]} a ${valores.at(-1)} ${rotulo}`;
}

function area(tipologias: Tipologia[]): string | null {
  const valores = tipologias
    .map((t) => t.areaPrivativa)
    .filter((a): a is number => typeof a === "number" && a > 0)
    .sort((a, b) => a - b);
  if (valores.length === 0) return null;

  const menor = Math.round(valores[0]);
  const maior = Math.round(valores.at(-1)!);
  // O travessão (–), não o hífen: é o sinal de intervalo, e a diferença
  // aparece no cartão do lado de números.
  return menor === maior ? `${menor} m²` : `${menor}–${maior} m²`;
}
