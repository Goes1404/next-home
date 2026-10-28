"use server";

import { revalidatePath } from "next/cache";
import { MENSAGEM_EMAIL_EM_USO, MENSAGEM_ENDERECO_DE_ACESSO } from "@/lib/corretores/acessoDaConta";
import { convidarCorretorDoGrupo, limparEmail } from "@/lib/corretores/convite";
import { ehEmailDeAcesso, normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import { creciPendenteDoCadastro } from "@/lib/corretores/cadastroPendente";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { apagarEm, podeCancelar, podeDesfazerCancelamento, rotinaDeApagarLigada } from "@/lib/grupos/encerramentoRegras";
import {
  ehUuid,
  padraoDoEmail,
  validarDadosDoGrupo,
  validarNovoGrupo,
  type DadosDoGrupo,
  type DadosNovoGrupo,
  type NovoGrupoValidado,
} from "@/lib/plataforma/dadosDoGrupo";
import {
  validarImobiliaria,
  validarIndependente,
  type CadastroDoGrupo,
  type FormularioDaImobiliaria,
  type FormularioDoIndependente,
} from "@/lib/plataforma/tiposDeConta";
import { ACAO_GRUPO_DESFEITO, ORDEM_DO_DESFAZER, type PassoQueFalhou } from "@/lib/plataforma/desfazerGrupo";
import { lerTetoDigitado } from "@/lib/planos/cotaDaIa";
import { COLUNA_DO_TETO, lerLimiteDigitado, RECURSOS, type Recurso } from "@/lib/planos/limitesDoPlano";
import { gravarLogoDoGrupo, tirarLogoDoGrupo, type ResultadoDaLogo } from "@/lib/marcaDoCrm/gravarLogo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Ações do painel da plataforma (fase 2A, desenho §11).
 *
 * Mesma regra de ouro de `corretor/(painel)/admin/acoes.ts`: a chave de
 * serviço nunca decide QUEM pode. Quem decide é
 * `exigirAdminDaPlataformaNaAcao()`, pela sessão; a chave só entra depois,
 * porque o operador age em grupos que a RLS dele não alcança (e o
 * `criar_grupo` só executa pela chave, 0195).
 *
 * Nada aqui lê conversa, ficha nem lead (§4): cadastro do grupo e do
 * primeiro acesso, e mais nada (`servicoComGrupo.test.ts`, `plataforma-admin`).
 */

type Servico = ReturnType<typeof createServiceClient>;

export type ResultadoNovoGrupo =
  | { ok: true; grupoId: string; email: string; enviado: boolean; url?: string }
  | { ok: false; erro: string };

export type ResultadoNovoAcesso =
  | { ok: true; email: string; papel: "gestor" | "corretor" }
  | { ok: false; erro: string };

/**
 * Cria um acesso para um grupo que já existe. A plataforma só recebe o
 * e-mail, senha temporária e papel: nome, CRECI e WhatsApp são informados
 * pelo titular no primeiro acesso. Enquanto isso a ficha é oculta e nunca
 * entra no site nem na roleta de leads.
 */
export async function criarAcessoPendenteDoGrupo(
  grupoId: string,
  _estadoAnterior: ResultadoNovoAcesso | undefined,
  formData: FormData,
): Promise<ResultadoNovoAcesso> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Imobiliária não encontrada." };

  const email = limparEmail(String(formData.get("email") ?? ""));
  const senha = String(formData.get("senha") ?? "");
  const papel = String(formData.get("papel") ?? "");
  if (!email) return { ok: false, erro: "Informe um e-mail válido." };
  if (senha.length < 8) return { ok: false, erro: "A senha temporária precisa ter pelo menos 8 caracteres." };
  if (ehEmailDeAcesso(email)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };
  if (papel !== "gestor" && papel !== "corretor") return { ok: false, erro: "Escolha o tipo de acesso." };

  const servico = createServiceClient();
  const { data: grupo, error: erroGrupo } = await servico.from("grupos").select("id").eq("id", grupoId).maybeSingle();
  if (erroGrupo || !grupo) return { ok: false, erro: "Imobiliária não encontrada." };
  if (await emailEmFicha(servico, email)) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  // A senha só vai ao Auth; nunca entra na ficha, auditoria, log ou resposta.
  const { data: criado, error: erroDoAuth } = await servico.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  });
  if (erroDoAuth || !criado.user) {
    if (erroDoAuth) console.error("[plataforma] falha ao criar login:", erroDoAuth.message);
    return { ok: false, erro: "Não foi possível criar o acesso agora. Confira se esse e-mail já está em uso." };
  }

  const base = normalizarParaEmail(email.split("@")[0] ?? "") || "novo-acesso";
  const slug = await slugDeCorretorLivre(servico, base);
  const { data: ficha, error: erroFicha } = await servico
    .from("corretores")
    .insert({
      nome: "Cadastro pendente",
      creci: creciPendenteDoCadastro(criado.user.id),
      whatsapp: "5511000000000",
      slug,
      email,
      user_id: criado.user.id,
      papel,
      ativo: true,
      oculta: true,
      deve_trocar_senha: true,
      grupo_id: grupoId,
    })
    .select("id, user_id")
    .single();
  if (erroFicha || !ficha) {
    console.error("[plataforma] falha ao criar ficha de acesso pendente:", erroFicha?.message);
    await apagarLogin(servico, criado.user.id);
    return { ok: false, erro: "Não foi possível criar o acesso agora. Tente novamente." };
  }

  const { error: erroAuditoria } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    ator_plataforma_user_id: guarda.userId,
    acao: "conta_criada",
    alvo_corretor_id: ficha.id,
    detalhes: { origem: "plataforma", cadastro_pendente: true, papel },
  });
  if (erroAuditoria) console.error("[plataforma] conta criada sem auditoria:", erroAuditoria.message);

  revalidatePath(`/plataforma/grupos/${grupoId}`);
  revalidatePath("/plataforma");
  return { ok: true, email, papel };
}

