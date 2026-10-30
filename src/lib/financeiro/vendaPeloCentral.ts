import "server-only";

import { escolherLeadsPorNome } from "@/lib/agenda/comandos/escolherLead";
import { normalizar } from "@/lib/agenda/comandos/normalizar";
import type { createServiceClient } from "@/lib/supabase/service";
import { recusaDoMesFechadoNoGrupo } from "./caixaPeloCentral";
import { dividirEmParcelas, valorDaImobiliaria } from "./parcelas";
import { hojeEmSaoPaulo, problemasDaVenda, resolverPar } from "./venda";

/**
 * A venda registrada pelo número central (onda 2, 30/10/2026; spec do CRM
 * pelo WhatsApp 3.2 item 9): "fechei o Vitta com a Maria, 450 mil".
 *
 * A tela grava pela função `salvar_venda` (0232), que é SECURITY INVOKER e
 * tira o grupo e o registrador da SESSÃO (`grupo_atual()`,
 * `corretor_atual()`): pela chave de serviço os dois viriam nulos, e a
 * função nem é executável por ela. Por isso as três escritas da função
 * (venda, divisão, parcelas) são refeitas aqui, com as MESMAS contas da tela
 * (`problemasDaVenda`, `resolverPar`, `valorDaImobiliaria`,
 * `dividirEmParcelas`) e o grupo explícito em toda leitura e escrita. Sem a
 * transação da função, uma falha na divisão ou nas parcelas apaga a venda
 * recém-criada (o cascade leva o resto).
 *
 * A venda pelo WhatsApp é sempre a forma simples da tela: um corretor com
 * 100% da venda, forma "repasse", uma parcela só com a comissão inteira,
 * paga pela construtora e sem data prevista. Divisão entre corretores,
 * parcelas e "recebe direto" ficam no painel, que edita a venda depois.
 */

type Supa = ReturnType<typeof createServiceClient>;

const OBSERVACAO = "Registrada pelo número central (WhatsApp).";

const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── Leituras do preparo ────────────────────────────────────────────────────

export type LeadDaVenda = {
  id: string;
  nome: string;
  corretorId: string | null;
  etapa: string;
  /** O imóvel de interesse, como a tela de venda nova já preenche. */
  imovelId: string | null;
};

export async function lerLeadDaVenda(
  supabase: Supa,
  p: { grupoId: string; leadId: string; soDoCorretor: string | null },
): Promise<LeadDaVenda | null> {
  let consulta = supabase
    .from("leads")
    .select("id, nome, corretor_id, etapa, imovel_interesse_id, empreendimento_id")
    .eq("id", p.leadId)
    .eq("grupo_id", p.grupoId)
    .is("arquivado_em", null);
  if (p.soDoCorretor) consulta = consulta.eq("corretor_id", p.soDoCorretor);
  const { data } = await consulta.maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    nome: data.nome?.trim() || "Cliente sem nome",
    corretorId: data.corretor_id,
    etapa: data.etapa,
    imovelId: data.imovel_interesse_id ?? data.empreendimento_id ?? null,
  };
}

export type ImovelDoCatalogo = { id: string; nome: string };

export type ImovelProcurado = { tipo: "um"; imovel: ImovelDoCatalogo } | { tipo: "varios"; opcoes: ImovelDoCatalogo[] } | { tipo: "nenhum" };

/**
 * O imóvel que a pessoa disse ("Vitta", "o 2 dorms do Vitta"), no catálogo
 * do grupo. O nome e os nomes alternativos (os apelidos que o porteiro já
 * usa) contam; palavras de sobra ("2 dorms do") não atrapalham: vale o
 * nome do imóvel aparecer no que foi dito, ou o que foi dito ser começo do
 * nome (`escolherLeadsPorNome`, a régua dos leads).
 */
export async function procurarImovelNoGrupo(supabase: Supa, grupoId: string, texto: string): Promise<ImovelProcurado> {
  const dito = ` ${normalizar(texto)} `;
  if (!dito.trim()) return { tipo: "nenhum" };
  const { data } = await supabase.from("empreendimentos").select("id, nome, nomes_alternativos").eq("grupo_id", grupoId).limit(1000);
  const catalogo = (data ?? []).map((e) => ({ id: e.id, nome: e.nome, nomes: [e.nome, ...(e.nomes_alternativos ?? [])].map(normalizar) }));
  const contidos = catalogo.filter((e) => e.nomes.some((n) => n.length >= 3 && dito.includes(` ${n} `)));
  const achados = contidos.length ? contidos : catalogo.filter((e) => escolherLeadsPorNome(texto, [{ id: e.id, nome: e.nome }]).tipo === "um");
  const opcoes = achados.map((e) => ({ id: e.id, nome: e.nome }));
  if (opcoes.length === 1) return { tipo: "um", imovel: opcoes[0] };
  return opcoes.length ? { tipo: "varios", opcoes: opcoes.slice(0, 4) } : { tipo: "nenhum" };
}

