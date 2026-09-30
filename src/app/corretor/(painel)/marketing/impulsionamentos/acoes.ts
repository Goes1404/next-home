"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { CANAIS_DE_CAMPANHA, lerValorEmReais } from "@/lib/crm/impulsionamentosCalculo";
import { createClient } from "@/lib/supabase/server";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";

type Resultado = { ok?: string; erro?: string };

const ROTA = "/corretor/marketing/impulsionamentos";
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function lerGasto(entrada: string): number | null | "invalido" {
  const valor = lerValorEmReais(entrada);
  if (valor !== null && (Number.isNaN(valor) || valor > 1_000_000)) return "invalido";
  return valor;
}

const VALOR_INVALIDO = "Não entendi o valor. Escreva só o número, por exemplo 50 ou 49,90.";

type Cliente = Awaited<ReturnType<typeof createClient>>;

/**
 * Grava "até este dia, a campanha tinha gastado X" (0133). Uma linha por
 * campanha e dia; salvar de novo no mesmo dia corrige. Ler e decidir entre
 * insert e update, e não upsert: com grant por coluna, o upsert tenta
 * atualizar a chave também e é recusado.
 */
async function registrarPontoDeGasto(
  supabase: Cliente,
  corretorId: string,
  impulsionamentoId: string,
  dia: string,
  valor: number,
): Promise<boolean> {
  const { data: existente } = await supabase
    .from("impulsionamento_gastos")
    .select("id")
    .eq("impulsionamento_id", impulsionamentoId)
    .eq("dia", dia)
    .maybeSingle();
  const { error } = existente
    ? await supabase.from("impulsionamento_gastos").update({ valor_acumulado: valor }).eq("id", existente.id)
    : await supabase.from("impulsionamento_gastos").insert({
        impulsionamento_id: impulsionamentoId,
        corretor_id: corretorId,
        dia,
        valor_acumulado: valor,
      });
  if (error) console.error("[campanhas] falha ao registrar o gasto do dia:", error.message);
  return !error;
}

/** O dia informado, ou hoje em São Paulo. Dia no futuro não vale. */
function diaDoGasto(entrada: string | undefined): string | "futuro" {
  const hoje = hojeEmSaoPaulo();
  if (!entrada || !DATA.test(entrada)) return hoje;
  return entrada > hoje ? "futuro" : entrada;
}

/**
 * O corretor informa quanto já tinha gastado até um dia (hoje, por padrão),
 * e, se quiser, de qual imóvel era. O valor da linha passa a ser o do
 * registro mais recente; os anteriores ficam na linha do tempo do custo.
 * Apagar o valor apaga a linha do tempo inteira.
 */
export async function salvarGastoDoImpulsionamento(params: {
  id: string;
  valor: string;
  empreendimentoId: string | null;
  dia?: string;
}): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const valor = lerGasto(params.valor);
  if (valor === "invalido") return { erro: VALOR_INVALIDO };
  const dia = diaDoGasto(params.dia);
  if (dia === "futuro") return { erro: "O dia do gasto não pode ser no futuro." };

  const supabase = await createClient();
  const { data: dono } = await supabase
    .from("impulsionamentos")
    .select("id")
    .eq("id", params.id)
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  // O anúncio de outro corretor: o gestor vê, mas não edita.
  if (!dono) return { erro: "Só quem fez o anúncio pode informar o gasto." };

  let total: number | null = null;
  if (valor === null) {
    await supabase.from("impulsionamento_gastos").delete().eq("impulsionamento_id", params.id);
  } else {
    if (!(await registrarPontoDeGasto(supabase, corretor.id, params.id, dia, valor))) {
      return { erro: "Não consegui salvar agora. Tente de novo." };
    }
    const { data: ultimo } = await supabase
      .from("impulsionamento_gastos")
      .select("valor_acumulado")
      .eq("impulsionamento_id", params.id)
      .order("dia", { ascending: false })
      .limit(1)
      .maybeSingle();
    total = ultimo ? Number(ultimo.valor_acumulado) : valor;
  }

  const { error } = await supabase
    .from("impulsionamentos")
    .update({
      valor_gasto: total,
      gasto_informado_em: total === null ? null : new Date().toISOString(),
      empreendimento_id: params.empreendimentoId || null,
    })
    .eq("id", params.id);
  if (error) return { erro: "Não consegui salvar agora. Tente de novo." };

  revalidatePath(ROTA);
  if (valor === null) return { ok: "Gasto apagado." };
  if (total !== valor) {
    return { ok: "Gasto registrado nesse dia. O total continua sendo o do registro mais recente." };
  }
  return { ok: "Gasto salvo. O custo por cliente já foi recalculado." };
}

/**
 * Campanha cadastrada pelo corretor (0132): antes de render, ou de um canal
 * que o webhook não reconhece sozinho. A chave `manual:<uuid>` é exigida pela
 * policy — sem ela o corretor poderia forjar a linha de um anúncio da Meta.
 */
