"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { redirect } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { caminhoDoStorage, extensaoPorTipo, validarMidia, type CampoMidia } from "@/lib/midiaCorretor";
import { createClient } from "@/lib/supabase/server";
import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";
import { normalizarWhatsapp } from "@/lib/whatsapp";

export type EstadoLogin = { erro?: string } | undefined;
export type EstadoForm = { erro?: string; ok?: string } | undefined;
/** Resultado das ações do funil — sucesso é a ausência de `erro`. */
export type ResultadoAcao = { erro?: string };

/**
 * Server Action é uma requisição POST à rota, não uma navegação — o
 * `proxy.ts` protege a navegação, mas não substitui esta checagem. Toda ação
 * do painel começa por aqui. Ver o aviso sobre isso na documentação do Next
 * (01-app/02-guides/authentication.md).
 */
async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return { supabase, user };
}

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { data: sessao, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });

  if (error) {
    return { erro: "E-mail ou senha inválidos." };
  }

  /*
   * Senha provisória entregue pelo gestor: manda direto para a troca.
   *
   * É redirect, não bloqueio em todas as rotas: bloquear daria loop (a
   * própria tela de senha é uma rota) e não protegeria ninguém além do dono
   * da conta. Quem ignorar segue com a senha que o gestor conhece — e o
   * banner do painel continua lembrando.
   */
  if (sessao?.user) {
    const { data: corretor } = await supabase
      .from("corretores")
      .select("deve_trocar_senha")
      .eq("user_id", sessao.user.id)
      .maybeSingle();

    if (corretor?.deve_trocar_senha) redirect("/corretor/senha");
  }

  redirect("/corretor");
}

export async function sair(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/corretor/entrar");
}

/**
 * Salva os campos que o corretor pode editar de si mesmo.
 *
 * Só `nome`, `whatsapp` e `bio` são enviados — `creci`, `slug` e `user_id`
 * não estão no formulário e, mais importante, o banco recusaria de qualquer
 * forma: a migration 0006 dá `grant update` apenas nessas colunas. A
 * validação abaixo é conveniência para o usuário, não a barreira de
 * segurança.
 */
export async function salvarPerfil(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const nome = String(formData.get("nome") ?? "").trim();
  const whatsappBruto = String(formData.get("whatsapp") ?? "");
  const bio = String(formData.get("bio") ?? "").trim();

  if (nome.length < 2 || nome.length > 120) {
    return { erro: "Informe seu nome completo." };
  }
  const whatsapp = normalizarWhatsapp(whatsappBruto);
  if (!whatsapp) {
    return { erro: "WhatsApp inválido. Use DDD + número, ex.: (11) 91234-5678." };
  }
  if (bio.length > 600) {
    return { erro: "A apresentação está muito longa (máximo 600 caracteres)." };
  }

  // `.select()` no fim é essencial, não enfeite: sem policy de UPDATE o RLS
  // não devolve erro — ele simplesmente não afeta linha nenhuma. Sem
  // conferir o que voltou, a tela diria "salvo" sem ter salvado nada.
  const { data, error } = await supabase
    .from("corretores")
    .update({ nome, whatsapp, bio: bio || null })
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return {
      erro: "Sem permissão para editar este cadastro. Fale com quem administra o site.",
    };
  }

  // A página pública do corretor e a vitrine da equipe leem esses campos.
  revalidatePath("/corretor/perfil");
  revalidatePath("/corretores");
  return { ok: "Perfil atualizado." };
}

/**
 * Upload de avatar ou fundo (vídeo ou foto) pro Storage, e grava a URL
 * pública na coluna certa. `campo` decide tudo: qual limite de
 * tamanho/tipo vale, em qual coluna a URL entra, e — pros dois campos de
 * fundo — qual `fundo_tipo` a mudança implica (subir um vídeo de fundo
 * troca `fundo_tipo` pra 'video' mesmo que estivesse em 'foto', e
 * vice-versa; não existe um "trocar o tipo" sem enviar o arquivo daquele
 * tipo — evita `fundo_tipo` apontando pra uma URL que nunca existiu).
 */
