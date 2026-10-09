"use server";

import { revalidatePath } from "next/cache";
import { algumProvedorConfigurado, chamarLlmJson } from "@/lib/whatsapp/llm";
import { aberturasDoJson, EXEMPLOS_VENCEDORES, promptDeAberturas } from "@/lib/marketing/aberturaSugerida";
import { getCorretorLogado } from "@/lib/corretorSessao";
import {
  elegivel,
  noRecorte,
  opcoesDeRecorte,
  type FiltroLeadsCampanha,
  type OpcoesDeRecorte,
  type RecorteDeOrigem,
} from "@/lib/crm/publicoDaCampanha";
import { placarDaFila, resultadoAB, type ResultadoAB } from "@/lib/whatsapp/testeAB";
import { desfechoDaLista, type Desfecho } from "@/lib/crm/desfechoDaLista";
import { createClient } from "@/lib/supabase/server";
import { getEmpreendimentos } from "@/lib/queries";
import type { Empreendimento, EtapaFunil } from "@/lib/types";
import { acenderCorrenteDeDisparo } from "@/lib/whatsapp/autoDisparo";
import { processarFilaCampanhas } from "@/lib/whatsapp/campaignDispatcher";
import { exemplosDaLista, montarFilaCampanha, nomesDaPessoa } from "@/lib/whatsapp/campaignQueue";
import { textosRecentesDoNumero } from "@/lib/whatsapp/textosDoNumero";
import {
  AVISO_DE_VERSOES_IGUAIS,
  fatosDaLista,
  MOTIVO_TEXTO_PARECIDO,
  MOTIVO_TEXTO_SEM_IA,
  versoesDiferentes,
} from "@/lib/whatsapp/variacaoDeTexto";
import { site } from "@/lib/site";
import { conferirNumerosNoWhatsapp, provedorConfigurado } from "@/lib/whatsapp/provider";
import { lerSinaisDaLista } from "@/lib/whatsapp/sinaisDaLista";
import { MOTIVO_SESSAO_CAIU } from "@/lib/whatsapp/sessaoCaida";
import type { SinaisDaLista } from "@/lib/whatsapp/pausaAutomatica";
import { dentroDaJanela, dentroDaJanelaDoCorretor, fraseDoLimite } from "@/lib/whatsapp/antiBan";
import { calcularLimiteDoDia } from "@/lib/whatsapp/repositorio";
import { linkDaPagina } from "@/lib/whatsapp/resolverMidia";
import { horariosDeVisita } from "@/lib/crm/agendaDoCorretor";
import {
  contextoDaLista,
  previsaoDeTermino,
  resolverHorarios,
  variaveisSemValor,
  type ContextoTemplate,
} from "@/lib/whatsapp/listaDeTransmissao";
import { MAXIMO_DE_MIDIAS_NA_LISTA, type MidiaDaLista } from "@/lib/whatsapp/midiasDaLista";
import { corretorTemAgenda, idsProtegidosDeNovaLista, leadsDoCorretor } from "@/lib/whatsapp/publicoDaLista";
import type { CriterioDaLista } from "@/lib/whatsapp/listasVivas";

/**
 * Ações do painel de listas de transmissão: criar, listar, diagnosticar e
 * (quando o corretor não quer esperar nem um minuto) empurrar a fila na hora.
 *
 * A montagem da fila (`montarFilaCampanha`) e o envio de fato
 * (`processarFilaCampanhas`) são os mesmos módulos usados pelo disparo
 * automático — este arquivo só decide QUAIS leads entram e grava o
 * resultado, sob a sessão do corretor logado (RLS via `createClient`, nunca
 * o cliente de serviço aqui).
 *
 * Criar uma lista já acende a corrente de auto-disparo
 * (`acenderCorrenteDeDisparo`): a partir daí as mensagens saem sozinhas,
 * uma a cada 35-75s, sem ninguém clicar em nada.
 *
 * Roadmap das listas (03/10/2026): o público sai SÓ da carteira do próprio
 * corretor (antes o gestor alcançava a equipe), a lista guarda o critério
 * (para repetir e para a lista viva), aceita fotos do imóvel e variáveis do
 * cadastro, pode virar rascunho, e "liberar" vale uma vez em vez de marcar a
 * lista para sempre.
 */

export type LeadElegivel = {
  id: string;
  nome: string;
  telefone: string;
  etapa: EtapaFunil;
};

export type PreviaPublicoCampanha = {
  total: number;
  protegidos: number;
};

/** Dias de vida de uma lista viva: depois disso ela para de incluir gente. */
const DIAS_DA_LISTA_VIVA = 30;

async function publicoComProtecao(
  filtro: FiltroLeadsCampanha,
  imovelSlug?: string | null,
  recorte?: RecorteDeOrigem | null,
): Promise<{
  elegiveis: LeadElegivel[];
  protegidos: number;
}> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { elegiveis: [], protegidos: 0 };

  const supabase = await createClient();
  const leads = await leadsDoCorretor(supabase, corretor.id);
  const base = leads.filter((lead) => elegivel(lead, filtro, { imovelSlug }) && noRecorte(lead, recorte));
  const protegidos = await idsProtegidosDeNovaLista(supabase, corretor.id);
  return {
    elegiveis: base
      .filter((lead) => !protegidos.has(lead.id))
      .map((lead) => ({
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone as string,
        etapa: lead.etapa,
      })),
    protegidos: base.filter((lead) => protegidos.has(lead.id)).length,
  };
}

/** Só a carteira DESTE corretor, mesmo para o gestor (`leadsDoCorretor`). */
export async function listarLeadsElegiveis(
  filtro: FiltroLeadsCampanha,
  imovelSlug?: string | null,
  recorte?: RecorteDeOrigem | null,
): Promise<LeadElegivel[]> {
  return (await publicoComProtecao(filtro, imovelSlug, recorte)).elegiveis;
}

/** Os canais e anúncios que existem na carteira, para o recorte do passo 1 (Fase 3). */
export async function listarOpcoesDeOrigem(): Promise<OpcoesDeRecorte> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { canais: [], anuncios: [] };
  return opcoesDeRecorte(await leadsDoCorretor(await createClient(), corretor.id));
}

/** Contagem informativa; criar a lista refaz a mesma proteção no servidor. */
export async function preverPublicoCampanha(
  filtro: FiltroLeadsCampanha,
  imovelSlug?: string | null,
  recorte?: RecorteDeOrigem | null,
): Promise<PreviaPublicoCampanha> {
  const publico = await publicoComProtecao(filtro, imovelSlug, recorte);
  return { total: publico.elegiveis.length, protegidos: publico.protegidos };
}

/**
 * Recorta os elegíveis pela seleção manual do corretor.
 *
 * A INTERSEÇÃO é a segurança: os ids chegam pela rede (Server Action é
 * endpoint HTTP) e só valem se apontarem para um lead DESTE corretor que
 * passa nas regras de base. Id alheio ou inventado não sobrevive ao filtro.
 */
function recortarPorSelecao(
  elegiveis: LeadElegivel[],
  leadIds: string[] | undefined,
): LeadElegivel[] {
  const escolhidos = new Set(leadIds ?? []);
  return elegiveis.filter((lead) => escolhidos.has(lead.id));
}

/** O imóvel do catálogo e as variáveis da mensagem que saem dele e do corretor. */
async function contextoDoImovel(
  empreendimentoId: string | null,
  corretorNome: string | null,
): Promise<{ imovel: Empreendimento | null; contexto: ContextoTemplate }> {
  const imovel = empreendimentoId
    ? ((await getEmpreendimentos()).find((e) => e.id === empreendimentoId) ?? null)
    : null;
  return {
    imovel,
    contexto: contextoDaLista({
      imovel,
      linkDoImovel: imovel ? linkDaPagina(imovel.slug) : null,
      corretorNome,
    }),
  };
}