export type ResultadoSenhaRedefinida =
  | { ok: true; nome: string; sessoesEncerradas: boolean }
  | { ok: false; erro: string };

/**
 * Redefine a senha de um acesso do grupo com uma senha temporária, para quem
 * ficou sem entrar (o "Esqueci a senha" depende do e-mail sair, e a conta
 * antiga pode nem ter e-mail na ficha). É o mesmo acordo do
 * `criarAcessoPendenteDoGrupo`: a senha só vai ao Auth, e a próxima entrada
 * cai na troca obrigatória (`deve_trocar_senha`).
 *
 * Outro administrador da plataforma é recusado: a senha dele se troca pela
 * própria sessão. A marca de troca é gravada ANTES da senha; se o Auth
 * recusar, ela volta ao que era — senão a pessoa seria mandada trocar uma
 * senha que não mudou.
 *
 * Depois da senha, as sessões abertas da pessoa são apagadas
 * (`encerrar_sessoes_do_usuario`, 0231): quem estava logado com a senha
 * antiga sai quando o token atual vencer (até 1 h). Falhar aqui não desfaz a
 * senha — ela já mudou —, só volta `sessoesEncerradas: false` para a tela.
 */
export async function redefinirSenhaDoAcesso(
  grupoId: string,
  corretorId: string,
  _estadoAnterior: ResultadoSenhaRedefinida | undefined,
  formData: FormData,
): Promise<ResultadoSenhaRedefinida> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId) || !ehUuid(corretorId)) return { ok: false, erro: "Acesso não encontrado." };

  const senha = String(formData.get("senha") ?? "");
  if (senha.length < 8) return { ok: false, erro: "A senha temporária precisa ter pelo menos 8 caracteres." };

  const servico = createServiceClient();
  const { data: ficha, error: erroFicha } = await servico
    .from("corretores")
    .select("id, nome, user_id, deve_trocar_senha")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (erroFicha) {
    console.error(`[plataforma] ficha ${corretorId} não lida para redefinir a senha: ${erroFicha.message}`);
    return { ok: false, erro: "Não foi possível conferir este acesso agora. Tente de novo." };
  }
  if (!ficha) return { ok: false, erro: "Acesso não encontrado." };
  if (!ficha.user_id) return { ok: false, erro: "Este corretor ainda não tem login." };

  const { data: admin, error: erroAdmin } = await servico
    .from("administradores_da_plataforma")
    .select("user_id")
    .eq("user_id", ficha.user_id)
    .maybeSingle();
  if (erroAdmin) {
    console.error(`[plataforma] não conferi se ${corretorId} administra a plataforma: ${erroAdmin.message}`);
    return { ok: false, erro: "Não foi possível conferir este acesso agora. Tente de novo." };
  }
  if (admin) return { ok: false, erro: "Este login administra a plataforma: a senha dele se troca pela própria sessão." };

  const trocaJaPendente = ficha.deve_trocar_senha;
  const { data: marcadas, error: erroMarca } = await servico
    .from("corretores")
    .update({ deve_trocar_senha: true })
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .select("id");
  if (erroMarca || !marcadas?.length) {
    console.error(`[plataforma] troca obrigatória não ligada (${corretorId}): ${erroMarca?.message ?? "nenhuma linha"}`);
    return { ok: false, erro: "Não foi possível redefinir a senha agora. Tente de novo." };
  }

  // A senha só vai ao Auth; nunca entra na ficha, auditoria, log ou resposta.
  const { error: erroDoAuth } = await servico.auth.admin.updateUserById(ficha.user_id, { password: senha });
  if (erroDoAuth) {
    console.error(`[plataforma] senha do acesso ${corretorId} não redefinida: ${erroDoAuth.message}`);
    if (!trocaJaPendente) {
      const { error: erroVolta } = await servico
        .from("corretores")
        .update({ deve_trocar_senha: false })
        .eq("id", corretorId)
        .eq("grupo_id", grupoId);
      if (erroVolta) console.error(`[plataforma] troca obrigatória não desligada (${corretorId}): ${erroVolta.message}`);
    }
    const fraca = (erroDoAuth as { code?: string }).code === "weak_password";
    return {
      ok: false,
      erro: fraca
        ? "O Auth recusou essa senha por ser fraca. Use uma mais longa, com letras e números."
        : "Não foi possível redefinir a senha agora. Tente de novo.",
    };
  }

  const { error: erroSessoes } = await servico.rpc("encerrar_sessoes_do_usuario", { p_user_id: ficha.user_id });
  if (erroSessoes) console.error(`[plataforma] sessões do acesso ${corretorId} não encerradas: ${erroSessoes.message}`);

  const { error: erroAuditoria } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    acao: "senha_redefinida",
    alvo_corretor_id: corretorId,
    detalhes: { origem: "plataforma", sessoes_encerradas: !erroSessoes },
  });
  if (erroAuditoria) console.error("[plataforma] senha redefinida sem auditoria:", erroAuditoria.message);

  revalidatePath(`/plataforma/grupos/${grupoId}`);
  revalidatePath("/plataforma/acessos");
  return { ok: true, nome: ficha.nome, sessoesEncerradas: !erroSessoes };
}

