"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import {
  andarDaUnidade,
  fimDaReserva,
  lerIdentificacoes,
  PRAZOS_DE_RESERVA,
  type StatusUnidade,
} from "@/lib/imoveis/unidades";
import { chaveDaUnidade } from "@/lib/imoveis/tabelaDeDisponibilidade";

type Resultado = { ok?: string; erro?: string };

function revalidar(slug: string) {
  revalidatePath(`/corretor/imoveis/${slug}`);
  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
}

/** Cadastra em lote. A que já existe (mesma identificação) é ignorada. */
export async function adicionarUnidades(params: {
  empreendimentoId: string;
  slug: string;
  tipologiaId: string | null;
  texto: string;
}): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const ids = lerIdentificacoes(params.texto);
  if (ids === null) return { erro: "Lote grande demais — cadastre até 200 unidades por vez." };
  if (ids.length === 0) return { erro: "Escreva as unidades: 101, 102 ou 101 a 110." };

  const supabase = await createClient();
  let dormitorios: number | null = null;
  let area: number | null = null;
  if (params.tipologiaId) {
    const { data: planta } = await supabase
      .from("tipologias")
      .select("dormitorios, area_privativa")
      .eq("id", params.tipologiaId)
      .eq("empreendimento_id", params.empreendimentoId)
      .maybeSingle();
    if (!planta) return { erro: "Planta não encontrada neste imóvel." };
    dormitorios = planta.dormitorios;
    area = planta.area_privativa != null ? Number(planta.area_privativa) : null;
  }

  const { error, count } = await supabase.from("unidades").upsert(
    ids.map((identificacao) => ({
      empreendimento_id: params.empreendimentoId,
      tipologia_id: params.tipologiaId,
      identificacao,
      andar: andarDaUnidade(identificacao),
      dormitorios,
      area_m2: area,
    })),
    { onConflict: "empreendimento_id,identificacao", ignoreDuplicates: true, count: "exact" },
  );
  if (error) return { erro: "Não foi possível cadastrar as unidades agora." };
  revalidar(params.slug);
  const novas = count ?? ids.length;
  return { ok: novas === 1 ? "1 unidade cadastrada." : `${novas} unidades cadastradas.` };
}

export async function mudarStatusDaUnidade(params: {
  id: string;
  slug: string;
  status: StatusUnidade;
  /**
   * Reserva com prazo (0121): vencido, a unidade volta a disponível sozinha
   * no tique dos follow-ups. Só vale para `reservada`.
   */
  diasDeReserva?: number | null;
}): Promise<Resultado & { reservadaAte?: string | null }> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  if (!["disponivel", "reservada", "vendida"].includes(params.status)) return { erro: "Status desconhecido." };
  const dias = params.diasDeReserva ?? null;
  if (!(PRAZOS_DE_RESERVA as readonly (number | null)[]).includes(dias)) return { erro: "Prazo desconhecido." };
  const supabase = await createClient();
  const reservadaAte = params.status === "reservada" ? fimDaReserva(dias) : null;
  const { data, error } = await supabase
    .from("unidades")
    .update({
      status: params.status,
      reservada_ate: reservadaAte,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", params.id)
    .select("id");
  if (error || !data?.length) return { erro: "Não foi possível mudar o status." };
  revalidar(params.slug);
  return { ok: "Status atualizado.", reservadaAte };
}

export async function excluirUnidade(params: { id: string; slug: string }): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("unidades").delete().eq("id", params.id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível excluir a unidade." };
  revalidar(params.slug);
  return { ok: "Unidade excluída." };
}

const TETO_PDF_DISPONIBILIDADE = 8 * 1024 * 1024;
const TETO_LINHAS_DISPONIBILIDADE = 500;

/**
 * Texto de dentro do PDF da tabela de disponibilidade (0121). Mesmo
 * extrator da tabela de preços: a construtora gera esse PDF de planilha, e o
 * texto está dentro. PDF escaneado não tem texto — e a tela diz isso.
 */
export async function lerTabelaDeUnidadesPdf(
  formData: FormData,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  if (!(await getCorretorLogado())) return { ok: false, erro: "Sessão expirada." };
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Selecione um arquivo." };
  if (arquivo.size > TETO_PDF_DISPONIBILIDADE) return { ok: false, erro: "O PDF passa de 8 MB — a tabela costuma ter poucos KB." };
  const { extrairTextoDePdf } = await import("@/lib/leads/pdfTexto");
  const texto = extrairTextoDePdf(Buffer.from(await arquivo.arrayBuffer()));
  if (!texto.trim()) {
    return { ok: false, erro: "Não achei texto neste PDF. Se ele for escaneado, copie a tabela e cole na caixa." };
  }
  return { ok: true, texto };
}

/**
 * Aplica o espelho da construtora: unidade que existe muda de status;
 * unidade que não existe é criada (sem planta — o corretor liga depois).
 * Status aplicado aqui apaga o prazo de reserva: quem manda agora é a
 * tabela da construtora.
 */
export async function aplicarDisponibilidade(params: {
  empreendimentoId: string;
  slug: string;
  linhas: Array<{ identificacao: string; status: StatusUnidade }>;
}): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const validas = (Array.isArray(params.linhas) ? params.linhas : [])
    .filter(
      (l) =>
        typeof l?.identificacao === "string" &&
        l.identificacao.trim().length > 0 &&
        l.identificacao.length <= 20 &&
        ["disponivel", "reservada", "vendida"].includes(l.status),
    )
    .slice(0, TETO_LINHAS_DISPONIBILIDADE);
  if (validas.length === 0) return { erro: "Nenhuma unidade reconhecida na tabela." };

  const supabase = await createClient();
  const { data: existentes, error } = await supabase
    .from("unidades")
    .select("id, identificacao, status")
    .eq("empreendimento_id", params.empreendimentoId);
  if (error) return { erro: "Não foi possível ler as unidades deste imóvel." };
  const porChave = new Map((existentes ?? []).map((u) => [chaveDaUnidade(u.identificacao), u]));

  const agora = new Date().toISOString();
  let mudaram = 0;
  const novas: typeof validas = [];
  for (const l of validas) {
    const atual = porChave.get(chaveDaUnidade(l.identificacao));
    if (!atual) {
      novas.push(l);
      continue;
    }
    if (atual.status === l.status) continue;
    const { error: e } = await supabase
      .from("unidades")
      .update({ status: l.status, reservada_ate: null, atualizado_em: agora })
      .eq("id", atual.id);
    if (!e) mudaram++;
  }
  if (novas.length > 0) {
    await supabase.from("unidades").insert(
      novas.map((l) => ({
        empreendimento_id: params.empreendimentoId,
        identificacao: l.identificacao.trim(),
        andar: andarDaUnidade(l.identificacao),
        status: l.status,
      })),
    );
  }
  revalidar(params.slug);
  return { ok: `${mudaram} unidade(s) mudaram de status e ${novas.length} foram cadastradas.` };
}
