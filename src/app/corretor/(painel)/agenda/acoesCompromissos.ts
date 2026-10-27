"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { instanteEmSaoPaulo } from "@/lib/agenda/calendario";
import { cancelarCompromisso, criarBloqueio, criarReuniao } from "@/lib/agenda/compromissos";

export type EstadoDoFormulario = { erro?: string; ok?: string } | null;

const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

function intervalo(fd: FormData): { inicio: Date; fim: Date } | { erro: string } {
  const dia = texto(fd, "dia");
  const inicio = instanteEmSaoPaulo(dia, texto(fd, "das"));
  const fim = instanteEmSaoPaulo(dia, texto(fd, "ate"));
  if (!inicio || !fim) return { erro: "Preencha o dia e os dois horários." };
  return { inicio, fim };
}

/** Bloqueio pessoal (médico, folga): o corretor da sessão, para ele mesmo. */
export async function bloquearHorario(_antes: EstadoDoFormulario, fd: FormData): Promise<EstadoDoFormulario> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const quando = intervalo(fd);
  if ("erro" in quando) return quando;
  const r = await criarBloqueio({ grupoId: corretor.grupoId, corretorId: corretor.id, motivo: texto(fd, "motivo") || null, ...quando });
  if (r.erro) return { erro: r.erro };
  revalidatePath("/corretor/agenda");
  return { ok: "Horário bloqueado. A assistente não vai oferecer esse horário." };
}

/** Reunião ou treinamento: só o gestor, para a equipe toda ou algumas pessoas. */
export async function marcarReuniao(_antes: EstadoDoFormulario, fd: FormData): Promise<EstadoDoFormulario> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro };
  const quando = intervalo(fd);
  if ("erro" in quando) return quando;
  const escolhidos = fd.getAll("participantes").map(String).filter(Boolean);
  const todos = texto(fd, "quem") !== "alguns";
  if (!todos && escolhidos.length === 0) return { erro: "Escolha quem participa." };
  const r = await criarReuniao({
    grupoId: guarda.corretor.grupoId,
    gestorId: guarda.corretor.id,
    titulo: texto(fd, "titulo"),
    participantes: todos ? "equipe" : escolhidos,
    ...quando,
  });
  if (r.erro) return { erro: r.erro };
  revalidatePath("/corretor/agenda");
  const aviso = r.comVisita?.length ? ` Atenção: ${r.comVisita.join(", ")} tem visita nesse horário.` : "";
  return { ok: `Reunião marcada e avisada no WhatsApp de quem participa.${aviso}` };
}

export async function cancelarDoFormulario(_antes: EstadoDoFormulario, fd: FormData): Promise<EstadoDoFormulario> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const r = await cancelarCompromisso({
    grupoId: corretor.grupoId,
    corretorId: corretor.id,
    ehGestor: corretor.papel === "gestor",
    compromissoId: texto(fd, "compromisso"),
  });
  if (r.erro) return { erro: r.erro };
  revalidatePath("/corretor/agenda");
  return { ok: "Cancelado." };
}
