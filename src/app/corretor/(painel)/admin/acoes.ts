"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Ações administrativas do gestor.
 *
 * São Server Actions, não rotas de API, por dois motivos: a action já roda
 * com o cookie de sessão (a autenticação não precisa ser refeita à mão) e o
 * Next confere a Origin nela — uma rota `/api/admin/*` seria um endpoint
 * público a mais para alguém varrer, sem ganho nenhum.
 *
 * REGRA DE OURO deste arquivo: o cliente de SERVIÇO (que ignora a RLS) nunca
 * decide QUEM pode fazer algo. Quem decide é `exigirGestorNaAcao()`, que roda
 * com a sessão do navegador. A service key só entra depois, para executar o
 * que exige privilégio (criar usuário no Auth, escrever `user_id`).
 */

export type ResultadoAdmin = { ok?: string; erro?: string };

/** Alfabeto sem `0/O/l/1`: a senha vai ser ditada ou copiada à mão. */
const ALFABETO = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Senha temporária gerada no SERVIDOR.
 *
 * Não deixamos o gestor escolher de propósito: senha digitada por humano em
 * lote vira "next123" para as sete pessoas, e aí o acesso de todo mundo vale
 * o mesmo que nenhum.
 */
function senhaTemporaria(tamanho = 12): string {
  const bytes = randomBytes(tamanho);
  let senha = "";
  for (let i = 0; i < tamanho; i++) senha += ALFABETO[bytes[i] % ALFABETO.length];
  return senha;
}

/** "Cristal - Bruna" → "cristal-bruna". Mesma forma dos slugs já no banco. */
function slugificar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function slugDisponivel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
  idAtual: string,
): Promise<string> {
  const candidato = base || "corretor";
  for (let sufixo = 0; sufixo < 50; sufixo++) {
    const slug = sufixo === 0 ? candidato : `${candidato}-${sufixo + 1}`;
    const { data } = await supabase.from("corretores").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === idAtual) return slug;
  }
  return `${candidato}-${Date.now().toString(36)}`;
}

export type ResultadoCriarAcesso =
  | { ok: true; email: string; senha: string; slug: string }
  | { ok?: false; erro: string };

/**
 * Cria o login de um corretor que já tem ficha mas não tem acesso.
 *
 * A senha volta UMA ÚNICA VEZ, no retorno desta função, para o gestor copiar
 * e repassar. Não é guardada em lugar nenhum — nem em log, nem no evento de
 * auditoria: senha que fica registrada em algum lugar é senha vazada mais
 * cedo ou mais tarde. Esqueceu? Redefine.
 */
export async function criarAcessoCorretor(
  corretorId: string,
  email: string,
): Promise<ResultadoCriarAcesso> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const emailLimpo = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo)) {
    return { erro: "E-mail inválido." };
  }

  const supabase = await createClient();
  const { data: alvo } = await supabase
    .from("corretores")
    .select("id, nome, slug, user_id")
    .eq("id", corretorId)
    .maybeSingle();

  if (!alvo) return { erro: "Corretor não encontrado." };
  if (alvo.user_id) return { erro: "Este corretor já tem acesso. Use 'Redefinir senha'." };

  /*
   * O slug tem que existir ANTES do login. `getCorretorLogado()` devolve
   * `null` quando o slug é nulo (corretorSessao.ts) — a pessoa entraria com
   * a senha certa e cairia direto em "Conta sem vínculo", com o painel vazio.
   */
  const slug = alvo.slug ?? (await slugDisponivel(supabase, slugificar(alvo.nome), alvo.id));

  const senha = senhaTemporaria();
  const servico = createServiceClient();

  // `email_confirm: true` é obrigatório: sem serviço de e-mail no projeto, a
  // conta nasceria esperando um link de confirmação que ninguém envia.
  const { data: criado, error: erroAuth } = await servico.auth.admin.createUser({
    email: emailLimpo,
    password: senha,
    email_confirm: true,
  });

  if (erroAuth || !criado?.user) {
    const jaExiste = erroAuth?.message?.toLowerCase().includes("already");
    return {
      erro: jaExiste
        ? "Já existe uma conta com este e-mail. Use outro, ou vincule pelo Supabase."
        : `Não foi possível criar o acesso: ${erroAuth?.message ?? "erro desconhecido"}`,
    };
  }

  const { error: erroVinculo } = await servico
    .from("corretores")
    .update({ user_id: criado.user.id, email: emailLimpo, slug, deve_trocar_senha: true })
    .eq("id", corretorId);

  if (erroVinculo) {
    /*
     * Compensação obrigatória: sem ela sobra um usuário órfão no Auth com o
     * e-mail queimado pela unicidade, e QUALQUER nova tentativa com o mesmo
     * e-mail falha para sempre — um beco sem saída pela UI.
     */
    await servico.auth.admin.deleteUser(criado.user.id);
    return { erro: "Acesso criado mas não vinculado; desfeito. Tente novamente." };
  }

  await servico.from("admin_eventos").insert({
    ator_id: guarda.corretor.id,
    acao: "conta_criada",
    alvo_corretor_id: corretorId,
    // Nunca a senha aqui dentro.
    detalhes: { email: emailLimpo, slug },
  });

  revalidatePath("/corretor/admin/contas");
  return { ok: true, email: emailLimpo, senha, slug };
}

