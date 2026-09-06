import "server-only";

import { REGRAS_DE_PLANO, type TipoDePlano } from "./gramatica";

/**
 * Classifica por VISÃO as fotos que o corretor subiu.
 *
 * ## Por que isto existe
 *
 * A gramática de câmera decide o movimento pelo `alt` da foto — e é isso que
 * impede os vídeos de ficarem todos iguais. As 265 fotos do catálogo têm `alt`
 * escrito por visão em agosto; foto que o corretor sobe agora não tem nenhum.
 * Sem classificar, `tipoDoPlano` cai em "interior" para tudo, todo plano vira
 * PUSH, e a gramática deixa de funcionar exatamente no caminho novo.
 *
 * ## Uma chamada só, com todas as fotos juntas
 *
 * Mais barato que uma por foto, e melhor: vendo o conjunto o modelo distingue
 * a fachada do prédio da foto da rua, e o living do salão de festas. Detalhe
 * baixo porque a pergunta é de categoria, não de leitura — não precisamos ler
 * nada escrito na imagem.
 *
 * ## Falhar aqui não pode parar o vídeo
 *
 * Sem chave, com timeout ou com JSON torto, cai numa heurística de ORDEM:
 * corretor põe a fachada primeiro quase sempre, e alternar depois é melhor que
 * marcar tudo como interior. Vídeo com movimento imperfeito é melhor que vídeo
 * nenhum — a mesma escolha do `melhorarPedido`.
 */

const BASE_URL = "https://api.openai.com/v1/chat/completions";
const TIMEOUT_MS = 20_000;
/** Teto de fotos por chamada. Acima disso o prompt fica caro sem ganho. */
const MAX_FOTOS = 10;

const TIPOS = REGRAS_DE_PLANO.map((r) => r.tipo);

function ehTipo(v: unknown): v is TipoDePlano {
  return typeof v === "string" && (TIPOS as string[]).includes(v);
}

/**
 * A reserva: alterna começando por fachada.
 *
 * Não é chute cego — corretor põe a fachada primeiro na esmagadora maioria dos
 * casos, e alternar impede o pior desfecho, que é a sequência inteira com o
 * mesmo movimento.
 */
export function classificacaoDeReserva(quantas: number): TipoDePlano[] {
  const roda: TipoDePlano[] = ["fachada", "interior", "lazer", "interior"];
  return Array.from({ length: quantas }, (_, i) => roda[i % roda.length]);
}

export async function classificarFotos(urls: string[]): Promise<TipoDePlano[]> {
  const fotos = urls.slice(0, MAX_FOTOS);
  if (fotos.length === 0) return [];

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return classificacaoDeReserva(fotos.length);

  const controle = new AbortController();
  const alarme = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const resposta = await fetch(BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: controle.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `São ${fotos.length} fotos de um empreendimento imobiliário, nesta ordem. ` +
                  "Classifique CADA uma em exatamente um destes tipos:\n" +
                  '- "fachada": o prédio visto de fora, entrada, portaria, torres, a rua.\n' +
                  '- "interior": dentro da unidade — living, sala, cozinha, quarto, varanda.\n' +
                  '- "lazer": área comum do condomínio — piscina, academia, playground, salão, coworking, pet.\n' +
                  '- "implantacao": planta, maquete, vista aérea ou perspectiva do conjunto todo.\n\n' +
                  "Atenção: cozinha gourmet DENTRO do apartamento é interior; espaço gourmet " +
                  "do condomínio é lazer.\n\n" +
                  `Responda só com JSON: {"tipos":["fachada","interior",...]} com exatamente ${fotos.length} itens, na mesma ordem.`,
              },
              // `detail: low` porque a pergunta é de categoria: uma miniatura
              // basta e custa uma fração dos tokens da imagem inteira.
              ...fotos.map((url) => ({
                type: "image_url" as const,
                image_url: { url, detail: "low" as const },
              })),
            ],
          },
        ],
      }),
    });

    if (!resposta.ok) return classificacaoDeReserva(fotos.length);
    const corpo = await resposta.json();
    const bruto = JSON.parse(corpo?.choices?.[0]?.message?.content ?? "{}") as { tipos?: unknown };
    const tipos = bruto.tipos;
    if (!Array.isArray(tipos)) return classificacaoDeReserva(fotos.length);

    // Item torto vira reserva NAQUELA posição, não descarta a resposta inteira:
    // o modelo acertar nove de dez ainda é melhor que a heurística pura.
    const reserva = classificacaoDeReserva(fotos.length);
    return fotos.map((_, i) => (ehTipo(tipos[i]) ? tipos[i] : reserva[i]));
  } catch {
    return classificacaoDeReserva(fotos.length);
  } finally {
    clearTimeout(alarme);
  }
}
