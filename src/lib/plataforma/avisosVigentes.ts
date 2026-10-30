import "server-only";

import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";
import { situacaoDoAviso, type AvisoAosClientes } from "./avisoAosClientes";

/**
 * Os avisos da Astro no ar agora (0242, 29/10/2026), para a faixa do painel.
 *
 * Pela chave de serviço porque `avisos_aos_clientes` não tem grant para
 * ninguém mais. A tabela é GLOBAL: o recado é da plataforma, não traz dado
 * de grupo nenhum, e quem filtra o público (papel) é a faixa, com
 * `avisosParaQuemVe`. Uma consulta só, coberta pelo índice parcial
 * `avisos_aos_clientes_vigentes_idx`, e deduplicada na requisição (`cache`):
 * o layout do painel não paga duas vezes.
 *
 * Falha de leitura devolve lista vazia (com log): sem aviso o painel segue
 * igual; derrubar o painel por causa de um recado seria pior.
 */
export const lerAvisosVigentes = cache(async function lerAvisosVigentes(): Promise<AvisoAosClientes[]> {
  const agora = new Date();
  const instante = agora.toISOString();
  try {
    const { data, error } = await createServiceClient()
      .from("avisos_aos_clientes")
      .select("id, titulo, texto, tipo, link, publico, inicio_em, fim_em, encerrado_em")
      .is("encerrado_em", null)
      .lte("inicio_em", instante)
      .or(`fim_em.is.null,fim_em.gt.${instante}`)
      .order("inicio_em", { ascending: false })
      .limit(5);
    if (error) {
      console.error(`[avisos da Astro] leitura falhou, o painel segue sem faixa: ${error.message}`);
      return [];
    }
    // A mesma régua do banco repetida aqui: um relógio diferente entre o
    // servidor e o banco não põe no ar o que já saiu.
    return (data ?? []).filter((a) => situacaoDoAviso(a, agora) === "no_ar");
  } catch (e) {
    console.error(`[avisos da Astro] leitura falhou, o painel segue sem faixa: ${(e as Error).message}`);
    return [];
  }
});
