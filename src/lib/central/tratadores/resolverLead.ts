import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { escolherLeadsPorNome } from "@/lib/agenda/comandos/escolherLead";
import { variantesDoTelefone } from "../telefone";
import type { ContextoDoCentral } from "../executar";

/**
 * Qual lead a pessoa quis dizer (onda 1; usado por todas as ferramentas que
 * recebem `lead`). O texto vem do cérebro ("o João", "joão p", "11 98765-4321").
 *
 * - Escopo pela identificação, nunca pelo cérebro: corretor só os dele,
 *   gestor o grupo inteiro. Arquivado não conta.
 * - Telefone com DDD casa pelas variantes (com/sem 55 e nono dígito). Só o
 *   final do número NÃO identifica ninguém (spec 3.1): vira `nenhum`.
 * - Nome usa a mesma régua da agenda por WhatsApp (`escolherLeadsPorNome`):
 *   nome completo exato ganha; senão cada palavra é começo de uma palavra
 *   do nome. A busca no banco é pelo primeiro pedaço, como em `canal.ts`.
 */
export type LeadResolvido = {
  id: string;
  nome: string;
  telefone: string | null;
  corretorId: string | null;
  etapa: string;
};

export type Resolucao =
  | { tipo: "um"; lead: LeadResolvido }
  | { tipo: "varios"; opcoes: LeadResolvido[] }
  | { tipo: "nenhum" };

type Supa = ReturnType<typeof createServiceClient>;

const COLUNAS = "id, nome, telefone, corretor_id, etapa";

function comoLead(l: { id: string; nome: string; telefone: string | null; corretor_id: string | null; etapa: string }): LeadResolvido {
  return { id: l.id, nome: l.nome, telefone: l.telefone, corretorId: l.corretor_id, etapa: l.etapa };
}

/** O primeiro pedaço do nome, sem os curingas do `ilike` (o mesmo de `canal.ts`). */
function trechoDeBusca(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? "").replace(/[%_,()\\]/g, "").slice(0, 40);
}

export async function resolverLead(ctx: ContextoDoCentral, texto: string, supabase: Supa = createServiceClient()): Promise<Resolucao> {
  const pedido = String(texto ?? "").trim();
  if (!pedido) return { tipo: "nenhum" };

  const escopo = () => {
    let c = supabase.from("leads").select(COLUNAS).eq("grupo_id", ctx.grupoId).is("arquivado_em", null);
    if (ctx.papel !== "gestor") c = c.eq("corretor_id", ctx.corretorId);
    return c;
  };

  const digitos = pedido.replace(/\D/g, "");
  if (digitos.length >= 10) {
    const { data } = await escopo().in("telefone", variantesDoTelefone(digitos)).limit(5);
    const achados = (data ?? []).map(comoLead);
    if (achados.length === 1) return { tipo: "um", lead: achados[0] };
    return achados.length ? { tipo: "varios", opcoes: achados } : { tipo: "nenhum" };
  }
  // Só o final do número (ou um pedaço dele): não identifica ninguém.
  if (digitos.length > 0 && pedido.replace(/[\d\s().+-]/g, "") === "") return { tipo: "nenhum" };

  const trecho = trechoDeBusca(pedido);
  if (!trecho) return { tipo: "nenhum" };
  const { data } = await escopo().ilike("nome", `%${trecho}%`).order("nome").limit(50);
  const escolha = escolherLeadsPorNome(pedido, (data ?? []).map(comoLead));
  if (escolha.tipo === "um") return { tipo: "um", lead: escolha.lead };
  if (escolha.tipo === "varios") return { tipo: "varios", opcoes: escolha.opcoes };
  return { tipo: "nenhum" };
}

/**
 * A resposta padrão ao cérebro quando o lead não ficou claro. Volta como
 * `Preparo` de tipo `resposta`: nada é proposto, a pessoa escolhe e pede de
 * novo.
 */
export function respostaDeLeadIncerto(r: Exclude<Resolucao, { tipo: "um" }>, pedido: string): unknown {
  if (r.tipo === "varios") {
    return {
      pergunta: `Achei mais de um cliente para "${pedido}". Pergunte qual é.`,
      opcoes: r.opcoes.map((o) => o.nome),
    };
  }
  return {
    erro: `Não achei cliente "${pedido}" na carteira. Peça o nome completo ou o telefone com DDD.`,
  };
}
