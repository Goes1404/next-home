"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { desconectarInstancia } from "@/lib/whatsapp/provider";
import { listarGruposWhatsapp, listarParticipantesDoGrupo, type GrupoWhatsapp } from "@/lib/whatsapp/provider";
import { colunasDaLista, listaGuardada } from "@/lib/whatsapp/gruposGuardados";
import { lidDoCorretor, mensagemDaSincronizacao, planejarVinculos } from "@/lib/whatsapp/vinculoNoGrupo";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { chaveDoNome, nomeEsperadoDoGrupo, validarPadraoDoNome } from "@/lib/whatsapp/nomeDoGrupoDeLeads";
import { validarModeloDoAviso } from "@/lib/whatsapp/avisoNoGrupoTexto";

/**
 * O ADM derruba o número de um corretor (30/09/2026, 0134).
 *
 * Existe para o caso de alguém sair da empresa ou perder o aparelho com o
 * número ainda respondendo em nome da imobiliária. É o único poder do ADM
 * sobre o WhatsApp de outro: ele não conecta (isso exige o celular do dono)
 * e não mexe no tom da IA de ninguém.
 *
 * Desde a 0134 a RLS não dá ao gestor a instância alheia, então a escrita
 * vai pela chave de serviço, DEPOIS da guarda de papel. Fica registrada em
 * `admin_eventos`, com quem fez, para o corretor saber por que caiu.
 *
 * O `corretorId` vem do navegador, e a chave de serviço enxerga todos os
 * grupos: a instância só é lida se for do grupo do gestor (L16). Sem isso o
 * gestor de outra empresa derrubaria o número de um corretor daqui.
 */
export async function desconectarNumeroDoCorretor(
  corretorId: string,
): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const servico = createServiceClient();
  const { data: instancia } = await servico
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name")
    .eq("corretor_id", corretorId)
    .eq("grupo_id", guarda.corretor.grupoId)
    .maybeSingle();
  if (!instancia?.instance_name) return { erro: "Este corretor não tem número conectado." };

  const resultado = await desconectarInstancia(instancia.instance_name);
  if (!resultado.ok) {
    return { erro: resultado.detalhe || "Não foi possível desconectar agora. Tente novamente." };
  }

  await servico
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "desconectado",
      // Zerar a base da curva de aquecimento: número novo não herda a
      // maturidade do anterior (mesma regra do botão do próprio corretor).
      conectado_em: null,
      telefone_conectado: null,
      qrcode_base64: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instancia.id)
    .eq("grupo_id", guarda.corretor.grupoId);

  await servico.from("admin_eventos").insert({
    ator_id: guarda.corretor.id,
    acao: "numero_desconectado",
    alvo_corretor_id: corretorId,
  });

  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
  return { ok: "Número desconectado. A IA desse corretor para até ele conectar de novo." };
}

/**
 * O número central sem escolha na tela (28/10/2026): vale o salvo; sem ele,
 * o da conta do gestor que está agindo, se conectado, e fica salvo. O salvo
 * não troca sozinho: outro gestor sincronizando não tira o número que já está
 * nos grupos.
 */
async function garantirNumeroCentral(
  servico: ReturnType<typeof createServiceClient>,
  grupoId: string,
  gestorId: string,
): Promise<{ instancia: string; padrao: string | null } | { erro: string }> {
  const { data: configuracao, error } = await servico
    .from("grupos")
    .select("envio_grupo_leads_ativo, envio_grupo_leads_instancia, padrao_nome_grupo_leads")
    .eq("id", grupoId)
    .maybeSingle();
  if (error) return { erro: "Não foi possível ler a configuração agora." };
  const padrao = configuracao?.padrao_nome_grupo_leads ?? null;
  if (configuracao?.envio_grupo_leads_ativo && configuracao.envio_grupo_leads_instancia) {
    return { instancia: configuracao.envio_grupo_leads_instancia, padrao };
  }

  const { data: propria } = await servico
    .from("corretor_whatsapp_instancias")
    .select("instance_name, status_conexao, conectado_em")
    .eq("grupo_id", grupoId)
    .eq("corretor_id", gestorId)
    .maybeSingle();
  if (!propria || propria.status_conexao !== "conectado" || !propria.conectado_em) {
    return { erro: "Conecte o WhatsApp desta conta: é ele que manda os avisos nos grupos." };
  }
  const { error: erroSalvar } = await servico
    .from("grupos")
    .update({ envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: propria.instance_name })
    .eq("id", grupoId);
  if (erroSalvar) return { erro: "Não foi possível salvar o número central." };
  return { instancia: propria.instance_name, padrao };
}

