"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { revalidarCorretores } from "@/lib/catalogo/revalidar";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import {
  candidatosDeEmail,
  emailInicial,
  normalizarParaEmail,
  senhaInicial,
} from "@/lib/corretores/credenciaisIniciais";

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
  // Delega para a normalização compartilhada: o slug e o e-mail de acesso
  // saem do MESMO nome, e duas cópias da regra divergiriam no primeiro
  // "Antônio" — o slug com acento removido de um jeito e o e-mail de outro.
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
 * O e-mail de acesso está livre em todos os grupos e no Auth? Mesma razão do
 * slug: pela sessão o gestor só veria o próprio grupo. Erro conta como
 * ocupado, para o lote seguir para o próximo candidato em vez de bater no
 * Auth.
 */
async function emailDeAcessoLivre(
  supabase: Awaited<ReturnType<typeof createClient>>,
  email: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("email_de_acesso_livre", { p_email: email });
  if (error) {
    console.error("[admin] falha ao conferir e-mail livre:", error.message);
    return false;
  }
  return data === true;
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
  /*
   * Senha explícita, só para o lote de bootstrap (`criarAcessosQueFaltam`),
   * onde a regra precisa ser uma só para todo mundo e ditável por WhatsApp.
   * Sem ela vale o de sempre — 12 caracteres aleatórios —, que continua
   * sendo o certo para criação avulsa e para redefinição.
   */
  senhaEscolhida?: string,
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
    .select("id, nome, slug, user_id, grupo_id")
    .eq("id", corretorId)
    .maybeSingle();

  // `corretores` é pública para leitura: a ficha de outro grupo aparece no
  // select acima. O login nasce no grupo de quem cria, e só para a equipe
  // dele.
  if (!alvo || alvo.grupo_id !== guarda.corretor.grupoId) return { erro: "Corretor não encontrado." };
  if (alvo.user_id) return { erro: "Este corretor já tem acesso. Use 'Redefinir senha'." };

  /*
   * O slug tem que existir ANTES do login. `getCorretorLogado()` devolve
   * `null` quando o slug é nulo (corretorSessao.ts) — a pessoa entraria com
   * a senha certa e cairia direto em "Conta sem vínculo", com o painel vazio.
   */
  const slug = alvo.slug ?? (await slugDisponivel(supabase, slugificar(alvo.nome)));

  const senha = senhaEscolhida ?? senhaTemporaria();
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

  // O grupo vai junto e no filtro: a chave de serviço ignora a RLS, e o
  // gatilho de grupo (0182) recusa mudar o grupo de uma ficha.
  const { error: erroVinculo } = await servico
    .from("corretores")
    .update({
      user_id: criado.user.id,
      email: emailLimpo,
      slug,
      deve_trocar_senha: true,
      grupo_id: guarda.corretor.grupoId,
    })
    .eq("id", corretorId)
    .eq("grupo_id", guarda.corretor.grupoId);

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

  revalidarCorretores();
  revalidatePath("/corretor/admin/contas");
  return { ok: true, email: emailLimpo, senha, slug };
}

export type DadosNovoCorretor = { nome: string; creci: string; whatsapp: string; email: string };

/**
 * Cadastra um corretor novo (ficha + login) de uma vez (07/10/2026).
 *
 * Até aqui só existia "Criar acesso" para quem JÁ tinha ficha, e ficha nova
 * só nascia por SQL. `corretores` não tem policy de INSERT de propósito (a
 * tabela é pública para leitura), então quem grava é a chave de serviço,
 * depois de `exigirGestorNaAcao()` decidir que pode.
 *
 * Se o login falhar, a ficha é apagada: sem isso sobraria um corretor sem
 * acesso que aparece no site, e a próxima tentativa com o mesmo nome
 * ganharia slug com sufixo.
 */
export async function cadastrarCorretor(dados: DadosNovoCorretor): Promise<ResultadoCriarAcesso> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };

  const nome = dados.nome.trim().replace(/\s+/g, " ");
  const creci = dados.creci.trim();
  const email = dados.email.trim().toLowerCase();
  const whatsapp = normalizarTelefoneBr(dados.whatsapp);
  if (nome.length < 3) return { erro: "Informe o nome do corretor." };
  if (!creci) return { erro: "Informe o CRECI." };
  if (!whatsapp || whatsapp.length < 12 || whatsapp.length > 13) {
    return { erro: "WhatsApp inválido. Use DDD + número, por exemplo (11) 98765-4321." };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." };

  const supabase = await createClient();
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
    return { erro: "Não foi possível cadastrar o corretor agora. Tente de novo." };
  }

  const acesso = await criarAcessoCorretor(ficha.id, email);
  if (!acesso.ok) {
    await servico.from("corretores").delete().eq("id", ficha.id);
    return { erro: acesso.erro };
  }
  return acesso;
}

export type AcessoEmLote = {
  nome: string;
  email: string;
  senha: string;
  slug: string;
};

export type ResultadoLoteAcessos = {
  criados: AcessoEmLote[];
  falhas: { nome: string; motivo: string }[];
  erro?: string;
};

