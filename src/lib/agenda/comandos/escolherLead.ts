import { normalizar } from "./normalizar";

export type Candidato = { id: string; nome: string };

export type EscolhaDoLead<T extends Candidato = Candidato> =
  | { tipo: "um"; lead: T }
  | { tipo: "varios"; opcoes: T[] }
  | { tipo: "nenhum" };

/** Mais que isso não cabe numa pergunta de WhatsApp: o corretor que escreva o sobrenome. */
const MAXIMO_DE_OPCOES = 4;

function palavras(nome: string): string[] {
  const n = normalizar(nome);
  return n ? n.split(" ") : [];
}

const porNome = (a: Candidato, b: Candidato) => a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });

/**
 * Acha, entre os leads do corretor, quem ele quis dizer com o nome que
 * escreveu ("Ana", "ana souza", "joão p").
 *
 * O nome completo exato ganha: "Ana Souza" não pergunta entre Ana Souza e
 * Ana Maria Souza. Senão, cada palavra do que ele escreveu tem de ser o
 * COMEÇO de alguma palavra do nome ("an sou" acha Ana Souza; "ouza" não
 * acha nada), em qualquer ordem. Acento e maiúscula não contam.
 */
export function escolherLeadsPorNome<T extends Candidato>(nome: string, candidatos: T[]): EscolhaDoLead<T> {
  const procurado = palavras(nome);
  if (!procurado.length) return { tipo: "nenhum" };

  const completo = procurado.join(" ");
  const exatos = candidatos.filter((c) => normalizar(c.nome) === completo);
  const achados = exatos.length
    ? exatos
    : candidatos.filter((c) => {
        const doCandidato = palavras(c.nome);
        return procurado.every((p) => doCandidato.some((d) => d.startsWith(p)));
      });

  if (!achados.length) return { tipo: "nenhum" };
  if (achados.length === 1) return { tipo: "um", lead: achados[0] };
  return { tipo: "varios", opcoes: [...achados].sort(porNome).slice(0, MAXIMO_DE_OPCOES) };
}