/**
 * As fotos escolhidas, conferidas contra o CADASTRO do imóvel.
 *
 * A URL chega pela rede: só vale se for de uma foto ou planta do imóvel da
 * lista. Assim a lista nunca anexa arquivo que não é do catálogo.
 */
function midiasValidas(imovel: Empreendimento | null, urls: string[] | undefined): MidiaDaLista[] {
  if (!imovel || !urls?.length) return [];
  const doCatalogo = [
    ...imovel.galeria.map((m) => ({ url: m.url, tipo: "foto" as const, titulo: m.alt || imovel.nome })),
    ...imovel.plantas.map((m) => ({ url: m.url, tipo: "planta" as const, titulo: m.alt || `Planta · ${imovel.nome}` })),
  ];
  const escolhidas = new Set(urls);
  return doCatalogo.filter((m) => escolhidas.has(m.url)).slice(0, MAXIMO_DE_MIDIAS_NA_LISTA);
}

/** Frase do aviso de variável sem valor, em português de gente. */
function avisoDeVariaveis(faltando: string[]): string {
  const lista = faltando.map((v) => `{${v}}`).join(", ");
  if (faltando.includes("horarios") && faltando.length === 1) {
    return "Para usar {horarios}, configure seus horários de visita em Minha IA → Agenda.";
  }
  return `A mensagem usa ${lista}, mas o imóvel escolhido não tem esse dado no cadastro. Tire da mensagem ou complete o cadastro.`;
}

export async function gerarPreviewCampanha(params: {
  filtro: FiltroLeadsCampanha;
  empreendimentoId: string | null;
  mensagemBase: string;
  mensagemBaseB?: string | null;
  /** Só para `filtro: "selecionados"` — os leads escolhidos um a um. */
  leadIds?: string[];
  /** Só para `filtro: "compradores"`. */
  imovelSlug?: string | null;
  /** Canal ou anúncio de origem (Fase 3). */
  recorte?: RecorteDeOrigem | null;
}): Promise<{ mensagens: string[]; mensagemB: string | null; observacao: string | null } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva uma mensagem base primeiro." };

  let elegiveis: LeadElegivel[];
  try {
    elegiveis = await listarLeadsElegiveis(params.filtro, params.imovelSlug ?? null, params.recorte);
  } catch {
    return { erro: "Não foi possível conferir os contatos recentes agora." };
  }
  if (params.filtro === "selecionados") {
    elegiveis = recortarPorSelecao(elegiveis, params.leadIds);
    if (elegiveis.length === 0) return { erro: "Escolha ao menos um lead primeiro." };
  }
  if (elegiveis.length === 0) return { erro: "Nenhum lead elegível para este filtro no momento." };

  const { imovel, contexto } = await contextoDoImovel(params.empreendimentoId, corretor.nome);
  const supabase = await createClient();
  const temAgenda = await corretorTemAgenda(supabase, corretor.id);
  const textoB = params.mensagemBaseB?.trim() || null;
  if (textoB && !versoesDiferentes(params.mensagemBase, textoB)) return { erro: AVISO_DE_VERSOES_IGUAIS };
  const faltando = [
    ...variaveisSemValor(params.mensagemBase, contexto, { temAgenda }),
    ...(textoB ? variaveisSemValor(textoB, contexto, { temAgenda }) : []),
  ];
  if (faltando.length > 0) return { erro: avisoDeVariaveis([...new Set(faltando)]) };

  const rotulos = temAgenda ? (await horariosDeVisita(corretor.id)).map((h) => h.rotulo) : [];
  const amostra = elegiveis.slice(0, 3);

  /*
   * Os exemplos passam pelo MESMO caminho do envio (08/10/2026): cada um é
   * reescrito e conferido contra as mensagens recentes do número e contra os
   * exemplos anteriores, em sequência. No teste A/B as duas versões também
   * são reescritas, cada uma mantendo a própria abertura. Antes, com duas
   * versões, o exemplo mostrava o texto cru, que era o que de fato saía.
   */
  const anteriores = (await textosRecentesDoNumero(supabase, corretor.id)) ?? [];
  const fatos = fatosDaLista({
    contexto,
    imovelNome: imovel?.nome,
    corretorNome: corretor.nome,
    nomeDaCasa: site.nome,
  });
  const filaA = montarFilaCampanha({
    campanhaId: "preview",
    leads: amostra,
    mensagemBase: params.mensagemBase,
    empreendimentoNome: imovel?.nome,
    contexto,
  });
  const exemplosA = await exemplosDaLista({
    textos: filaA.map((item, i) => ({ texto: item.mensagemPersonalizada, nomeLead: amostra[i]?.nome ?? "" })),
    fatos,
    anteriores,
    manterAbertura: Boolean(textoB),
  });

  let exemploB: string | null = null;
  let reescritos = exemplosA.reescritos;
  let repetidos = exemplosA.repetidos;
  if (textoB) {
    const filaB = montarFilaCampanha({
      campanhaId: "preview",
      leads: amostra.slice(0, 1),
      mensagemBase: textoB,
      empreendimentoNome: imovel?.nome,
      contexto,
    });
    const b = await exemplosDaLista({
      textos: filaB.map((item) => ({ texto: item.mensagemPersonalizada, nomeLead: amostra[0]?.nome ?? "" })),
      fatos,
      anteriores: [
        ...exemplosA.textos.map((texto, i) => ({ texto, nomes: nomesDaPessoa(amostra[i]?.nome) })),
        ...anteriores,
      ],
      manterAbertura: true,
    });
    exemploB = b.textos[0] ?? null;
    reescritos += b.reescritos;
    repetidos += b.repetidos;
  }

  return {
    mensagens: exemplosA.textos.map((texto) => resolverHorarios(texto, rotulos)),
    mensagemB: exemploB ? resolverHorarios(exemploB, rotulos) : null,
    observacao: observacaoDosExemplos({ iaConfigurada: algumProvedorConfigurado(), reescritos, repetidos }),
  };
}

/** O recado embaixo dos exemplos quando a IA não reescreveu algum deles. */
function observacaoDosExemplos(p: { iaConfigurada: boolean; reescritos: number; repetidos: number }): string | null {
  if (!p.iaConfigurada) {
    return "A IA que reescreve as mensagens não está configurada. Cada pessoa recebe o texto como está, e mensagem que repetiria outra do seu número não sai.";
  }
  if (p.repetidos > 0) {
    return "A IA não conseguiu deixar algum exemplo diferente das mensagens recentes do seu número. No envio a fila tenta de novo, e mensagem repetida não sai. Se continuar, deixe o texto mais longo ou mude a abertura.";
  }
  if (p.reescritos === 0) {
    return "A IA não respondeu agora, então os exemplos estão como você escreveu. No envio, cada mensagem é reescrita antes de sair.";
  }
  return null;
}

/**
 * Duas aberturas para o teste A/B, escritas pela IA na régua medida da
 * casa (`aberturaSugerida.ts`). Reprovada na validação, devolve erro — a
 * tela mantém o que o corretor já escreveu. Não consome cota nem dispara.
 */
