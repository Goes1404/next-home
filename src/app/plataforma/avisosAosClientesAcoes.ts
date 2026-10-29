"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { validarAviso } from "@/lib/plataforma/avisoAosClientes";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Os avisos da Astro para todos os clientes (0242, 29/10/2026): publicar e
 * encerrar. A guarda da plataforma vem antes de tudo; a chave só depois
 * (mesma regra de `suporteAcoes.ts`). A validação é a do módulo puro, a
 * mesma que a prévia usa no navegador.
 *
 * O painel lê os avisos por requisição (`lerAvisosVigentes`), sem cache
 * entre requisições: o aviso publicado aparece na próxima tela que o
 * cliente abrir, e o encerrado some do mesmo jeito.
 */

export type ResultadoDoAviso = { ok: true; mensagem: string } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

export async function publicarAviso(
  _estadoAnterior: ResultadoDoAviso | undefined,
  formData: FormData,
): Promise<ResultadoDoAviso> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const validado = validarAviso({
    titulo: formData.get("titulo"),
    texto: formData.get("texto"),
    tipo: formData.get("tipo"),
    link: formData.get("link"),
    publico: formData.get("publico"),
    inicio: formData.get("inicio"),
    fim: formData.get("fim"),
  });
  if (!validado.ok) return validado;

  const { inicio_em, ...resto } = validado.aviso;
  const servico = createServiceClient();
  const { error } = await servico
    .from("avisos_aos_clientes")
    .insert({ ...resto, ...(inicio_em ? { inicio_em } : {}), criado_por: guarda.userId });
  if (error) {
    console.error(`[plataforma] aviso aos clientes não publicado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  console.info(`[plataforma] aviso aos clientes publicado por ${guarda.userId}`);
  revalidatePath("/plataforma/avisos");
  return { ok: true, mensagem: inicio_em ? "Aviso agendado." : "Aviso no ar: aparece na próxima tela que cada cliente abrir." };
}

/** Tira o aviso do ar agora (e cancela o agendado). Idempotente: o já encerrado fica como está. */
export async function encerrarAviso(id: string): Promise<ResultadoDoAviso> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(id)) return { ok: false, erro: "Aviso não encontrado." };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("avisos_aos_clientes")
    .update({ encerrado_em: new Date().toISOString() })
    .eq("id", id)
    .is("encerrado_em", null)
    .select("id");
  if (error) {
    console.error(`[plataforma] aviso ${id} não encerrado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  console.info(`[plataforma] aviso ${id} encerrado por ${guarda.userId} (${data?.length ?? 0} linha)`);
  revalidatePath("/plataforma/avisos");
  return { ok: true, mensagem: "Aviso encerrado." };
}