export async function enviarMidiaCorretor(
  campo: CampoMidia,
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo." };
  }

  const erroValidacao = validarMidia(campo, arquivo);
  if (erroValidacao) return { erro: erroValidacao };

  const { data: linhaAtual } = await supabase
    .from("corretores")
    .select("id, foto_url, video_url, fundo_foto_url")
    .eq("user_id", user.id)
    .single();

  if (!linhaAtual) {
    return { erro: "Sem permissão para editar este cadastro. Fale com quem administra o site." };
  }

  const caminho = `corretores/${linhaAtual.id}/${campo}-${Date.now()}.${extensaoPorTipo(arquivo.type)}`;
  const { error: erroUpload } = await supabase.storage
    .from("empreendimentos")
    .upload(caminho, arquivo);

  if (erroUpload) {
    return { erro: "Não foi possível enviar o arquivo. Tente novamente." };
  }

  const { data: urlPublica } = supabase.storage.from("empreendimentos").getPublicUrl(caminho);

  const resultado =
    campo === "avatar"
      ? await supabase
          .from("corretores")
          .update({ foto_url: urlPublica.publicUrl })
          .eq("user_id", user.id)
          .select("id")
      : campo === "fundo_video"
        ? await supabase
            .from("corretores")
            .update({ video_url: urlPublica.publicUrl, fundo_tipo: "video" })
            .eq("user_id", user.id)
            .select("id")
        : await supabase
            .from("corretores")
            .update({ fundo_foto_url: urlPublica.publicUrl, fundo_tipo: "foto" })
            .eq("user_id", user.id)
            .select("id");

  if (resultado.error || !resultado.data || resultado.data.length === 0) {
    await supabase.storage.from("empreendimentos").remove([caminho]);
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  const urlAntiga =
    campo === "avatar"
      ? linhaAtual.foto_url
      : campo === "fundo_video"
        ? linhaAtual.video_url
        : linhaAtual.fundo_foto_url;

  if (urlAntiga) {
    const caminhoAntigo = caminhoDoStorage(urlAntiga);
    if (caminhoAntigo) await supabase.storage.from("empreendimentos").remove([caminhoAntigo]);
  }

  revalidatePath("/corretor/perfil");
  revalidatePath("/corretores");
  revalidatePath("/", "layout");
  revalidatePath("/portfolio", "layout");
  revalidatePath("/empreendimentos", "layout");

  return { ok: "Enviado com sucesso." };
}

/**
 * Substitui a lista inteira de destaques do corretor logado. Sempre
 * apaga-e-recria em vez de um PATCH incremental: são no máximo 15 linhas, e
 * o cliente já manda o array final a cada mudança (adicionar, remover ou
 * reordenar) — mais simples de acertar do que reconciliar um diff.
 */
export async function salvarDestaques(slugs: string[]): Promise<ResultadoAcao> {
  const { supabase, user } = await exigirSessao();

  if (slugs.length > 15) {
    return { erro: "Máximo de 15 destaques." };
  }

  const { data: corretor } = await supabase
    .from("corretores")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!corretor) {
    return { erro: "Sem permissão para editar este cadastro. Fale com quem administra o site." };
  }

  const { error: erroApagar } = await supabase
    .from("corretor_destaques")
    .delete()
    .eq("corretor_id", corretor.id);

  if (erroApagar) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  if (slugs.length === 0) {
    revalidatePath("/corretor/links");
    return {};
  }

  const { error: erroInserir } = await supabase.from("corretor_destaques").insert(
    slugs.map((slug, index) => ({
      corretor_id: corretor.id,
      empreendimento_slug: slug,
      posicao: index,
    })),
  );

  if (erroInserir) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }

  revalidatePath("/corretor/links");
  return {};
}

/**
 * Troca a senha revalidando a atual antes.
 *
 * `auth.updateUser` sozinho aceitaria a troca só com a sessão válida — o que
 * deixaria qualquer sessão esquecida num computador emprestado trocar a senha
 * sem conhecer a antiga. O `signInWithPassword` abaixo fecha isso.
 */
export async function trocarSenha(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (nova.length < 8) {
    return { erro: "A nova senha precisa ter pelo menos 8 caracteres." };
  }
  if (nova !== confirmacao) {
    return { erro: "A confirmação não confere com a nova senha." };
  }
  if (nova === atual) {
    return { erro: "A nova senha precisa ser diferente da atual." };
  }
  if (!user.email) {
    return { erro: "Esta conta não tem e-mail cadastrado; fale com o administrador." };
  }

  const { error: erroAtual } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: atual,
  });
  if (erroAtual) {
    return { erro: "A senha atual está incorreta." };
  }

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    return { erro: "Não foi possível trocar a senha agora. Tente novamente." };
  }

  // A senha deixou de ser a provisória do gestor: some o redirect do login e
  // o aviso do painel.
  await supabase
    .from("corretores")
    .update({ deve_trocar_senha: false })
    .eq("user_id", user.id);

  return { ok: "Senha alterada." };
}

/**
 * Move um lead de etapa no funil.
 *
 * O `.select("id")` no fim segue a mesma regra do `salvarPerfil`, e aqui ela
 * é ainda mais necessária: a tela usa `useOptimistic`, então o cartão já
 * pulou de coluna antes de o servidor responder. Sem conferir as linhas
 * afetadas, um lead de outro corretor pareceria ter se movido — e só um
 * recarregamento revelaria que nada aconteceu.
 */
