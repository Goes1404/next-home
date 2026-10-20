import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_DOCUMENTOS } from "@/lib/crm/envioAutorizado";
import { BUCKET_CONTABILIDADE } from "@/lib/financeiro/contadorDados";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";
import { apagarPasta, pastasDaRaiz, type BucketDoStorage } from "./arquivosPrivados";
import {
  BUCKET_DAS_EXPORTACOES,
  DIAS_DA_COPIA_FINAL,
  DIAS_DE_RETENCAO,
  caminhoDaCopia,
  ordemDeApagar,
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
 * Um grupo por execução (o teto da função é 30 s). A ordem é a de
 * `ordemDeApagar`: quem falhou vai para o fim da fila, senão um grupo que
 * falha sempre travaria todos os outros. Para o grupo da vez:
 *   1. gera a planilha do grupo e grava a cópia no bucket PRIVADO
 *      `exportacoes-de-grupos` — sem a cópia gravada, nada é apagado;
 *   2. anota o caminho e o instante da cópia em `grupos` (o banco recusa
 *      apagar sem eles, e recusa se entrou lead ou venda depois da cópia);
 *   3. lê os logins de quem era do grupo e quais deles são administradores
 *      da plataforma. Se a leitura falha, PARA: "não sei se é administrador"
 *      não pode virar "apaga o login";
 *   4. apaga os arquivos PRIVADOS do grupo: `documentos-clientes/<lead>/`
 *      (documentos e mídia recebida no WhatsApp) e `contabilidade/<grupo>/`
 *      (pacotes do contador, com CPF/CNPJ). Antes das linhas: depois delas não
 *      haveria mais como saber de quem é cada pasta. Falhou, para (e repete
 *      no próximo tique: apagar pasta é idempotente);
 *   5. chama `apagar_dados_do_grupo`, que recusa sozinho antes dos 90 dias,
 *      o grupo 1 e o grupo já apagado;
 *   6. só então apaga os logins (o Auth prende o e-mail), menos administrador
 *      da plataforma;
 *   7. registra um evento da PLATAFORMA (sem grupo), com o endereço do grupo
 *      e as contagens: nenhum nome de pessoa.
 *
 * Toda falha fica em `grupos.falha_ao_apagar` (a tela do grupo mostra) e num
 * evento da plataforma, além do log.
 *
 * Também no mesmo tique: a cópia final guardada é apagada 30 dias depois dos
 * dados (`apagarCopiasFinaisVencidas`).
 *
 * Fica para depois (pendência declarada): os arquivos do grupo no Storage
 * público (fotos dos imóveis, artes), pastas de `documentos-clientes` de
 * leads que já tinham sido excluídos antes (não há mais como ligá-las ao
 * grupo) e as instâncias da Evolution.
 */

type Cliente = SupabaseClient<Database>;

export type ResultadoDaRotina =
  | { ligada: false }
  | { ligada: true; apagado?: string; erro?: string; pendentes: number; copiasApagadas?: number };

const DIA_MS = 86_400_000;
/** Quantos grupos vencidos a rotina lê para escolher a vez (não processa todos). */
const CANDIDATOS = 20;
/** Quantas cópias finais vencidas apaga por tique. */
const COPIAS_POR_TIQUE = 10;

async function registrarFalha(servico: Cliente, grupo: { id: string; slug: string }, erro: string, agora: Date) {
  const { error: erroGrupo } = await servico
    .from("grupos")
    .update({ tentativa_de_apagar_em: agora.toISOString(), falha_ao_apagar: erro.slice(0, 300) })
    .eq("id", grupo.id)
    .is("dados_apagados_em", null);
  if (erroGrupo) console.error(`[encerramento] falha de ${grupo.slug} não anotada no grupo: ${erroGrupo.message}`);
  const { error: erroEvento } = await servico.from("admin_eventos").insert({
    grupo_id: null,
    acao: "falha_ao_apagar_dados_do_grupo",
    ator_id: null,
    ator_plataforma_user_id: null,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", slug: grupo.slug, erro: erro.slice(0, 300) },
  });
  if (erroEvento) console.error(`[encerramento] evento da falha de ${grupo.slug} não gravado: ${erroEvento.message}`);
}

export async function apagarGruposCanceladosVencidos(opcoes: {
  env?: Record<string, string | undefined>;
  agora?: Date;
  servico?: Cliente;
} = {}): Promise<ResultadoDaRotina> {
  const env = opcoes.env ?? process.env;
  if (!rotinaDeApagarLigada(env)) return { ligada: false };
  const agora = opcoes.agora ?? new Date();
  const servico = opcoes.servico ?? createServiceClient();

  const copiasApagadas = await apagarCopiasFinaisVencidas(servico, agora);

  const limite = new Date(agora.getTime() - DIAS_DE_RETENCAO * DIA_MS).toISOString();
  const { data: vencidos, error } = await servico
    .from("grupos")
    .select("id, slug, cancelado_em, tentativa_de_apagar_em")
    .not("cancelado_em", "is", null)
    .lte("cancelado_em", limite)
    .is("dados_apagados_em", null)
    .neq("id", GRUPO_NEXT_HOME_ID)
    .order("cancelado_em")
    .limit(CANDIDATOS);
  if (error) {
    console.error("[encerramento] grupos vencidos não lidos:", error.message);
    return { ligada: true, erro: "grupos vencidos não lidos", pendentes: 0, copiasApagadas };
  }
  const lista = ordemDeApagar(
    (vencidos ?? []).filter((g): g is typeof g & { cancelado_em: string } => g.cancelado_em !== null),
  );
  if (lista.length === 0) return { ligada: true, pendentes: 0, copiasApagadas };
  const grupo = lista[0];
  const pendentes = lista.length - 1;
  const falhou = async (erro: string) => {
    console.error(`[encerramento] grupo ${grupo.slug}: ${erro}`);
    await registrarFalha(servico, grupo, erro, agora);
    return { ligada: true as const, erro, pendentes: lista.length, copiasApagadas };
  };

  // 1. A cópia. O instante é o do relógio de verdade, lido ANTES da leitura:
  // o banco compara com o `created_at` das linhas.
  const copiaEm = new Date().toISOString();
  let dados: Awaited<ReturnType<typeof lerDadosDoGrupo>>;
  let arquivo: Buffer;
  try {
    dados = await lerDadosDoGrupo(servico, grupo.id);
    arquivo = arquivoDoGrupo(dados);
  } catch (e) {
    if (!(e instanceof FalhaNaExportacao)) throw e;
    return falhou(`cópia não gerada (${e.message})`);
  }
  const caminho = caminhoDaCopia(grupo.id, agora);
  const { error: erroUpload } = await servico.storage
    .from(BUCKET_DAS_EXPORTACOES)
    .upload(caminho, arquivo, { contentType: TIPO_XLSX, upsert: true });
  if (erroUpload) return falhou(`cópia não gravada (${erroUpload.message})`);

  // 2. O caminho e o instante da cópia, que o banco exige antes de apagar.
  const { error: erroCaminho } = await servico
    .from("grupos")
    .update({ exportacao_final_caminho: caminho, exportacao_final_em: copiaEm })
    .eq("id", grupo.id)
    .is("dados_apagados_em", null);
  if (erroCaminho) return falhou(`caminho da cópia não anotado (${erroCaminho.message})`);

  // 3. Os logins, e quem deles é administrador da plataforma. Lidos antes: depois
  // do passo 5 a ficha não existe mais. Sem resposta sobre o administrador,
  // nada é apagado (o erro empurraria para o lado destrutivo).
  const { data: fichas, error: erroFichas } = await servico
    .from("corretores")
    .select("user_id")
    .eq("grupo_id", grupo.id)
    .not("user_id", "is", null);
  if (erroFichas) return falhou(`logins não lidos (${erroFichas.message})`);
  const logins = [...new Set((fichas ?? []).map((f) => f.user_id).filter((u): u is string => !!u))];
  const administradores = new Set<string>();
  if (logins.length > 0) {
    const { data: admins, error: erroAdmins } = await servico
      .from("administradores_da_plataforma")
      .select("user_id")
      .in("user_id", logins);
    if (erroAdmins || !admins) return falhou(`administradores da plataforma não lidos (${erroAdmins?.message ?? "sem resposta"})`);
    for (const a of admins) administradores.add(a.user_id);
  }

  // 4. Os arquivos privados do grupo.
  try {
    const documentos = servico.storage.from(BUCKET_DOCUMENTOS) as unknown as BucketDoStorage;
    const pastas = await pastasDaRaiz(documentos);
    for (const lead of dados.leads) {
      if (pastas.has(lead.id)) await apagarPasta(documentos, lead.id);
    }
    await apagarPasta(servico.storage.from(BUCKET_CONTABILIDADE) as unknown as BucketDoStorage, grupo.id);
  } catch (e) {
    return falhou(`arquivos privados não apagados (${e instanceof Error ? e.message : String(e)})`);
  }

  // 5. Apagar.
  const { data: apagado, error: erroApagar } = await servico.rpc("apagar_dados_do_grupo", { p_grupo: grupo.id });
  if (erroApagar) return falhou(`banco recusou (${erroApagar.message})`);

  // 6. Os logins. Administrador da plataforma fica (ele é da plataforma,
  // não do grupo); falha num login vira log, não desfaz o que já foi feito.
  let loginsApagados = 0;
  for (const userId of logins) {
    if (administradores.has(userId)) continue;
    const { error: erroLogin } = await servico.auth.admin.deleteUser(userId);
    if (erroLogin) console.error(`[encerramento] login de ${grupo.slug} não apagado: ${erroLogin.message}`);
    else loginsApagados++;
  }

  // 7. O registro, da plataforma: o grupo não tem mais ninguém para lê-lo.
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

  return { ligada: true, apagado: grupo.slug, pendentes, copiasApagadas };
}

/**
 * A cópia final guardada também tem prazo: `DIAS_DA_COPIA_FINAL` depois dos
 * dados apagados, ela sai do bucket e o caminho fica nulo (a rota de
 * exportação passa a responder "apagada em …"). Falha numa cópia vira log e
 * fica para o próximo tique.
 */
export async function apagarCopiasFinaisVencidas(servico: Cliente, agora: Date): Promise<number> {
  const limite = new Date(agora.getTime() - DIAS_DA_COPIA_FINAL * DIA_MS).toISOString();
  const { data, error } = await servico
    .from("grupos")
    .select("id, slug, exportacao_final_caminho")
    .not("dados_apagados_em", "is", null)
    .lte("dados_apagados_em", limite)
    .not("exportacao_final_caminho", "is", null)
    .limit(COPIAS_POR_TIQUE);
  if (error) {
    console.error("[encerramento] cópias finais vencidas não lidas:", error.message);
    return 0;
  }
  let apagadas = 0;
  for (const g of data ?? []) {
    if (!g.exportacao_final_caminho) continue;
    const { error: erroRemover } = await servico.storage.from(BUCKET_DAS_EXPORTACOES).remove([g.exportacao_final_caminho]);
    if (erroRemover) {
      console.error(`[encerramento] cópia final de ${g.slug} não apagada: ${erroRemover.message}`);
      continue;
    }
    const { error: erroGrupo } = await servico
      .from("grupos")
      .update({ exportacao_final_caminho: null, copia_final_apagada_em: agora.toISOString() })
      .eq("id", g.id);
    if (erroGrupo) {
      console.error(`[encerramento] cópia final de ${g.slug} apagada, mas o grupo não foi anotado: ${erroGrupo.message}`);
      continue;
    }
    apagadas++;
    const { error: erroEvento } = await servico.from("admin_eventos").insert({
      grupo_id: null,
      acao: "copia_final_apagada",
      ator_id: null,
      ator_plataforma_user_id: null,
      alvo_corretor_id: null,
      detalhes: { origem: "plataforma", slug: g.slug },
    });
    if (erroEvento) console.error(`[encerramento] evento da cópia de ${g.slug} não gravado: ${erroEvento.message}`);
  }
  return apagadas;
}
