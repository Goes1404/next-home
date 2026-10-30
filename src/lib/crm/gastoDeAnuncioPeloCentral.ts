import "server-only";

import { escolherLeadsPorNome } from "@/lib/agenda/comandos/escolherLead";
import { normalizar } from "@/lib/agenda/comandos/normalizar";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * O gasto de anúncio informado pelo número central (onda 2, 30/10/2026;
 * spec do CRM pelo WhatsApp 3.7 item 25): "gastei 300 no anúncio do Vitta".
 * Em 29/10, 13 de 19 anúncios estavam sem valor; é o que falta para Anúncios
 * pagos medir custo por cliente.
 *
 * As regras são as de `salvarGastoDoImpulsionamento` (a tela): o valor é o
 * total gasto ATÉ o dia (0133), uma linha por campanha e dia (salvar de novo
 * no mesmo dia corrige), e `impulsionamentos.valor_gasto` passa a ser o do
 * registro mais recente. Só muda o escopo: pelo central o gestor também
 * informa o gasto dos anúncios do grupo (decisão da onda 2: é ele quem paga a
 * conta da Meta). A linha do dia fica sempre com o dono da campanha, que é o
 * que a tabela exige (`corretor_id` = o dono).
 */

type Supa = ReturnType<typeof createServiceClient>;

export type CampanhaDoGrupo = {
  id: string;
  nome: string;
  donoId: string;
  imovel: string | null;
  valorGasto: number | null;
};

/** O nome que a lista de Anúncios pagos mostra (`nomeDoResumo`). */
function nomeNaTela(l: { titulo: string | null; criada_pelo_corretor: boolean }): string {
  return l.titulo?.trim() || (l.criada_pelo_corretor ? "Campanha sem nome" : "Post impulsionado");
}

/**
 * As campanhas de cima da lista (o anúncio agrupado numa campanha não tem
 * gasto próprio na tela: conta no da campanha). Corretor: só as dele.
 */
export async function campanhasDoGrupo(supabase: Supa, p: { grupoId: string; soDoCorretor: string | null }): Promise<CampanhaDoGrupo[]> {
  let consulta = supabase
    .from("impulsionamentos")
    .select("id, corretor_id, titulo, empreendimento_id, valor_gasto, criada_pelo_corretor, agrupado_em, ultimo_lead_em")
    .eq("grupo_id", p.grupoId)
    .is("agrupado_em", null);
  if (p.soDoCorretor) consulta = consulta.eq("corretor_id", p.soDoCorretor);
  const { data } = await consulta.order("ultimo_lead_em", { ascending: false }).limit(300);
  const linhas = data ?? [];
  const idsDosImoveis = [...new Set(linhas.map((l) => l.empreendimento_id).filter((id): id is string => !!id))];
  const { data: imoveis } = idsDosImoveis.length
    ? await supabase.from("empreendimentos").select("id, nome").eq("grupo_id", p.grupoId).in("id", idsDosImoveis)
    : { data: [] as { id: string; nome: string }[] };
  const nomeDoImovel = new Map((imoveis ?? []).map((i) => [i.id, i.nome]));
  return linhas.map((l) => ({
    id: l.id,
    nome: nomeNaTela(l),
    donoId: l.corretor_id,
    imovel: l.empreendimento_id ? (nomeDoImovel.get(l.empreendimento_id) ?? null) : null,
    valorGasto: l.valor_gasto === null ? null : Number(l.valor_gasto),
  }));
}

/** O que sobra do pedido sem as palavras de ligação ("o anúncio do Vitta" → "vitta"). */
const PALAVRAS_DE_LIGACAO = new Set(["o", "a", "os", "as", "do", "da", "de", "dos", "das", "no", "na", "anuncio", "anuncios", "campanha", "campanhas", "post", "impulsionamento", "impulsionado"]);

/**
 * Qual campanha a pessoa disse. Nome igual ganha; senão o nome da campanha
 * contém o pedido, ou o pedido traz o nome do imóvel da campanha ("anúncio
 * do Vitta"); senão a régua dos leads (cada palavra é começo de uma palavra
 * do nome).
 */
export function escolherCampanha(pedido: string, campanhas: CampanhaDoGrupo[]): CampanhaDoGrupo[] {
  const chave = normalizar(pedido)
    .split(" ")
    .filter((p) => p && !PALAVRAS_DE_LIGACAO.has(p))
    .join(" ");
  if (!chave) return [];
  const dito = ` ${chave} `;
  const exatas = campanhas.filter((c) => normalizar(c.nome) === chave);
  if (exatas.length) return exatas;
  // Pelo nome OU pelo imóvel, juntos: "Vitta" casa com "Vitta stories" e
  // com "Reels outubro" (do Vitta), e duas campanhas viram pergunta em vez
  // de o gasto cair na que tem o nome parecido.
  const casadas = campanhas.filter(
    (c) =>
      ` ${normalizar(c.nome)} `.includes(dito) ||
      (c.imovel && normalizar(c.imovel).length >= 3 && dito.includes(` ${normalizar(c.imovel)} `)),
  );
  if (casadas.length) return casadas;
  return campanhas.filter((c) => escolherLeadsPorNome(chave, [{ id: c.id, nome: c.nome }]).tipo === "um");
}

/** O que o desfaz precisa para voltar ao gasto de antes. */
export type RegistroDoGasto = {
  impulsionamentoId: string;
  dia: string;
  valor: number;
  /** O valor da linha do dia antes do central (null = a linha não existia). */
  pontoAntes: number | null;
  valorGastoAntes: number | null;
  gastoInformadoEmAntes: string | null;
};

export type GastoInformado = { desfecho: "informado"; total: number; registro: RegistroDoGasto } | { desfecho: "nao_achou" } | { desfecho: "falhou" };

