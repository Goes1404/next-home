import "server-only";

import { enviarMidiaWhatsapp, type TipoMidiaWhatsapp } from "./provider";
import { gravarMensagem } from "./repositorio";

/**
 * Fotos e planta do imóvel que a lista de transmissão manda DEPOIS do texto
 * (roadmap das listas, Fase 2, 03/10/2026).
 *
 * Antes, a lista só sabia mandar texto: nada de foto, planta ou apresentação,
 * justo o que faz alguém parar e olhar. As mídias vêm do CADASTRO do imóvel
 * (escolhidas no assistente), nunca de URL digitada, então não há como a
 * lista anexar arquivo que não é do catálogo.
 */

export type MidiaDaLista = { url: string; tipo: "foto" | "planta"; titulo: string };

/** Teto de anexos por mensagem: mais que isso vira álbum, e álbum ninguém pediu. */
export const MAXIMO_DE_MIDIAS_NA_LISTA = 2;

/**
 * Manda as mídias, uma a uma, com pausa curta e humana entre elas, e grava a
 * nota `📎 título: url` que o Live Chat mostra e que `midiasJaEnviadas` lê
 * para a IA não reenviar a mesma foto depois. Nunca lança: falha numa foto
 * não desfaz o texto que já saiu.
 */
export async function enviarMidiasDaLista(params: {
  instanceName: string;
  telefone: string;
  conversaId: string;
  midias: readonly MidiaDaLista[];
}): Promise<number> {
  const notas: string[] = [];
  for (const midia of params.midias.slice(0, MAXIMO_DE_MIDIAS_NA_LISTA)) {
    if (!/^https:\/\//.test(midia.url)) continue;
    await new Promise((r) => setTimeout(r, 1500 + Math.floor(Math.random() * 1500)));
    try {
      const envio = await enviarMidiaWhatsapp({
        instanceName: params.instanceName,
        telefone: params.telefone,
        tipo: midia.tipo as TipoMidiaWhatsapp,
        url: midia.url,
      });
      if (envio.enviado) notas.push(`📎 ${midia.titulo || midia.tipo}: ${midia.url}`);
    } catch (err) {
      console.warn("[lista] falha ao enviar mídia:", err);
    }
  }
  if (notas.length > 0) {
    await gravarMensagem({
      conversaLiberada: true,
      conversaId: params.conversaId,
      remetente: "bot",
      conteudo: notas.join("\n"),
    }).catch((err) => console.warn("[lista] falha ao gravar nota de anexo:", err));
  }
  return notas.length;
}
