"use server";

import { revalidatePath } from "next/cache";
import { erroDaSenha } from "@/lib/auth/politicaDeSenha";
import { MENSAGEM_ENDERECO_DE_ACESSO } from "@/lib/corretores/acessoDaConta";
import { limparEmail } from "@/lib/corretores/convite";
import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Quem administra a plataforma (pedido do dono, 29/10/2026): pôr e tirar
 * logins de `administradores_da_plataforma` (0190).
 *
 * A tabela não tem grant para ninguém além da chave de serviço; quem decide
 * é `exigirAdminDaPlataformaNaAcao()`, pela sessão, e a chave só entra
 * depois (mesma regra de ouro de `acoes.ts`).
 *
 * Duas recusas que a tela não substitui: ninguém se tira (o erro mais fácil
 * de cometer, e desfazê-lo exigiria o acesso que acabou de sair) e a
 * plataforma nunca fica sem administrador — conferido antes E depois do
 * delete, porque dois administradores tirando um ao outro ao mesmo tempo
 * passariam os dois pela conferência de antes.
 *
 * Conta nova nasce com senha temporária (que passa por `erroDaSenha`) e
 * `app_metadata.deve_trocar_senha`: o administrador da plataforma pode não
 * ter ficha em `corretores`, onde mora a troca obrigatória dos corretores; o
 * login (`entrar`) lê a marca do `app_metadata` e manda para a troca, e
 * `trocarSenha` a desliga. `app_metadata` só a chave de serviço escreve.
 *
 * Os eventos `admin_da_plataforma_adicionado` e `_removido` entram no CHECK
 * de `admin_eventos` na 0237. São eventos da plataforma: `grupo_id` nulo,
 * nenhuma mãe preenchida e `detalhes.origem = 'plataforma'` (0182). Antes da
 * 0237 o insert falha, o log diz quem fez o quê, e a ação vale mesmo assim.
 */

export type ResultadoNovoAdministrador =
  | { ok: true; email: string; contaCriada: boolean }
  | { ok: false; erro: string; semConta?: true; email?: string };

export type ResultadoAdministrador = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível concluir agora. Tente de novo.";
/** `listUsers` pagina; 50 páginas de 1000 cobrem com folga os logins de hoje. */
const POR_PAGINA = 1000;
const PAGINAS = 50;

type Servico = ReturnType<typeof createServiceClient>;

/**
 * O login do Auth com este e-mail. O Auth não busca por e-mail na API de
 * administração; a lista é paginada e comparada aqui, sem diferença de
 * maiúsculas. `undefined` = não deu para saber (a tela não pode oferecer
 * "criar conta" para um e-mail que talvez exista).
 */
async function loginPorEmail(servico: Servico, email: string): Promise<{ id: string } | null | undefined> {
  for (let pagina = 1; pagina <= PAGINAS; pagina++) {
    const { data, error } = await servico.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA });
    if (error) {
      console.error(`[plataforma] logins não listados (página ${pagina}): ${error.message}`);
      return undefined;
    }
    const usuarios = data?.users ?? [];
    const achado = usuarios.find((u) => (u.email ?? "").toLowerCase() === email);
    if (achado) return { id: achado.id };
    if (usuarios.length < POR_PAGINA) return null;
  }
  console.error("[plataforma] a busca do login por e-mail passou do teto de páginas");
  return undefined;
}

async function registrar(
  servico: Servico,
  operador: string,
  acao: "admin_da_plataforma_adicionado" | "admin_da_plataforma_removido",
  detalhes: Record<string, string | boolean>,
): Promise<void> {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: null,
    ator_id: null,
    ator_plataforma_user_id: operador,
    acao,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", ...detalhes },
  });
  // O log carrega o registro quando o banco recusa (antes da 0237).
  if (error) console.error(`[plataforma] evento ${acao} não gravado: ${error.message}`, { operador, ...detalhes });
}

/**
 * Põe um login como administrador da plataforma, pelo e-mail. Login que não
 * existe só é criado com `criarConta = "1"` e a senha temporária: a primeira
 * resposta (`semConta`) é a tela perguntando antes de criar.
 */
