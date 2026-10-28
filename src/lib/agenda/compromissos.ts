import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import { ehConflitoDeHorario } from "./conflito";
import type { ItemDaAgenda } from "./itens";

/**
 * Reuniões e bloqueios da Agenda (0226, fase 3). Um caminho só para o painel
 * e para o WhatsApp (fase 5): quem chama passa ids já conferidos pela sessão
 * (ou pelo número do corretor), e tudo aqui filtra o grupo.
 *
 * As tabelas são fechadas ao painel; a trava visita × compromisso mora no
 * banco (gatilho, código 23P01) e é a mesma que a IA respeita.
 */

type Supa = ReturnType<typeof createServiceClient>;
export type ItemCompromisso = Extract<ItemDaAgenda, { tipo: "compromisso" }>;

const QUANDO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

/** Compromisso mais longo que se aceita: uma semana (férias maiores, em partes). */
const DURACAO_MAXIMA_MS = 7 * 86_400_000;

function validarIntervalo(inicio: Date, fim: Date, agora: Date): string | null {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return "Data ou hora inválida.";
  if (fim <= inicio) return "O fim precisa ser depois do começo.";
  if (fim <= agora) return "Esse horário já passou.";
  if (fim.getTime() - inicio.getTime() > DURACAO_MAXIMA_MS) return "Um compromisso pode durar no máximo uma semana.";
  return null;
}

export function descreverQuando(inicio: Date, fim: Date): string {
  return `${QUANDO.format(inicio)} às ${HORA.format(fim)}`;
}

