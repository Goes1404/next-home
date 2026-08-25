"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import type { Lead } from "@/lib/types";
import { acenderCorrenteDeDisparo } from "@/lib/whatsapp/autoDisparo";
import { processarFilaCampanhas } from "@/lib/whatsapp/campaignDispatcher";
import { gerarMensagensCampanhaPersonalizadas, montarFilaCampanha } from "@/lib/whatsapp/campaignQueue";
import { provedorConfigurado } from "@/lib/whatsapp/provider";
import { saldoDiario, dentroDaJanela } from "@/lib/whatsapp/antiBan";

/**
 * Ações do painel de Campanhas: criar, listar, diagnosticar e (quando o
 * corretor não quer esperar nem um minuto) empurrar a fila na hora.
 *
 * A montagem da fila (`montarFilaCampanha`) e o envio de fato
 * (`processarFilaCampanhas`) são os mesmos módulos usados pelo disparo
 * automático — este arquivo só decide QUAIS leads entram e grava o
 * resultado, sob a sessão do corretor logado (RLS via `createClient`, nunca
 * o cliente de serviço aqui).
 *
 * Criar uma campanha já acende a corrente de auto-disparo
 * (`acenderCorrenteDeDisparo`): a partir daí as mensagens saem sozinhas,
 * uma a cada 35-75s, sem ninguém clicar em nada.
 */

export type FiltroLeadsCampanha = "parados_15d" | "novos_sem_contato" | "todos" | "selecionados";

const DIAS_PARADO = 15;

/** Fechado e perdido nunca entram — reativar quem já comprou ou já disse não é o oposto do objetivo. */
function elegivel(lead: Lead, filtro: FiltroLeadsCampanha): boolean {
  if (!lead.telefone) return false;
  if (lead.etapa === "fechado" || lead.etapa === "perdido") return false;

  if (filtro === "novos_sem_contato") return lead.etapa === "novo";
  if (filtro === "parados_15d") {
    const dias = (Date.now() - new Date(lead.etapaAlteradaEm).getTime()) / 86_400_000;
    return dias >= DIAS_PARADO;
  }
  // "todos" e "selecionados" usam só as regras de base: quem recorta a
  // seleção manual é a lista de ids, mais abaixo.
  return true;
}

export type LeadElegivel = { id: string; nome: string; telefone: string };

/** `getMeusLeads` já vem filtrado por RLS (0007) — aqui só decide QUAIS desses entram na campanha. */
export async function listarLeadsElegiveis(filtro: FiltroLeadsCampanha): Promise<LeadElegivel[]> {
  const leads = await getMeusLeads();
  return leads
    .filter((lead) => elegivel(lead, filtro))
    .map((lead) => ({ id: lead.id, nome: lead.nome, telefone: lead.telefone as string }));
}

/**
 * Recorta os elegíveis pela seleção manual do corretor.
 *
 * A INTERSEÇÃO é a segurança: os ids chegam pela rede (Server Action é
 * endpoint HTTP) e só valem se apontarem para um lead que a RLS já entregou
 * como do corretor E que passa nas regras de base (tem telefone, não está
 * fechado/perdido). Id alheio ou inventado simplesmente não sobrevive ao
 * filtro — nunca vira mensagem.
 */
function recortarPorSelecao(elegiveis: LeadElegivel[], leadIds: string[] | undefined): LeadElegivel[] {
  const escolhidos = new Set(leadIds ?? []);
  return elegiveis.filter((lead) => escolhidos.has(lead.id));
}

export async function gerarPreviewCampanha(params: {
  filtro: FiltroLeadsCampanha;
  empreendimentoNome: string;
  mensagemBase: string;
  /** Só para `filtro: "selecionados"` — os leads escolhidos um a um. */
  leadIds?: string[];
}): Promise<{ mensagens: string[] } | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva uma mensagem base primeiro." };

  let elegiveis = await listarLeadsElegiveis(params.filtro);
  if (params.filtro === "selecionados") {
    elegiveis = recortarPorSelecao(elegiveis, params.leadIds);
    if (elegiveis.length === 0) return { erro: "Escolha ao menos um lead primeiro." };
  }
  if (elegiveis.length === 0) {
    return { erro: "Nenhum lead elegível para este filtro no momento." };
  }

  // Amostra de até 3 — o preview é só para o corretor calibrar o tom antes
  // de disparar de verdade, não precisa (nem deve) gerar a fila inteira.
  const fila = await gerarMensagensCampanhaPersonalizadas({
    campanhaId: "preview",
    leads: elegiveis.slice(0, 3),
    mensagemBase: params.mensagemBase,
    empreendimentoNome: params.empreendimentoNome,
  });

  return { mensagens: fila.map((item) => item.mensagemPersonalizada) };
}