/**
 * O e-mail já é de alguma ficha (de qualquer grupo)? A plataforma não chama
 * `email_de_acesso_livre` (0192), que é do gestor: a mesma pergunta vai pela
 * chave de serviço, e só a contagem volta. Conferir antes de criar o grupo
 * poupa criar e desfazer; o Auth ainda recusa e-mail com login no convite.
 *
 * Sem diferença de maiúsculas: fichas gravadas antes da normalização têm
 * "Beto@Gmail.com", e o digitado chega em minúsculas.
 */
async function emailEmFicha(servico: Servico, email: string): Promise<boolean> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .ilike("email", padraoDoEmail(email));
  if (error) {
    // "Não sei" não vira "em uso": o Auth decide no convite.
    console.error("[plataforma] falha ao conferir o e-mail nas fichas:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Primeiro slug de corretor livre a partir do nome, olhando TODOS os grupos
 * (o slug de corretor é global até a fase 3). É a regra de
 * `slug_de_corretor_livre` (0192), que exige gestor; o operador não é, então
 * a pergunta vai pela chave de serviço. Erro na conferência não vira
 * "livre": o slug sai com o sufixo de tempo.
 */
async function slugDeCorretorLivre(servico: Servico, nome: string): Promise<string> {
  const base = normalizarParaEmail(nome) || "corretor";
  for (let sufixo = 0; sufixo < 50; sufixo++) {
    const slug = sufixo === 0 ? base : `${base}-${sufixo + 1}`;
    const { count, error } = await servico
      .from("corretores")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    if (error) {
      console.error("[plataforma] falha ao conferir slug de corretor livre:", error.message);
      break;
    }
    if ((count ?? 0) === 0) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Desfaz um grupo recém-criado que não chegou ao fim (ficha ou convite
 * falharam), na ordem de `ORDEM_DO_DESFAZER`, e deixa UM evento da
 * plataforma dizendo que a tentativa existiu.
 *
 * O login: o convite já apaga o usuário que criou quando o vínculo falha;
 * aqui só se apaga o que ficou VINCULADO a esta ficha, ou o login que o
 * convite não conseguiu conferir (`loginNaoConferido`) — e este só depois de
 * conferir de novo que ele não é de ficha nenhuma. Um login de outra ficha
 * (o Auth reaproveita convite pendente) nunca é apagado.
 */
async function desfazerGrupo(
  servico: Servico,
  tentativa: {
    grupoId: string;
    slug: string;
    passo: PassoQueFalhou;
    operador: string;
    corretorId?: string;
    loginNaoConferido?: string;
  },
): Promise<void> {
  const { grupoId } = tentativa;
  if (tentativa.corretorId) {
    const { data: ficha } = await servico
      .from("corretores")
      .select("user_id")
      .eq("id", tentativa.corretorId)
      .eq("grupo_id", grupoId)
      .maybeSingle();
    if (ficha?.user_id) await apagarLogin(servico, ficha.user_id);
  }
  if (tentativa.loginNaoConferido) await apagarLoginSemFicha(servico, tentativa.loginNaoConferido);

  let desfeito = true;
  for (const { tabela, coluna } of ORDEM_DO_DESFAZER) {
    // Com a tabela numa união, o supabase-js não acha coluna em comum para o
    // `eq`; o par tabela/coluna de cada linha é conferido no banco
    // (`plataforma.db.test.ts` apaga pela mesma constante).
    const apagar = servico.from(tabela).delete() as unknown as {
      eq: (coluna: string, valor: string) => PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await apagar.eq(coluna, grupoId);
    if (error) {
      // Parar aqui: apagar o grupo com linhas dele ainda vivas bateria na
      // chave estrangeira do mesmo jeito. O endereço fica preso, e o log diz qual.
      console.error(`[plataforma] grupo ${grupoId} não foi desfeito por inteiro (${tabela}): ${error.message}`);
      desfeito = false;
      break;
    }
  }

  // Depois dos deletes: o evento é da plataforma (sem grupo), então não sai
  // junto com os do grupo. Sem e-mail e sem nome — o endereço e o passo bastam.
  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: null,
    acao: ACAO_GRUPO_DESFEITO,
    ator_id: null,
    ator_plataforma_user_id: tentativa.operador,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", slug: tentativa.slug, passo: tentativa.passo, desfeito },
  });
  if (erroDoEvento) {
    console.error(`[plataforma] evento do grupo desfeito (${tentativa.slug}) não gravado: ${erroDoEvento.message}`);
  }
}

async function apagarLogin(servico: Servico, userId: string): Promise<void> {
  const { error } = await servico.auth.admin.deleteUser(userId);
  if (error) console.error(`[plataforma] login do grupo desfeito não apagado: ${error.message}`);
}

/**
 * Apaga o login que o convite devolveu e não conseguiu conferir — só se,
 * agora, ele não for de ficha nenhuma. Se a conferência falhar de novo, fica:
 * apagar o login de outra pessoa é pior que deixar um órfão.
 */
async function apagarLoginSemFicha(servico: Servico, userId: string): Promise<void> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(`[plataforma] login do convite não conferido de novo; mantido: ${error.message}`);
    return;
  }
  if ((count ?? 0) === 0) await apagarLogin(servico, userId);
}

function erroDoCriarGrupo(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "Esse endereço já é de outro grupo. Escolha outro.";
  console.error("[plataforma] criar_grupo falhou:", error.message);
  // Pode ter falhado só a resposta, com o grupo já criado: tentar de novo
  // às cegas bateria no endereço repetido e pareceria culpa dele.
  return "Não foi possível confirmar a criação do grupo. Antes de tentar de novo, confira na lista de grupos se ele já aparece.";
}

/**
 * Cria o grupo e o primeiro acesso numa operação só: `criar_grupo` (grupo,
 * taxas, fiscal, evento), a ficha do primeiro corretor como GESTORA do grupo
 * — inclusive o independente, que é gestor do próprio grupo (§18) — e o
 * convite pelo mesmo caminho do gestor (`convidarCorretorDoGrupo`).
 *
 * Se a ficha ou o convite falham, o grupo é desfeito: um grupo sem ninguém
 * que entre nele não serve, e o endereço ficaria preso pela unicidade.
 */
export async function criarGrupoComPrimeiroAcesso(dados: DadosNovoGrupo): Promise<ResultadoNovoGrupo> {
  const validacao = validarNovoGrupo(dados);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };
  return criarGrupoValidado(validacao.dados);
}