/** Decide se a roleta pode entregar lead a corretor sem WhatsApp conectado. */
export async function configurarPuloDeCorretorDesconectado(
  ativado: boolean,
): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const { error } = await createServiceClient()
    .from("grupos")
    .update({ pular_corretor_whatsapp_desconectado: ativado })
    .eq("id", guarda.corretor.grupoId);
  if (error) return { erro: "Nao foi possivel salvar esta regra agora." };

  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
  return {
    ok: ativado
      ? "A roleta vai pular corretores com WhatsApp desconectado."
      : "A roleta volta a apenas priorizar quem estiver conectado.",
  };
}

/**
 * Confirmação automática de visita (0246, 29/10/2026): com a opção ligada,
 * o sistema pede a confirmação ao cliente sozinho, até 24h antes, com as
 * travas do lembrete de véspera. Desligada (padrão), só pelo toque do
 * corretor na Agenda.
 */
export async function configurarConfirmacaoAutomatica(ligada: boolean): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const { error } = await createServiceClient()
    .from("grupos")
    .update({ confirmacao_visita_automatica: ligada })
    .eq("id", guarda.corretor.grupoId);
  if (error) {
    return {
      erro: /confirmacao_visita_automatica/.test(error.message)
        ? "A confirmação automática ainda não foi ativada no banco."
        : "Não foi possível salvar agora.",
    };
  }
  revalidatePath("/corretor/agenda");
  return {
    ok: ligada
      ? "Ligada: a confirmação é pedida sozinha até 24h antes de cada visita."
      : "Desligada: a confirmação só sai pelo toque do corretor.",
  };
}

/**
 * Comandos pelo WhatsApp (0249; plano da onda 0, Task 8): ligado, o número
 * central atende a equipe desta imobiliária. Desligado (padrão), o central
 * fica em silêncio para quem é daqui, e o aviso de queda sai só por e-mail.
 */
export async function configurarCentralWhatsapp(ligado: boolean): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };

  const { error } = await createServiceClient()
    .from("grupos")
    .update({ central_whatsapp_ativo: ligado })
    .eq("id", guarda.corretor.grupoId);
  if (error) {
    return {
      erro: /central_whatsapp_ativo/.test(error.message)
        ? "Os comandos pelo WhatsApp ainda não foram ativados no banco."
        : "Não foi possível salvar agora.",
    };
  }
  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/whatsapp");
  return {
    ok: ligado
      ? "Ligado: a equipe já pode mandar mensagem para o número central."
      : "Desligado: o número central não responde mais a equipe.",
  };
}

type Servico = ReturnType<typeof createServiceClient>;

/** A lista de grupos guardada no grupo do gestor (0234), se for deste número. */
async function lerListaDeGrupos(servico: Servico, grupoId: string, instancia: string) {
  const { data } = await servico
    .from("grupos")
    .select("grupos_whatsapp_do_central, grupos_whatsapp_instancia, grupos_whatsapp_lidos_em")
    .eq("id", grupoId)
    .maybeSingle();
  return listaGuardada(data, instancia);
}

/** Guarda a lista recém-lida; falha só vai ao log (a ação já tem a lista). */
async function guardarListaDeGrupos(servico: Servico, grupoId: string, instancia: string, grupos: GrupoWhatsapp[]) {
  const { error } = await servico.from("grupos").update(colunasDaLista(instancia, grupos)).eq("id", grupoId);
  if (error) console.error("[grupos] falha ao guardar a lista de grupos", error.message);
}

/**
 * Procura, nos grupos do número central, o grupo de cada corretor pelo padrão
 * de nome da imobiliária (`{corretor} & {imobiliaria}` se ela não escolheu
 * outro) e guarda o JID, nunca o nome visível, como destino do envio. Grupo
 * escolhido à mão pelo gestor fica como está, e não é entregue a outro.
 *
 * Cada corretor tem o grupo só dele: grupo que cai em mais de um corretor é
 * recusado para todos eles (spec 6.4). Para cada grupo vinculado, lê quem
 * está nele e guarda o `@lid` do corretor, achado pelo número dele na lista
 * (nunca por adivinhação). Falha ao ler os participantes não desfaz o
 * vínculo do grupo.
 */