export async function adicionarAdministrador(
  _estadoAnterior: ResultadoNovoAdministrador | undefined,
  formData: FormData,
): Promise<ResultadoNovoAdministrador> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const email = limparEmail(String(formData.get("email") ?? ""));
  if (!email) return { ok: false, erro: "Informe um e-mail válido." };
  const criarConta = formData.get("criarConta") === "1";
  const senha = String(formData.get("senha") ?? "");

  const servico = createServiceClient();
  const login = await loginPorEmail(servico, email);
  if (login === undefined) return { ok: false, erro: "Não foi possível conferir este e-mail agora. Tente de novo." };

  if (login) {
    const { data: jaEh, error: erroJaEh } = await servico
      .from("administradores_da_plataforma")
      .select("user_id")
      .eq("user_id", login.id)
      .maybeSingle();
    if (erroJaEh) {
      console.error(`[plataforma] não conferi se ${login.id} já administra: ${erroJaEh.message}`);
      return { ok: false, erro: ERRO_GENERICO };
    }
    if (jaEh) return { ok: false, erro: "Este login já administra a plataforma." };

    const { error } = await servico.from("administradores_da_plataforma").insert({ user_id: login.id });
    if (error) {
      console.error(`[plataforma] administrador ${login.id} não gravado: ${error.message}`);
      return { ok: false, erro: ERRO_GENERICO };
    }
    await registrar(servico, guarda.userId, "admin_da_plataforma_adicionado", { user_id: login.id, conta_criada: false });
    revalidatePath("/plataforma/administradores");
    return { ok: true, email, contaCriada: false };
  }

  if (!criarConta) {
    return {
      ok: false,
      semConta: true,
      email,
      erro: "Não há login com este e-mail. Para criar um, defina uma senha temporária abaixo.",
    };
  }
  if (ehEmailDeAcesso(email)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };
  const senhaFraca = erroDaSenha(senha);
  if (senhaFraca) return { ok: false, erro: senhaFraca, semConta: true, email };

  // A senha só vai ao Auth; nunca entra em tabela, auditoria, log ou resposta.
  const { data: criado, error: erroDoAuth } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    app_metadata: { deve_trocar_senha: true },
  });
  if (erroDoAuth || !criado?.user) {
    if (erroDoAuth) console.error("[plataforma] login do administrador não criado:", erroDoAuth.message);
    return { ok: false, erro: "Não foi possível criar o login agora. Confira se esse e-mail já está em uso." };
  }

  const { error: erroDoAdmin } = await servico.from("administradores_da_plataforma").insert({ user_id: criado.user.id });
  if (erroDoAdmin) {
    // Login sem o papel não serve a ninguém: sai, para a próxima tentativa não bater em "e-mail em uso".
    console.error(`[plataforma] administrador novo não gravado: ${erroDoAdmin.message}`);
    const { error: erroAoApagar } = await servico.auth.admin.deleteUser(criado.user.id);
    if (erroAoApagar) console.error(`[plataforma] login ${criado.user.id} ficou órfão: ${erroAoApagar.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  await registrar(servico, guarda.userId, "admin_da_plataforma_adicionado", { user_id: criado.user.id, conta_criada: true });
  revalidatePath("/plataforma/administradores");
  return { ok: true, email, contaCriada: true };
}

/** Tira um login da administração da plataforma. O login continua existindo. */
export async function removerAdministrador(userId: string): Promise<ResultadoAdministrador> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(userId)) return { ok: false, erro: "Administrador não encontrado." };
  if (userId === guarda.userId) {
    return { ok: false, erro: "Você não pode tirar o próprio acesso. Peça a outro administrador." };
  }

  const servico = createServiceClient();
  const { data: todos, error: erroDaLista } = await servico.from("administradores_da_plataforma").select("user_id");
  if (erroDaLista) {
    console.error(`[plataforma] administradores não lidos: ${erroDaLista.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const lista = todos ?? [];
  if (!lista.some((a) => a.user_id === userId)) return { ok: false, erro: "Administrador não encontrado." };
  if (lista.length <= 1) return { ok: false, erro: "A plataforma não pode ficar sem administrador." };

  const { data: tirados, error } = await servico
    .from("administradores_da_plataforma")
    .delete()
    .eq("user_id", userId)
    .select("user_id");
  if (error) {
    console.error(`[plataforma] administrador ${userId} não removido: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!tirados || tirados.length === 0) return { ok: false, erro: "Administrador não encontrado." };

  // Dois administradores tirando um ao outro ao mesmo tempo: os dois passam
  // pela conferência de cima. Quem olhar depois e achar zero devolve o seu.
  const { count, error: erroDaConta } = await servico
    .from("administradores_da_plataforma")
    .select("user_id", { count: "exact", head: true });
  if (erroDaConta || (count ?? 0) === 0) {
    const { error: erroAoDevolver } = await servico.from("administradores_da_plataforma").insert({ user_id: userId });
    if (erroAoDevolver) console.error(`[plataforma] administrador ${userId} não devolvido: ${erroAoDevolver.message}`);
    return { ok: false, erro: "A plataforma não pode ficar sem administrador." };
  }

  await registrar(servico, guarda.userId, "admin_da_plataforma_removido", { user_id: userId });
  revalidatePath("/plataforma/administradores");
  return { ok: true };
}