/**
 * Os dois formulários por tipo (`/plataforma/grupos/novo/imobiliaria` e
 * `/independente`) caem na MESMA criação (`criarGrupoValidado`): o que muda é
 * só o pedido que cada um monta e valida (`tiposDeConta.ts`), mais o cadastro
 * (documento, CRECI, mensalidade, vencimento) que o grupo recebe.
 */
export async function criarImobiliaria(form: FormularioDaImobiliaria): Promise<ResultadoNovoGrupo> {
  const pedido = validarImobiliaria(form);
  if (!pedido.ok) return { ok: false, erro: pedido.erro };
  return criarGrupoValidado(pedido.dados.grupo, pedido.dados.cadastro);
}

export async function criarCorretorIndependente(form: FormularioDoIndependente): Promise<ResultadoNovoGrupo> {
  const pedido = validarIndependente(form);
  if (!pedido.ok) return { ok: false, erro: pedido.erro };
  return criarGrupoValidado(pedido.dados.grupo, pedido.dados.cadastro);
}

/**
 * O miolo comum: confere a guarda (a validação do pedido, pura, já rodou) e
 * cria. Fica aqui, e não nas três entradas, para a guarda estar antes da
 * chave de serviço num lugar só.
 */
async function criarGrupoValidado(d: NovoGrupoValidado, cadastro?: CadastroDoGrupo): Promise<ResultadoNovoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const servico = createServiceClient();
  if (await emailEmFicha(servico, d.primeiro.email)) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  const { data: grupoId, error: erroGrupo } = await servico.rpc("criar_grupo", {
    p_nome: d.nome,
    p_slug: d.slug,
    p_tipo: d.tipo,
    p_plano: d.plano,
    p_contato: d.contato,
    p_criado_por: guarda.userId,
  });
  if (erroGrupo || !grupoId) {
    return { ok: false, erro: erroDoCriarGrupo(erroGrupo ?? { message: "sem id" }) };
  }

  if (cadastro) {
    // Documento, CRECI, mensalidade e vencimento: colunas que `criar_grupo` não recebe.
    const { data: gravado, error: erroCadastro } = await servico
      .from("grupos")
      .update(cadastro)
      .eq("id", grupoId)
      .select("id");
    if (erroCadastro || !gravado || gravado.length === 0) {
      console.error("[plataforma] falha ao gravar o cadastro do grupo:", erroCadastro?.message);
      await desfazerGrupo(servico, { grupoId, slug: d.slug, passo: "cadastro", operador: guarda.userId });
      return { ok: false, erro: "Não foi possível gravar os dados do grupo agora; o grupo foi desfeito. Tente de novo." };
    }
  }

  const slug = await slugDeCorretorLivre(servico, d.primeiro.nome);
  // Pela chave de serviço não há sessão para o gatilho tirar o grupo: ele vai explícito.
  const { data: ficha, error: erroFicha } = await servico
    .from("corretores")
    .insert({
      nome: d.primeiro.nome,
      creci: d.primeiro.creci,
      whatsapp: d.primeiro.whatsapp,
      slug,
      ativo: true,
      papel: "gestor",
      grupo_id: grupoId,
    })
    .select("id")
    .single();
  if (erroFicha || !ficha) {
    console.error("[plataforma] falha ao criar a ficha do primeiro acesso:", erroFicha?.message);
    await desfazerGrupo(servico, { grupoId, slug: d.slug, passo: "ficha", operador: guarda.userId });
    return { ok: false, erro: "Não foi possível criar o primeiro acesso agora; o grupo foi desfeito. Tente de novo." };
  }

  const convite = await convidarCorretorDoGrupo({
    grupoId,
    corretorId: ficha.id,
    email: d.primeiro.email,
    ator: { plataformaUserId: guarda.userId },
    slug,
  });
  if (!convite.ok) {
    await desfazerGrupo(servico, {
      grupoId,
      slug: d.slug,
      passo: "convite",
      operador: guarda.userId,
      corretorId: ficha.id,
      loginNaoConferido: convite.loginNaoConferido,
    });
    return { ok: false, erro: convite.erro };
  }

  revalidatePath("/plataforma");
  return {
    ok: true,
    grupoId,
    email: d.primeiro.email,
    enviado: convite.enviado,
    ...(convite.url ? { url: convite.url } : {}),
  };
}

