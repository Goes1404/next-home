import "server-only";
import { algumProvedorConfigurado, chamarLlmJson } from "./llm";
import { detectarRecusa } from "./recusaDoCliente";
import { ofereceuParar } from "./duvidaDeEngano";
import {
  lerVeredito,
  montarPromptDeRecusa,
  recusaDoVeredito,
  temSinalNegativo,
  type ClassificacaoDeRecusa,
} from "./recusaEmCamadas";

/**
 * A recusa em camadas: regex primeiro, IA no que for duvidoso
 * (`recusaEmCamadas.ts` explica o porquê).
 *
 * Nunca lança. Sem motor, com timeout ou com JSON torto, o desfecho é o da
 * regex sozinha, que é o comportamento de antes: a camada nova só ACRESCENTA.
 *
 * O orçamento é curto (4s) porque, no turno da IA, o cliente está esperando
 * a resposta, e esta chamada só acontece em mensagem com sinal negativo.
 */
const ORCAMENTO_MS = 4_000;

export async function classificarRecusa(p: {
  texto: string;
  /** A última fala do bot ou do corretor: o que dá sentido a um "não". */
  ultimaFalaNossa: string;
  jaRecusouAntes?: boolean;
}): Promise<ClassificacaoDeRecusa> {
  const pelaRegex = detectarRecusa(p.texto, {
    jaRecusouAntes: p.jaRecusouAntes,
    ofereceuParar: ofereceuParar(p.ultimaFalaNossa),
  });
  if (pelaRegex) return { recusa: pelaRegex, decididoPor: "regex", veredito: null, modelo: null };

  if (!temSinalNegativo(p.texto) || !algumProvedorConfigurado()) {
    return { recusa: null, decididoPor: null, veredito: null, modelo: null };
  }

  try {
    const resposta = await chamarLlmJson(
      montarPromptDeRecusa({ ultimaFalaNossa: p.ultimaFalaNossa, falaDoCliente: p.texto }),
      { temperature: 0, orcamentoMs: ORCAMENTO_MS, fatia: 1 },
    );
    if (!resposta.ok) return { recusa: null, decididoPor: null, veredito: null, modelo: null };
    const veredito = lerVeredito(resposta.json, p.texto);
    const recusa = recusaDoVeredito(veredito);
    return { recusa, decididoPor: recusa ? "ia" : null, veredito, modelo: resposta.modelo };
  } catch (err) {
    console.warn("[recusa] classificação pela IA falhou:", err);
    return { recusa: null, decididoPor: null, veredito: null, modelo: null };
  }
}