export async function sincronizarGruposDeLeads(): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const servico = createServiceClient();
  const grupoId = guarda.corretor.grupoId;
  const central = await garantirNumeroCentral(servico, grupoId, guarda.corretor.id);
  if ("erro" in central) return { erro: central.erro };
  const instancia = central.instancia;

  // Lista nova: o número central pode ter entrado num grupo agora. Fica
  // guardada no grupo para a aba não esperar a Evolution (0234).
  const lista = await listarGruposWhatsapp(instancia, { fresca: true });
  if (lista.erro) return { erro: lista.erro };
  await guardarListaDeGrupos(servico, grupoId, instancia, lista.grupos);
  const { data: corretores, error } = await servico
    .from("corretores")
    .select("id, nome, whatsapp, whatsapp_grupo_leads_jid, whatsapp_grupo_leads_manual")
    .eq("grupo_id", grupoId)
    .eq("ativo", true)
    .eq("papel", "corretor");
  if (error) return { erro: "Não foi possível ler a equipe agora." };

  // O vínculo escolhido à mão fica de fora: nem o corretor é re-vinculado,
  // nem o grupo dele vai para outro corretor que tenha o nome parecido.
  const daMao = (corretores ?? []).filter((c) => c.whatsapp_grupo_leads_manual);
  const jidsDaMao = new Set(daMao.map((c) => c.whatsapp_grupo_leads_jid).filter(Boolean));
  const imobiliaria = (await lerMarcaDoCrm(grupoId)).nome;
  const padrao = central.padrao;
  const plano = planejarVinculos(
    (corretores ?? []).filter((c) => !c.whatsapp_grupo_leads_manual),
    lista.grupos.filter((g) => !jidsDaMao.has(g.jid)),
    (nome) => chaveDoNome(nomeEsperadoDoGrupo(padrao, nome, imobiliaria)),
    chaveDoNome,
  );

  // Não manter um JID antigo depois que o grupo foi renomeado, apagado ou
  // passou a servir a dois corretores (ou a ter um homônimo): é preferível o CRM registrar a falha
  // a expor lead no grupo errado.
  let semGrupo = 0;
  for (const corretor of [
    ...plano.semGrupo,
    ...plano.repetidos.flatMap((r) => r.corretores),
    ...plano.gruposComMesmoNome.flatMap((r) => r.corretores),
  ]) {
    const { error: erroLimpar } = await servico
      .from("corretores")
      .update({ whatsapp_grupo_leads_jid: null, whatsapp_grupo_leads_nome: null })
      .eq("id", corretor.id)
      .eq("grupo_id", grupoId);
    if (!erroLimpar && plano.semGrupo.includes(corretor)) semGrupo++;
  }

  let vinculados = 0;
  for (const { corretor, grupo } of plano.vinculos) {
    const { error: erroUpdate } = await servico
      .from("corretores")
      .update({ whatsapp_grupo_leads_jid: grupo.jid, whatsapp_grupo_leads_nome: grupo.nome })
      .eq("id", corretor.id)
      .eq("grupo_id", grupoId);
    if (erroUpdate) continue;
    vinculados++;
    await guardarLidDoCorretor(servico, grupoId, instancia, corretor, grupo.jid);
  }

  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
  const mensagem = mensagemDaSincronizacao({
    vinculados,
    semGrupo,
    repetidos: plano.repetidos.map((r) => ({ grupoNome: r.grupo.nome })),
    gruposComMesmoNome: plano.gruposComMesmoNome.map((r) => ({ grupoNome: r.grupos[0].nome })),
  });
  const recusados = plano.repetidos.length + plano.gruposComMesmoNome.length;
  return !vinculados && recusados ? { erro: mensagem } : { ok: mensagem };
}

/**
 * Guarda o `@lid` do corretor lendo quem está no grupo dele. Só grava o par
 * número↔lid que a lista traz; se o corretor não aparece, ou aparece só com
 * o número, o que já estava guardado fica como está. Nunca lança: o vínculo
 * do grupo já foi salvo e não pode ser desfeito por esta leitura.
 */
async function guardarLidDoCorretor(
  servico: ReturnType<typeof createServiceClient>,
  grupoId: string,
  instancia: string,
  corretor: { id: string; whatsapp: string | null },
  grupoJid: string,
): Promise<void> {
  try {
    const leitura = await listarParticipantesDoGrupo(instancia, grupoJid);
    if (leitura.erro) {
      console.error("[grupos] participantes do grupo não lidos; o vínculo do grupo foi mantido", {
        corretorId: corretor.id,
        erro: leitura.erro,
      });
      return;
    }
    const achado = lidDoCorretor(leitura.participantes, corretor.whatsapp);
    // Sem o par número↔lid na lista, o que já estava guardado fica como está.
    if (achado.achou !== "lid") return;
    const { error } = await servico
      .from("corretores")
      .update({ whatsapp_lid: achado.lid })
      .eq("id", corretor.id)
      .eq("grupo_id", grupoId);
    if (error) {
      console.error("[grupos] não foi possível guardar o id do corretor no grupo", {
        corretorId: corretor.id,
        erro: error.message,
      });
    }
  } catch (err) {
    console.error("[grupos] falha ao ler os participantes do grupo", {
      corretorId: corretor.id,
      erro: err instanceof Error ? err.message : String(err),
    });
  }
}