export async function nomeDoImovel(supabase: Supa, grupoId: string, imovelId: string): Promise<string | null> {
  const { data } = await supabase.from("empreendimentos").select("nome").eq("id", imovelId).eq("grupo_id", grupoId).maybeSingle();
  return data?.nome?.trim() || null;
}

/** A venda ativa que o lead já tem: registrar de novo duplicaria a comissão. */
export async function vendaAtivaDoLead(
  supabase: Supa,
  grupoId: string,
  leadId: string,
): Promise<{ id: string; dataVenda: string; valorVenda: number } | null> {
  const { data } = await supabase
    .from("vendas")
    .select("id, data_venda, valor_venda")
    .eq("grupo_id", grupoId)
    .eq("lead_id", leadId)
    .eq("status", "ativa")
    .limit(1)
    .maybeSingle();
  return data ? { id: data.id, dataVenda: data.data_venda, valorVenda: Number(data.valor_venda) } : null;
}

export type ComissaoDeReferencia = { percentual: number; de: "imovel" | "corretor" | "imobiliaria" };

/**
 * A comissão que a venda pelo WhatsApp propõe. A comissão muda por venda
 * (decisão de 25/09/2026) e o pedido falado quase nunca a traz ("fechei o
 * Vitta, 450 mil"), então o central propõe a mais provável e DIZ de onde ela
 * veio, para a pessoa conferir antes do "sim" (e corrigir no painel, que
 * edita a venda até a comissão entrar): a última venda do mesmo imóvel (a
 * construtora paga a mesma taxa), senão a última do corretor, senão a última
 * da imobiliária. Sem nenhuma, não há o que propor.
 */
export async function comissaoDeReferencia(
  supabase: Supa,
  p: { grupoId: string; imovelId: string | null; corretorId: string },
): Promise<ComissaoDeReferencia | null> {
  const ultima = async (filtro: { coluna: "empreendimento_id" | "corretor_id"; valor: string } | null) => {
    let consulta = supabase
      .from("vendas")
      .select("comissao_percentual")
      .eq("grupo_id", p.grupoId)
      .eq("status", "ativa")
      .not("comissao_percentual", "is", null);
    if (filtro) consulta = consulta.eq(filtro.coluna, filtro.valor);
    const { data } = await consulta.order("data_venda", { ascending: false }).limit(1).maybeSingle();
    const n = numero(data?.comissao_percentual);
    return n !== null && n > 0 && n <= 100 ? n : null;
  };
  if (p.imovelId) {
    const doImovel = await ultima({ coluna: "empreendimento_id", valor: p.imovelId });
    if (doImovel !== null) return { percentual: doImovel, de: "imovel" };
  }
  const doCorretor = await ultima({ coluna: "corretor_id", valor: p.corretorId });
  if (doCorretor !== null) return { percentual: doCorretor, de: "corretor" };
  const daCasa = await ultima(null);
  return daCasa !== null ? { percentual: daCasa, de: "imobiliaria" } : null;
}

/**
 * O repasse da última venda do corretor, como a tela de venda nova já
 * preenche (`getUltimoRepasse`), com o grupo explícito. Sem histórico, 0:
 * é o que a tela grava com o campo vazio.
 */
export async function ultimoRepasseNoGrupo(supabase: Supa, grupoId: string, corretorId: string): Promise<number | null> {
  const { data: partes } = await supabase
    .from("venda_participantes")
    .select("venda_id, repasse_percentual")
    .eq("grupo_id", grupoId)
    .eq("corretor_id", corretorId)
    .not("repasse_percentual", "is", null)
    .limit(100);
  if (!partes?.length) return null;
  const { data: recente } = await supabase
    .from("vendas")
    .select("id")
    .eq("grupo_id", grupoId)
    .in(
      "id",
      partes.map((p) => p.venda_id),
    )
    .order("data_venda", { ascending: false })
    .limit(1)
    .maybeSingle();
  const escolhida = partes.find((p) => p.venda_id === recente?.id) ?? partes[0];
  return numero(escolhida.repasse_percentual);
}

