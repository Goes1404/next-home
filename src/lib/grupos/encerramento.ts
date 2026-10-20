import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import {
  BUCKET_DAS_EXPORTACOES,
  DIAS_DE_RETENCAO,
  caminhoDaCopia,
  rotinaDeApagarLigada,
} from "./encerramentoRegras";
import { arquivoDoGrupo, FalhaNaExportacao, lerDadosDoGrupo, TIPO_XLSX } from "./exportacaoDoGrupo";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * A rotina dos 90 dias (resposta 7 do dono, operação enxuta de 20/10/2026).
 *
 * Roda no tique diário que já existe (`/api/cron/limpar-artes-ia`), não num
 * cron novo da Vercel (o Hobby tem teto de jobs e recusa o deploy inteiro
 * acima dele). DESLIGADA por padrão: só age com `APAGAR_GRUPOS_CANCELADOS=1`
 * no ambiente. Para ligar, ver a nota do vault
 * `encerramento-do-grupo-e-pedido-do-titular`.
 *
 * Um grupo por execução (o teto da função é 30 s), na ordem do cancelamento:
 *   1. gera a planilha do grupo e grava a cópia no bucket PRIVADO
 *      `exportacoes-de-grupos` — sem a cópia gravada, nada é apagado;
 *   2. anota o caminho em `grupos.exportacao_final_caminho` (o banco recusa
 *      apagar sem ele);
 *   3. chama `apagar_dados_do_grupo`, que recusa sozinho antes dos 90 dias,
 *      o grupo 1 e o grupo já apagado;
 *   4. só então apaga os logins de quem era do grupo (o Auth prende o
 *      e-mail), menos administrador da plataforma;
 *   5. registra um evento da PLATAFORMA (sem grupo), com o endereço do grupo
 *      e as contagens: nenhum nome de pessoa.
 *
 * Fica para depois (pendência declarada): os arquivos do grupo no Storage
 * público (fotos dos imóveis, artes) e as instâncias da Evolution.
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoDaRotina =
  | { ligada: false }
  | { ligada: true; apagado?: string; erro?: string; pendentes: number };

const DIA_MS = 86_400_000;

export async function apagarGruposCanceladosVencidos(opcoes: {
  env?: Record<string, string | undefined>;
  agora?: Date;
  servico?: Cliente;
} = {}): Promise<ResultadoDaRotina> {
  const env = opcoes.env ?? process.env;
  if (!rotinaDeApagarLigada(env)) return { ligada: false };
  const agora = opcoes.agora ?? new Date();
  const servico = opcoes.servico ?? createServiceClient();

  const limite = new Date(agora.getTime() - DIAS_DE_RETENCAO * DIA_MS).toISOString();
  const { data: vencidos, error } = await servico
    .from("grupos")
    .select("id, slug")
    .not("cancelado_em", "is", null)
    .lte("cancelado_em", limite)
    .is("dados_apagados_em", null)
    .neq("id", GRUPO_NEXT_HOME_ID)
    .order("cancelado_em")
    .limit(2);
  if (error) {
    console.error("[encerramento] grupos vencidos não lidos:", error.message);
    return { ligada: true, erro: "grupos vencidos não lidos", pendentes: 0 };
  }
  const lista = vencidos ?? [];
  if (lista.length === 0) return { ligada: true, pendentes: 0 };
  const grupo = lista[0];
  const pendentes = lista.length - 1;
  const falhou = (erro: string) => {
    console.error(`[encerramento] grupo ${grupo.slug}: ${erro}`);
    return { ligada: true as const, erro, pendentes: lista.length };
  };

  // 1. A cópia.
  let arquivo: Buffer;
  try {
    arquivo = arquivoDoGrupo(await lerDadosDoGrupo(servico, grupo.id));
  } catch (e) {
    if (!(e instanceof FalhaNaExportacao)) throw e;
    return falhou(`cópia não gerada (${e.message})`);
  }
  const caminho = caminhoDaCopia(grupo.id, agora);
  const { error: erroUpload } = await servico.storage
    .from(BUCKET_DAS_EXPORTACOES)
    .upload(caminho, arquivo, { contentType: TIPO_XLSX, upsert: true });
  if (erroUpload) return falhou(`cópia não gravada (${erroUpload.message})`);

  // 2. O caminho da cópia, que o banco exige antes de apagar.
  const { error: erroCaminho } = await servico
    .from("grupos")
    .update({ exportacao_final_caminho: caminho })
    .eq("id", grupo.id)
    .is("dados_apagados_em", null);
  if (erroCaminho) return falhou(`caminho da cópia não anotado (${erroCaminho.message})`);

  // Os logins são lidos antes: depois do passo 3 a ficha não existe mais.
  const { data: fichas, error: erroFichas } = await servico
    .from("corretores")
    .select("user_id")
    .eq("grupo_id", grupo.id)
    .not("user_id", "is", null);
  if (erroFichas) return falhou(`logins não lidos (${erroFichas.message})`);
  const logins = [...new Set((fichas ?? []).map((f) => f.user_id).filter((u): u is string => !!u))];

  // 3. Apagar.
  const { data: apagado, error: erroApagar } = await servico.rpc("apagar_dados_do_grupo", { p_grupo: grupo.id });
  if (erroApagar) return falhou(`banco recusou (${erroApagar.message})`);

  // 4. Os logins. Administrador da plataforma fica (ele é da plataforma,
  // não do grupo); falha num login vira log, não desfaz o que já foi feito.
  let loginsApagados = 0;
  for (const userId of logins) {
    const { count } = await servico
      .from("administradores_da_plataforma")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);
    if ((count ?? 0) > 0) continue;
    const { error: erroLogin } = await servico.auth.admin.deleteUser(userId);
    if (erroLogin) console.error(`[encerramento] login de ${grupo.slug} não apagado: ${erroLogin.message}`);
    else loginsApagados++;
  }

  // 5. O registro, da plataforma: o grupo não tem mais ninguém para lê-lo.
  const resumo = (apagado ?? {}) as { linhas?: number };
  const { error: erroEvento } = await servico.from("admin_eventos").insert({
    grupo_id: null,
    acao: "dados_do_grupo_apagados",
    ator_id: null,
    ator_plataforma_user_id: null,
    alvo_corretor_id: null,
    detalhes: {
      origem: "plataforma",
      slug: grupo.slug,
      linhas: resumo.linhas ?? null,
      logins_apagados: loginsApagados,
      copia: caminho,
    },
  });
  if (erroEvento) console.error(`[encerramento] evento de ${grupo.slug} não gravado: ${erroEvento.message}`);

  return { ligada: true, apagado: grupo.slug, pendentes };
}