export async function sugerirAberturas(params: {
  imovel: string;
  bairro?: string | null;
  cidade?: string | null;
  estagio?: string | null;
  publico: string;
}): Promise<{ a: string; b: string } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  // As aberturas que já venceram um A/B deste corretor viram exemplo.
  const supabase = await createClient();
  const { data: decididas } = await supabase
    .from("whatsapp_campanhas")
    .select("mensagem_base, mensagem_base_b, variante_vencedora")
    .eq("corretor_id", corretor.id)
    .not("variante_vencedora", "is", null)
    .order("created_at", { ascending: false })
    .limit(EXEMPLOS_VENCEDORES);
  const vencedoras = (decididas ?? [])
    .map((c) => (c.variante_vencedora === "B" ? c.mensagem_base_b : c.mensagem_base))
    .filter((t): t is string => Boolean(t));

  const prompt = promptDeAberturas(
    {
      imovel: String(params.imovel ?? ""),
      bairro: params.bairro ?? null,
      cidade: params.cidade ?? null,
      estagio: params.estagio ?? null,
      publico: String(params.publico ?? ""),
    },
    vencedoras,
  );
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await chamarLlmJson(prompt, { temperature: 0.9, orcamentoMs: 15_000 });
    if (!r.ok) return { erro: "A IA não respondeu agora. Tente de novo em instantes." };
    const par = aberturasDoJson(r.json);
    if (par) return par;
  }
  return { erro: "A IA sugeriu algo fora da régua (longo, sem pergunta ou com valor). Tente de novo." };
}

export type ResultadoCriarCampanha =
  | {
      ok: true;
      campanhaId: string;
      totalLeads: number;
      /** Quantos saíram da lista por não ter WhatsApp (consulta antes da fila). */
      semWhatsapp: number;
    }
  | { erro: string };

export type ParametrosDaLista = {
  titulo: string;
  empreendimentoId: string | null;
  filtro: FiltroLeadsCampanha;
  mensagemBase: string;
  /** Segunda versão da mensagem (teste A/B, 0084). Ausente = uma versão só. */
  mensagemBaseB?: string | null;
  /** ISO absoluto; a interface envia o horário de Brasília já com offset. */
  iniciarEm?: string | null;
  /** Só para `filtro: "selecionados"` — os leads escolhidos um a um. */
  leadIds?: string[];
  /**
   * Dispara em qualquer horário, inclusive madrugada e domingo (0058).
   * Exceção pedida caso a caso. Espaçamento, cota e disjuntor continuam.
   */
  ignorarJanela?: boolean;
  /** Canal ou anúncio de origem (Fase 3). O servidor refaz o recorte. */
  recorte?: RecorteDeOrigem | null;
  /** URLs de fotos/plantas do imóvel, conferidas contra o cadastro (0155). */
  midias?: string[];
  /** Lista viva: por 30 dias, quem passar a se encaixar entra sozinho (0155). */
  viva?: boolean;
  /** Modelo de mensagem de onde o texto partiu, para a biblioteca contar a taxa (0155). */
  templateId?: string | null;
  /** Rascunho que esta lista conclui: some quando a lista nasce. */
  rascunhoId?: string | null;
};

/** O critério que a lista guarda (0155): é o que permite repeti-la e mantê-la viva. */
function criterioDe(params: ParametrosDaLista, imovelSlug: string | null): CriterioDaLista {
  return {
    filtro: params.filtro,
    imovelSlug: params.filtro === "compradores" ? imovelSlug : null,
    recorte: params.filtro === "selecionados" ? null : (params.recorte ?? null),
  };
}

export async function criarCampanha(params: ParametrosDaLista): Promise<ResultadoCriarCampanha> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const titulo = params.titulo.trim();
  if (!titulo) return { erro: "Dê um título para a lista de transmissão." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva a mensagem base." };

  const inicio = params.iniciarEm ? new Date(params.iniciarEm) : null;
  if (inicio && Number.isNaN(inicio.getTime())) {
    return { erro: "Escolha uma data válida para o envio." };
  }
  if (inicio && inicio.getTime() < Date.now() - 60_000) {
    return { erro: "O horário escolhido já passou. Escolha um horário futuro." };
  }
  if (inicio && !params.ignorarJanela && !dentroDaJanela(inicio)) {
    return {
      erro: "Agende entre 9h e 20h59, de segunda a sábado, no horário de Brasília.",
    };
  }

  if (!provedorConfigurado()) {
    return {
      erro: "Nenhum provedor de WhatsApp está conectado a este ambiente. Conecte seu número em /corretor/whatsapp primeiro.",
    };
  }

  const supabase = await createClient();

  /*
   * Sem número conectado, a lista nasceria parada (Fase 3 do roadmap). Só 1
   * dos 7 corretores tinha o número conectado em 03/10/2026: os outros
   * montavam a lista e ela ficava "enviando" para sempre.
   */
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("status_conexao, instance_name")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  if (instancia?.status_conexao !== "conectado") {
    return {
      erro: "Seu WhatsApp não está conectado. Conecte o número em Minha IA → WhatsApp e volte para criar a lista.",
    };
  }

  const { imovel, contexto } = await contextoDoImovel(params.empreendimentoId, corretor.nome);

  // Compradores só existem em relação a UM imóvel.
  let imovelSlug: string | null = null;
  if (params.filtro === "compradores") {
    if (!imovel) return { erro: "Escolha o imóvel dos compradores." };
    imovelSlug = imovel.slug;
  }

  const temAgenda = await corretorTemAgenda(supabase, corretor.id);
  const textoB = params.mensagemBaseB?.trim() || null;
  if (textoB && !versoesDiferentes(params.mensagemBase, textoB)) return { erro: AVISO_DE_VERSOES_IGUAIS };
  const faltando = [
    ...variaveisSemValor(params.mensagemBase, contexto, { temAgenda }),
    ...(textoB ? variaveisSemValor(textoB, contexto, { temAgenda }) : []),
  ];
  if (faltando.length > 0) return { erro: avisoDeVariaveis([...new Set(faltando)]) };

  let elegiveis: LeadElegivel[];
  try {
    elegiveis = await listarLeadsElegiveis(params.filtro, imovelSlug, params.recorte);
  } catch {
    // Falha fechada: sem provar quem recebeu lista recentemente, ninguém
    // entra na fila. Repetir propaganda é pior do que pedir nova tentativa.
    return {
      erro: "Não foi possível conferir os contatos recentes agora. Tente de novo.",
    };
  }
  if (params.filtro === "selecionados") {
    elegiveis = recortarPorSelecao(elegiveis, params.leadIds);
    if (elegiveis.length === 0) return { erro: "Escolha ao menos um lead primeiro." };
  }
  if (elegiveis.length === 0) {
    return { erro: "Nenhum lead elegível para este filtro no momento." };
  }

  /*
   * Número sem WhatsApp sai da lista ANTES da fila (07/10/2026). A conta da
   * Bruna foi restringida no meio de uma lista em que 17 de 131 tentativas
   * eram números sem WhatsApp; na da Carolini, 24 de 39. Só sai quem o
   * provedor diz que NÃO tem; "não sei" fica, e o disparador trata no envio.
   */
  const existencia = await conferirNumerosNoWhatsapp({
    instanceName: instancia.instance_name ?? "",
    telefones: elegiveis.map((l) => l.telefone),
  });
  const antesDaConferencia = elegiveis.length;
  elegiveis = elegiveis.filter((l) => existencia.get(l.telefone) !== false);
  const semWhatsapp = antesDaConferencia - elegiveis.length;
  if (elegiveis.length === 0) {
    return { erro: "Nenhum dos números desta lista tem WhatsApp. Confira os telefones dos leads." };
  }

  const viva = Boolean(params.viva) && params.filtro !== "selecionados";
  const midias = midiasValidas(imovel, params.midias);

  const { data: campanha, error: erroCampanha } = await supabase
    .from("whatsapp_campanhas")
    .insert({
      corretor_id: corretor.id,
      titulo,
      empreendimento_id: imovel?.id ?? null,
      mensagem_base: params.mensagemBase,
      mensagem_base_b: textoB,
      total_leads: elegiveis.length,
      status: "em_andamento",
      ignorar_janela: params.ignorarJanela ?? false,
      criterio: criterioDe(params, imovelSlug),
      viva,
      viva_ate: viva ? new Date(Date.now() + DIAS_DA_LISTA_VIVA * 86_400_000).toISOString() : null,
      midias,
      contexto_template: contexto,
      template_id: params.templateId ?? null,
    })
    .select("id")
    .single();

  if (erroCampanha || !campanha)
    return { erro: "Não foi possível criar a lista de transmissão agora." };

  // Fila montada SEM chamar a IA: só interpolação de template e cálculo de
  // horários. A variação anti-ban por IA acontece no envio, um item por vez.
  const fila = montarFilaCampanha({
    campanhaId: campanha.id,
    leads: elegiveis,
    mensagemBase: params.mensagemBase,
    empreendimentoNome: imovel?.nome,
    contexto,
    ignorarJanela: params.ignorarJanela,
    mensagemBaseB: textoB,
    iniciarEm: inicio ?? undefined,
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
      variante: item.variante ?? null,
    })),
  );

  if (erroFila) {
    // Lista sem fila é um card fantasma no histórico — melhor desfazer.
    await supabase.from("whatsapp_campanhas").delete().eq("id", campanha.id);
    return { erro: "Não foi possível montar a fila de envio agora." };
  }

  if (params.rascunhoId) {
    await supabase
      .from("whatsapp_campanhas")
      .delete()
      .eq("id", params.rascunhoId)
      .eq("corretor_id", corretor.id)
      .eq("status", "rascunho");
  }

  acenderCorrenteDeDisparo();

  revalidatePath("/corretor/campanhas");
  return { ok: true, campanhaId: campanha.id, totalLeads: elegiveis.length, semWhatsapp };
}