// ── Registrar ──────────────────────────────────────────────────────────────

export type VendaDoCentral = {
  leadId: string;
  /** O corretor da venda (100%): o dono do lead, ou quem pede se o lead não tem dono. */
  participanteId: string;
  imovelId: string | null;
  /** O nome do imóvel (do catálogo) ou o que a pessoa disse, se não está nele. */
  imovelDescricao: string;
  dataVenda: string;
  valorVenda: number;
  comissaoPercentual: number;
  repassePercentual: number;
};

export type VendaRegistrada =
  | { desfecho: "registrada"; vendaId: string; atualizadoEm: string; comissaoValor: number }
  | { desfecho: "ja_existe"; dataVenda: string; valorVenda: number }
  | { desfecho: "nao_achou" }
  | { desfecho: "recusado"; motivo: string }
  | { desfecho: "falhou" };

/**
 * Grava a venda. Confere tudo de novo, mesmo que a proposta já tenha
 * conferido (até 1 hora entre a proposta e o "sim"): o lead continua no
 * grupo (e do corretor, para corretor), o participante e o imóvel são do
 * grupo, o lead não ganhou outra venda e o mês não fechou. `corretor_id` da
 * venda é quem pediu: é o "registrador" das policies, o que pode editar e
 * excluir pela tela enquanto a comissão não entra.
 */
export async function registrarVendaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; registradorId: string; soDoCorretor: string | null; venda: VendaDoCentral },
): Promise<VendaRegistrada> {
  const v = p.venda;
  const problemas = problemasDaVenda(
    {
      leadId: v.leadId,
      empreendimentoId: v.imovelId,
      imovelDescricao: v.imovelDescricao,
      unidade: "",
      dataVenda: v.dataVenda,
      valorVenda: v.valorVenda,
      comissao: { modo: "percentual", numero: v.comissaoPercentual },
      observacao: OBSERVACAO,
      participantes: [{ corretorId: v.participanteId, partePercentual: 100, repasse: { modo: "percentual", numero: v.repassePercentual } }],
      parcelas: [],
    },
    hojeEmSaoPaulo(),
  );
  if (problemas.length > 0) return { desfecho: "recusado", motivo: problemas[0] };

  const lead = await lerLeadDaVenda(supabase, { grupoId: p.grupoId, leadId: v.leadId, soDoCorretor: p.soDoCorretor });
  if (!lead) return { desfecho: "nao_achou" };
  const { data: participante } = await supabase.from("corretores").select("id").eq("id", v.participanteId).eq("grupo_id", p.grupoId).maybeSingle();
  if (!participante) return { desfecho: "nao_achou" };
  const imovelNome = v.imovelId ? await nomeDoImovel(supabase, p.grupoId, v.imovelId) : null;
  if (v.imovelId && !imovelNome) return { desfecho: "recusado", motivo: "O imóvel não está mais no catálogo." };

  const jaTem = await vendaAtivaDoLead(supabase, p.grupoId, v.leadId);
  if (jaTem) return { desfecho: "ja_existe", dataVenda: jaTem.dataVenda, valorVenda: jaTem.valorVenda };
  const fechado = await recusaDoMesFechadoNoGrupo(supabase, p.grupoId, [v.dataVenda]);
  if (fechado) return { desfecho: "recusado", motivo: fechado };

  const comissao = resolverPar(v.valorVenda, { modo: "percentual", numero: v.comissaoPercentual });
  const repasse = resolverPar(comissao.valor, { modo: "percentual", numero: v.repassePercentual });
  const esperado = valorDaImobiliaria(comissao.valor, [{ formaRecebimento: "repasse", repasseValor: repasse.valor }]);
  const parcelas = esperado > 0 ? dividirEmParcelas(esperado, 1, null, "construtora") : [];

  const { data: venda, error } = await supabase
    .from("vendas")
    .insert({
      grupo_id: p.grupoId,
      corretor_id: p.registradorId,
      lead_id: v.leadId,
      empreendimento_id: v.imovelId,
      // O nome vai junto, como na função: se o imóvel sair do catálogo, a
      // venda continua dizendo o que foi vendido.
      imovel_descricao: (imovelNome ?? v.imovelDescricao).slice(0, 200),
      unidade: null,
      data_venda: v.dataVenda,
      valor_venda: v.valorVenda,
      comissao_percentual: comissao.percentual,
      comissao_valor: comissao.valor,
      observacao: OBSERVACAO,
    })
    .select("id, atualizado_em")
    .single();
  if (error || !venda) {
    console.error("[central] falha ao registrar a venda:", error?.message);
    return { desfecho: "falhou" };
  }

  const desfazerVenda = async (motivo: string) => {
    console.error(`[central] venda desfeita no meio (${motivo})`);
    await supabase.from("vendas").delete().eq("id", venda.id).eq("grupo_id", p.grupoId);
  };
  const { error: erroDaDivisao } = await supabase.from("venda_participantes").insert({
    grupo_id: p.grupoId,
    venda_id: venda.id,
    corretor_id: v.participanteId,
    parte_percentual: 100,
    repasse_percentual: repasse.percentual,
    repasse_valor: repasse.valor,
    forma_recebimento: "repasse",
  });
  if (erroDaDivisao) {
    await desfazerVenda(erroDaDivisao.message);
    return { desfecho: "falhou" };
  }
  if (parcelas.length > 0) {
    const { error: erroDasParcelas } = await supabase.from("venda_parcelas").insert(
      parcelas.map((pc) => ({ grupo_id: p.grupoId, venda_id: venda.id, numero: pc.numero, valor: pc.valor, pagador: pc.pagador, vence_em: pc.venceEm })),
    );
    if (erroDasParcelas) {
      await desfazerVenda(erroDasParcelas.message);
      return { desfecho: "falhou" };
    }
  }
  return { desfecho: "registrada", vendaId: venda.id, atualizadoEm: venda.atualizado_em, comissaoValor: comissao.valor };
}

