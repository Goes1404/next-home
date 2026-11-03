import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import { numeroPorPhoneId, numerosDaConta, type NumeroOficial } from "./numeros";
import { receberMensagemOficial } from "./respostaOficial";
import {
  aplicarEstadoDoModelo,
  aplicarEventoDaConta,
  aplicarPreferencia,
  aplicarQualidadeDoModelo,
  aplicarQualidadeDoNumero,
  aplicarStatus,
} from "./statusOficial";
import type { CampoCru, EventoOficial } from "./webhook";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O webhook da API oficial em duas metades, para a Meta receber o 200 rápido
 * (ela reenvia o que demora) e a IA ter o tempo dela:
 *
 *   1. `guardarEventosCrus`, ANTES da resposta: acha o grupo de cada mudança
 *      pelo número (ou pela conta) e guarda o payload cru. Número que não é
 *      nosso não é guardado: o webhook é do app inteiro, e um app pode servir
 *      contas que este sistema não conhece.
 *   2. `processarEventos`, DEPOIS (`after`): status, modelos, qualidade,
 *      preferências e, por último, as mensagens (que podem chamar a IA).
 */

export type ResolvedorDeNumeros = {
  porPhoneId: (id: string) => Promise<NumeroOficial | null>;
  porConta: (wabaId: string) => Promise<NumeroOficial[]>;
};

export function resolvedorComCache(supabase: Supa): ResolvedorDeNumeros {
  const porPhone = new Map<string, Promise<NumeroOficial | null>>();
  const porConta = new Map<string, Promise<NumeroOficial[]>>();
  return {
    porPhoneId: (id) => {
      if (!porPhone.has(id)) porPhone.set(id, numeroPorPhoneId(supabase, id));
      return porPhone.get(id)!;
    },
    porConta: (wabaId) => {
      if (!porConta.has(wabaId)) porConta.set(wabaId, numerosDaConta(supabase, wabaId));
      return porConta.get(wabaId)!;
    },
  };
}

/** Guarda os campos crus de número conhecido; devolve os ids gravados. */
export async function guardarEventosCrus(
  supabase: Supa,
  campos: CampoCru[],
  numeros: ResolvedorDeNumeros,
): Promise<string[]> {
  const linhas: { grupo_id: string; phone_number_id: string | null; campo: string; payload: Json }[] = [];
  for (const c of campos) {
    const numero = c.phoneNumberId
      ? await numeros.porPhoneId(c.phoneNumberId)
      : c.wabaId
        ? ((await numeros.porConta(c.wabaId))[0] ?? null)
        : null;
    if (!numero) continue;
    linhas.push({ grupo_id: numero.grupo_id, phone_number_id: c.phoneNumberId, campo: c.campo, payload: (c.valor ?? null) as Json });
  }
  if (linhas.length === 0) return [];
  const { data, error } = await supabase.from("whatsapp_oficial_eventos").insert(linhas).select("id");
  if (error) {
    console.warn("[oficial] eventos crus não guardados:", error.message);
    return [];
  }
  return (data ?? []).map((l) => l.id);
}

const ORDEM: Record<EventoOficial["tipo"], number> = {
  status: 0,
  modelo: 1,
  qualidade_do_modelo: 2,
  qualidade_do_numero: 3,
  conta: 4,
  preferencia: 5,
  mensagem: 6,
};

export async function processarEventos(
  supabase: Supa,
  eventos: EventoOficial[],
  numeros: ResolvedorDeNumeros,
  idsCrus: string[] = [],
): Promise<void> {
  const ordenados = [...eventos].sort((a, b) => ORDEM[a.tipo] - ORDEM[b.tipo]);
  let falhas = 0;
  for (const ev of ordenados) {
    try {
      switch (ev.tipo) {
        case "status": {
          const numero = await numeros.porPhoneId(ev.phoneNumberId);
          if (numero) await aplicarStatus(supabase, numero, ev);
          break;
        }
        case "mensagem": {
          const numero = await numeros.porPhoneId(ev.phoneNumberId);
          if (numero && numero.estado !== "desligado") await receberMensagemOficial(supabase, numero, ev);
          break;
        }
        case "modelo":
          await aplicarEstadoDoModelo(supabase, await numeros.porConta(ev.wabaId), ev);
          break;
        case "qualidade_do_modelo":
          await aplicarQualidadeDoModelo(supabase, await numeros.porConta(ev.wabaId), ev);
          break;
        case "qualidade_do_numero":
          await aplicarQualidadeDoNumero(supabase, await numeros.porConta(ev.wabaId));
          break;
        case "conta":
          await aplicarEventoDaConta(supabase, await numeros.porConta(ev.wabaId), ev);
          break;
        case "preferencia": {
          const numero = ev.phoneNumberId
            ? await numeros.porPhoneId(ev.phoneNumberId)
            : ((await numeros.porConta(ev.wabaId))[0] ?? null);
          if (numero) await aplicarPreferencia(supabase, numero, ev);
          break;
        }
      }
    } catch (erro) {
      falhas++;
      console.error(`[oficial] evento ${ev.tipo} não processado:`, erro);
    }
  }
  if (idsCrus.length > 0) {
    await supabase
      .from("whatsapp_oficial_eventos")
      .update({ processado_em: new Date().toISOString(), erro: falhas > 0 ? `${falhas} evento(s) com erro; ver o log` : null })
      .in("id", idsCrus);
  }
}
