"use server";

import { revalidatePath } from "next/cache";
import { revalidarCorretores } from "@/lib/catalogo/revalidar";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { ehEmailDeAcesso, normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import {
  MENSAGEM_EMAIL_EM_USO,
  MENSAGEM_ENDERECO_DE_ACESSO,
  MENSAGEM_ENDERECO_PROVISORIO,
} from "@/lib/corretores/acessoDaConta";
import {
  convidarCorretorDoGrupo,
  limparEmail,
  mandarLinkDeAcesso,
  registrarEventoDeAcesso,
  type ResultadoDoLink,
} from "@/lib/corretores/convite";

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
 * que exige privilégio (convidar no Auth, escrever `user_id`).
 *
 * Desde a fase 2A o gestor não vê senha nenhuma: convida pelo e-mail real, e
 * o corretor cria a própria senha pelo link (`src/lib/corretores/convite.ts`,
 * o mesmo caminho do convite pela plataforma).
 */

export type ResultadoAdmin = { ok?: string; erro?: string };

/** "Cristal - Bruna" → "cristal-bruna". Mesma forma dos slugs já no banco. */
function slugificar(nome: string): string {
  // Delega para a normalização compartilhada: duas cópias da regra
  // divergiriam no primeiro "Antônio".
  return normalizarParaEmail(nome);
}

/**
 * Primeiro slug livre a partir do nome.
 *
 * O slug é GLOBAL (o site resolve o corretor por ele, sem grupo, até a fase
 * 3), mas a sessão do gestor só enxerga o próprio grupo: lendo `corretores`
 * por ela, um slug do grupo A pareceria livre, o update bateria na chave
 * única e o login recém-criado seria desfeito. Quem confere é
 * `slug_de_corretor_livre` (0183), que olha todos os grupos e só diz sim/não.
 * Erro da função não vira "livre": o slug sai com o sufixo de tempo.
 */
async function slugDisponivel(
  supabase: Awaited<ReturnType<typeof createClient>>,
  base: string,
): Promise<string> {
  const candidato = base || "corretor";
  for (let sufixo = 0; sufixo < 50; sufixo++) {
    const slug = sufixo === 0 ? candidato : `${candidato}-${sufixo + 1}`;
    const { data: livre, error } = await supabase.rpc("slug_de_corretor_livre", { p_slug: slug });
    if (error) {
      console.error("[admin] falha ao conferir slug livre:", error.message);
      break;
    }
    if (livre) return slug;
  }
  return `${candidato}-${Date.now().toString(36)}`;
}

/**
 * O e-mail está livre em todos os grupos e no Auth? Pela sessão o gestor só
 * veria o próprio grupo; `email_de_acesso_livre` (0183) olha todos e só diz
 * sim/não. Erro devolve `null` ("não sei"): quem decide aí é o Auth, que
 * recusa e-mail repetido no convite e na troca — chamar de "em uso" um
 * e-mail livre só porque a conferência falhou mandaria o gestor atrás de um
 * problema que não existe.
 */
async function emailDeAcessoLivre(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("email_de_acesso_livre", { p_email: email });
  if (error) {
    console.error("[admin] falha ao conferir e-mail livre:", error.message);
    return null;
  }
  return data === true;
}

/**
 * Convida um corretor que já tem ficha mas não tem acesso: ele recebe um
 * link no e-mail real e cria a própria senha.
 *
 * Volta `{ ok, enviado }`. Sem e-mail configurado (ou com o envio recusado),
 * volta também a `url`, para o gestor copiar e mandar pelo WhatsApp.
 */
export async function criarAcessoCorretor(corretorId: string, email: string): Promise<ResultadoDoLink> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const emailLimpo = limparEmail(email);
  if (!emailLimpo) return { ok: false, erro: "E-mail inválido." };
  if (ehEmailDeAcesso(emailLimpo)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };

  const supabase = await createClient();
  const { data: alvo } = await supabase
    .from("corretores")
    .select("id, nome, slug, user_id, grupo_id")
    .eq("id", corretorId)
    .eq("grupo_id", guarda.corretor.grupoId)
    .maybeSingle();

  if (!alvo) return { ok: false, erro: "Corretor não encontrado." };
  if (alvo.user_id) return { ok: false, erro: "Este corretor já tem acesso. Use 'Reenviar convite'." };
  if ((await emailDeAcessoLivre(supabase, emailLimpo)) === false) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  /*
   * O slug tem que existir ANTES do login. `getCorretorLogado()` devolve
   * `null` quando o slug é nulo (corretorSessao.ts) — a pessoa criaria a
   * senha e cairia direto em "Conta sem vínculo", com o painel vazio.
   */
  const slug = alvo.slug ?? (await slugDisponivel(supabase, slugificar(alvo.nome)));

  const r = await convidarCorretorDoGrupo({
    grupoId: guarda.corretor.grupoId,
    corretorId,
    email: emailLimpo,
    slug,
    ator: { corretorId: guarda.corretor.id },
  });

  if (r.ok) {
    revalidarCorretores();
    revalidatePath("/corretor/admin/contas");
  }
  return r;
}

