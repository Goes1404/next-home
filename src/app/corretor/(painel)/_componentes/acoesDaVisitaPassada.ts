"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { instanteEmSaoPaulo } from "@/lib/agenda/calendario";
import { responderVisita, type RespostaDaVisita } from "@/lib/agenda/confirmacao";
import { limparEstado, lerEstado } from "@/lib/agenda/conversaDeAgenda";
import { createServiceClient } from "@/lib/supabase/service";

const RESPOSTAS: RespostaDaVisita[] = ["aconteceu", "faltou", "remarcou"];

/**
 * A resposta à cobrança "a visita aconteceu?" pelo Início (0225). A mesma
 * função do WhatsApp; respondida aqui, a pergunta pendente no WhatsApp
 * dessa visita é apagada para o "1" de depois não cair em outra.
 */
export async function responderVisitaDoPainel(
  _antes: { erro?: string; ok?: string } | null,
  fd: FormData,
): Promise<{ erro?: string; ok?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const visitaId = String(fd.get("visita") ?? "");
  const resposta = String(fd.get("resposta") ?? "") as RespostaDaVisita;
  if (!visitaId || !RESPOSTAS.includes(resposta)) return { erro: "Escolha uma resposta." };

  let nova: Date | null = null;
  if (resposta === "remarcou") {
    nova = instanteEmSaoPaulo(String(fd.get("dia") ?? ""), String(fd.get("hora") ?? ""));
    if (!nova) return { erro: "Diga o dia e a hora da nova visita." };
  }

  const supabase = createServiceClient();
  const r = await responderVisita({ visitaId, corretorId: corretor.id, resposta, nova }, supabase);
  if (r.ok) {
    const pendente = await lerEstado(supabase, corretor.id);
    if (pendente && "visitaId" in pendente && pendente.visitaId === visitaId) await limparEstado(supabase, corretor.id);
    revalidatePath("/corretor");
    revalidatePath("/corretor/agenda");
  }
  return r;
}