/**
 * Grava o ponto do dia e recalcula o total, como a tela. Lê e decide entre
 * insert e update (não upsert), igual a `registrarPontoDeGasto`. O "antes"
 * é capturado aqui, no momento de gravar: é ele que o desfaz devolve.
 */
export async function informarGastoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; soDoCorretor: string | null; impulsionamentoId: string; dia: string; valor: number },
): Promise<GastoInformado> {
  let consulta = supabase
    .from("impulsionamentos")
    .select("id, corretor_id, valor_gasto, gasto_informado_em")
    .eq("id", p.impulsionamentoId)
    .eq("grupo_id", p.grupoId);
  if (p.soDoCorretor) consulta = consulta.eq("corretor_id", p.soDoCorretor);
  const { data: campanha } = await consulta.maybeSingle();
  if (!campanha) return { desfecho: "nao_achou" };

  const { data: existente } = await supabase
    .from("impulsionamento_gastos")
    .select("id, valor_acumulado")
    .eq("grupo_id", p.grupoId)
    .eq("impulsionamento_id", p.impulsionamentoId)
    .eq("dia", p.dia)
    .maybeSingle();
  // O "antes" sai das linhas lidas AGORA, antes de qualquer escrita.
  const pontoAntes = existente ? Number(existente.valor_acumulado) : null;
  const valorGastoAntes = campanha.valor_gasto === null ? null : Number(campanha.valor_gasto);
  const gastoInformadoEmAntes = campanha.gasto_informado_em;
  const { error } = existente
    ? await supabase.from("impulsionamento_gastos").update({ valor_acumulado: p.valor }).eq("id", existente.id).eq("grupo_id", p.grupoId)
    : await supabase.from("impulsionamento_gastos").insert({
        grupo_id: p.grupoId,
        impulsionamento_id: p.impulsionamentoId,
        corretor_id: campanha.corretor_id,
        dia: p.dia,
        valor_acumulado: p.valor,
      });
  if (error) {
    console.error("[central] falha ao registrar o gasto do dia:", error.message);
    return { desfecho: "falhou" };
  }

  const total = (await ultimoPonto(supabase, p.grupoId, p.impulsionamentoId)) ?? p.valor;
  const { error: erroDoTotal } = await supabase
    .from("impulsionamentos")
    .update({ valor_gasto: total, gasto_informado_em: new Date().toISOString() })
    .eq("id", p.impulsionamentoId)
    .eq("grupo_id", p.grupoId);
  if (erroDoTotal) {
    console.error("[central] falha ao gravar o total do anúncio:", erroDoTotal.message);
    return { desfecho: "falhou" };
  }
  return {
    desfecho: "informado",
    total,
    registro: {
      impulsionamentoId: p.impulsionamentoId,
      dia: p.dia,
      valor: p.valor,
      pontoAntes,
      valorGastoAntes,
      gastoInformadoEmAntes,
    },
  };
}

async function ultimoPonto(supabase: Supa, grupoId: string, impulsionamentoId: string): Promise<number | null> {
  const { data } = await supabase
    .from("impulsionamento_gastos")
    .select("valor_acumulado")
    .eq("grupo_id", grupoId)
    .eq("impulsionamento_id", impulsionamentoId)
    .order("dia", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? Number(data.valor_acumulado) : null;
}

/**
 * O "desfaz" do gasto (spec 4.6): a linha do dia volta ao valor de antes (ou
 * sai, se o central a criou) e o total volta a ser o do registro mais
 * recente que sobrou. Só se a linha do dia ainda está como o central deixou:
 * se alguém corrigiu o gasto depois, a correção é mais nova e fica.
 */
export async function desfazerGastoPeloCentral(
  supabase: Supa,
  p: { grupoId: string; soDoCorretor: string | null; registro: RegistroDoGasto },
): Promise<{ desfecho: "desfeito"; total: number | null } | { desfecho: "mudou" }> {
  const r = p.registro;
  let consulta = supabase.from("impulsionamentos").select("id").eq("id", r.impulsionamentoId).eq("grupo_id", p.grupoId);
  if (p.soDoCorretor) consulta = consulta.eq("corretor_id", p.soDoCorretor);
  const { data: campanha } = await consulta.maybeSingle();
  if (!campanha) return { desfecho: "mudou" };

  const { data: ponto } = await supabase
    .from("impulsionamento_gastos")
    .select("id, valor_acumulado")
    .eq("grupo_id", p.grupoId)
    .eq("impulsionamento_id", r.impulsionamentoId)
    .eq("dia", r.dia)
    .maybeSingle();
  if (!ponto || Number(ponto.valor_acumulado) !== r.valor) return { desfecho: "mudou" };

  const { error } =
    r.pontoAntes === null
      ? await supabase.from("impulsionamento_gastos").delete().eq("id", ponto.id).eq("grupo_id", p.grupoId)
      : await supabase.from("impulsionamento_gastos").update({ valor_acumulado: r.pontoAntes }).eq("id", ponto.id).eq("grupo_id", p.grupoId);
  if (error) throw new Error(`desfazer gasto: ${error.message}`);

  // Sem linha nenhuma (a campanha antiga só tinha o total), volta o total
  // que estava; com linhas, o total é o do registro mais recente, como na tela.
  const restante = await ultimoPonto(supabase, p.grupoId, r.impulsionamentoId);
  const total = restante ?? r.valorGastoAntes;
  await supabase
    .from("impulsionamentos")
    .update({ valor_gasto: total, gasto_informado_em: total === null ? null : r.gastoInformadoEmAntes })
    .eq("id", r.impulsionamentoId)
    .eq("grupo_id", p.grupoId);
  return { desfecho: "desfeito", total };
}
