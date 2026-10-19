import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * Leitura para o ADM contar o que acontece nas conversas da equipe SEM ler
 * nenhuma delas (30/09/2026, 0134).
 *
 * Desde a 0134 a RLS não deixa o gestor ler conversa, mensagem nem
 * telemetria de outro corretor: o número pareado costuma ser o WhatsApp
 * pessoal de cada um. Os painéis da Administração, porém, precisam de
 * CONTAGENS da equipe (conversas, tempo de resposta, falas por lead). Esses
 * números saem por aqui, com a chave de serviço, e só depois de conferir
 * que quem pede é o gestor.
 *
 * Regra de quem usa: pedir só contagem, id e data. Texto de mensagem,
 * prévia, memória e contexto da IA NUNCA passam por aqui, e
 * `admNaoLeConversa.test.ts` lê o código de quem chama para cobrar isso.
 *
 * Desde a plataforma multi-grupo (L16, L17) a chave de serviço NÃO sai
 * daqui crua: a resposta é uma {@link LeituraDoGrupo}, que só expõe consultas
 * já recortadas pelo grupo do gestor. Com o cliente cru, a Visão geral e o
 * WhatsApp da equipe somavam todos os grupos, e o gestor do grupo B via os
 * números do grupo A.
 */
export async function clienteParaNumerosDaEquipe(): Promise<LeituraDoGrupo> {
  const corretor = await getCorretorLogado();
  if (corretor?.papel !== "gestor") {
    throw new Error("Números da equipe são só do ADM.");
  }
  if (!corretor.grupoId) {
    throw new Error("Números da equipe exigem o grupo do gestor.");
  }
  return leituraDoGrupo(createServiceClient(), corretor.grupoId);
}

type Cliente = SupabaseClient<Database>;

/** Uma consulta que aceita o filtro do grupo (tabela com `grupo_id`). */
type FiltraPorGrupo<B> = { eq(coluna: "grupo_id", valor: string): B };

/**
 * Uma consulta que aceita o recorte pelos corretores do grupo. As views
 * ainda NÃO têm `grupo_id` (é a 0184 que o acrescenta): até lá o recorte
 * delas é por `corretor_id` entre os corretores do grupo.
 */
type FiltraPorCorretor<B> = { in(coluna: "corretor_id", valores: string[]): B };

/**
 * Leitura recortada por UM grupo, por cima de qualquer cliente: a chave de
 * serviço (o ADM, o relatório semanal) ou a sessão. Quem lê monta a consulta
 * (`(c) => c.from("x").select("...")`) e o filtro do grupo é sempre aplicado
 * por cima, aqui: não há como ler sem ele.
 */
export type LeituraDoGrupo = Awaited<ReturnType<typeof leituraDoGrupo>>;

export async function leituraDoGrupo(cliente: Cliente, grupoId: string) {
  const { data, error } = await cliente.from("corretores").select("id").eq("grupo_id", grupoId);
  if (error) throw new Error(`Corretores do grupo ilegíveis: ${error.message}`);
  const idsDoGrupo = (data ?? []).map((c) => c.id);

  return {
    grupoId,
    /** Consulta numa tabela, sempre com `grupo_id = <grupo>` por cima. */
    ler<B extends FiltraPorGrupo<B>>(montar: (c: Cliente) => B): B {
      return montar(cliente).eq("grupo_id", grupoId);
    },
    /** Consulta numa view, sempre com `corretor_id` entre os do grupo. */
    lerView<B extends FiltraPorCorretor<B>>(montar: (c: Cliente) => B): B {
      return montar(cliente).in("corretor_id", idsDoGrupo);
    },
  };
}