/**
 * Guarda a lista como RASCUNHO (Fase 4): sem fila, sem envio, para terminar
 * depois. Nada aqui manda mensagem; o público é recalculado quando a lista
 * nascer de verdade.
 */
export async function salvarRascunho(
  params: ParametrosDaLista,
): Promise<{ ok: true; id: string } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = await createClient();
  const { imovel } = await contextoDoImovel(params.empreendimentoId, corretor.nome);
  const linha = {
    titulo: params.titulo.trim() || "Rascunho",
    empreendimento_id: imovel?.id ?? null,
    mensagem_base: params.mensagemBase,
    mensagem_base_b: params.mensagemBaseB?.trim() || null,
    criterio: { ...criterioDe(params, imovel?.slug ?? null), leadIds: params.leadIds ?? [] },
    midias: midiasValidas(imovel, params.midias),
    template_id: params.templateId ?? null,
    viva: Boolean(params.viva),
  };

  if (params.rascunhoId) {
    const { data, error } = await supabase
      .from("whatsapp_campanhas")
      .update(linha)
      .eq("id", params.rascunhoId)
      .eq("corretor_id", corretor.id)
      .eq("status", "rascunho")
      .select("id");
    if (error || !data?.length) return { erro: "Não foi possível salvar o rascunho agora." };
    revalidatePath("/corretor/campanhas");
    return { ok: true, id: params.rascunhoId };
  }

  const { data, error } = await supabase
    .from("whatsapp_campanhas")
    .insert({ ...linha, corretor_id: corretor.id, status: "rascunho", total_leads: 0 })
    .select("id")
    .single();
  if (error || !data) return { erro: "Não foi possível salvar o rascunho agora." };
  revalidatePath("/corretor/campanhas");
  return { ok: true, id: data.id };
}

/** Uma lista guardada, para repetir ou continuar o rascunho no assistente. */
export type ListaParaReabrir = {
  id: string;
  status: CampanhaListada["status"];
  titulo: string;
  imovelSlug: string | null;
  filtro: FiltroLeadsCampanha;
  recorte: RecorteDeOrigem | null;
  leadIds: string[];
  mensagemBase: string;
  mensagemBaseB: string | null;
  midias: string[];
  templateId: string | null;
  viva: boolean;
};

/**
 * O que o assistente precisa para reabrir uma lista (Fase 3: repetir) ou um
 * rascunho (Fase 4: continuar). Só do próprio corretor.
 */
export async function carregarListaParaReabrir(id: string): Promise<ListaParaReabrir | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .select(
      "id, status, titulo, criterio, mensagem_base, mensagem_base_b, variante_vencedora, midias, template_id, viva, empreendimento:empreendimentos(slug)",
    )
    .eq("id", id)
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  if (!data) return null;
  const criterio = (data.criterio ?? {}) as Partial<CriterioDaLista> & { leadIds?: string[] };
  const imovel = (Array.isArray(data.empreendimento) ? data.empreendimento[0] : data.empreendimento) as
    | { slug: string }
    | null;
  // Repetir uma lista que já decidiu o A/B parte da vencedora.
  const vencedoraB = data.variante_vencedora === "B" && data.mensagem_base_b;
  return {
    id: data.id,
    status: data.status,
    titulo: data.titulo,
    imovelSlug: imovel?.slug ?? null,
    filtro: criterio.filtro ?? "parados_15d",
    recorte: criterio.recorte ?? null,
    leadIds: criterio.leadIds ?? [],
    mensagemBase: vencedoraB ? data.mensagem_base_b! : data.mensagem_base,
    mensagemBaseB: data.variante_vencedora ? null : data.mensagem_base_b,
    midias: ((data.midias ?? []) as MidiaDaLista[]).map((m) => m.url),
    templateId: data.template_id,
    viva: data.viva,
  };
}

/** Apaga um rascunho. Lista que já saiu nunca é apagada por aqui. */
export async function descartarRascunho(id: string): Promise<{ ok: true } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const { data } = await (await createClient())
    .from("whatsapp_campanhas")
    .delete()
    .eq("id", id)
    .eq("corretor_id", corretor.id)
    .eq("status", "rascunho")
    .select("id");
  if (!data?.length) return { erro: "Rascunho não encontrado." };
  revalidatePath("/corretor/campanhas");
  return { ok: true };
}

/** O caminho de cada lista: de quem recebeu até quem comprou. */
export type FunilDaLista = {
  enviadas: number;
  responderam: number;
  /** Responderam e trocaram duas ou mais mensagens depois do envio. */
  conversaram: number;
  /** Mediana do tempo até a resposta, em minutos; null sem resposta. */
  medianaRespostaMin: number | null;
};

export type CampanhaListada = {
  /** Placar do teste A/B, ou null quando a lista tem uma versão só (0084). */
  testeAB: ResultadoAB | null;
  /** Versão que o disparador passou a usar no resto da fila (0121). */
  vencedora: "A" | "B" | null;
  /** Quando a vencedora foi decidida (0155). */
  vencedoraEm: string | null;
  id: string;
  titulo: string;
  empreendimentoNome: string | null;
  totalLeads: number;
  totalEnviados: number;
  totalRespondidos: number;
  status: "rascunho" | "em_andamento" | "pausada" | "concluida" | "cancelada";
  criadoEm: string;
  /** Quem recebeu e depois marcou visita ou comprou (`desfechoDaLista.ts`). */
  desfecho: Desfecho;
  funil: FunilDaLista;
  /** Lista viva: até quando inclui gente nova (0155). */
  vivaAte: string | null;
  /** Quantas fotos/plantas vão junto da mensagem. */
  midias: number;
  /** Pode ser repetida (guarda o critério) — listas antigas não guardavam. */
  repetivel: boolean;
  /** Por que o disparador pausou a lista sozinho (0172), ou null. */
  pausaAutomatica: string | null;
  /**
   * As mensagens que saíram com o texto conferido (0173) e a mais parecida
   * delas com outra do número, em %. Null para listas de antes da conferência.
   */
  texto: { conferidas: number; maisParecidaPct: number } | null;
};

