/**
 * As respostas que o corretor marcou 👍 viram exemplo para a IA (29/09/2026).
 *
 * Até aqui o 👍 não servia para nada: ficava gravado em
 * `ia_interacoes.avaliacao` e nenhuma parte do sistema lia. Agora a resposta
 * aprovada volta ao prompt das conversas seguintes do MESMO corretor, junto
 * da fala do cliente que ela respondeu, escolhida por assunto — o mesmo
 * mecanismo das correções (`correcoesDoCorretor.ts`), com o sinal oposto.
 *
 * Parte pura: extrair, escolher e formatar. A leitura do banco mora em
 * `aprendizadoContinuo.ts`.
 */
import { termosDaFala } from "./correcoesDoCorretor";

export type RespostaAprovada = { falaCliente: string; resposta: string };

/** Quantas entram por resposta. Mais que isso dilui o assunto do prompt. */
export const TETO_APROVADAS = 2;

type Mensagem = { remetente: string; texto: string; interacaoId: string | null };

/**
 * Os pares (fala do cliente, resposta aprovada) de uma conversa, em ordem.
 *
 * Uma resposta da IA sai em vários balões com o MESMO `interacao_id`: eles
 * são juntados. A fala do cliente é a última dele antes da resposta; sem
 * ela, o par não ensina nada e fica de fora.
 */
export function extrairAprovadas(
  mensagens: readonly Mensagem[],
  aprovadas: ReadonlySet<string>,
): RespostaAprovada[] {
  const pares: RespostaAprovada[] = [];
  let ultimaDoCliente = "";
  for (let i = 0; i < mensagens.length; i++) {
    const m = mensagens[i];
    if (m.remetente === "cliente") {
      ultimaDoCliente = m.texto;
      continue;
    }
    if (m.remetente !== "bot" || !m.interacaoId || !aprovadas.has(m.interacaoId)) continue;
    // Só no PRIMEIRO balão da resposta: os seguintes já entraram junto.
    if (i > 0 && mensagens[i - 1].interacaoId === m.interacaoId) continue;
    const baloes: string[] = [];
    for (let j = i; j < mensagens.length && mensagens[j].interacaoId === m.interacaoId; j++) {
      baloes.push(mensagens[j].texto);
    }
    if (ultimaDoCliente.trim()) pares.push({ falaCliente: ultimaDoCliente, resposta: baloes.join("\n") });
  }
  return pares;
}

/**
 * As aprovadas mais parecidas com o que o cliente disse agora. Sem nenhum
 * termo em comum, nenhuma entra: diferente da correção, o 👍 ensina a
 * JOGADA daquela situação, e fora dela a jogada não serve.
 */
export function escolherAprovadas(lista: readonly RespostaAprovada[], mensagemAtual: string): RespostaAprovada[] {
  const atual = termosDaFala(mensagemAtual);
  return lista
    .map((a, i) => {
      let comum = 0;
      for (const t of termosDaFala(a.falaCliente)) if (atual.has(t)) comum++;
      return { a, comum, i };
    })
    .filter((p) => p.comum > 0)
    .sort((x, y) => y.comum - x.comum || x.i - y.i)
    .slice(0, TETO_APROVADAS)
    .map((p) => p.a);
}

const corte = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

export function formatarAprovadas(lista: readonly RespostaAprovada[]): string {
  if (lista.length === 0) return "";
  const blocos = lista.map((a, i) =>
    [`Aprovada ${i + 1}:`, `Cliente: ${corte(a.falaCliente, 300)}`, `Resposta que o corretor aprovou: ${corte(a.resposta, 500)}`].join("\n"),
  );
  return `RESPOSTAS QUE O SEU CORRETOR APROVOU 👍 (é o jeito que funciona com ele em situações parecidas: siga a jogada e o tom, com as suas palavras; os dados de imóvel delas podem ser de outro imóvel, então os de agora vêm só do catálogo):\n${blocos.join("\n\n")}`;
}
