/**
 * O corretor ensinando a IA (26/09/2026). O 👎 marcava o erro e parava ali;
 * o que o corretor responderia NO LUGAR — a informação mais valiosa — não
 * tinha onde ficar. Agora fica em `ia_correcoes` e volta ao prompt das
 * conversas seguintes do MESMO corretor, escolhida por assunto.
 *
 * Parte pura: escolher e formatar. A leitura do banco mora em
 * `buscarExemplosFewShot`, junto com o resto do few-shot.
 */

export type Correcao = { falaCliente: string; respostaIa: string | null; respostaCerta: string };

/** Quantas entram por resposta. Mais que isso dilui o assunto do prompt. */
export const TETO_CORRECOES = 3;

const VAZIAS = new Set(["que", "para", "com", "uma", "voce", "vocês", "voces", "tem", "ter", "sim", "nao", "isso", "esse", "essa", "como", "qual", "mais", "pode", "gostaria", "queria", "obrigado", "obrigada", "tudo", "bem"]);

function termos(texto: string): Set<string> {
  return new Set(
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !VAZIAS.has(t)),
  );
}

/**
 * As correções mais parecidas com o que o cliente disse agora; empate vai
 * para a mais recente (a lista chega da mais nova para a mais velha). Sem
 * nenhum termo em comum, ainda entram as duas mais recentes: elas ensinam o
 * JEITO do corretor, que vale para qualquer assunto.
 */
export function escolherCorrecoes(correcoes: Correcao[], mensagemAtual: string): Correcao[] {
  const atual = termos(mensagemAtual);
  const pontuadas = correcoes.map((c, i) => {
    const t = termos(c.falaCliente);
    let comum = 0;
    for (const x of t) if (atual.has(x)) comum++;
    return { c, comum, i };
  });
  const relevantes = pontuadas.filter((p) => p.comum > 0).sort((a, b) => b.comum - a.comum || a.i - b.i);
  if (relevantes.length > 0) return relevantes.slice(0, TETO_CORRECOES).map((p) => p.c);
  return correcoes.slice(0, 2);
}

const corte = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function formatarCorrecoes(correcoes: Correcao[]): string {
  if (correcoes.length === 0) return "";
  const blocos = correcoes.map((c, i) =>
    [
      `Correção ${i + 1}:`,
      `Cliente: ${corte(c.falaCliente, 300)}`,
      c.respostaIa ? `Resposta que o corretor REPROVOU: ${corte(c.respostaIa, 300)}` : null,
      `Como o corretor responderia: ${corte(c.respostaCerta, 500)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return `CORREÇÕES FEITAS PELO SEU CORRETOR (siga o jeito dele em situações parecidas; nunca repita a resposta reprovada):\n${blocos.join("\n\n")}`;
}