// ── Desfazer ───────────────────────────────────────────────────────────────

export type VendaDesfeita = { desfecho: "desfeita" } | { desfecho: "mudou" } | { desfecho: "recusado"; motivo: string };

/**
 * O "desfaz" da venda (spec 4.6): exclui a venda, como o "Excluir" da tela,
 * só se NADA mudou desde o "sim": a venda segue ativa, de quem a registrou,
 * com o mesmo `atualizado_em` (editar pela tela muda), a parcela sem
 * recebimento, sem previsão e sem distrato, o repasse sem pagamento, sem
 * dado fiscal, e fora de mês fechado. Qualquer mudança é trabalho de outra
 * pessoa (o gestor marcou a previsão, o contador já recebeu o mês) e o
 * desfaz não passa por cima: a venda fica, e a resposta manda ao painel.
 */
export async function desfazerVendaPeloCentral(
  supabase: Supa,
  p: { grupoId: string; registradorId: string; vendaId: string; atualizadoEm: string },
): Promise<VendaDesfeita> {
  const { data: venda } = await supabase
    .from("vendas")
    .select("id, corretor_id, status, data_venda, atualizado_em")
    .eq("id", p.vendaId)
    .eq("grupo_id", p.grupoId)
    .maybeSingle();
  if (!venda || venda.corretor_id !== p.registradorId || venda.status !== "ativa" || venda.atualizado_em !== p.atualizadoEm) {
    return { desfecho: "mudou" };
  }
  const [{ data: parcelas }, { data: partes }, { data: fiscal }] = await Promise.all([
    supabase.from("venda_parcelas").select("recebida_em, cancelada_em, vence_em").eq("grupo_id", p.grupoId).eq("venda_id", p.vendaId),
    supabase.from("venda_participantes").select("repasse_pago_em, forma_recebimento").eq("grupo_id", p.grupoId).eq("venda_id", p.vendaId),
    supabase.from("venda_fiscal").select("venda_id").eq("grupo_id", p.grupoId).eq("venda_id", p.vendaId).maybeSingle(),
  ]);
  const parcelaMexida = (parcelas ?? []).some((pc) => pc.recebida_em || pc.cancelada_em || pc.vence_em);
  const repasseMexido = (partes ?? []).some((pt) => pt.repasse_pago_em || pt.forma_recebimento !== "repasse") || (partes ?? []).length !== 1;
  if (parcelaMexida || repasseMexido || fiscal) return { desfecho: "mudou" };
  const fechado = await recusaDoMesFechadoNoGrupo(supabase, p.grupoId, [venda.data_venda]);
  if (fechado) return { desfecho: "recusado", motivo: fechado };

  const { data, error } = await supabase
    .from("vendas")
    .delete()
    .eq("id", p.vendaId)
    .eq("grupo_id", p.grupoId)
    .eq("corretor_id", p.registradorId)
    .eq("atualizado_em", p.atualizadoEm)
    .select("id");
  if (error) console.error("[central] falha ao desfazer a venda:", error.message);
  return data?.length ? { desfecho: "desfeita" } : { desfecho: "mudou" };
}