export type DadosNovoCorretor = { nome: string; creci: string; whatsapp: string; email: string };

/**
 * Cadastra um corretor novo (ficha + convite) de uma vez (07/10/2026).
 *
 * `corretores` não tem policy de INSERT de propósito (a tabela é pública
 * para leitura), então quem grava é a chave de serviço, depois de
 * `exigirGestorNaAcao()` decidir que pode.
 *
 * Se o convite falhar, a ficha é apagada: sem isso sobraria um corretor sem
 * acesso que aparece no site, e a próxima tentativa com o mesmo nome
 * ganharia slug com sufixo. E-mail que não saiu NÃO é falha: o link volta
 * para a tela.
 */
export async function cadastrarCorretor(dados: DadosNovoCorretor): Promise<ResultadoDoLink> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { ok: false, erro: guarda.erro ?? "Acesso negado." };

  const nome = dados.nome.trim().replace(/\s+/g, " ");
  const creci = dados.creci.trim();
  const email = limparEmail(dados.email);
  const whatsapp = normalizarTelefoneBr(dados.whatsapp);
  if (nome.length < 3) return { ok: false, erro: "Informe o nome do corretor." };
  if (!creci) return { ok: false, erro: "Informe o CRECI." };
  if (!whatsapp || whatsapp.length < 12 || whatsapp.length > 13) {
    return { ok: false, erro: "WhatsApp inválido. Use DDD + número, por exemplo (11) 98765-4321." };
  }
  if (!email) return { ok: false, erro: "E-mail inválido." };
  if (ehEmailDeAcesso(email)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };

  const supabase = await createClient();
  // Antes de criar a ficha: e-mail ocupado não deixa ficha órfã para trás.
  if ((await emailDeAcessoLivre(supabase, email)) === false) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  const slug = await slugDisponivel(supabase, slugificar(nome));
  const servico = createServiceClient();
  // Pela chave de serviço não há sessão para o gatilho tirar o grupo: ele
  // vai explícito, o de quem cadastra (0183).
  const { data: ficha, error } = await servico
    .from("corretores")
    .insert({ nome, creci, whatsapp, slug, ativo: true, grupo_id: guarda.corretor.grupoId })
    .select("id")
    .single();
  if (error || !ficha) {
    console.error("[admin] falha ao cadastrar corretor:", error?.message);
    return { ok: false, erro: "Não foi possível cadastrar o corretor agora. Tente de novo." };
  }

  const convite = await criarAcessoCorretor(ficha.id, email);
  if (!convite.ok) {
    await servico.from("corretores").delete().eq("id", ficha.id).eq("grupo_id", guarda.corretor.grupoId);
  }
  return convite;
}

/**
 * A ficha do grupo do gestor e o usuário do Auth dela. O e-mail usado nos
 * links é o do AUTH, que é para onde o login aponta — a ficha pode estar
 * desatualizada numa conta antiga.
 */