export async function criarCampanha(params: {
  nome: string;
  canal: string;
  valor: string;
  empreendimentoId: string | null;
  inicio: string;
  fim: string;
}): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const nome = params.nome.trim().slice(0, 120);
  if (nome.length < 2) return { erro: "Dê um nome à campanha, por exemplo \"Vitra - outubro\"." };
  if (!(params.canal in CANAIS_DE_CAMPANHA)) return { erro: "Escolha onde a campanha roda." };
  const valor = lerGasto(params.valor);
  if (valor === "invalido") return { erro: VALOR_INVALIDO };
  const inicio = DATA.test(params.inicio) ? params.inicio : null;
  const fim = DATA.test(params.fim) ? params.fim : null;
  if (inicio && fim && fim < inicio) return { erro: "O fim não pode ser antes do início." };

  const agora = new Date().toISOString();
  const chave = `manual:${randomUUID()}`;
  const supabase = await createClient();
  const { error } = await supabase.from("impulsionamentos").insert({
    corretor_id: corretor.id,
    chave,
    criada_pelo_corretor: true,
    titulo: nome,
    canal: params.canal as keyof typeof CANAIS_DE_CAMPANHA,
    valor_gasto: valor,
    gasto_informado_em: valor === null ? null : agora,
    empreendimento_id: params.empreendimentoId || null,
    inicio,
    fim,
    primeiro_lead_em: agora,
    ultimo_lead_em: agora,
  });
  if (error) {
    console.error("[campanhas] falha ao criar:", error.message);
    return { erro: "Não consegui criar a campanha agora. Tente de novo." };
  }

  if (valor !== null) {
    const { data: criada } = await supabase
      .from("impulsionamentos")
      .select("id")
      .eq("chave", chave)
      .maybeSingle();
    // Falhar aqui não desfaz a campanha: o total fica em `valor_gasto`, e a
    // linha do tempo usa o total quando não há registro com data.
    if (criada) await registrarPontoDeGasto(supabase, corretor.id, criada.id, hojeEmSaoPaulo(), valor);
  }

  revalidatePath(ROTA);
  return { ok: "Campanha criada." };
}

/** Apaga uma campanha que o próprio corretor criou. Os clientes ficam; só perdem o vínculo. */
export async function apagarCampanha(id: string): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impulsionamentos")
    .delete()
    .eq("id", id)
    .eq("criada_pelo_corretor", true)
    .select("id");
  if (error) return { erro: "Não consegui apagar agora. Tente de novo." };
  if (!data?.length) return { erro: "Só dá para apagar uma campanha que você mesmo criou." };

  revalidatePath(ROTA);
  return { ok: "Campanha apagada. Os clientes continuam na sua carteira." };
}

/**
 * Coloca um anúncio detectado dentro de uma campanha do corretor (ou tira,
 * com `campanhaId` nulo). A policy confere que a campanha é dele e é manual.
 */
export async function agruparAnuncio(params: {
  anuncioId: string;
  campanhaId: string | null;
}): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("impulsionamentos")
    .update({ agrupado_em: params.campanhaId || null })
    .eq("id", params.anuncioId)
    .eq("criada_pelo_corretor", false)
    .select("id");
  if (error) return { erro: "Não consegui mover o anúncio agora. Tente de novo." };
  if (!data?.length) return { erro: "Só quem fez o anúncio pode colocá-lo numa campanha." };

  revalidatePath(ROTA);
  return { ok: params.campanhaId ? "Anúncio colocado na campanha." : "Anúncio tirado da campanha." };
}

/**
 * Diz de qual campanha vieram clientes de outro canal. Cliente que chegou
 * pela etiqueta da Meta não entra aqui: ele já é contado pelo anúncio.
 */
export async function vincularClientes(params: {
  campanhaId: string;
  leadIds: string[];
}): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const ids = [...new Set(params.leadIds)].slice(0, 200);
  if (ids.length === 0) return { erro: "Marque pelo menos um cliente." };

  const supabase = await createClient();
  const { data: campanha } = await supabase
    .from("impulsionamentos")
    .select("id")
    .eq("id", params.campanhaId)
    .eq("corretor_id", corretor.id)
    .eq("criada_pelo_corretor", true)
    .maybeSingle();
  if (!campanha) return { erro: "Só dá para ligar clientes a uma campanha sua." };

  const { data, error } = await supabase
    .from("leads")
    .update({ impulsionamento_id: params.campanhaId })
    .in("id", ids)
    .eq("corretor_id", corretor.id)
    .is("meta_ad_id", null)
    .select("id");
  if (error) return { erro: "Não consegui salvar agora. Tente de novo." };

  revalidatePath(ROTA);
  const n = data?.length ?? 0;
  return { ok: n === 1 ? "1 cliente ligado à campanha." : `${n} clientes ligados à campanha.` };
}

/** Tira um cliente da campanha em que o corretor o tinha colocado. */
export async function desvincularCliente(leadId: string): Promise<Resultado> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ impulsionamento_id: null })
    .eq("id", leadId)
    .eq("corretor_id", corretor.id);
  if (error) return { erro: "Não consegui salvar agora. Tente de novo." };

  revalidatePath(ROTA);
  return { ok: "Cliente tirado da campanha." };
}
