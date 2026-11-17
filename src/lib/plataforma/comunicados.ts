import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Leituras de `/plataforma/comunicados` (0260). Tabelas só da chave de
 * serviço; cada função pede a PROVA da guarda da plataforma, como
 * `avisosAosClientes.ts`.
 */

export type GrupoDoComunicado = { id: string; nome: string; centralLigado: boolean };
export type Destinatario = { id: string; nome: string; whatsapp: string };
export type ResumoDoComunicado = {
  id: string;
  criado_em: string;
  grupo: string;
  situacao: "enviando" | "pausado" | "concluido";
  texto: string;
  total: number;
  enviados: number;
  falharam: number;
  pulados: number;
  ultimoMotivo: string | null;
};

export async function listarGruposAtivos(_prova: { userId: string }): Promise<GrupoDoComunicado[]> {
  const { data, error } = await createServiceClient()
    .from("grupos")
    .select("id, nome, central_whatsapp_ativo, situacao")
    .eq("situacao", "ativo")
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao ler as imobiliárias: ${error.message}`);
  return (data ?? []).map((g) => ({ id: g.id, nome: g.nome, centralLigado: g.central_whatsapp_ativo === true }));
}

/** Quem recebe: corretores e gestores ativos, visíveis, com WhatsApp no perfil. */
export async function destinatariosDoGrupo(_prova: { userId: string }, grupoId: string): Promise<Destinatario[]> {
  const { data, error } = await createServiceClient()
    .from("corretores")
    .select("id, nome, whatsapp, ativo, oculta")
    .eq("grupo_id", grupoId)
    .eq("ativo", true)
    .eq("oculta", false)
    .order("nome", { ascending: true });
  if (error) throw new Error(`Falha ao ler os corretores: ${error.message}`);
  return (data ?? [])
    .filter((c) => (c.whatsapp ?? "").replace(/\D/g, "").length >= 10)
    .map((c) => ({ id: c.id, nome: c.nome, whatsapp: c.whatsapp }));
}

export async function listarComunicados(_prova: { userId: string }): Promise<ResumoDoComunicado[]> {
  const servico = createServiceClient();
  const { data: comunicados, error } = await servico
    .from("comunicados")
    .select("id, criado_em, grupo_id, situacao, texto")
    .order("criado_em", { ascending: false })
    .limit(30);
  if (error) throw new Error(`Falha ao ler os comunicados: ${error.message}`);
  if (!comunicados || comunicados.length === 0) return [];

  const ids = comunicados.map((c) => c.id);
  const grupoIds = [...new Set(comunicados.map((c) => c.grupo_id))];
  const [{ data: envios }, { data: grupos }] = await Promise.all([
    servico.from("comunicado_envios").select("comunicado_id, situacao, motivo, ordem").in("comunicado_id", ids),
    servico.from("grupos").select("id, nome").in("id", grupoIds),
  ]);
  const nomeDoGrupo = new Map((grupos ?? []).map((g) => [g.id, g.nome]));

  return comunicados.map((c) => {
    const meus = (envios ?? []).filter((e) => e.comunicado_id === c.id);
    const falhas = meus.filter((e) => e.situacao === "falhou").sort((a, b) => b.ordem - a.ordem);
    return {
      id: c.id,
      criado_em: c.criado_em,
      grupo: nomeDoGrupo.get(c.grupo_id) ?? "—",
      situacao: c.situacao,
      texto: c.texto,
      total: meus.length,
      enviados: meus.filter((e) => e.situacao === "enviado").length,
      falharam: falhas.length,
      pulados: meus.filter((e) => e.situacao === "pulado").length,
      ultimoMotivo: falhas[0]?.motivo ?? null,
    };
  });
}