async function contaDoGrupo(
  corretorId: string,
  grupoId: string,
): Promise<
  | { erro: string }
  | { erro?: undefined; userId: string; emailDoLogin: string; ultimoLogin: string | null }
> {
  const supabase = await createClient();
  const { data: alvo } = await supabase
    .from("corretores")
    .select("id, user_id, email")
    .eq("id", corretorId)
    // O link sai pela chave de serviço: a ficha tem de ser do grupo de quem
    // pede, senão o gestor de um grupo mandaria o link de outro.
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (!alvo) return { erro: "Corretor não encontrado." };
  if (!alvo.user_id) return { erro: "Este corretor ainda não tem acesso. Use 'Convidar'." };

  const { data, error } = await createServiceClient().auth.admin.getUserById(alvo.user_id);
  if (error) console.error(`[admin] falha ao ler o login do corretor ${corretorId}: ${error.message}`);
  const email = data?.user?.email ?? alvo.email;
  if (!email) return { erro: "Este acesso está sem e-mail. Use 'Trocar e-mail'." };
  return { userId: alvo.user_id, emailDoLogin: email, ultimoLogin: data?.user?.last_sign_in_at ?? null };
}

/**
 * Manda de novo o link de quem tem acesso: convite enquanto a pessoa nunca
 * entrou, link de senha depois. O convite também cai para o link de senha
 * quando o Auth o recusa — conta já confirmada que nunca entrou (criada pelo
 * caminho antigo, com senha provisória) não aceita convite, e o link de
 * senha resolve do mesmo jeito.
 */
export async function reenviarConvite(corretorId: string): Promise<ResultadoDoLink> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const conta = await contaDoGrupo(corretorId, guarda.corretor.grupoId);
  if (conta.erro !== undefined) return { ok: false, erro: conta.erro };
  if (ehEmailDeAcesso(conta.emailDoLogin)) return { ok: false, erro: MENSAGEM_ENDERECO_PROVISORIO };

  const pedido = { grupoId: guarda.corretor.grupoId, email: conta.emailDoLogin, usuarioEsperado: conta.userId };
  let tipo: "invite" | "recovery" = conta.ultimoLogin ? "recovery" : "invite";
  let r = await mandarLinkDeAcesso({ ...pedido, tipo });
  if (!r.ok && tipo === "invite" && r.motivo === "email_em_uso") {
    tipo = "recovery";
    r = await mandarLinkDeAcesso({ ...pedido, tipo });
  }
  if (!r.ok) return { ok: false, erro: r.erro };

  await registrarEventoDeAcesso(createServiceClient(), {
    grupoId: guarda.corretor.grupoId,
    ator: { corretorId: guarda.corretor.id },
    acao: "convite_reenviado",
    alvoCorretorId: corretorId,
    detalhes: { tipo },
  });

  revalidatePath("/corretor/admin/contas");
  return { ok: true, enviado: r.enviado, ...(r.url ? { url: r.url } : {}) };
}

/**
 * Link para criar uma senha nova (no lugar da antiga "Redefinir senha", que
 * devolvia uma senha em claro para o gestor repassar).
 */
export async function enviarLinkDeSenha(corretorId: string): Promise<ResultadoDoLink> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const conta = await contaDoGrupo(corretorId, guarda.corretor.grupoId);
  if (conta.erro !== undefined) return { ok: false, erro: conta.erro };
  if (ehEmailDeAcesso(conta.emailDoLogin)) return { ok: false, erro: MENSAGEM_ENDERECO_PROVISORIO };

  const r = await mandarLinkDeAcesso({
    grupoId: guarda.corretor.grupoId,
    tipo: "recovery",
    email: conta.emailDoLogin,
    usuarioEsperado: conta.userId,
  });
  if (!r.ok) return { ok: false, erro: r.erro };

  await registrarEventoDeAcesso(createServiceClient(), {
    grupoId: guarda.corretor.grupoId,
    ator: { corretorId: guarda.corretor.id },
    acao: "link_de_senha_enviado",
    alvoCorretorId: corretorId,
  });

  return { ok: true, enviado: r.enviado, ...(r.url ? { url: r.url } : {}) };
}