export type ResultadoDadosDoGrupo = { ok: true } | { ok: false; erro: string };

/**
 * Contato de cobrança e dados institucionais do grupo. Plano, tipo e
 * endereço ficam de fora: o plano só muda no ciclo seguinte (§20), e nesta
 * fase é de leitura depois de criado.
 */
export async function editarDadosDoGrupo(grupoId: string, dados: DadosDoGrupo): Promise<ResultadoDadosDoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  // Id torto não vai ao banco: o Postgres recusaria com "invalid input
  // syntax for type uuid", e a tela mostraria o erro genérico.
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const validacao = validarDadosDoGrupo(dados);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };

  const { data, error } = await createServiceClient()
    .from("grupos")
    .update(validacao.dados)
    .eq("id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] dados do grupo ${grupoId} não gravados: ${error.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado." };

  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}

export type ResultadoTetoDaIa = { ok: true } | { ok: false; erro: string };

/**
 * O teto de respostas da IA do grupo por mês (fase 2B). Em branco volta ao
 * padrão do plano. Fica registrado em `admin_eventos` com o antes e o depois
 * (o gestor do grupo enxerga o evento no histórico dele).
 */
export async function ajustarTetoDaIa(grupoId: string, texto: string): Promise<ResultadoTetoDaIa> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const lido = lerTetoDigitado(texto);
  if (!lido.ok) return { ok: false, erro: lido.erro };

  const servico = createServiceClient();
  const { data: antes, error: erroLeitura } = await servico
    .from("grupos")
    .select("teto_respostas_ia")
    .eq("id", grupoId)
    .maybeSingle();
  if (erroLeitura) {
    console.error(`[plataforma] teto da IA do grupo ${grupoId} não lido: ${erroLeitura.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!antes) return { ok: false, erro: "Grupo não encontrado." };
  const tetoAntes = antes.teto_respostas_ia ?? null;

  const { data, error } = await servico
    .from("grupos")
    .update({ teto_respostas_ia: lido.teto })
    .eq("id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] teto da IA do grupo ${grupoId} não gravado: ${error.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado." };

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "cota_da_ia_ajustada",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", antes: tetoAntes, depois: lido.teto },
  });
  if (erroDoEvento) console.error(`[plataforma] evento do teto da IA (${grupoId}) não gravado: ${erroDoEvento.message}`);

  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}

export type ResultadoLimitesDoPlano = { ok: true } | { ok: false; erro: string };

/**
 * Os limites de artes, vídeos e mensagens de lista do grupo por mês (limites do plano).
 * Em branco volta ao padrão do plano. Um evento por limite que MUDOU, na ação
 * `cota_da_ia_ajustada` com `detalhes.recurso` (antes e depois), para não
 * mexer no CHECK de `admin_eventos` a cada recurso.
 */
export async function ajustarLimitesDoPlano(
  grupoId: string,
  textos: Record<Recurso, string>,
): Promise<ResultadoLimitesDoPlano> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const novos = {} as Record<Recurso, number | null>;
  for (const recurso of RECURSOS) {
    const lido = lerLimiteDigitado(String(textos?.[recurso] ?? ""), recurso);
    if (!lido.ok) return { ok: false, erro: lido.erro };
    novos[recurso] = lido.teto;
  }

  const servico = createServiceClient();
  const { data: antes, error: erroLeitura } = await servico
    .from("grupos")
    .select("teto_artes, teto_videos, teto_mensagens_lista")
    .eq("id", grupoId)
    .maybeSingle();
  if (erroLeitura) {
    console.error(`[plataforma] limites do plano do grupo ${grupoId} não lidos: ${erroLeitura.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!antes) return { ok: false, erro: "Grupo não encontrado." };

  const { data, error } = await servico
    .from("grupos")
    .update({
      teto_artes: novos.arte,
      teto_videos: novos.video,
      teto_mensagens_lista: novos.lista,
    })
    .eq("id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] limites do plano do grupo ${grupoId} não gravados: ${error.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado." };

  for (const recurso of RECURSOS) {
    const tetoAntes = antes[COLUNA_DO_TETO[recurso]] ?? null;
    if (tetoAntes === novos[recurso]) continue;
    const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
      grupo_id: grupoId,
      acao: "cota_da_ia_ajustada",
      ator_id: null,
      ator_plataforma_user_id: guarda.userId,
      alvo_corretor_id: null,
      detalhes: { origem: "plataforma", recurso, antes: tetoAntes, depois: novos[recurso] },
    });
    if (erroDoEvento) console.error(`[plataforma] evento do limite ${recurso} (${grupoId}) não gravado: ${erroDoEvento.message}`);
  }

  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}

