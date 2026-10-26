"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { desconectarInstancia } from "@/lib/whatsapp/provider";
import { listarGruposWhatsapp, listarParticipantesDoGrupo } from "@/lib/whatsapp/provider";
import { lidDoCorretor, mensagemDaSincronizacao, planejarVinculos } from "@/lib/whatsapp/vinculoNoGrupo";

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
  return { ok: "Número desconectado. A IA desse corretor para até ele conectar de novo." };
}

/** Maiúsculas, sem acento nem emoji; símbolos viram um espaço só. */
function normalizarNome(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * Como o grupo do corretor deve se chamar: `NOME DO CORRETOR & ARETZ`. O
 * sufixo é acrescentado só ao nome do corretor: o nome do grupo já o traz.
 */
function nomeDeGrupoAretz(nome: string): string {
  return normalizarNome(`${nome} & Aretz`);
}

/** Define qual nÃºmero da imobiliÃ¡ria envia os avisos aos grupos dos corretores. */
export async function configurarEnvioDeLeadsNosGrupos(
  instanceName: string | null,
): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const servico = createServiceClient();
  const escolhida = instanceName?.trim() ?? "";

  if (!escolhida) {
    const { error } = await servico
      .from("grupos")
      .update({ envio_grupo_leads_ativo: false, envio_grupo_leads_instancia: null })
      .eq("id", guarda.corretor.grupoId);
    if (error) return { erro: "NÃ£o foi possÃ­vel desativar agora." };
    revalidatePath("/corretor/admin/whatsapp");
    return { ok: "Envio para grupos desativado." };
  }

  const { data: instancia } = await servico
    .from("corretor_whatsapp_instancias")
    .select("instance_name, status_conexao, conectado_em")
    .eq("grupo_id", guarda.corretor.grupoId)
    .eq("instance_name", escolhida)
    .maybeSingle();
  if (!instancia || instancia.status_conexao !== "conectado" || !instancia.conectado_em) {
    return { erro: "Escolha um nÃºmero central que esteja conectado." };
  }

  const { error } = await servico
    .from("grupos")
    .update({ envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: escolhida })
    .eq("id", guarda.corretor.grupoId);
  if (error) return { erro: "NÃ£o foi possÃ­vel salvar o nÃºmero central." };
  revalidatePath("/corretor/admin/whatsapp");
  return { ok: "NÃºmero central salvo. Agora sincronize os grupos da Aretz." };
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
  return {
    ok: ativado
      ? "A roleta vai pular corretores com WhatsApp desconectado."
      : "A roleta volta a apenas priorizar quem estiver conectado.",
  };
}

/**
 * Procura o padrão `NOME DO CORRETOR & ARETZ` nos grupos do número central
 * e guarda o JID, nunca o nome visível, como destino do envio.
 *
 * Cada corretor tem o grupo só dele: grupo que cai em mais de um corretor é
 * recusado para todos eles (spec 6.4). Para cada grupo vinculado, lê quem
 * está nele e guarda o `@lid` do corretor, achado pelo número dele na lista
 * (nunca por adivinhação). Falha ao ler os participantes não desfaz o
 * vínculo do grupo.
 */
export async function sincronizarGruposDeLeadsDaAretz(): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const servico = createServiceClient();
  const grupoId = guarda.corretor.grupoId;
  const { data: configuracao } = await servico
    .from("grupos")
    .select("envio_grupo_leads_ativo, envio_grupo_leads_instancia")
    .eq("id", grupoId)
    .maybeSingle();
  if (!configuracao?.envio_grupo_leads_ativo || !configuracao.envio_grupo_leads_instancia) {
    return { erro: "Escolha e salve primeiro o número central da Aretz." };
  }
  const instancia = configuracao.envio_grupo_leads_instancia;

  const lista = await listarGruposWhatsapp(instancia);
  if (lista.erro) return { erro: lista.erro };
  const { data: corretores, error } = await servico
    .from("corretores")
    .select("id, nome, whatsapp")
    .eq("grupo_id", grupoId)
    .eq("ativo", true)
    .eq("papel", "corretor");
  if (error) return { erro: "Não foi possível ler a equipe agora." };

  const plano = planejarVinculos(corretores ?? [], lista.grupos, nomeDeGrupoAretz, normalizarNome);

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