/**
 * Troca o e-mail de login de um corretor e manda o link de senha para o
 * endereço novo. É o caminho das contas antigas `@nexthome.com` (domínio de
 * terceiro), que não podem receber link nenhum.
 *
 * Troca no Auth primeiro e depois na ficha; se a ficha falhar, o Auth volta
 * ao endereço antigo — senão login e ficha apontariam para e-mails
 * diferentes, e o próximo link sairia para o endereço errado.
 */
export async function trocarEmailDoCorretor(corretorId: string, emailNovo: string): Promise<ResultadoDoLink> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { ok: false, erro: guarda.erro };

  const email = limparEmail(emailNovo);
  if (!email) return { ok: false, erro: "E-mail inválido." };
  if (ehEmailDeAcesso(email)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };

  const grupoId = guarda.corretor.grupoId;
  const conta = await contaDoGrupo(corretorId, grupoId);
  if (conta.erro !== undefined) return { ok: false, erro: conta.erro };
  if (conta.emailDoLogin.toLowerCase() === email) return { ok: false, erro: "Esse já é o e-mail deste acesso." };

  const supabase = await createClient();
  if ((await emailDeAcessoLivre(supabase, email)) === false) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  const servico = createServiceClient();
  const { error: erroAuth } = await servico.auth.admin.updateUserById(conta.userId, { email, email_confirm: true });
  if (erroAuth) {
    const codigo = (erroAuth as { code?: string }).code;
    if (codigo === "email_exists" || /already (been )?registered/i.test(erroAuth.message ?? "")) {
      return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };
    }
    console.error(`[admin] falha ao trocar o e-mail do login (corretor ${corretorId}): ${erroAuth.message}`);
    return { ok: false, erro: "Não foi possível trocar o e-mail agora. Tente de novo." };
  }

  const { data: trocadas, error: erroFicha } = await servico
    .from("corretores")
    .update({ email })
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .select("id");
  if (erroFicha || !trocadas || trocadas.length === 0) {
    console.error(`[admin] ficha ${corretorId} sem o e-mail novo: ${erroFicha?.message ?? "nenhuma linha"}`);
    const { error: erroVolta } = await servico.auth.admin.updateUserById(conta.userId, {
      email: conta.emailDoLogin,
      email_confirm: true,
    });
    if (erroVolta) console.error(`[admin] login do corretor ${corretorId} não voltou ao e-mail antigo: ${erroVolta.message}`);
    return { ok: false, erro: "Não foi possível trocar o e-mail agora. Tente de novo." };
  }

  await registrarEventoDeAcesso(servico, {
    grupoId,
    ator: { corretorId: guarda.corretor.id },
    acao: "email_alterado",
    alvoCorretorId: corretorId,
    detalhes: { de: conta.emailDoLogin, para: email },
  });

  revalidarCorretores();
  revalidatePath("/corretor/admin/contas");

  const r = await mandarLinkDeAcesso({ grupoId, tipo: "recovery", email, usuarioEsperado: conta.userId });
  if (!r.ok) {
    return { ok: false, erro: "O e-mail foi trocado, mas o link não foi gerado. Use 'Mandar link de senha'." };
  }
  return { ok: true, enviado: r.enviado, ...(r.url ? { url: r.url } : {}) };
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

  revalidarCorretores();
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

  revalidarCorretores();
  revalidatePath("/corretor/admin/contas");
  return { ok: ativo ? "Corretor reativado." : "Corretor desativado — sai da roleta de leads." };
}

/**
 * Conta só WhatsApp (0180): a pessoa usa o painel como WhatsApp Web. Todas
 * as conversas do número aparecem (inclusive de quem não é lead, que não
 * vira lead), o texto de todas é guardado e a IA fica desligada.
 *
 * Pela chave de serviço, depois da guarda: `so_whatsapp` não tem grant de
 * UPDATE para a sessão — se tivesse, qualquer corretor ligaria sozinho a
 * exceção à regra de privacidade.
 */