/**
 * Cria de uma vez o acesso de todo corretor ATIVO que ainda não tem login.
 *
 * Existe porque a roleta de leads (0093) prefere quem tem login e quem tem
 * WhatsApp no ar — e enquanto 7 dos 8 corretores não conseguem entrar no
 * painel, essa preferência não distribui nada. Criar um a um pela tela, com
 * e-mail digitado à mão, é onde nasce o "next123 para todo mundo".
 *
 * A credencial é derivada, não sorteada: e-mail do SLUG (que já é UNIQUE no
 * banco, então nasce único) e senha pela regra de `credenciaisIniciais.ts`.
 * As duas metades são previsíveis de propósito, para caberem numa mensagem
 * de WhatsApp — quem fecha a janela é `deve_trocar_senha: true`, que o
 * `criarAcessoCorretor` já grava e que manda o primeiro login para
 * `/corretor/senha` antes de qualquer tela.
 *
 * Falha de um corretor NÃO aborta os outros: num lote, parar no primeiro
 * erro deixaria metade criada e metade não, sem ninguém saber onde parou.
 * O que não deu certo volta nomeado.
 */
export async function criarAcessosQueFaltam(): Promise<ResultadoLoteAcessos> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { criados: [], falhas: [], erro: guarda.erro };

  const supabase = await createClient();
  const { data: pendentes, error } = await supabase
    .from("corretores")
    .select("id, nome, slug, whatsapp")
    .eq("ativo", true)
    .is("user_id", null)
    // `corretores` é pública para leitura: sem o filtro, o lote tentaria
    // criar login para a equipe de outro grupo.
    .eq("grupo_id", guarda.corretor.grupoId)
    .order("nome");

  if (error) return { criados: [], falhas: [], erro: "Não foi possível ler a equipe." };

  /*
   * Os endereços já usados neste lote, para o primeiro nome não colidir. O
   * slug era UNIQUE no banco e dava a unicidade de graça; primeiro nome não
   * dá, e e-mail no Auth é único — um segundo "Eduardo" derrubaria a criação
   * dele. Os de antes do lote, de qualquer grupo, quem responde é
   * `email_de_acesso_livre` (0183): pela sessão o gestor só veria o próprio.
   */
  const ocupados = new Set<string>();

  const criados: AcessoEmLote[] = [];
  const falhas: { nome: string; motivo: string }[] = [];

  for (const corretor of pendentes ?? []) {
    /*
     * O slug pode ser nulo aqui (é o caso de "Equipe Next Home"), e é o
     * `criarAcessoCorretor` que o gera. Só que o e-mail SAI do slug, então
     * ele precisa existir antes — e gerá-lo aqui criaria uma segunda regra
     * de slug para divergir da primeira. Sem slug, o corretor fica de fora
     * com o motivo escrito.
     */
    if (!corretor.slug) {
      falhas.push({
        nome: corretor.nome,
        motivo: "Sem link pessoal (slug). Abra a ficha, salve o cadastro e tente de novo.",
      });
      continue;
    }

    let email: string;
    let senha: string;
    try {
      // Primeiro nome livre; se estiver tomado, cai para nome+sobrenome e
      // depois para o slug inteiro. O último candidato sempre existe.
      const candidatos = candidatosDeEmail(corretor.nome, corretor.slug).map(emailInicial);
      let livre: string | undefined;
      for (const candidato of candidatos) {
        if (ocupados.has(candidato.toLowerCase())) continue;
        if (await emailDeAcessoLivre(supabase, candidato)) {
          livre = candidato;
          break;
        }
      }
      email = livre ?? candidatos[0];
      senha = senhaInicial(corretor.whatsapp);
    } catch (e) {
      falhas.push({ nome: corretor.nome, motivo: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const r = await criarAcessoCorretor(corretor.id, email, senha);
    if (r.ok) {
      // Dentro do MESMO lote dois "Eduardo" colidiriam: a consulta acima é de
      // antes do laço, e o e-mail recém-criado ainda não estava lá.
      ocupados.add(r.email.toLowerCase());
      criados.push({ nome: corretor.nome, email: r.email, senha: r.senha, slug: r.slug });
    }
    else falhas.push({ nome: corretor.nome, motivo: r.erro });
  }

  revalidarCorretores();
  revalidatePath("/corretor/admin/contas");
  return { criados, falhas };
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
    // A senha nova sai pela chave de serviço: a ficha tem de ser do grupo
    // de quem pede, senão o gestor de um grupo redefiniria a de outro.
    .eq("grupo_id", guarda.corretor.grupoId)
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

  revalidarCorretores();
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

  // Primeiro a carteira e a origem de cada lead: o update abaixo sobrescreve
  // `origem_atribuicao` com `manual`, e a fase 5 precisa saber de onde cada
  // um veio (L30).
  let leitura = supabase.from("leads").select("id, origem_atribuicao");
  leitura = deId === null ? leitura.is("corretor_id", null) : leitura.eq("corretor_id", deId);
  const { data: carteira, error: erroLeitura } = await leitura;
  if (erroLeitura) return { erro: traduzirErroBanco(erroLeitura.message) };
  if (!carteira || carteira.length === 0) {
    return { ok: deId === null ? "Não havia leads sem dono." : "Este corretor não tem leads." };
  }

  // O registro da origem vem ANTES do update: gravado depois, uma falha no
  // meio perderia a origem para sempre. Se o update falhar, sobra uma linha
  // de repasse com a origem que o lead ainda tem, o que não engana ninguém.
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
  if (mensagem.includes("Só quem administra")) {
    return "Esta ação é restrita a quem administra a imobiliária.";
  }
  return "Não foi possível concluir a ação agora. Tente novamente.";
}