export type ResultadoCancelamento = { ok: true } | { ok: false; erro: string };

/**
 * Registra que o grupo cancelou (resposta 7 do dono, 0202): `cancelado_em`
 * agora e o grupo vira `encerrado` (o SITE para pela 0201; o painel segue
 * aberto, para a equipe baixar os dados nos 90 dias). Os dados
 * ficam bloqueados por 90 dias; a rotina diária, quando ligada, apaga depois
 * (com a cópia gravada antes). Só cancela quem ainda não estava cancelado: a
 * data dos 90 dias não se mexe com um segundo clique.
 *
 * A Next Home não cancela (o banco também recusa, por CHECK).
 */
export async function registrarCancelamento(grupoId: string): Promise<ResultadoCancelamento> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  if (!podeCancelar(grupoId)) return { ok: false, erro: "A Next Home não pode ser cancelada por aqui." };

  const agora = new Date().toISOString();
  const servico = createServiceClient();
  // A situação de antes (ativo ou suspenso) é guardada: desfazer volta a ela,
  // e não a um `ativo` que tiraria a suspensão por atraso sem ninguém pedir.
  const { data: antes, error: erroAntes } = await servico
    .from("grupos")
    .select("situacao")
    .eq("id", grupoId)
    .maybeSingle();
  if (erroAntes) {
    console.error(`[plataforma] grupo ${grupoId} não lido para cancelar: ${erroAntes.message}`);
    return { ok: false, erro: "Não foi possível registrar o cancelamento agora. Tente de novo." };
  }
  if (!antes) return { ok: false, erro: "Grupo não encontrado." };
  const { data, error } = await servico
    .from("grupos")
    .update({ cancelado_em: agora, situacao: "encerrado", situacao_antes_do_cancelamento: antes.situacao })
    .eq("id", grupoId)
    .is("cancelado_em", null)
    .is("dados_apagados_em", null)
    .select("id");
  if (error) {
    console.error(`[plataforma] cancelamento do grupo ${grupoId} não gravado: ${error.message}`);
    return { ok: false, erro: "Não foi possível registrar o cancelamento agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado ou já cancelado." };

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "grupo_cancelado",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", apagar_em: apagarEm(agora).toISOString() },
  });
  if (erroDoEvento) console.error(`[plataforma] evento do cancelamento (${grupoId}) não gravado: ${erroDoEvento.message}`);

  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}