/** Quantas listas o histórico mostra por vez. */
const LISTAS_POR_PAGINA = 20;

/**
 * As listas DESTE corretor, mais recentes primeiro, de 20 em 20 (Fase 4).
 * `antesDe` é a data de criação da última lista já mostrada.
 */
export async function listarCampanhas(antesDe?: string): Promise<CampanhaListada[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];

  // Filtro explícito desde a 0031: as policies de campanha incluem o
  // gestor, então sem o `.eq` esta tela mostraria as listas dos colegas.
  const supabase = await createClient();
  let consulta = supabase
    .from("whatsapp_campanhas")
    .select(
      "id, titulo, total_leads, total_enviados, total_respondidos, status, created_at, mensagem_base_b, variante_vencedora, vencedora_em, viva, viva_ate, midias, criterio, pausa_automatica, empreendimento:empreendimentos(nome)",
    )
    .eq("corretor_id", corretor.id)
    .order("created_at", { ascending: false })
    .limit(LISTAS_POR_PAGINA);
  if (antesDe) consulta = consulta.lt("created_at", antesDe);
  const { data } = await consulta;

  const ids = (data ?? []).map((c) => c.id);
  const [placar, desfechos, funis, textos] = await Promise.all([
    placaresDoTeste(supabase, (data ?? []).filter((c) => c.mensagem_base_b).map((c) => c.id)),
    desfechosDasListas(supabase, ids),
    funisDasListas(supabase, ids),
    textoDasListas(supabase, ids),
  ]);

  return (data ?? []).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    desfecho: desfechos.get(c.id) ?? { visitas: 0, vendas: 0 },
    funil: funis.get(c.id) ?? { enviadas: 0, responderam: 0, conversaram: 0, medianaRespostaMin: null },
    testeAB: placar.has(c.id) ? resultadoAB(placar.get(c.id)!) : null,
    vencedora: c.variante_vencedora,
    vencedoraEm: c.vencedora_em,
    empreendimentoNome: (c.empreendimento as { nome: string } | null)?.nome ?? null,
    totalLeads: c.total_leads,
    totalEnviados: c.total_enviados,
    totalRespondidos: c.total_respondidos,
    status: c.status,
    criadoEm: c.created_at,
    vivaAte: c.viva && c.viva_ate && new Date(c.viva_ate) > new Date() ? c.viva_ate : null,
    midias: Array.isArray(c.midias) ? c.midias.length : 0,
    repetivel: Boolean(c.criterio),
    pausaAutomatica: c.status === "pausada" ? c.pausa_automatica : null,
    texto: textos.get(c.id) ?? null,
  }));
}

/**
 * Quantas mensagens de cada lista saíram com o texto conferido (0173), e a
 * mais parecida delas com outra do número. É a prova, na tela, de que a lista
 * não mandou texto repetido. Paginado: a resposta do banco para em 1.000
 * linhas, e 20 listas de 300 passariam disso.
 */
async function textoDasListas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, { conferidas: number; maisParecidaPct: number }>> {
  const resultado = new Map<string, { conferidas: number; maisParecidaPct: number }>();
  if (ids.length === 0) return resultado;
  const PAGINA = 1000;
  for (let pagina = 0; pagina < 10; pagina++) {
    const { data } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("campanha_id, semelhanca_max")
      .in("campanha_id", ids)
      .in("status", ["enviado", "respondido"])
      .not("semelhanca_max", "is", null)
      .order("id")
      .range(pagina * PAGINA, pagina * PAGINA + PAGINA - 1);
    for (const item of data ?? []) {
      const atual = resultado.get(item.campanha_id) ?? { conferidas: 0, maisParecidaPct: 0 };
      atual.conferidas++;
      atual.maisParecidaPct = Math.max(atual.maisParecidaPct, Math.round((item.semelhanca_max ?? 0) * 100));
      resultado.set(item.campanha_id, atual);
    }
    if (!data || data.length < PAGINA) break;
  }
  return resultado;
}

type Contagem = { enviados: number; respostas: number };

/**
 * O placar do A/B, só para as listas que TÊM segunda versão (0084). Itens
 * reescritos depois da decisão perdem a letra (`vencedoraAB.ts`) e saem da
 * conta: o placar mostra só o que foi enviado DURANTE o teste.
 */
async function placaresDoTeste(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comTeste: string[],
): Promise<Map<string, { a: Contagem; b: Contagem }>> {
  const placar = new Map<string, { a: Contagem; b: Contagem }>();
  if (comTeste.length === 0) return placar;
  const { data: itens } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("campanha_id, variante, status")
    .in("campanha_id", comTeste)
    .not("variante", "is", null);
  const porCampanha = new Map<string, Array<{ variante: string | null; status: string }>>();
  for (const item of itens ?? []) {
    porCampanha.set(item.campanha_id, [...(porCampanha.get(item.campanha_id) ?? []), item]);
  }
  for (const [id, lista] of porCampanha) placar.set(id, placarDaFila(lista));
  return placar;
}

/**
 * Visitas e vendas de quem recebeu cada lista (Fase 3). Três consultas para
 * as listas da tela, nunca uma por lista. A RLS recorta.
 */
