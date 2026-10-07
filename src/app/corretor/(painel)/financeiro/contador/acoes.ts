"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { BUCKET_CONTABILIDADE, montarPacoteDoMes } from "@/lib/financeiro/contadorDados";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { site } from "@/lib/site";

/**
 * As ações do contador (0168). Toda função confere o gestor antes de tocar no
 * banco (Server Action é endpoint HTTP), e a RLS confere de novo. O arquivo
 * vai para o bucket privado pela chave de serviço, porque não há policy em
 * storage.objects para ninguém mais.
 */

export type ResultadoContador = { erro?: string; ok?: string; link?: string };

const ROTA = "/corretor/financeiro/contador";
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const TOKEN = /^[0-9a-f-]{36}$/i;

export async function fecharMes(mes: string): Promise<ResultadoContador> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!MES.test(mes)) return { erro: "Mês inválido." };
  if (mes >= hojeEmSaoPaulo().slice(0, 7)) return { erro: "Só dá para fechar um mês que já terminou." };

  const pacote = await montarPacoteDoMes(mes);
  if (!pacote.ok) return { erro: pacote.motivo };

  const caminho = `${mes}.xlsx`;
  const { error: erroUpload } = await createServiceClient()
    .storage.from(BUCKET_CONTABILIDADE)
    .upload(caminho, pacote.arquivo, {
      upsert: true,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  if (erroUpload) {
    console.error("[contador] falha ao guardar o pacote:", erroUpload.message);
    return { erro: "Não consegui guardar o arquivo do mês. Tente de novo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("meses_fechados").insert({
    mes: `${mes}-01`,
    arquivo_path: caminho,
    totais: pacote.totais,
    fechado_por: guarda.corretor.id,
  });
  if (error) {
    if (error.code === "23505") return { erro: "Este mês já está fechado." };
    console.error("[contador] falha ao fechar o mês:", error.message);
    return { erro: "Não foi possível fechar o mês agora." };
  }
  revalidatePath(ROTA);
  return { ok: "Mês fechado. O contador já pode baixar." };
}

export async function reabrirMes(mes: string): Promise<ResultadoContador> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!MES.test(mes)) return { erro: "Mês inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("meses_fechados").delete().eq("mes", `${mes}-01`).select("arquivo_path");
  if (error || !data?.length) return { erro: "Não foi possível reabrir o mês." };
  // Arquivo velho no bucket diria ao contador um número que deixou de valer.
  const { error: erroArquivo } = await createServiceClient().storage.from(BUCKET_CONTABILIDADE).remove([data[0].arquivo_path]);
  if (erroArquivo) console.error("[contador] mês reaberto, arquivo não removido:", erroArquivo.message);
  revalidatePath(ROTA);
  return { ok: "Mês reaberto. Avise o contador: o arquivo que ele tem deixou de valer." };
}

export async function criarAcessoContador(nome: string): Promise<ResultadoContador> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  const limpo = nome.trim().slice(0, 120);
  if (!limpo) return { erro: "Informe o nome do contador ou do escritório." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acessos_contador")
    .insert({ nome: limpo, criado_por: guarda.corretor.id })
    .select("token")
    .single();
  if (error || !data) {
    console.error("[contador] falha ao criar acesso:", error?.message);
    return { erro: "Não foi possível criar o link agora." };
  }
  revalidatePath(ROTA);
  return { ok: "Link criado. Copie e mande ao contador.", link: `${site.url}/contador/${data.token}` };
}

export async function revogarAcessoContador(token: string): Promise<ResultadoContador> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  if (!TOKEN.test(token)) return { erro: "Link inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("acessos_contador")
    .update({ revogado_em: new Date().toISOString() })
    .eq("token", token)
    .is("revogado_em", null)
    .select("token");
  if (error || !data?.length) return { erro: "Não foi possível revogar o link." };
  revalidatePath(ROTA);
  return { ok: "Link revogado. Ele deixou de funcionar." };
}
