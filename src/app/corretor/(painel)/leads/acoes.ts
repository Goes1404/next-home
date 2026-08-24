"use server";

import { revalidatePath } from "next/cache";
import {
  getCorretorLogado,
  getPaginaDeLeads,
  type FiltroLeads,
  type PaginaDeLeads,
} from "@/lib/corretorSessao";
import { preencherTemplate } from "@/lib/mensagem";
import { createClient } from "@/lib/supabase/server";
import { normalizarWhatsapp } from "@/lib/whatsapp";
import { saldoDiario } from "@/lib/whatsapp/antiBan";
import { acenderCorrenteDeDisparo } from "@/lib/whatsapp/autoDisparo";
import { montarFilaCampanha } from "@/lib/whatsapp/campaignQueue";
import { provedorConfigurado } from "@/lib/whatsapp/provider";

/**
 * Disparo em massa para os leads selecionados na lista.
 *
 * ANTES: a tela abria uma aba de `wa.me` por lead e o corretor tinha que,
 * em cada uma, abrir o app e apertar enviar — 53 mensagens já saíram assim.
 * Nenhum link do WhatsApp (`wa.me`, `api.whatsapp.com/send` ou o deep link
 * `whatsapp://send`) envia sozinho: o toque em "enviar" é exigência da
 * plataforma, contra spam, e não há parâmetro que contorne.
 *
 * AGORA: a seleção vira uma campanha de verdade e quem envia é o servidor,
 * pelo número conectado do corretor (Evolution API), com o espaçamento
 * anti-ban, a cota de aquecimento e a corrente de auto-disparo que as
 * Campanhas já usavam. Nenhuma aba abre; as mensagens saem sozinhas.
 */

export type RecorteDisparo = {
  /** Leads selecionados que têm telefone utilizável. */
  elegiveis: number;
  /** Selecionados sem telefone válido — serão pulados. */
  semTelefone: number;
  /** Quantos cabem na cota de HOJE deste número. */
  hoje: number;
  /** O resto, que sai sozinho nos próximos dias conforme a cota renova. */
  depois: number;
  /** Dias desde o pareamento — explica por que a cota é o que é. */
  diasDeNumero: number | null;
  /** null quando o número não está conectado: sem ele, nada sai pelo servidor. */
  numeroConectado: string | null;
};

type Contexto =
  | { erro: string }
  | {
      erro?: undefined;
      corretor: NonNullable<Awaited<ReturnType<typeof getCorretorLogado>>>;
      supabase: Awaited<ReturnType<typeof createClient>>;
      leads: { id: string; nome: string; telefone: string | null }[];
      instancia: {
        id: string;
        instance_name: string;
        conectado_em: string | null;
        telefone_conectado: string | null;
        envios_campanha_contador: number;
        envios_campanha_data: string | null;
      } | null;
    };

async function carregarContexto(leadIds: string[]): Promise<Contexto> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  // RLS (0007) recorta os leads: id de outro corretor simplesmente não volta.
  const { data: leads } = await supabase
    .from("leads")
    .select("id, nome, telefone")
    .in("id", leadIds);

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, instance_name, conectado_em, telefone_conectado, envios_campanha_contador, envios_campanha_data")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  return { corretor, supabase, leads: leads ?? [], instancia };
}

/** Divide a seleção entre "sai hoje" e "sai depois", pela curva de aquecimento. */
function recortar(
  leads: { telefone: string | null }[],
  totalSelecionado: number,
  instancia: {
    conectado_em: string | null;
    telefone_conectado: string | null;
    envios_campanha_contador: number;
    envios_campanha_data: string | null;
  } | null,
): RecorteDisparo {
  const elegiveis = leads.filter((l) => l.telefone && normalizarWhatsapp(l.telefone)).length;
  const conectadoEm = instancia?.conectado_em ? new Date(instancia.conectado_em) : null;

  if (!conectadoEm) {
    return {
      elegiveis,
      semTelefone: totalSelecionado - elegiveis,
      hoje: 0,
      depois: elegiveis,
      diasDeNumero: null,
      numeroConectado: null,
    };
  }

  const hojeISO = new Date().toISOString().slice(0, 10);
  const enviosHoje =
    instancia?.envios_campanha_data === hojeISO ? instancia.envios_campanha_contador : 0;
  const saldo = saldoDiario({ conectadoEm, enviosCampanhaHoje: enviosHoje });
  const hoje = Math.min(elegiveis, saldo);

  return {
    elegiveis,
    semTelefone: totalSelecionado - elegiveis,
    hoje,
    depois: elegiveis - hoje,
    diasDeNumero: Math.floor((Date.now() - conectadoEm.getTime()) / 86_400_000),
    numeroConectado: instancia?.telefone_conectado ?? null,
  };
}