async function desfechosDasListas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, Desfecho>> {
  const resultado = new Map<string, Desfecho>();
  if (ids.length === 0) return resultado;

  const { data: itens } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("campanha_id, lead_id, enviado_em")
    .in("campanha_id", ids)
    .in("status", ["enviado", "respondido"])
    .not("lead_id", "is", null);
  const leadIds = [...new Set((itens ?? []).map((i) => i.lead_id as string))];
  if (leadIds.length === 0) return resultado;

  const [{ data: leads }, { data: vendas }] = await Promise.all([
    supabase.from("leads").select("id, visita_marcada_em").in("id", leadIds).not("visita_marcada_em", "is", null),
    supabase.from("vendas").select("lead_id, created_at, status").in("lead_id", leadIds),
  ]);
  const visitas = (leads ?? []).map((l) => ({ leadId: l.id, marcadaEm: l.visita_marcada_em }));
  const vendasDosLeads = (vendas ?? []).map((v) => ({ leadId: v.lead_id, criadaEm: v.created_at, status: v.status }));

  for (const id of ids) {
    const daLista = (itens ?? [])
      .filter((i) => i.campanha_id === id)
      .map((i) => ({ leadId: i.lead_id, enviadoEm: i.enviado_em }));
    resultado.set(id, desfechoDaLista({ itens: daLista, visitas, vendas: vendasDosLeads }));
  }
  return resultado;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/**
 * O caminho de cada lista (Fase 1): enviadas → responderam → conversaram,
 * mais a mediana do tempo até a resposta. "Conversou" = trocou duas ou mais
 * mensagens depois de receber: uma resposta só pode ser "pare".
 */
async function funisDasListas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, FunilDaLista>> {
  const resultado = new Map<string, FunilDaLista>();
  if (ids.length === 0) return resultado;

  const { data: itens } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("campanha_id, lead_id, status, enviado_em, resposta_em")
    .in("campanha_id", ids)
    .in("status", ["enviado", "respondido"]);

  const respondidos = (itens ?? []).filter((i) => i.status === "respondido" && i.lead_id && i.enviado_em);
  const leadIds = [...new Set(respondidos.map((i) => i.lead_id as string))];
  const falasPorLead = new Map<string, string[]>();
  if (leadIds.length > 0) {
    const { data: conversas } = await supabase.from("whatsapp_conversas").select("id, lead_id").in("lead_id", leadIds);
    const leadDaConversa = new Map((conversas ?? []).map((c) => [c.id, c.lead_id as string]));
    const desde = respondidos.map((i) => i.enviado_em as string).sort()[0];
    if (leadDaConversa.size > 0) {
      const { data: falas } = await supabase
        .from("whatsapp_mensagens")
        .select("conversa_id, created_at")
        .in("conversa_id", [...leadDaConversa.keys()])
        .eq("remetente", "cliente")
        .gte("created_at", desde)
        .limit(5000);
      for (const f of falas ?? []) {
        const lead = leadDaConversa.get(f.conversa_id);
        if (lead) falasPorLead.set(lead, [...(falasPorLead.get(lead) ?? []), f.created_at]);
      }
    }
  }

  for (const id of ids) {
    const daLista = (itens ?? []).filter((i) => i.campanha_id === id);
    const resp = daLista.filter((i) => i.status === "respondido");
    const tempos = resp
      .filter((i) => i.enviado_em && i.resposta_em)
      .map((i) => (new Date(i.resposta_em!).getTime() - new Date(i.enviado_em!).getTime()) / 60_000)
      .filter((m) => m >= 0);
    const conversaram = resp.filter(
      (i) =>
        i.lead_id &&
        i.enviado_em &&
        (falasPorLead.get(i.lead_id) ?? []).filter((t) => t >= i.enviado_em!).length >= 2,
    ).length;
    const m = mediana(tempos);
    resultado.set(id, {
      enviadas: daLista.length,
      responderam: resp.length,
      conversaram,
      medianaRespostaMin: m === null ? null : Math.round(m),
    });
  }
  return resultado;
}

export type ItemDaLista = {
  id: string;
  leadId: string | null;
  nome: string;
  telefone: string;
  status: "pendente" | "enviado" | "respondido" | "erro";
  erroMotivo: string | null;
  agendadoPara: string;
  enviadoEm: string | null;
  respostaEm: string | null;
};

/** Quantas pessoas a gaveta "Ver quem recebeu" carrega por vez (Fase 4). */
const ITENS_POR_PAGINA = 200;

/**
 * Quem está na lista e o que aconteceu com cada um (Fase 1), de 200 em 200
 * (Fase 4: antes parava em 500 sem avisar). Responde "por que fulano não
 * recebeu?" sem abrir o banco.
 */
export async function detalharCampanha(
  campanhaId: string,
  pagina = 0,
): Promise<{ itens: ItemDaLista[]; total: number; temMais: boolean } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = await createClient();

  // A lista tem de ser DESTE corretor: a policy deixa o gestor ver a equipe.
  const { data: campanha } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("id", campanhaId)
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  if (!campanha) return { erro: "Lista não encontrada." };

  const inicio = Math.max(0, pagina) * ITENS_POR_PAGINA;
  const { data, error, count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id, lead_id, telefone, status, erro_motivo, agendado_para, enviado_em, resposta_em, lead:leads(nome)", {
      count: "exact",
    })
    .eq("campanha_id", campanhaId)
    .order("agendado_para", { ascending: true })
    .range(inicio, inicio + ITENS_POR_PAGINA - 1);
  if (error) return { erro: "Não foi possível abrir a lista agora." };

  const total = count ?? 0;
  return {
    total,
    temMais: inicio + (data?.length ?? 0) < total,
    itens: (data ?? []).map((i) => {
      const lead = (Array.isArray(i.lead) ? i.lead[0] : i.lead) as { nome: string | null } | null;
      return {
        id: i.id,
        leadId: i.lead_id,
        nome: lead?.nome?.trim() || i.telefone,
        telefone: i.telefone,
        status: i.status as ItemDaLista["status"],
        erroMotivo: i.erro_motivo,
        agendadoPara: i.agendado_para,
        enviadoEm: i.enviado_em,
        respostaEm: i.resposta_em,
      };
    }),
  };
}

/**
 * Pausar, retomar e cancelar UMA lista (Fase 1), sem mexer nas outras.
 *
 * Pausar é só o estado: o disparador pega apenas lista `em_andamento` e
 * confere de novo antes de cada mensagem. Retomar não reagenda nada: o
 * espaçamento de 35-75s mora no banco (0062) e vale para os itens vencidos.
 * Cancelar apaga o que ainda não saiu e marca a lista como `cancelada` (0153).
 */
export async function pausarCampanha(campanhaId: string): Promise<{ ok: true } | { erro: string }> {
  return mudarEstadoDaLista(campanhaId, "em_andamento", "pausada");
}

export async function retomarCampanha(campanhaId: string): Promise<{ ok: true } | { erro: string }> {
  /*
   * Os sinais de hoje viram a base (0172): a pausa automática só volta com
   * sinais NOVOS. Sem isso, retomar uma lista que parou sozinha a pararia de
   * novo na mensagem seguinte. Ler antes de mudar o estado; falha de leitura
   * deixa a base como estava.
   */
  const supabase = await createClient();
  const sinais = await lerSinaisDaLista(supabase, campanhaId);
  const r = await mudarEstadoDaLista(campanhaId, "pausada", "em_andamento", {
    pausa_automatica: null,
    ...(sinais ? { pausa_base: sinais } : {}),
  });
  if ("ok" in r) {
    /*
     * A conferência de texto também recomeça (08/10/2026). Sem isso, o item
     * que esperava texto continuava com os ciclos no teto e pausava a lista
     * de novo no primeiro ciclo depois de retomar. O motivo de falha de
     * ENVIO fica: é ele que explica o disjuntor.
     */
    await supabase
      .from("whatsapp_campanhas_fila")
      .update({ tentativas_texto: 0 })
      .eq("campanha_id", campanhaId)
      .eq("status", "pendente")
      .gt("tentativas_texto", 0);
    await supabase
      .from("whatsapp_campanhas_fila")
      .update({ erro_motivo: null })
      .eq("campanha_id", campanhaId)
      .eq("status", "pendente")
      .in("erro_motivo", [MOTIVO_TEXTO_PARECIDO, MOTIVO_TEXTO_SEM_IA]);
    acenderCorrenteDeDisparo();
  }
  return r;
}

export async function cancelarCampanha(
  campanhaId: string,
): Promise<{ ok: true; removidos: number } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = await createClient();

  // Primeiro o estado: a partir daqui o disparador já não pega a lista.
  const { data: mudou } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: "cancelada", viva: false })
    .eq("id", campanhaId)
    .eq("corretor_id", corretor.id)
    .in("status", ["em_andamento", "pausada"])
    .select("id");
  if (!mudou || mudou.length === 0) return { erro: "Esta lista já terminou ou não é sua." };

  const { data: removidos } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .eq("campanha_id", campanhaId)
    .eq("status", "pendente")
    .select("id");

  revalidatePath("/corretor/campanhas");
  return { ok: true, removidos: removidos?.length ?? 0 };
}

async function mudarEstadoDaLista(
  campanhaId: string,
  de: "em_andamento" | "pausada",
  para: "em_andamento" | "pausada",
  extra: { pausa_automatica?: null; pausa_base?: SinaisDaLista } = {},
): Promise<{ ok: true } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: para, ...extra })
    .eq("id", campanhaId)
    .eq("corretor_id", corretor.id)
    .eq("status", de)
    .select("id");
  if (!data || data.length === 0) {
    return { erro: para === "pausada" ? "Esta lista não está enviando agora." : "Esta lista não está pausada." };
  }
  revalidatePath("/corretor/campanhas");
  return { ok: true };
}

export type ResultadoProcessarFila =
  | {
      ok: true;
      processados: number;
      enviados: number;
      erros: number;
      restantes: number;
      /** true = a fila segue andando sozinha a partir daqui. */
      continuaSozinha: boolean;
      diagnostico: string[];
    }
  | { erro: string };