/**
 * Desfaz o cancelamento dentro dos 90 dias: o grupo volta à situação de antes
 * (ativo ou suspenso) e a data some. Depois que a rotina apagou, não há o que
 * desfazer; e depois dos 90 dias, com a rotina ligada, também não (os
 * arquivos podem estar saindo naquele instante).
 */
export async function desfazerCancelamento(grupoId: string): Promise<ResultadoCancelamento> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const servico = createServiceClient();
  const { data: grupo, error: erroLeitura } = await servico
    .from("grupos")
    .select("cancelado_em, dados_apagados_em, situacao_antes_do_cancelamento")
    .eq("id", grupoId)
    .maybeSingle();
  if (erroLeitura) {
    console.error(`[plataforma] grupo ${grupoId} não lido para desfazer: ${erroLeitura.message}`);
    return { ok: false, erro: "Não foi possível desfazer agora. Tente de novo." };
  }
  if (!grupo) return { ok: false, erro: "Grupo não encontrado." };
  if (grupo.dados_apagados_em) return { ok: false, erro: "Os dados deste grupo já foram apagados; não dá para desfazer." };
  if (!grupo.cancelado_em) return { ok: false, erro: "Este grupo não está cancelado." };
  if (!podeDesfazerCancelamento(grupo.cancelado_em, rotinaDeApagarLigada(process.env))) {
    return {
      ok: false,
      erro: "Passaram os 90 dias e a rotina que apaga está ligada: os dados deste grupo podem estar sendo apagados agora. Não dá para desfazer.",
    };
  }

  const situacaoAnterior = (["ativo", "suspenso", "encerrado"] as const).find(
    (s) => s === grupo.situacao_antes_do_cancelamento,
  );
  const { data, error } = await servico
    .from("grupos")
    .update({ cancelado_em: null, situacao: situacaoAnterior ?? "ativo", situacao_antes_do_cancelamento: null })
    .eq("id", grupoId)
    .is("dados_apagados_em", null)
    .select("id");
  if (error || !data || data.length === 0) {
    console.error(`[plataforma] desfazer cancelamento de ${grupoId} falhou: ${error?.message ?? "0 linhas"}`);
    return { ok: false, erro: "Não foi possível desfazer agora. Tente de novo." };
  }

  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "cancelamento_desfeito",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", cancelado_em: grupo.cancelado_em },
  });
  if (erroDoEvento) console.error(`[plataforma] evento do desfazer (${grupoId}) não gravado: ${erroDoEvento.message}`);

  revalidatePath("/plataforma");
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}