export async function criarBloqueio(
  p: { grupoId: string; corretorId: string; inicio: Date; fim: Date; motivo: string | null },
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<{ erro?: string; id?: string }> {
  const invalido = validarIntervalo(p.inicio, p.fim, agora);
  if (invalido) return { erro: invalido };

  const { data, error } = await supabase
    .from("compromissos")
    .insert({
      grupo_id: p.grupoId,
      tipo: "bloqueio",
      titulo: (p.motivo ?? "").trim().slice(0, 120),
      inicio: p.inicio.toISOString(),
      fim: p.fim.toISOString(),
      criado_por: p.corretorId,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não foi possível bloquear agora. Tente de novo." };

  const { error: erroParticipante } = await supabase.from("compromisso_participantes").insert({
    compromisso_id: data.id,
    corretor_id: p.corretorId,
    grupo_id: p.grupoId,
    inicio: p.inicio.toISOString(),
    fim: p.fim.toISOString(),
  });
  if (erroParticipante) {
    // Sem a linha do participante o bloqueio não ocupa nada: desfaz.
    await supabase.from("compromissos").delete().eq("id", data.id).eq("grupo_id", p.grupoId);
    return {
      erro: ehConflitoDeHorario(erroParticipante)
        ? "Você tem visita marcada nesse horário. Remarque a visita antes de bloquear."
        : "Não foi possível bloquear agora. Tente de novo.",
    };
  }
  return { id: data.id };
}

export async function criarReuniao(
  p: {
    grupoId: string;
    gestorId: string;
    titulo: string;
    inicio: Date;
    fim: Date;
    participantes: "equipe" | string[];
  },
  supabase: Supa = createServiceClient(),
  agora: Date = new Date(),
): Promise<{ erro?: string; id?: string; comVisita?: string[] }> {
  const invalido = validarIntervalo(p.inicio, p.fim, agora);
  if (invalido) return { erro: invalido };
  const titulo = p.titulo.trim().slice(0, 120) || "Reunião";

  // Só gente ativa do grupo; "equipe toda" inclui o gestor que marcou.
  let consulta = supabase.from("corretores").select("id, nome").eq("grupo_id", p.grupoId).eq("ativo", true);
  if (p.participantes !== "equipe") consulta = consulta.in("id", [...new Set([...p.participantes, p.gestorId])]);
  const { data: pessoas, error: erroPessoas } = await consulta;
  if (erroPessoas) return { erro: "Não foi possível marcar a reunião agora. Tente de novo." };
  if (!pessoas || pessoas.length === 0) return { erro: "Escolha quem participa." };

  const { data, error } = await supabase
    .from("compromissos")
    .insert({
      grupo_id: p.grupoId,
      tipo: "reuniao",
      titulo,
      inicio: p.inicio.toISOString(),
      fim: p.fim.toISOString(),
      criado_por: p.gestorId,
    })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não foi possível marcar a reunião agora. Tente de novo." };

  const { error: erroParticipantes } = await supabase.from("compromisso_participantes").insert(
    pessoas.map((c) => ({
      compromisso_id: data.id,
      corretor_id: c.id,
      grupo_id: p.grupoId,
      inicio: p.inicio.toISOString(),
      fim: p.fim.toISOString(),
    })),
  );
  if (erroParticipantes) {
    await supabase.from("compromissos").delete().eq("id", data.id).eq("grupo_id", p.grupoId);
    return { erro: "Não foi possível marcar a reunião agora. Tente de novo." };
  }

  // Quem tem visita no horário: a reunião vale, mas o gestor fica sabendo.
  const { data: visitas } = await supabase
    .from("visitas")
    .select("corretor_id")
    .eq("grupo_id", p.grupoId)
    .eq("status", "marcada")
    .in(
      "corretor_id",
      pessoas.map((c) => c.id),
    )
    .lt("inicio", p.fim.toISOString())
    .gt("fim", p.inicio.toISOString());
  const comVisitaIds = new Set((visitas ?? []).map((v) => v.corretor_id));
  const comVisita = pessoas.filter((c) => comVisitaIds.has(c.id)).map((c) => c.nome);

  const quando = descreverQuando(p.inicio, p.fim);
  await Promise.all(
    pessoas
      .filter((c) => c.id !== p.gestorId)
      .map((c) =>
        avisarCorretor(supabase, c.id, `Reunião: ${titulo}, ${quando}. Já está na sua Agenda.`, "/corretor/agenda"),
      ),
  );
  return { id: data.id, comVisita };
}

/**
 * Cancela: o bloqueio só quem o criou; a reunião só o gestor do grupo. O
 * gatilho da 0226 libera os participantes; a reunião cancelada avisa quem ia.
 */
export async function cancelarCompromisso(
  p: { grupoId: string; corretorId: string; ehGestor: boolean; compromissoId: string },
  supabase: Supa = createServiceClient(),
): Promise<{ erro?: string }> {
  const { data: c } = await supabase
    .from("compromissos")
    .select("id, tipo, titulo, inicio, fim, criado_por, cancelado_em")
    .eq("id", p.compromissoId)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!c || c.cancelado_em) return { erro: "Esse compromisso não existe mais." };
  const pode = c.tipo === "bloqueio" ? c.criado_por === p.corretorId : p.ehGestor;
  if (!pode) return { erro: "Só quem marcou pode cancelar." };

  const { error } = await supabase
    .from("compromissos")
    .update({ cancelado_em: new Date().toISOString() })
    .eq("id", c.id)
    .eq("grupo_id", p.grupoId);
  if (error) return { erro: "Não foi possível cancelar agora. Tente de novo." };

  if (c.tipo === "reuniao") {
    const { data: quem } = await supabase
      .from("compromisso_participantes")
      .select("corretor_id")
      .eq("compromisso_id", c.id)
      .eq("grupo_id", p.grupoId);
    const quando = descreverQuando(new Date(c.inicio), new Date(c.fim));
    await Promise.all(
      (quem ?? [])
        .filter((q) => q.corretor_id !== p.corretorId)
        .map((q) =>
          avisarCorretor(supabase, q.corretor_id, `Reunião cancelada: ${c.titulo}, ${quando}.`, "/corretor/agenda"),
        ),
    );
  }
  return {};
}

type LinhaParticipacao = {
  corretor_id: string;
  corretor: { nome: string } | null;
  compromisso: {
    id: string;
    tipo: "reuniao" | "bloqueio";
    titulo: string;
    inicio: string;
    fim: string;
    criado_por: string;
    cancelado_em: string | null;
  } | null;
};

const SELECT_PARTICIPACAO = `corretor_id,
  corretor:corretores!compromisso_participantes_corretor_id_fkey(nome),
  compromisso:compromissos!compromisso_participantes_compromisso_id_fkey(id, tipo, titulo, inicio, fim, criado_por, cancelado_em)`;

/**
 * Os compromissos que cruzam [inicio, fim). `vistaDe`:
 * - `{ corretorId }`: a agenda do próprio corretor (vê o título dos dele);
 * - `{ equipe: true, corretorId? }`: a do gestor — bloqueio sai SEM título
 *   ("ocupado"), uma linha por pessoa bloqueada; reunião sai uma vez só.
 */
export async function lerCompromissos(
  p: { grupoId: string; inicio: Date; fim: Date; limite: number } & (
    | { corretorId: string; equipe?: false }
    | { equipe: true; corretorId: string | null }
  ),
): Promise<ItemCompromisso[]> {
  let consulta = createServiceClient()
    .from("compromisso_participantes")
    .select(SELECT_PARTICIPACAO)
    .eq("grupo_id", p.grupoId)
    .eq("ativo", true)
    .lt("inicio", p.fim.toISOString())
    .gt("fim", p.inicio.toISOString());
  if (p.corretorId) consulta = consulta.eq("corretor_id", p.corretorId);
  const { data, error } = await consulta.order("inicio", { ascending: true }).limit(p.limite);
  if (error) throw new Error(`Falha ao ler os compromissos: ${error.message}`);

  const vistos = new Set<string>();
  const itens: ItemCompromisso[] = [];
  for (const linha of (data ?? []) as unknown as LinhaParticipacao[]) {
    const c = linha.compromisso;
    if (!c || c.cancelado_em) continue;
    if (p.equipe) {
      if (c.tipo === "reuniao") {
        if (vistos.has(c.id)) continue;
        vistos.add(c.id);
        itens.push({ tipo: "compromisso", id: c.id, inicio: c.inicio, fim: c.fim, subtipo: "reuniao", titulo: c.titulo, podeCancelar: true });
      } else {
        // O gestor vê "ocupado": o título do bloqueio nunca sai do servidor.
        itens.push({
          tipo: "compromisso",
          id: `${c.id}:${linha.corretor_id}`,
          inicio: c.inicio,
          fim: c.fim,
          subtipo: "bloqueio",
          titulo: "",
          corretorNome: linha.corretor?.nome ?? null,
          podeCancelar: false,
        });
      }
      continue;
    }
    itens.push({
      tipo: "compromisso",
      id: c.id,
      inicio: c.inicio,
      fim: c.fim,
      subtipo: c.tipo,
      titulo: c.titulo,
      podeCancelar: c.tipo === "bloqueio" && c.criado_por === p.corretorId,
    });
  }
  return itens;
}