/** Nova senha temporária para quem esqueceu — mesmo contrato de exibição única. */
export async function redefinirSenhaCorretor(
  corretorId: string,
): Promise<ResultadoCriarAcesso> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const supabase = await createClient();
  const { data: alvo } = await supabase
    .from("corretores")
    .select("id, user_id, email, slug")
    .eq("id", corretorId)
    .maybeSingle();

  if (!alvo?.user_id) return { erro: "Este corretor ainda não tem acesso." };

  const senha = senhaTemporaria();
  const servico = createServiceClient();

  const { error } = await servico.auth.admin.updateUserById(alvo.user_id, { password: senha });
  if (error) return { erro: `Não foi possível redefinir: ${error.message}` };

  await servico.from("corretores").update({ deve_trocar_senha: true }).eq("id", corretorId);
  await servico.from("admin_eventos").insert({
    ator_id: guarda.corretor.id,
    acao: "senha_redefinida",
    alvo_corretor_id: corretorId,
  });

  revalidatePath("/corretor/admin/contas");
  return { ok: true, email: alvo.email ?? "", senha, slug: alvo.slug ?? "" };
}

/**
 * Promove ou despromove.
 *
 * Passa pela RPC com o cliente NORMAL de propósito: `definir_papel_corretor`
 * é `security definer` e confere `eh_gestor()` pela sessão — a decisão fica
 * no banco, junto das policies, em vez de depender só desta camada.
 */
export async function alterarPapelCorretor(
  corretorId: string,
  papel: "corretor" | "gestor",
): Promise<ResultadoAdmin> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const supabase = await createClient();
  const { error } = await supabase.rpc("definir_papel_corretor", {
    alvo: corretorId,
    novo_papel: papel,
  });

  if (error) return { erro: traduzirErroBanco(error.message) };

  revalidatePath("/corretor/admin/contas");
  return { ok: papel === "gestor" ? "Agora administra a imobiliária." : "Voltou a ser corretor." };
}

/** Desligar é `ativo = false`, nunca DELETE — o histórico de leads perde o dono. */
export async function alternarAtivoCorretor(
  corretorId: string,
  ativo: boolean,
): Promise<ResultadoAdmin> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretores")
    .update({ ativo })
    .eq("id", corretorId)
    .select("id");

  if (error) return { erro: traduzirErroBanco(error.message) };
  if (!data || data.length === 0) return { erro: "Corretor não encontrado." };

  await createServiceClient()
    .from("admin_eventos")
    .insert({
      ator_id: guarda.corretor.id,
      acao: ativo ? "corretor_reativado" : "corretor_desativado",
      alvo_corretor_id: corretorId,
    });

  revalidatePath("/corretor/admin/contas");
  return { ok: ativo ? "Corretor reativado." : "Corretor desativado — sai da roleta de leads." };
}

/**
 * Passa a carteira INTEIRA de um corretor (ou todos os leads sem dono) para
 * outro corretor, de uma vez.
 *
 * É a ação que faltava desde a 0030 — o valor `leads_redistribuidos` existe
 * no check de `admin_eventos` desde lá, e nenhuma linha de código o
 * escrevia. Sem isto, desligar alguém deixava os leads dele num limbo: o
 * seletor unitário só alcança os ~50 leads mais recentes, e uma carteira de
 * 80 leads antigos não tinha caminho nenhum pela interface.
 *
 * `deId = null` significa "os sem dono": o mesmo gesto resolve o backlog de
 * órfãos que a roleta não conseguiu atribuir.
 */
export async function redistribuirCarteira(
  deId: string | null,
  paraId: string,
): Promise<ResultadoAdmin & { movidos?: number }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  if (deId === paraId) return { erro: "Origem e destino são o mesmo corretor." };

  const supabase = await createClient();

  // O destino precisa existir e estar ativo — mandar uma carteira para um
  // corretor desativado só trocaria um limbo por outro.
  const { data: destino } = await supabase
    .from("corretores")
    .select("id, nome, ativo")
    .eq("id", paraId)
    .maybeSingle();
  if (!destino) return { erro: "Corretor de destino não encontrado." };
  if (!destino.ativo) {
    return { erro: `${destino.nome} está desativado — reative antes de passar leads para ele.` };
  }

  let query = supabase.from("leads").update({
    corretor_id: paraId,
    origem_atribuicao: "manual",
  });
  query = deId === null ? query.is("corretor_id", null) : query.eq("corretor_id", deId);

  const { data: movidos, error } = await query.select("id");
  if (error) return { erro: traduzirErroBanco(error.message) };

  const total = movidos?.length ?? 0;
  if (total === 0) {
    return { ok: deId === null ? "Não havia leads sem dono." : "Este corretor não tem leads." };
  }

  // Auditoria pelo cliente de serviço — mesma razão das outras ações: a
  // tabela não tem policy de INSERT de propósito (log forjável não é log).
  await createServiceClient()
    .from("admin_eventos")
    .insert({
      ator_id: guarda.corretor.id,
      acao: "leads_redistribuidos",
      alvo_corretor_id: deId,
      detalhes: { para: paraId, quantidade: total },
    });

  revalidatePath("/corretor/admin/leads");
  revalidatePath("/corretor/admin");
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/funil");

  return {
    ok: `${total} lead${total === 1 ? "" : "s"} agora ${total === 1 ? "é" : "são"} de ${destino.nome}.`,
    movidos: total,
  };
}

/** Mensagem do trigger/função vira algo que o gestor entende e sabe resolver. */
function traduzirErroBanco(mensagem: string): string {
  if (mensagem.includes("sem nenhum gestor ativo")) {
    return "A imobiliária ficaria sem ninguém na administração. Promova outro gestor antes.";
  }
  if (mensagem.includes("outro gestor para remover")) {
    return "Você não pode remover o próprio acesso administrativo — peça a outro gestor.";
  }
  if (mensagem.includes("Só quem administra")) {
    return "Esta ação é restrita a quem administra a imobiliária.";
  }
  return "Não foi possível concluir a ação agora. Tente novamente.";
}