export type ResultadoDaLogoDoGrupo = ResultadoDaLogo;

/**
 * Troca a logo do grupo no CRM (0208). PNG, JPEG ou WebP até 1 MB, sem SVG;
 * o arquivo vai para o bucket público `empreendimentos`, em
 * `grupos/<grupo_id>/logo-<hash>.<ext>`.
 */
export async function trocarLogoDoGrupo(grupoId: string, dados: FormData): Promise<ResultadoDaLogoDoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const arquivo = dados.get("logo");
  const r = await gravarLogoDoGrupo(grupoId, arquivo instanceof File ? arquivo : null);
  if (!r.ok) return r;

  const { error: erroDoEvento } = await createServiceClient().from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "logo_do_grupo_alterada",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", mudanca: "trocada", url: r.url },
  });
  if (erroDoEvento) console.error(`[plataforma] evento da logo (${grupoId}) não gravado: ${erroDoEvento.message}`);
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return r;
}

/** Tira a logo: o CRM do grupo volta a mostrar o nome escrito. */
export async function tirarLogoDoGrupoNaPlataforma(grupoId: string): Promise<ResultadoDaLogoDoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };

  const r = await tirarLogoDoGrupo(grupoId);
  if (!r.ok) return r;

  const { error: erroDoEvento } = await createServiceClient().from("admin_eventos").insert({
    grupo_id: grupoId,
    acao: "logo_do_grupo_alterada",
    ator_id: null,
    ator_plataforma_user_id: guarda.userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", mudanca: "removida", url: null },
  });
  if (erroDoEvento) console.error(`[plataforma] evento da logo (${grupoId}) não gravado: ${erroDoEvento.message}`);
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return r;
}