/**
 * Empurra a fila deste corretor agora, e deixa a corrente acesa. Processa um
 * lote curto (a tela está esperando) e delega o resto à corrente.
 */
export async function processarFilaAgora(): Promise<ResultadoProcessarFila> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const resultado = await processarFilaCampanhas({
    corretorId: corretor.id,
    limiteTotal: 2,
    orcamentoMs: 8_000,
  });

  if (resultado.deveContinuar) acenderCorrenteDeDisparo();

  revalidatePath("/corretor/campanhas");

  // Só é erro quando NADA saiu — senão a tela diria "não disparou" logo
  // depois de disparar.
  if (!resultado.dentroDaJanela && resultado.processados === 0) {
    return {
      erro: "Fora do horário comercial (9h às 20h59, de segunda a sábado) — as listas comuns não disparam agora. A fila segue esperando a próxima janela.",
    };
  }

  return {
    ok: true,
    processados: resultado.processados,
    enviados: resultado.enviados,
    erros: resultado.erros,
    restantes: resultado.restantes,
    continuaSozinha: resultado.deveContinuar,
    diagnostico: resultado.diagnostico,
  };
}

export type ResultadoEnvioImediato = ResultadoCriarCampanha;

/**
 * Dispara UMA mensagem para todos os leads, a qualquer hora.
 *
 * Por baixo não há caminho novo: monta uma lista comum marcada com
 * `ignorar_janela` (0058) e acende a mesma corrente de disparo. O que muda é
 * a janela, e só ela. Sem imóvel: variáveis do imóvel na mensagem são
 * recusadas (`variaveisSemValor`) em vez de virar texto genérico.
 */
export async function enviarAgoraParaTodosOsLeads(params: {
  mensagemBase: string;
}): Promise<ResultadoEnvioImediato> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const mensagemBase = params.mensagemBase.trim();
  if (mensagemBase.length < 10) {
    return { erro: "Escreva a mensagem que vai para os leads (pelo menos uma frase)." };
  }

  const agora = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return criarCampanha({
    titulo: `Envio imediato · ${agora}`,
    empreendimentoId: null,
    filtro: "todos",
    mensagemBase,
    ignorarJanela: true,
  });
}

export type ResultadoLiberacao =
  | { ok: true; campanhas: number; mensagens: number }
  | { erro: string };

/**
 * Solta, UMA VEZ, uma fila que está esperando o horário comercial.
 *
 * Liberar é duas coisas: reagendar os pendentes a partir de agora (com o
 * mesmo espaçamento de 35-75s, num comando só no banco — `reagendar_fila_
 * campanha`, 0155) e autorizar a lista a sair fora da janela ATÉ o último
 * item reagendado (`janela_liberada_ate`). Depois disso ela volta à janela
 * segura sozinha.
 *
 * O que mudou no roadmap (Fase 0, 03/10/2026):
 * - não marca mais `ignorar_janela` para sempre;
 * - NÃO devolve à fila os itens com erro. Eles eram revividos por causa de um
 *   defeito de DDI de agosto, já corrigido, e a revivência devolvia número
 *   sem WhatsApp, quem esgotou as tentativas e quem foi barrado por estar
 *   conversando com o corretor;
 * - só libera o horário: cota acabada, número caído ou bloqueado não são
 *   coisa que este botão resolva, e a tela já não o oferece nesses casos.
 */
export async function liberarEnvioAgora(params?: {
  campanhaId?: string;
}): Promise<ResultadoLiberacao> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  // Dentro do horário (e do expediente) a fila já está saindo sozinha:
  // liberar não teria o que fazer, e reagendar só embaralharia a ordem.
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("expediente_inicio, expediente_fim")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  const expediente = instancia
    ? { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim }
    : null;
  if (dentroDaJanelaDoCorretor(new Date(), expediente)) {
    return { erro: "As listas já estão dentro do horário e saindo sozinhas." };
  }

  let queryCampanhas = supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", corretor.id)
    .eq("status", "em_andamento");
  if (params?.campanhaId) queryCampanhas = queryCampanhas.eq("id", params.campanhaId);

  const { data: campanhas } = await queryCampanhas;
  const ids = (campanhas ?? []).map((c) => c.id);
  if (ids.length === 0) return { erro: "Nenhuma lista em andamento para liberar." };

  const { data: reagendados, error: erroReagenda } = await supabase.rpc("reagendar_fila_campanha", {
    p_campanhas: ids,
  });
  if (erroReagenda) return { erro: "Não foi possível liberar o envio agora." };

  const { data: ultimo } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("agendado_para")
    .in("campanha_id", ids)
    .eq("status", "pendente")
    .order("agendado_para", { ascending: false })
    .limit(1)
    .maybeSingle();

  // A liberação vale até o último item reagendado, com folga de 30 min
  // para retentativas. Depois disso a lista volta à janela segura.
  const ate = new Date(
    Math.max(Date.now(), ultimo ? new Date(ultimo.agendado_para).getTime() : 0) + 30 * 60_000,
  ).toISOString();
  const { error: erroMarca } = await supabase
    .from("whatsapp_campanhas")
    .update({ janela_liberada_ate: ate })
    .in("id", ids);
  if (erroMarca) return { erro: "Não foi possível liberar o envio agora." };

  acenderCorrenteDeDisparo();
  revalidatePath("/corretor/campanhas");

  return { ok: true, campanhas: ids.length, mensagens: reagendados ?? 0 };
}

export type ResultadoLimparFila =
  { ok: true; removidos: number; campanhasFechadas: number } | { erro: string };

/**
 * Esvazia a fila de disparo deste corretor.
 *
 * Só remove o que AINDA NÃO SAIU — `pendente` e `erro`. Mensagem já
 * entregue ou respondida é histórico do atendimento e nunca pode sumir.
 * As listas que ficam sem nada pendente são fechadas na sequência.
 */
export async function limparFilaDisparo(): Promise<ResultadoLimparFila> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  const { data: campanhas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", corretor.id)
    .neq("status", "rascunho");

  const ids = (campanhas ?? []).map((c) => c.id);
  if (ids.length === 0) return { ok: true, removidos: 0, campanhasFechadas: 0 };

  const { data: removidas, error } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .in("campanha_id", ids)
    .in("status", ["pendente", "erro"])
    .select("id");

  if (error) return { erro: "Não foi possível limpar a fila agora. Tente de novo." };

  let campanhasFechadas = 0;
  for (const id of ids) {
    const { count } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", id)
      .eq("status", "pendente");

    if ((count ?? 0) === 0) {
      const { data } = await supabase
        .from("whatsapp_campanhas")
        .update({ status: "concluida", viva: false })
        .eq("id", id)
        .eq("corretor_id", corretor.id)
        .eq("status", "em_andamento")
        .select("id");
      campanhasFechadas += data?.length ?? 0;
    }
  }

  revalidatePath("/corretor/campanhas");
  return { ok: true, removidos: removidas?.length ?? 0, campanhasFechadas };
}

/** O que está impedindo a fila de andar, em categoria — a tela decide o botão por ela. */
export type TipoDeImpedimento =
  | "sem_numero"
  | "bloqueado"
  | "desconectado"
  | "cota"
  | "horario"
  | "expediente"
  /** A próxima mensagem sairia parecida com outra do número (08/10/2026). */
  | "texto";

