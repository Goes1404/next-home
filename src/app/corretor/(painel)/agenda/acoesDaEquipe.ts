"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { ehConflitoDeHorario } from "@/lib/agenda/conflito";

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type VisitaParaPassar = {
  id: string;
  inicio: string;
  lead_id: string;
  corretor_id: string;
  status: string;
  lead: { nome: string; corretor_id: string | null } | null;
};

/**
 * O gestor passa uma visita de um corretor para outro (27/10/2026, fase 2).
 *
 * Só a visita muda: o lead continua do dono ("o lead é de quem pagou o
 * anúncio", 0206). `passada_em` diz ao espelho do lead (0223) que a troca é
 * de propósito; devolver ao dono do lead a zera. O cliente NÃO é avisado (o
 * corretor avisa); quem recebe e quem perde a visita são.
 *
 * `visitas` é fechada ao painel: tudo pela chave de serviço, com o grupo do
 * gestor da sessão em cada consulta.
 */
export async function passarVisita(visitaId: string, paraCorretorId: string): Promise<{ erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro };
  const gestor = guarda.corretor;
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("visitas")
    .select("id, inicio, lead_id, corretor_id, status, lead:leads!visitas_lead_id_fkey(nome, corretor_id)")
    .eq("id", visitaId)
    .eq("grupo_id", gestor.grupoId)
    .maybeSingle();
  const v = data as unknown as VisitaParaPassar | null;
  if (!v || v.status !== "marcada" || Date.parse(v.inicio) < Date.now()) {
    return { erro: "Essa visita não pode mais ser passada." };
  }
  if (v.corretor_id === paraCorretorId) return {};

  const { data: destino } = await supabase
    .from("corretores")
    .select("id, nome, ativo")
    .eq("id", paraCorretorId)
    .eq("grupo_id", gestor.grupoId)
    .maybeSingle();
  if (!destino || !destino.ativo) return { erro: "Escolha um corretor ativo da equipe." };

  const devolvida = paraCorretorId === v.lead?.corretor_id;
  const { data: passada, error } = await supabase
    .from("visitas")
    .update({
      corretor_id: paraCorretorId,
      passada_em: devolvida ? null : new Date().toISOString(),
      passada_por: devolvida ? null : gestor.id,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", v.id)
    .eq("grupo_id", gestor.grupoId)
    .eq("status", "marcada")
    .select("id");
  if (error) {
    return {
      erro: ehConflitoDeHorario(error)
        ? "Esse corretor já tem outra visita nesse horário."
        : "Não foi possível passar a visita agora. Tente de novo.",
    };
  }
  // Mudou entre a leitura e a gravação (desmarcada, respondida): nada foi passado.
  if (!passada?.length) return { erro: "Essa visita não pode mais ser passada." };

  const quando = QUANDO.format(new Date(v.inicio));
  const nome = v.lead?.nome ?? "o cliente";
  await supabase.from("lead_interacoes").insert({
    lead_id: v.lead_id,
    corretor_id: gestor.id,
    tipo: "sistema",
    conteudo: `Visita de ${quando} passada para ${destino.nome}.`,
    detalhes: { visita_id: v.id, de: v.corretor_id, para: paraCorretorId },
  });
  await Promise.all([
    avisarCorretor(
      supabase,
      paraCorretorId,
      `Você recebeu uma visita: ${nome}, ${quando}. Está na sua Agenda.`,
      "/corretor/agenda",
    ),
    avisarCorretor(supabase, v.corretor_id, `A visita com ${nome} (${quando}) passou para ${destino.nome}.`, "/corretor/agenda"),
  ]);

  revalidatePath("/corretor/agenda");
  return {};
}

/** O mesmo, pelo `<form>` da lista da equipe (`useActionState`). */
export async function passarVisitaDoFormulario(
  _antes: { erro?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ erro?: string; ok?: boolean }> {
  const visitaId = String(formData.get("visita") ?? "");
  const para = String(formData.get("para") ?? "");
  if (!visitaId || !para) return { erro: "Escolha para quem passar a visita." };
  const r = await passarVisita(visitaId, para);
  return r.erro ? r : { ok: true };
}