export async function alternarSoWhatsapp(
  corretorId: string,
  ligar: boolean,
): Promise<ResultadoAdmin> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("corretores")
    .update({ so_whatsapp: ligar })
    .eq("id", corretorId)
    // Chave de serviço sobre id vindo do navegador: só dentro do grupo.
    .eq("grupo_id", guarda.corretor.grupoId)
    .select("id");
  if (error) {
    console.error("[admin] falha ao marcar conta só WhatsApp:", error.message);
    return {
      erro: /so_whatsapp/.test(error.message)
        ? "O banco ainda não tem a conta só WhatsApp (migration 0180)."
        : traduzirErroBanco(error.message),
    };
  }
  if (!data || data.length === 0) return { erro: "Corretor não encontrado." };

  // A IA da instância desliga junto: o webhook já a ignora nesta conta, e a
  // tela de configuração passa a dizer a mesma coisa.
  if (ligar) {
    await servico
      .from("corretor_whatsapp_instancias")
      .update({ modo_bot: "desativado" })
      .eq("corretor_id", corretorId);
  }
  console.info(`[admin] conta só WhatsApp ${ligar ? "ligada" : "desligada"}`, {
    ator: guarda.corretor.id,
    alvo: corretorId,
  });

  revalidarCorretores();
  revalidatePath("/corretor/admin/contas");
  revalidatePath("/corretor/pessoas");
  return {
    ok: ligar
      ? "Agora é só WhatsApp: todas as conversas aparecem, sem virar lead e sem IA."
      : "Voltou a ser conta comum: conversas sem lead ficam escondidas.",
  };
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
/** Ids por PATCH ao repassar a carteira (vão na URL). */
const LOTE_DE_REPASSE = 200;
/** O `max_rows` do PostgREST (supabase/config.toml). */
const TETO_DA_LEITURA = 1000;