export type ResultadoCriarCampanha = { ok: true; campanhaId: string; totalLeads: number } | { erro: string };

export async function criarCampanha(params: {
  titulo: string;
  empreendimentoId: string | null;
  empreendimentoNome: string;
  filtro: FiltroLeadsCampanha;
  mensagemBase: string;
  /** Só para `filtro: "selecionados"` — os leads escolhidos um a um. */
  leadIds?: string[];
}): Promise<ResultadoCriarCampanha> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const titulo = params.titulo.trim();
  if (!titulo) return { erro: "Dê um título para a lista de transmissão." };
  if (!params.mensagemBase.trim()) return { erro: "Escreva a mensagem base." };

  if (!provedorConfigurado()) {
    return {
      erro: "Nenhum provedor de WhatsApp está conectado a este ambiente. Conecte seu número em /corretor/whatsapp primeiro.",
    };
  }

  let elegiveis = await listarLeadsElegiveis(params.filtro);
  if (params.filtro === "selecionados") {
    elegiveis = recortarPorSelecao(elegiveis, params.leadIds);
    if (elegiveis.length === 0) return { erro: "Escolha ao menos um lead primeiro." };
  }
  if (elegiveis.length === 0) {
    return { erro: "Nenhum lead elegível para este filtro no momento." };
  }

  const supabase = await createClient();

  const { data: campanha, error: erroCampanha } = await supabase
    .from("whatsapp_campanhas")
    .insert({
      corretor_id: corretor.id,
      titulo,
      empreendimento_id: params.empreendimentoId,
      mensagem_base: params.mensagemBase,
      total_leads: elegiveis.length,
      status: "em_andamento",
    })
    .select("id")
    .single();

  if (erroCampanha || !campanha) return { erro: "Não foi possível criar a lista de transmissão agora." };

  // Fila montada SEM chamar a IA: só interpolação de template e cálculo de
  // horários. A variação anti-ban por IA acontece no envio, um item por vez
  // (`variarMensagemComIA`, usada pelo disparador).
  //
  // Antes, esta action fazia uma chamada ao Gemini por lead, em série,
  // antes de gravar qualquer coisa. Com algumas dezenas de leads isso
  // estoura o tempo da função e a campanha simplesmente não nasce — o
  // corretor via "criando..." e nada aparecia.
  const fila = montarFilaCampanha({
    campanhaId: campanha.id,
    leads: elegiveis,
    mensagemBase: params.mensagemBase,
    empreendimentoNome: params.empreendimentoNome,
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

  // Acende a corrente: a primeira mensagem sai em segundos e a fila segue
  // andando sozinha, sem depender do corretor clicar em nada.
  acenderCorrenteDeDisparo();

  revalidatePath("/corretor/campanhas");
  return { ok: true, campanhaId: campanha.id, totalLeads: elegiveis.length };
}

export type CampanhaListada = {
  id: string;
  titulo: string;
  empreendimentoNome: string | null;
  totalLeads: number;
  totalEnviados: number;
  totalRespondidos: number;
  status: "rascunho" | "em_andamento" | "pausada" | "concluida";
  criadoEm: string;
};

export async function listarCampanhas(): Promise<CampanhaListada[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];

  // Filtro explícito desde a 0031: as policies de campanha passaram a
  // incluir o gestor (a administração vê a equipe), então sem o `.eq` esta
  // tela mostraria as campanhas dos colegas para quem administra. Aqui é a
  // lista PESSOAL; a da equipe fica em /corretor/admin/whatsapp.
  const supabase = await createClient();
  const { data } = await supabase
    .from("whatsapp_campanhas")
    .select(
      "id, titulo, total_leads, total_enviados, total_respondidos, status, created_at, empreendimento:empreendimentos(nome)",
    )
    .eq("corretor_id", corretor.id)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []).map((c) => ({
    id: c.id,
    titulo: c.titulo,
    empreendimentoNome: (c.empreendimento as { nome: string } | null)?.nome ?? null,
    totalLeads: c.total_leads,
    totalEnviados: c.total_enviados,
    totalRespondidos: c.total_respondidos,
    status: c.status,
    criadoEm: c.created_at,
  }));
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
 * Empurra a fila deste corretor agora, e deixa a corrente acesa.
 *
 * O botão continua existindo para quem não quer esperar nem um minuto, mas
 * deixou de ser o caminho principal: ele processa um lote e acende a
 * corrente de auto-disparo, que segue despachando sozinha. Antes, cada
 * clique mandava no máximo 3 mensagens e parava — uma campanha de 40 leads
 * exigia o corretor clicando o dia inteiro.
 */