export async function moverEtapa(leadId: string, etapa: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  // `etapa` chega tipada como `string`, e não como `EtapaFunil`, de
  // propósito: Server Action é um endpoint HTTP: o argumento vem pela rede e
  // o tipo do TypeScript some na compilação. A lista fechada é a validação
  // real — o `check` da migration é a segunda linha de defesa, não a
  // primeira.
  if (!ETAPAS_FUNIL.includes(etapa as EtapaFunil)) {
    return { erro: "Etapa desconhecida." };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ etapa, etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível mover agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este lead não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor");
  return {};
}

/**
 * Passa um lead para outro corretor. Só gestor.
 *
 * A checagem de papel aqui é conveniência: quem decide de verdade é o
 * `with check` da policy (0007), que exige que um corretor comum termine
 * dono do lead — ou seja, ele não consegue nem doar nem roubar. A mensagem
 * abaixo existe para o gestor entender o que houve, não para barrar ninguém.
 */
export async function atribuirLead(
  leadId: string,
  corretorId: string,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const { data, error } = await supabase
    .from("leads")
    .update({ corretor_id: corretorId, origem_atribuicao: "manual" })
    .eq("id", leadId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível atribuir agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Sem permissão para atribuir este lead." };
  }

  revalidatePath("/corretor/equipe");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/leads");
  return {};
}

/**
 * Liga/desliga a pausa temporária de um corretor na escala da roleta. Só
 * gestor — mesma checagem de `atribuirLead`.
 */
export async function alternarPausa(
  corretorId: string,
  pausado: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const { data, error } = await supabase
    .from("corretores")
    .update({ em_pausa: pausado })
    .eq("id", corretorId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Corretor não encontrado." };
  }

  revalidatePath("/corretor/equipe");
  return {};
}

/**
 * Marca (ou apaga, com `quando = null`) a data/hora de uma visita agendada.
 *
 * Não mexe em `etapa` — a etapa muda por `moverEtapa`, como qualquer outra.
 * As duas ações ficam separadas porque o corretor pode reagendar uma visita
 * sem que isso conte como "mudou de etapa" de novo (o card não deve pular a
 * animação/optimistic update do funil só por causa de horário).
 */
export async function definirVisitaEm(
  leadId: string,
  quando: string | null,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  if (quando !== null && Number.isNaN(Date.parse(quando))) {
    return { erro: "Data inválida." };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ visita_agendada_em: quando })
    .eq("id", leadId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este lead não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/visitas");
  revalidatePath("/corretor");
  return {};
}

/**
 * Cria um template. `padrao: true` desmarca qualquer outro padrão do mesmo
 * corretor antes de gravar o novo — só um padrão por vez.
 */
export async function criarTemplate(
  titulo: string,
  conteudo: string,
  padrao: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const tituloLimpo = titulo.trim();
  const conteudoLimpo = conteudo.trim();
  if (tituloLimpo.length < 2 || tituloLimpo.length > 120) {
    return { erro: "Informe um título entre 2 e 120 caracteres." };
  }
  if (conteudoLimpo.length < 2 || conteudoLimpo.length > 2000) {
    return { erro: "A mensagem precisa ter entre 2 e 2000 caracteres." };
  }

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  if (padrao) {
    await supabase
      .from("templates_mensagens")
      .update({ padrao: false })
      .eq("corretor_id", corretor.id)
      .eq("padrao", true);
  }

  const { data, error } = await supabase
    .from("templates_mensagens")
    .insert({ corretor_id: corretor.id, titulo: tituloLimpo, conteudo: conteudoLimpo, padrao })
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Não foi possível salvar o template." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/** Edita um template existente. Mesma regra de `padrao` de `criarTemplate`. */
export async function editarTemplate(
  id: string,
  titulo: string,
  conteudo: string,
  padrao: boolean,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const tituloLimpo = titulo.trim();
  const conteudoLimpo = conteudo.trim();
  if (tituloLimpo.length < 2 || tituloLimpo.length > 120) {
    return { erro: "Informe um título entre 2 e 120 caracteres." };
  }
  if (conteudoLimpo.length < 2 || conteudoLimpo.length > 2000) {
    return { erro: "A mensagem precisa ter entre 2 e 2000 caracteres." };
  }

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  if (padrao) {
    await supabase
      .from("templates_mensagens")
      .update({ padrao: false })
      .eq("corretor_id", corretor.id)
      .eq("padrao", true)
      .neq("id", id);
  }

  const { data, error } = await supabase
    .from("templates_mensagens")
    .update({ titulo: tituloLimpo, conteudo: conteudoLimpo, padrao })
    .eq("id", id)
    .select("id");

  if (error) {
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este template não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/** Apaga um template. Sem confirmação no servidor — a UI confirma antes de chamar. */
export async function apagarTemplate(id: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const { data, error } = await supabase
    .from("templates_mensagens")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) {
    return { erro: "Não foi possível apagar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este template não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/templates");
  return {};
}

/**
 * Registra que uma aba de WhatsApp foi aberta para este lead com esta
 * mensagem. Não confirma entrega — `wa.me` não permite isso; é só o
 * registro de que o corretor disparou o envio em massa para este contato.
 */
export async function registrarEnvio(leadId: string, mensagem: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  const corretor = await getCorretorLogado();
  if (!corretor) {
    return { erro: "Conta sem vínculo de corretor." };
  }

  const { error } = await supabase.from("historico_envios").insert({
    lead_id: leadId,
    corretor_id: corretor.id,
    mensagem_enviada: mensagem,
  });

  if (error) {
    return { erro: "Não foi possível registrar o envio." };
  }

  return {};
}