/** O padrão do nome dos grupos dos corretores; vazio volta ao de fábrica. */
export async function configurarNomeDosGrupos(entrada: string): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const validado = validarPadraoDoNome(entrada);
  if (!validado.ok) return { erro: validado.erro };
  const { error } = await createServiceClient()
    .from("grupos")
    .update({ padrao_nome_grupo_leads: validado.padrao })
    .eq("id", guarda.corretor.grupoId);
  if (error) return { erro: "Não foi possível salvar o nome dos grupos agora." };
  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
  return { ok: "Nome dos grupos salvo. Agora sincronize os grupos dos corretores." };
}

/** O relatório que chega no grupo a cada lead (0229). Vazio volta ao padrão. */
export async function configurarRelatorioNoGrupo(entrada: string): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const validado = validarModeloDoAviso(entrada);
  if (!validado.ok) return { erro: validado.erro };
  const { error } = await createServiceClient()
    .from("grupos")
    .update({ texto_aviso_grupo_leads: validado.modelo })
    .eq("id", guarda.corretor.grupoId);
  if (error) return { erro: "Não foi possível salvar o relatório agora." };
  revalidatePath("/corretor/marketing/impulsionamentos");
  return { ok: validado.modelo ? "Relatório salvo. Vale para os próximos leads." : "Relatório voltou ao padrão." };
}

/**
 * O gestor escolhe à mão o grupo de um corretor (grupo com apelido, nome
 * antigo...), ou desfaz a escolha (`null`) e devolve o corretor para a
 * sincronização. Só vale grupo do número central que nenhum outro corretor
 * da imobiliária usa: um grupo, um corretor (spec 6.4).
 */
export async function vincularGrupoDoCorretor(
  corretorId: string,
  grupoJid: string | null,
): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const servico = createServiceClient();
  const grupoId = guarda.corretor.grupoId;

  const { data: corretor } = await servico
    .from("corretores")
    .select("id, whatsapp")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .eq("ativo", true)
    .eq("papel", "corretor")
    .maybeSingle();
  if (!corretor) return { erro: "Corretor não encontrado." };

  if (!grupoJid) {
    const { error } = await servico
      .from("corretores")
      .update({ whatsapp_grupo_leads_jid: null, whatsapp_grupo_leads_nome: null, whatsapp_grupo_leads_manual: false })
      .eq("id", corretor.id)
      .eq("grupo_id", grupoId);
    if (error) return { erro: "Não foi possível desfazer agora." };
    revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
    return { ok: "Escolha desfeita. A sincronização volta a procurar o grupo pelo nome." };
  }

  const central = await garantirNumeroCentral(servico, grupoId, guarda.corretor.id);
  if ("erro" in central) return { erro: central.erro };
  // O grupo escolhido saiu da lista que a tela mostrou: a guardada (0234)
  // basta. Só lê da Evolution se ele não estiver nela (lista velha).
  let grupo = (await lerListaDeGrupos(servico, grupoId, central.instancia))?.grupos.find((g) => g.jid === grupoJid);
  if (!grupo) {
    const lista = await listarGruposWhatsapp(central.instancia);
    if (lista.erro) return { erro: lista.erro };
    await guardarListaDeGrupos(servico, grupoId, central.instancia, lista.grupos);
    grupo = lista.grupos.find((g) => g.jid === grupoJid);
  }
  if (!grupo) return { erro: "Esse grupo não está no número central. Confira se o número participa dele." };

  const { data: dono } = await servico
    .from("corretores")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("whatsapp_grupo_leads_jid", grupoJid)
    .neq("id", corretor.id)
    .limit(1)
    .maybeSingle();
  if (dono) return { erro: "Esse grupo já é de outro corretor. Cada corretor precisa do grupo dele." };

  const { error } = await servico
    .from("corretores")
    .update({ whatsapp_grupo_leads_jid: grupo.jid, whatsapp_grupo_leads_nome: grupo.nome, whatsapp_grupo_leads_manual: true })
    .eq("id", corretor.id)
    .eq("grupo_id", grupoId);
  if (error) return { erro: "Não foi possível vincular agora." };
  await guardarLidDoCorretor(servico, grupoId, central.instancia, corretor, grupo.jid);
  revalidatePath("/corretor/admin/whatsapp");
  revalidatePath("/corretor/marketing/impulsionamentos");
  return { ok: `Grupo "${grupo.nome}" vinculado.` };
}