export async function processarFilaAgora(): Promise<ResultadoProcessarFila> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const resultado = await processarFilaCampanhas({
    corretorId: corretor.id,
    limiteTotal: 2,
    // A server action responde para uma tela com alguém olhando: trabalha
    // pouco e delega o resto à corrente, em vez de segurar o botão girando.
    // O trabalho de verdade é da corrente, que tem os 60s da rota inteira.
    orcamentoMs: 8_000,
  });

  if (resultado.deveContinuar) acenderCorrenteDeDisparo();

  revalidatePath("/corretor/campanhas");

  if (!resultado.dentroDaJanela) {
    return {
      erro: "Fora do horário comercial (9h às 20h59, de segunda a sábado) — as listas não disparam agora. A fila segue esperando a próxima janela.",
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

export type ResultadoLimparFila =
  | { ok: true; removidos: number; campanhasFechadas: number }
  | { erro: string };

/**
 * Esvazia a fila de disparo deste corretor.
 *
 * Só remove o que AINDA NÃO SAIU — `pendente` e `erro`. Mensagem já
 * entregue (`enviado`) ou respondida pelo cliente (`respondido`) é
 * histórico do atendimento e nunca pode desaparecer: é dela que o Live Chat
 * e a linha do tempo do lead são feitos.
 *
 * Por que apagar em vez de marcar como cancelada: a fila é uma lista de
 * intenções, não de fatos. Um item pendente é uma mensagem que ninguém
 * mandou; guardá-lo como "cancelado" encheria a tabela de linhas que nunca
 * seriam consultadas — o mesmo erro do `historico_envios`, que acumulou 53
 * registros que nenhuma tela lia.
 *
 * As campanhas que ficam sem nada pendente são fechadas na sequência. Sem
 * isso elas continuariam em "em andamento" para sempre, prometendo um
 * disparo que não existe mais.
 */
export async function limparFilaDisparo(): Promise<ResultadoLimparFila> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  // O `.eq("corretor_id")` é explícito de propósito: desde a 0031 as
  // policies de campanha incluem o gestor, e sem ele um gestor limparia a
  // fila da equipe inteira ao clicar no botão da própria tela.
  const { data: campanhas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", corretor.id);

  const ids = (campanhas ?? []).map((c) => c.id);
  if (ids.length === 0) return { ok: true, removidos: 0, campanhasFechadas: 0 };

  const { data: removidas, error } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .in("campanha_id", ids)
    .in("status", ["pendente", "erro"])
    .select("id");

  if (error) return { erro: "Não foi possível limpar a fila agora. Tente de novo." };

  // Fecha o que ficou sem pendência. Uma campanha cuja fila esvaziou não
  // está mais "em andamento" — dizer que está é mentir na tela.
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
        .update({ status: "concluida" })
        .eq("id", id)
        .eq("corretor_id", corretor.id)
        .neq("status", "concluida")
        .select("id");
      campanhasFechadas += data?.length ?? 0;
    }
  }

  revalidatePath("/corretor/campanhas");
  return { ok: true, removidos: removidas?.length ?? 0, campanhasFechadas };
}

