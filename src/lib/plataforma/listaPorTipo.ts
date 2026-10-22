// A lista de grupos separada por tipo (imobiliárias e corretores independentes).
//
// Módulo PURO: a página lê `?tipo=` e usa estas funções; sem JS, o filtro é
// um link.

import type { TipoDeGrupo } from "./rotulosDoGrupo";

export type FiltroDeTipo = "todos" | TipoDeGrupo;

export const FILTROS_DE_TIPO: readonly { valor: FiltroDeTipo; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "imobiliaria", rotulo: "Imobiliárias" },
  { valor: "independente", rotulo: "Independentes" },
];

/** O `?tipo=` da URL (texto, lista ou ausente); valor desconhecido = todos. */
export function lerFiltroDeTipo(valor: string | string[] | undefined): FiltroDeTipo {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "imobiliaria" || v === "independente" ? v : "todos";
}

export function hrefDoFiltro(filtro: FiltroDeTipo): string {
  return filtro === "todos" ? "/plataforma" : `/plataforma?tipo=${filtro}`;
}

/** Separa por tipo, mantendo a ordem de entrada. */
export function separarPorTipo<T extends { tipo: TipoDeGrupo }>(grupos: readonly T[]) {
  return {
    imobiliarias: grupos.filter((g) => g.tipo === "imobiliaria"),
    independentes: grupos.filter((g) => g.tipo === "independente"),
  };
}