export type StatusDisparo = {
  /** Nome pareado no provedor; null quando o número ainda não conectou. */
  numeroConectado: string | null;
  statusConexao: string;
  /** Quantos disparos ainda cabem hoje neste número (aquecimento pelo uso, 0158). */
  saldoHoje: number | null;
  /** Por que o limite de hoje é esse, em português; null sem número conectado. */
  explicacaoDoLimite: string | null;
  dentroDaJanela: boolean;
  pendentes: number;
  proximoAgendadoEm: string | null;
  /** O que está impedindo a fila de andar, em português, ou null se está tudo certo. */
  impedimento: string | null;
  impedimentoTipo: TipoDeImpedimento | null;
  /** Previsão de término do que sai hoje (ISO), quando há previsão. */
  terminaEm: string | null;
  /** Quantas ficam para os próximos dias. */
  continuaAmanha: number;
};

/** O dia de hoje em São Paulo (YYYY-MM-DD) — o mesmo relógio da cota (0155). */
function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/**
 * O que o painel precisa saber para responder "por que minha lista não está
 * saindo?" e "quando termina?" sem ninguém abrir o banco.
 *
 * Desde o roadmap das listas, conta também o EXPEDIENTE do corretor (0148):
 * antes a tela dizia "saem sozinhas" enquanto o disparador segurava tudo
 * porque o expediente dele tinha acabado.
 */
export async function statusDisparo(): Promise<StatusDisparo | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "id, status_conexao, telefone_conectado, conectado_em, bloqueado_ate, envios_campanha_contador, envios_campanha_data, expediente_inicio, expediente_fim",
    )
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  const { data: campanhas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", corretor.id)
    .eq("status", "em_andamento");

  const ids = (campanhas ?? []).map((c) => c.id);

  let pendentes = 0;
  let proximoAgendadoEm: string | null = null;
  // Itens que esperam a IA reescrever para não sair texto repetido.
  let esperandoTextoSemIa = 0;
  let esperandoTextoParecido = 0;
  let esperandoSessao = 0;

  if (ids.length > 0) {
    const { count } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .in("campanha_id", ids)
      .eq("status", "pendente");
    pendentes = count ?? 0;

    const { data: proximo } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("agendado_para")
      .in("campanha_id", ids)
      .eq("status", "pendente")
      .order("agendado_para", { ascending: true })
      .limit(1)
      .maybeSingle();
    proximoAgendadoEm = proximo?.agendado_para ?? null;

    const { data: esperando } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("erro_motivo")
      .in("campanha_id", ids)
      .eq("status", "pendente")
      .in("erro_motivo", [MOTIVO_TEXTO_SEM_IA, MOTIVO_TEXTO_PARECIDO, MOTIVO_SESSAO_CAIU])
      .limit(50);
    for (const e of esperando ?? []) {
      if (e.erro_motivo === MOTIVO_TEXTO_SEM_IA) esperandoTextoSemIa++;
      else if (e.erro_motivo === MOTIVO_SESSAO_CAIU) esperandoSessao++;
      else esperandoTextoParecido++;
    }
  }

  const conectadoEm = instancia?.conectado_em ? new Date(instancia.conectado_em) : null;
  const enviosHoje =
    instancia?.envios_campanha_data === hojeEmSaoPaulo() ? instancia.envios_campanha_contador : 0;

  // O mesmo limite que o disparador usa (calcularLimiteDoDia): a tela não
  // pode prometer uma cota que a reserva recusa.
  const limiteHoje =
    instancia && conectadoEm ? await calcularLimiteDoDia(instancia.id, conectadoEm) : null;
  const saldoHoje = limiteHoje ? Math.max(0, limiteHoje.limite - enviosHoje) : null;
  const agora = new Date();
  const janelaAberta = dentroDaJanela(agora);
  const expediente = instancia
    ? { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim }
    : null;
  const noExpediente = dentroDaJanelaDoCorretor(agora, expediente);
  const bloqueado =
    instancia?.bloqueado_ate && new Date(instancia.bloqueado_ate) > agora;

  let impedimento: string | null = null;
  let impedimentoTipo: TipoDeImpedimento | null = null;
  if (!instancia) {
    impedimentoTipo = "sem_numero";
    impedimento = "Nenhum número de WhatsApp cadastrado. Conecte o seu em Minha IA → WhatsApp.";
  } else if (esperandoSessao > 0) {
    /*
     * A sessão do WhatsApp caiu (`sessaoCaida.ts`, 08/10/2026). Vem antes da
     * pausa porque a pausa que essas falhas abrem NÃO volta sozinha, e o
     * texto dela diria que volta: sem reconectar, nada sai.
     */
    impedimentoTipo = "desconectado";
    impedimento =
      instancia.status_conexao === "conectado"
        ? "A conexão do WhatsApp caiu e as mensagens não estão saindo, mesmo com o número aparecendo como conectado. Em Minha IA → WhatsApp, toque em Desconectar e conecte o número de novo: a fila volta sozinha quando ele reconectar."
        : "A conexão do WhatsApp caiu e as mensagens não estão saindo. Conecte o número de novo em Minha IA → WhatsApp: a fila volta sozinha quando ele reconectar.";
  } else if (bloqueado) {
    impedimentoTipo = "bloqueado";
    impedimento = `Envios pausados automaticamente até ${new Date(instancia.bloqueado_ate as string).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} depois de falhas seguidas do WhatsApp. Voltam sozinhos.`;
  } else if (instancia.status_conexao !== "conectado" || !conectadoEm) {
    impedimentoTipo = "desconectado";
    impedimento =
      "O número não está conectado. Leia o QR Code em Minha IA → WhatsApp — sem isso nenhuma mensagem sai.";
  } else if (saldoHoje === 0) {
    impedimentoTipo = "cota";
    impedimento = "Hoje já saíram todas as mensagens que o seu número aguenta com segurança. A fila continua sozinha amanhã.";
  } else if (!janelaAberta) {
    impedimentoTipo = "horario";
    impedimento =
      "Fora do horário comercial (9h às 20h59, de segunda a sábado). A fila retoma sozinha na próxima janela.";
  } else if (!noExpediente) {
    impedimentoTipo = "expediente";
    impedimento = `Fora do seu expediente (${instancia.expediente_inicio}h às ${instancia.expediente_fim}h). A fila retoma sozinha no começo do próximo expediente.`;
  } else if (esperandoTextoSemIa > 0) {
    impedimentoTipo = "texto";
    impedimento =
      "A IA que reescreve cada mensagem não está respondendo agora. Sem ela, a próxima sairia igual a uma que o seu número já mandou, então a fila espera e tenta de novo a cada minuto.";
  } else if (esperandoTextoParecido > 0) {
    impedimentoTipo = "texto";
    impedimento =
      "A IA está reescrevendo a próxima mensagem até ela ficar diferente das que o seu número já mandou. A fila segue sozinha; se demorar, a lista pausa e avisa o que mudar no texto.";
  }

  // A janela de hoje é a interseção entre a janela segura e o expediente.
  const previsao =
    !impedimento && pendentes > 0
      ? previsaoDeTermino({
          pendentes,
          saldoHoje,
          agora,
          expediente: {
            inicioHora: Math.max(9, instancia?.expediente_inicio ?? 9),
            fimHora: Math.min(21, instancia?.expediente_fim ?? 21),
          },
        })
      : null;

  return {
    numeroConectado: instancia?.telefone_conectado ?? null,
    statusConexao: instancia?.status_conexao ?? "sem_instancia",
    saldoHoje,
    explicacaoDoLimite: limiteHoje ? fraseDoLimite(limiteHoje) : null,
    dentroDaJanela: janelaAberta,
    pendentes,
    proximoAgendadoEm,
    impedimento,
    impedimentoTipo,
    terminaEm: previsao?.terminaEm?.toISOString() ?? null,
    continuaAmanha: previsao?.continuaAmanha ?? 0,
  };
}
