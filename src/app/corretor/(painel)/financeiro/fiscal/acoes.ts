"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { problemasDosDadosFiscais, soDigitos, documentoValido, type DadosFiscaisDaVenda, type Regime } from "@/lib/financeiro/fiscal";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";

/**
 * As ações do fiscal (0167). Toda função confere o gestor antes de tocar no
 * banco (Server Action é endpoint HTTP), e a RLS confere de novo.
 */

export type ResultadoFiscal = { erro?: string; ok?: string };

const ROTA = "/corretor/financeiro/fiscal";
const textoOuNulo = (v: string | null) => (v && v.trim() ? v.trim().slice(0, 200) : null);
const docOuNulo = (v: string | null) => (v && soDigitos(v) ? soDigitos(v) : null);

export async function salvarConfigFiscal(c: {
  regime: Regime;
  aliquotaSimples: number;
  aliquotaIss: number;
  tetoInss: number;
  cnpj: string | null;
  razaoSocial: string | null;
}): Promise<ResultadoFiscal> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };

  if (c.regime !== "simples" && c.regime !== "presumido") return { erro: "Regime inválido." };
  if (!(c.aliquotaSimples >= 0 && c.aliquotaSimples <= 0.5)) return { erro: "A alíquota do Simples deve ficar entre 0% e 50%." };
  if (!(c.aliquotaIss >= 0 && c.aliquotaIss <= 0.1)) return { erro: "O ISS deve ficar entre 0% e 10%." };
  if (!(c.tetoInss > 0)) return { erro: "Informe o teto do INSS." };
  const cnpj = docOuNulo(c.cnpj);
  if (cnpj && (cnpj.length !== 14 || !documentoValido(cnpj))) return { erro: "O CNPJ da imobiliária não confere." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("fiscal_config")
    .update({
      regime: c.regime,
      aliquota_simples: c.aliquotaSimples,
      aliquota_iss: c.aliquotaIss,
      teto_inss: c.tetoInss,
      cnpj,
      razao_social: textoOuNulo(c.razaoSocial),
      conferido_em: hojeEmSaoPaulo(),
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    console.error("[fiscal] falha ao salvar a configuração:", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath(ROTA);
  return { ok: "Configuração salva." };
}

export async function salvarDadosFiscaisDaVenda(f: DadosFiscaisDaVenda): Promise<ResultadoFiscal> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!/^[0-9a-f-]{36}$/i.test(f.vendaId)) return { erro: "Venda inválida." };

  const limpo = {
    compradorNome: textoOuNulo(f.compradorNome),
    compradorDocumento: docOuNulo(f.compradorDocumento),
    vendedorNome: textoOuNulo(f.vendedorNome),
    vendedorDocumento: docOuNulo(f.vendedorDocumento),
    notaNumero: f.notaNumero?.trim() ? f.notaNumero.trim().slice(0, 40) : null,
    notaEmitidaEm: f.notaEmitidaEm || null,
  };
  const problemas = problemasDosDadosFiscais(limpo);
  if (problemas.length > 0) return { erro: problemas[0] };

  const supabase = await createClient();
  const linha = {
    comprador_nome: limpo.compradorNome,
    comprador_documento: limpo.compradorDocumento,
    vendedor_nome: limpo.vendedorNome,
    vendedor_documento: limpo.vendedorDocumento,
    nota_numero: limpo.notaNumero,
    nota_emitida_em: limpo.notaEmitidaEm,
    atualizado_em: new Date().toISOString(),
  };
  const { data: existe, error: erroLer } = await supabase.from("venda_fiscal").select("venda_id").eq("venda_id", f.vendaId).maybeSingle();
  if (erroLer) {
    console.error("[fiscal] falha ao ler a venda:", erroLer.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  const { error } = existe
    ? await supabase.from("venda_fiscal").update(linha).eq("venda_id", f.vendaId)
    : await supabase.from("venda_fiscal").insert({ venda_id: f.vendaId, ...linha });
  if (error) {
    console.error("[fiscal] falha ao salvar a venda:", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath(ROTA);
  return { ok: "Dados fiscais salvos." };
}

export async function definirVinculoDoCorretor(corretorId: string, vinculo: "autonomo" | "pj"): Promise<ResultadoFiscal> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (vinculo !== "autonomo" && vinculo !== "pj") return { erro: "Vínculo inválido." };
  if (!/^[0-9a-f-]{36}$/i.test(corretorId)) return { erro: "Corretor inválido." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("corretor_fiscal")
    .upsert({ corretor_id: corretorId, vinculo, atualizado_em: new Date().toISOString() }, { onConflict: "corretor_id" });
  if (error) {
    console.error("[fiscal] falha ao salvar o vínculo:", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath(ROTA);
  return { ok: vinculo === "pj" ? "Corretor marcado como PJ: sem RPA." : "Corretor marcado como autônomo: recebe por RPA." };
}