/**
 * O recorte ANTES de confirmar — o modal não pode prometer 19 envios hoje
 * quando a cota do número novo permite 15.
 */
export async function previewDisparo(leadIds: string[]): Promise<RecorteDisparo | { erro: string }> {
  const ctx = await carregarContexto(leadIds);
  if (ctx.erro !== undefined) return { erro: ctx.erro };
  return recortar(ctx.leads, leadIds.length, ctx.instancia);
}

export type ResultadoDisparoLista =
  | { ok: true; campanhaId: string; recorte: RecorteDisparo }
  /** `podeManual` liga o modo de queda na UI: abrir a conversa no app, um a um. */
  | { erro: string; podeManual?: boolean };

export async function dispararParaLeadsSelecionados(params: {
  leadIds: string[];
  templateId: string;
}): Promise<ResultadoDisparoLista> {
  const ctx = await carregarContexto(params.leadIds);
  if (ctx.erro !== undefined) return { erro: ctx.erro };
  const { corretor, supabase, leads, instancia } = ctx;

  if (!provedorConfigurado()) {
    return {
      erro: "Nenhum provedor de WhatsApp está conectado a este ambiente.",
      podeManual: true,
    };
  }
  if (!instancia?.conectado_em) {
    return {
      erro: "Seu número de WhatsApp ainda não está pareado — sem ele o envio automático não acontece. Leia o QR Code em Configurações do WhatsApp.",
      podeManual: true,
    };
  }

  const { data: template } = await supabase
    .from("templates_mensagens")
    .select("conteudo")
    .eq("id", params.templateId)
    .maybeSingle();

  if (!template) return { erro: "Template não encontrado." };

  const elegiveis = leads
    .map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone ? normalizarWhatsapp(l.telefone) : null }))
    .filter((l): l is { id: string; nome: string; telefone: string } => Boolean(l.telefone));

  if (elegiveis.length === 0) {
    return { erro: "Nenhum dos contatos selecionados tem telefone válido." };
  }

  /*
   * Ponte entre as duas sintaxes de template do projeto, sem código novo:
   * `preencherTemplate` resolve o que é constante (nome e telefone do
   * corretor) e deixa no lugar do nome do lead o marcador `{nome}`, que é
   * justamente o que `montarFilaCampanha` substitui lead a lead.
   */
  const mensagemBase = preencherTemplate(template.conteudo, {
    nomeLead: "{nome}",
    nomeCorretor: corretor.nome,
    telefoneCorretor: corretor.whatsapp,
  });

  const { data: campanha, error: erroCampanha } = await supabase
    .from("whatsapp_campanhas")
    .insert({
      corretor_id: corretor.id,
      titulo: `Disparo para lista — ${new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      mensagem_base: mensagemBase,
      total_leads: elegiveis.length,
      status: "em_andamento",
    })
    .select("id")
    .single();

  if (erroCampanha || !campanha) return { erro: "Não foi possível criar o disparo agora." };

  const fila = montarFilaCampanha({
    campanhaId: campanha.id,
    leads: elegiveis,
    mensagemBase,
  });

  const { error: erroFila } = await supabase.from("whatsapp_campanhas_fila").insert(
    fila.map((item) => ({
      campanha_id: campanha.id,
      lead_id: item.leadId,
      telefone: item.telefone,
      mensagem_personalizada: item.mensagemPersonalizada,
      personalizado_por_ia: item.personalizadoPorIA,
      status: item.status,
      agendado_para: item.agendadoPara,
    })),
  );

  if (erroFila) {
    // Campanha sem fila é um card fantasma no histórico — melhor desfazer.
    await supabase.from("whatsapp_campanhas").delete().eq("id", campanha.id);
    return { erro: "Não foi possível montar a fila de envio agora." };
  }

  // Acende a corrente: a primeira mensagem sai em segundos, o resto anda
  // sozinho (corrente + pg_cron), respeitando cota e horário comercial.
  acenderCorrenteDeDisparo();

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/campanhas");

  return {
    ok: true,
    campanhaId: campanha.id,
    recorte: recortar(leads, params.leadIds.length, instancia),
  };
}

/**
 * Próxima página da lista, para o botão "carregar mais".
 *
 * O filtro chega do cliente mas não é confiável nem precisa ser: a RLS
 * recorta o que a sessão pode ver, exatamente como na primeira página que a
 * própria tela renderizou no servidor.
 */
export async function carregarPaginaLeads(
  filtro: FiltroLeads,
  pagina: number,
): Promise<PaginaDeLeads> {
  return getPaginaDeLeads(filtro, pagina);
}