/**
 * TEMPORÁRIO — ferramenta de FASE DE TESTE.
 *
 * Zera a cota do dia, o bloqueio e o disjuntor deste corretor, para não ser
 * preciso esperar a virada do dia a cada experimento.
 *
 * ISTO AFROUXA A PROTEÇÃO ANTI-BAN DE PROPÓSITO. A cota diária existe
 * porque volume alto num número novo é o caminho mais curto para o WhatsApp
 * bloquear a linha do corretor — e uma linha bloqueada não volta com
 * deploy. Enquanto este botão existir, quem clicar está assumindo esse
 * risco conscientemente.
 *
 * `conectado_em` não é tocado: zerá-lo reiniciaria a curva de aquecimento e
 * daria cota MENOR, além de mentir sobre a idade do número.
 *
 * PARA REMOVER depois da fase de teste: apagar esta função, o botão em
 * `CampanhasManager.tsx` e a função `resetar_cota_campanha` no banco
 * (migration 0034).
 */
export async function resetarCotaDisparo(): Promise<{ ok?: true; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const supabase = await createClient();

  // Só a instância DESTE corretor: a RPC é `security definer` e recebe um
  // id, então quem escolhe o id precisa ser esta camada, com a sessão.
  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id")
    .eq("corretor_id", corretor.id)
    .maybeSingle();

  if (!instancia) return { erro: "Nenhum número de WhatsApp configurado para você." };

  const { error } = await supabase.rpc("resetar_cota_campanha", {
    p_instancia_id: instancia.id,
  });

  if (error) return { erro: "Não foi possível resetar a cota agora." };

  revalidatePath("/corretor/campanhas");
  return { ok: true };
}

export type StatusDisparo = {
  /** Nome pareado no provedor; null quando o número ainda não conectou. */
  numeroConectado: string | null;
  statusConexao: string;
  /** Quantos disparos ainda cabem hoje neste número (curva de aquecimento). */
  saldoHoje: number | null;
  dentroDaJanela: boolean;
  pendentes: number;
  proximoAgendadoEm: string | null;
  /** O que está impedindo a fila de andar, em português, ou null se está tudo certo. */
  impedimento: string | null;
};

/**
 * O que o painel precisa saber para responder "por que minha campanha não
 * está saindo?" sem ninguém abrir o banco.
 *
 * Esta pergunta não tinha resposta antes: uma fila 100% pendente era
 * indistinguível de uma fila travada por número não pareado, cota estourada
 * ou disjuntor aberto. Os três casos apareciam como "0 enviados".
 */
export async function statusDisparo(): Promise<StatusDisparo | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("status_conexao, telefone_conectado, conectado_em, bloqueado_ate, envios_campanha_contador, envios_campanha_data")
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
  }

  const conectadoEm = instancia?.conectado_em ? new Date(instancia.conectado_em) : null;
  const hoje = new Date().toISOString().slice(0, 10);
  const enviosHoje = instancia?.envios_campanha_data === hoje ? instancia.envios_campanha_contador : 0;

  const saldoHoje = conectadoEm ? saldoDiario({ conectadoEm, enviosCampanhaHoje: enviosHoje }) : null;
  const janelaAberta = dentroDaJanela(new Date());
  const bloqueado = instancia?.bloqueado_ate && new Date(instancia.bloqueado_ate) > new Date();

  let impedimento: string | null = null;
  if (!instancia) {
    impedimento = "Nenhum número de WhatsApp cadastrado. Conecte o seu em Configurações do WhatsApp.";
  } else if (bloqueado) {
    impedimento = `Envios pausados automaticamente até ${new Date(instancia.bloqueado_ate as string).toLocaleString("pt-BR")} após falhas seguidas do provedor.`;
  } else if (instancia.status_conexao !== "conectado" || !conectadoEm) {
    impedimento = "O número ainda não está pareado. Leia o QR Code em Configurações do WhatsApp — sem isso nenhum disparo é autorizado.";
  } else if (saldoHoje === 0) {
    impedimento = "Cota diária de disparos deste número atingida. A fila continua sozinha amanhã.";
  } else if (!janelaAberta) {
    impedimento = "Fora do horário comercial (9h às 20h59, de segunda a sábado). A fila retoma sozinha na próxima janela.";
  }

  return {
    numeroConectado: instancia?.telefone_conectado ?? null,
    statusConexao: instancia?.status_conexao ?? "sem_instancia",
    saldoHoje,
    dentroDaJanela: janelaAberta,
    pendentes,
    proximoAgendadoEm,
    impedimento,
  };
}