export async function redistribuirCarteira(
  deId: string | null,
  paraId: string,
): Promise<ResultadoAdmin & { movidos?: number }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  if (deId === paraId) return { erro: "Origem e destino são o mesmo corretor." };

  const supabase = await createClient();

  // O destino precisa existir, ser do grupo de quem repassa e estar ativo —
  // mandar uma carteira para um corretor desativado só trocaria um limbo por
  // outro. O grupo é conferido AQUI, antes da linha de repasse: `corretores`
  // é legível por todos, então um id de outro grupo passaria pela leitura, o
  // gatilho da 0182 recusaria o update, e as linhas `repasse` (que não se
  // apagam) ficariam dizendo à fase 5 que o lead foi repassado sem ter sido.
  const { data: destino } = await supabase
    .from("corretores")
    .select("id, nome, ativo, grupo_id")
    .eq("id", paraId)
    .maybeSingle();
  if (!destino || destino.grupo_id !== guarda.corretor.grupoId) {
    return { erro: "Corretor de destino não encontrado." };
  }
  if (!destino.ativo) {
    return { erro: `${destino.nome} está desativado — reative antes de passar leads para ele.` };
  }

  // Primeiro a carteira e a origem de cada lead: o update abaixo sobrescreve
  // `origem_atribuicao` com `manual`, e a fase 5 precisa saber de onde cada
  // um veio (L30).
  // Só a carteira do grupo de quem repassa: até a 0184 a sessão do gestor
  // ainda enxerga outros grupos, e um lead alheio (ou sem dono, de outro
  // grupo) ganharia linha de repasse antes de o gatilho recusar o update.
  let leitura = supabase
    .from("leads")
    .select("id, origem_atribuicao")
    .eq("grupo_id", guarda.corretor.grupoId);
  leitura = deId === null ? leitura.is("corretor_id", null) : leitura.eq("corretor_id", deId);
  const { data: carteira, error: erroLeitura } = await leitura;
  if (erroLeitura) return { erro: traduzirErroBanco(erroLeitura.message) };
  if (!carteira || carteira.length === 0) {
    return { ok: deId === null ? "Não havia leads sem dono." : "Este corretor não tem leads." };
  }

  // O registro da origem vem ANTES do update: gravado depois, uma falha no
  // meio perderia a origem para sempre. O preço é o inverso: se o update
  // falhar, sobra uma linha de repasse para um lead que não mudou de dono, e
  // a fase 5 a leria como repasse. Por isso tudo o que dá para conferir antes
  // (destino no grupo e ativo, carteira do grupo) é conferido antes; o que
  // sobra é falha de banco no meio, e o leitor da fase 5 deve confirmar que o
  // dono atual do lead é o `detalhes.para` da linha.
  const { error: erroRepasse } = await createServiceClient()
    .from("lead_interacoes")
    .insert(
      carteira.map((l) => ({
        lead_id: l.id,
        corretor_id: guarda.corretor.id,
        tipo: "repasse" as const,
        conteudo: "Repasse de carteira pela gestão",
        detalhes: { origem_anterior: l.origem_atribuicao, de: deId, para: paraId },
      })),
    );
  if (erroRepasse) {
    console.error("[redistribuir] origem anterior não gravada:", erroRepasse.message);
    return { erro: "Não foi possível registrar a passagem dos leads agora. Tente de novo." };
  }

  // Só os leads lidos acima: um lead que chegou no meio não muda de dono sem
  // ter a origem registrada. Em lotes, porque os ids vão na URL do PATCH.
  const ids = carteira.map((l) => l.id);
  const movidos: { id: string }[] = [];
  for (let i = 0; i < ids.length; i += LOTE_DE_REPASSE) {
    const { data, error } = await supabase
      .from("leads")
      .update({ corretor_id: paraId, origem_atribuicao: "manual" })
      .in("id", ids.slice(i, i + LOTE_DE_REPASSE))
      .select("id");
    if (error) return { erro: traduzirErroBanco(error.message) };
    movidos.push(...(data ?? []));
  }

  const total = movidos.length;
  if (total === 0) {
    return { ok: deId === null ? "Não havia leads sem dono." : "Este corretor não tem leads." };
  }

  // A transferência entra na linha do tempo de cada lead (plano de
  // ativação, 3.3): o novo dono precisa saber de onde ele veio.
  const { data: origem } = deId
    ? await supabase.from("corretores").select("nome").eq("id", deId).maybeSingle()
    : { data: null };
  const { error: erroLinha } = await createServiceClient()
    .from("lead_interacoes")
    .insert(
      movidos.map((l) => ({
        lead_id: l.id,
        corretor_id: guarda.corretor.id,
        tipo: "sistema" as const,
        conteudo: `Lead transferido${origem?.nome ? ` de ${origem.nome}` : ""} para ${destino.nome} pela gestão`,
        detalhes: { de: deId, para: paraId, motivo: "redistribuicao_de_carteira" },
      })),
    );
  if (erroLinha) console.error("[redistribuir] linha do tempo não gravada:", erroLinha.message);

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
  revalidatePath("/corretor/pessoas");
  revalidatePath("/corretor/funil");

  // A leitura para no teto do PostgREST (1000 linhas): carteira maior passa
  // em mais de um clique, e a tela diz isso em vez de parecer completa.
  const sobrou = carteira.length >= TETO_DA_LEITURA ? " Ainda há leads para passar: repita." : "";
  return {
    ok: `${total} lead${total === 1 ? "" : "s"} agora ${total === 1 ? "é" : "são"} de ${destino.nome}.${sobrou}`,
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
  if (mensagem.includes("não é da sua imobiliária")) {
    return "Este corretor não é da sua imobiliária.";
  }
  if (mensagem.includes("Só quem administra")) {
    return "Esta ação é restrita a quem administra a imobiliária.";
  }
  return "Não foi possível concluir a ação agora. Tente novamente.";
}
