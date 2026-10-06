import "server-only";

import { conteudoParaGravar, resumoParaGravar, TEXTO_NAO_GUARDADO } from "./privacidadeDaConversa";
import { mesclarDossie } from "./mesclarDossie";
import type { SituacaoDaConversa } from "./quandoAIaResponde";
import { createServiceClient } from "@/lib/supabase/service";
import { site } from "@/lib/site";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import type { ClassificacaoDeRecusa } from "./recusaEmCamadas";
import { rotuloDaVisita } from "./mudancaDeVisita";
import type { ConviteDeEntrada } from "./porteiro";
import { comRetentativa } from "@/lib/supabase/retentativa";
import {
  bloqueadoAtePor,
  deveAbrirDisjuntor,
  limiteDoDia,
  diasDesdeConexao,
  DIAS_DE_USO_RECENTE,
  type LimiteDoDia,
  INTERVALO_MINIMO_SEGUNDOS,
  INTERVALO_MAXIMO_SEGUNDOS,
} from "./antiBan";
import { consultarEstadoConexao } from "./provider";
import { resetPorTrocaDeNumero } from "./trocaDeNumero";
import { camposDaFicha } from "./fichaDoLead";
import type { DossieClienteIA } from "./types";
import { contaComoRespostaDaLista, type ListaRecenteDoLead } from "./contextoDaCampanha";
import {
  citaOImovel,
  diaEmSaoPauloISO,
  ehClienteDePessoa,
  remetenteResumido,
  segredoDaMedicao,
} from "./medicaoDoLink";

/**
 * Persistência do fluxo de WhatsApp, do lado do webhook.
 *
 * Roda sem sessão de usuário (a requisição vem do provedor, não do
 * navegador do corretor), por isso usa o cliente de serviço — ver
 * `supabase/service.ts` para o porquê.
 */

export type InstanciaResolvida = {
  id: string;
  corretorId: string;
  instanceName: string;
  nomeCorretor: string;
  creciCorretor: string;
  whatsappCorretor: string;
  /** Slug do corretor — vira o link do catálogo dele (`/?corretor=<slug>`). */
  slugCorretor: string | null;
  nomeAssistente: string;
  tomVoz: string;
  modoBot: "24_7" | "noturno_e_fds" | "co_piloto_3min" | "desativado";
  webhookSecret: string | null;
  /** Frase que o corretor digita no próprio chat para "ligar" a IA. Nula = recurso desligado. */
  palavraChaveAtivacao: string | null;
  palavraChaveTeste: string | null;
  /** Frases que o CLIENTE escreve e que liberam a IA na hora (0056). */
  palavrasEntradaCliente: string | null;
  /** O expediente do corretor (0148): modo "fora do expediente" e janela de envio. */
  expediente: { inicioHora: number; fimHora: number };
  /** As regras que o corretor escreveu para a IA dele (0154). */
  regrasDaIa: string | null;
};

/**
 * Descobre de quem é a instância que recebeu a mensagem.
 *
 * É o que torna o sistema multi-corretor de verdade: sem isto, toda
 * conversa seria atribuída a um corretor fixo e o dossiê cairia na caixa
 * de outra pessoa.
 */
export async function resolverInstancia(instanceName: string): Promise<InstanciaResolvida | null> {
  if (!instanceName) return null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "id, corretor_id, instance_name, nome_assistente, tom_voz, modo_bot, webhook_secret, palavra_chave_ativacao, palavra_chave_teste, palavras_entrada_cliente, expediente_inicio, expediente_fim, regras_da_ia",
    )
    .eq("instance_name", instanceName)
    .maybeSingle();

  if (error || !data) return null;

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, creci, whatsapp, slug")
    .eq("id", data.corretor_id)
    .maybeSingle();

  if (!corretor) return null;

  return {
    id: data.id,
    corretorId: data.corretor_id,
    instanceName: data.instance_name,
    nomeCorretor: corretor.nome,
    creciCorretor: corretor.creci,
    whatsappCorretor: corretor.whatsapp,
    slugCorretor: corretor.slug,
    nomeAssistente: data.nome_assistente,
    tomVoz: data.tom_voz,
    modoBot: data.modo_bot,
    webhookSecret: data.webhook_secret,
    palavraChaveAtivacao: data.palavra_chave_ativacao,
    palavraChaveTeste: data.palavra_chave_teste,
    palavrasEntradaCliente: data.palavras_entrada_cliente,
    expediente: { inicioHora: data.expediente_inicio ?? 9, fimHora: data.expediente_fim ?? 21 },
    regrasDaIa: data.regras_da_ia ?? null,
  };
}

export type ConversaPersistida = {
  id: string;
  /** Nulo apenas em objetos legados/testes; a 0111 torna impossível no banco. */
  leadId: string | null;
  /**
   * A MEMÓRIA da conversa (0110) — o estado da negociação em prosa.
   *
   * É o que sobrevive à janela de 40 falas, das quais até 27 são do
   * corretor nas conversas ativas (o número é o WhatsApp pessoal dele).
   */
  memoria: string | null;
  /** A memória atual foi escrita por uma PESSOA: a IA não a reescreve. */
  memoriaDoCorretor: boolean;
  telefoneCliente: string;
  botAtivo: boolean;
  /** De onde esta conversa nasceu — 'campanha' é quem o disparo em massa criou (ver campaignDispatcher.ts). */
  origem: "organica" | "campanha";
  /** Conversa de teste da equipe: fora do few-shot e do golden (ver 0038/0039). */
  eTeste: boolean;
  /** Quando a IA atendeu esta conversa pela primeira vez (0106). */
  atendidaEm: string | null;
  /** O lead pediu para não ser contatado (0110). Entra na decisão de responder. */
  naoContatar: boolean;
  /**
   * O lead foi transferido para OUTRO corretor depois desta conversa: este
   * número não fala mais com ele (`quandoAIaResponde.ts`).
   */
  leadDeOutroCorretor: boolean;
  /**
   * `leads.visita_agendada_em`, para a IA saber que há visita marcada e
   * poder remarcar ou desmarcar (A2, 06/10/2026).
   */
  visitaAgendadaEm: string | null;
};

/*
 * O lead vem embutido porque dois motivos de silêncio moram nele: o pedido
 * para não ser contatado e a transferência para outro corretor. Uma consulta
 * só, em vez de uma segunda leitura no meio do webhook.
 */
const SELECT_CONVERSA =
  "id, corretor_id, lead_id, telefone_cliente, bot_ativo, origem, e_teste, atendida_em, memoria, memoria_do_corretor, lead:leads!whatsapp_conversas_lead_id_fkey(corretor_id, nao_contatar_em, visita_agendada_em)";

type LeadEmbutido = {
  corretor_id: string | null;
  nao_contatar_em: string | null;
  visita_agendada_em?: string | null;
};

function mapConversa(row: {
  id: string;
  corretor_id?: string | null;
  lead_id: string | null;
  telefone_cliente: string;
  bot_ativo: boolean;
  origem: "organica" | "campanha";
  e_teste: boolean;
  atendida_em?: string | null;
  memoria?: string | null;
  memoria_do_corretor?: boolean;
  lead?: LeadEmbutido | LeadEmbutido[] | null;
}): ConversaPersistida {
  const lead = Array.isArray(row.lead) ? (row.lead[0] ?? null) : (row.lead ?? null);
  return {
    id: row.id,
    leadId: row.lead_id,
    telefoneCliente: row.telefone_cliente,
    botAtivo: row.bot_ativo,
    atendidaEm: row.atendida_em ?? null,
    naoContatar: Boolean(lead?.nao_contatar_em),
    leadDeOutroCorretor: Boolean(
      lead?.corretor_id && row.corretor_id && lead.corretor_id !== row.corretor_id,
    ),
    memoria: row.memoria ?? null,
    memoriaDoCorretor: row.memoria_do_corretor ?? false,
    visitaAgendadaEm: lead?.visita_agendada_em ?? null,
    eTeste: row.e_teste,
    origem: row.origem,
  };
}

/** Uma conversa pelo id, no mesmo formato que o webhook usa — para os crons. */
export async function lerConversaPersistida(conversaId: string): Promise<ConversaPersistida | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select(SELECT_CONVERSA)
    .eq("id", conversaId)
    .maybeSingle();
  return data ? mapConversa(data) : null;
}

/**
 * Variantes do telefone vindas do JID do WhatsApp (só dígitos, com DDI),
 * no formato de `leads.telefone_e164` (também só dígitos).
 *
 * A variante do nono dígito é o caso real que quebrava tudo: o mesmo
 * celular existe como `5511988881111` num cadastro e `551188881111` no
 * outro, e um match exato deixa o lead órfão para sempre.
 */
export function candidatosTelefone(jidDigitos: string): string[] {
  const candidatos = new Set<string>([jidDigitos]);

  if (jidDigitos.startsWith("55")) {
    // 55 + DDD(2) + 9 + 8 dígitos → variante sem o 9
    if (jidDigitos.length === 13 && jidDigitos[4] === "9") {
      candidatos.add(jidDigitos.slice(0, 4) + jidDigitos.slice(5));
    }
    // 55 + DDD(2) + 8 dígitos → variante com o 9
    if (jidDigitos.length === 12) {
      candidatos.add(jidDigitos.slice(0, 4) + "9" + jidDigitos.slice(4));
    }
  }

  return Array.from(candidatos);
}

/** Só as strings de um `jsonb` que deveria ser lista de texto. */
function apenasTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Encontra um lead JÁ cadastrado pelo telefone normalizado.
 *
 * Mensagem recebida não é consentimento para criar cadastro. Sem lead, não
 * nasce conversa, mensagem, dossiê ou telemetria. Erro de banco sobe em vez
 * de parecer "desconhecido" e descartar a mensagem de um lead real.
 */
async function encontrarLeadCadastrado(
  supabase: ReturnType<typeof createServiceClient>,
  params: { corretorId: string; telefoneCliente: string },
): Promise<string | null> {
  const candidatos = candidatosTelefone(params.telefoneCliente);

  // Com retentativa (12/09/2026): esta é a PRIMEIRA consulta do webhook, e
  // um "Gateway Timeout" do Supabase aqui derrubava a requisição inteira —
  // 8 vezes em 24h, todas em minutos redondos (00:00, 00:30), que é quando
  // o pg_cron e os crons da Vercel batem no mesmo banco. O provedor recebe
  // 500 e reentrega, mas a mensagem do cliente espera a reentrega para ser
  // respondida. Erro COM código (consulta errada) continua sem repetição.
  const { data: lead, error } = await comRetentativa("lead do WhatsApp", () =>
    supabase
      .from("leads")
      .select("id")
      .eq("corretor_id", params.corretorId)
      .in("telefone_e164", candidatos)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (error) throw new Error(`Falha ao conferir o lead do WhatsApp: ${error.message}`);
  return lead?.id ?? null;
}

/**
 * Cadastra o lead de quem respondeu a uma peça NOSSA e ainda não existia.
 *
 * A 0111 fechou o webhook para número desconhecido, e isso protege a
 * conversa pessoal do corretor — mas fechou junto a porta que o anúncio
 * PAGA para abrir: a pessoa clica, escreve, e a mensagem morre sem resposta
 * e sem rastro no CRM. Quem decide se há convite é `reconhecerConviteDeEntrada`
 * (puro, testado); aqui só se executa a decisão.
 *
 * Três detalhes que não são livres:
 *
 * - **`telefone_e164` NUNCA entra no insert.** É coluna GERADA, e incluí-la
 *   faz o Postgres recusar a linha inteira ("cannot insert a non-DEFAULT
 *   value"). Foi exatamente esse erro, engolido em silêncio, que em agosto
 *   deixou 30 conversas sem cadastro por semanas.
 * - **`corretor_id` vai preenchido**, nunca nulo. O trigger
 *   `leads_distribuir` (0007) sorteia um dono quando o campo chega vazio — e
 *   aqui isso mandaria o lead para um corretor DIFERENTE daquele em cujo
 *   número a pessoa está escrevendo. Quem recebeu a mensagem atende.
 * - **`consentimento_lgpd` fica no default `false`.** A pessoa iniciou um
 *   contato comercial, o que sustenta o cadastro, mas ninguém marcou uma
 *   caixa: escrever `true` aqui seria afirmar um consentimento que não
 *   aconteceu — e esse campo existe justamente para distinguir os dois.
 *
 * A origem nasce `whatsapp/organico` de propósito: é ela que
 * `marcarLeadVindoDeAnuncio` exige para promover a ficha a `meta/ctwa` com
 * o imóvel, logo em seguida, quando o texto é o do nosso link.
 */
async function cadastrarLeadDeConvite(
  supabase: ReturnType<typeof createServiceClient>,
  params: { corretorId: string; telefoneCliente: string; nomeCliente?: string | null },
): Promise<string | null> {
  const nome =
    params.nomeCliente?.trim().slice(0, 120) || `WhatsApp ${params.telefoneCliente.slice(-4)}`;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      nome,
      telefone: params.telefoneCliente,
      corretor_id: params.corretorId,
      origem: "whatsapp/organico",
      // O dono saiu do NÚMERO que recebeu a mensagem — que é o destino do
      // link porteiro. Não houve sorteio, então 'roleta' mentiria.
      origem_atribuicao: "link",
    })
    .select("id")
    .single();

  if (error || !data) {
    // Sem este log, uma policy ou constraint nova derruba a entrada de leads
    // do anúncio inteira e o sintoma é só "a fila não enche" — o defeito que
    // custou semanas em agosto.
    console.error("[porteiro] falha ao cadastrar lead de convite:", error?.message);
    return null;
  }
  return data.id;
}

export type CadastroPelaPalavraChave =
  | { desfecho: "ja_e_lead"; leadId: string }
  | { desfecho: "cadastrado"; leadId: string }
  | { desfecho: "lead_de_outro_corretor"; leadId: string }
  | { desfecho: "falhou" };

/**
 * A palavra-chave do corretor CADASTRA o número (0146, plano de ativação,
 * 03/10/2026).
 *
 * Antes, num número sem lead, o porteiro da 0111 descartava a mensagem do
 * corretor antes de o webhook ler a palavra: ele digitava, nada acontecia, e
 * a única saída era cadastrar à mão no painel. A palavra é um ato deliberado
 * dele, então vale como a autorização que o convite do cliente já é.
 *
 * O telefone é procurado em TODAS as carteiras, com e sem o nono dígito:
 *
 * - **na dele:** nada a cadastrar, a conversa segue como sempre;
 * - **em nenhuma:** nasce na carteira dele. O nome fica no placeholder
 *   `WhatsApp 1234` de propósito: o pushName desta mensagem é o nome do
 *   CORRETOR, não do cliente. A primeira fala do cliente preenche;
 * - **na de outro corretor (regra N6):** o lead NÃO muda de carteira, nada é
 *   criado, e quem chama registra o aviso. Duas fichas para a mesma pessoa
 *   em carteiras diferentes é como dois corretores ligam para o mesmo
 *   cliente sem saber.
 *
 * Palavra de TESTE: o lead nasce arquivado, com origem própria. Arquivado é
 * o recorte que todas as telas, relatórios, listas e campanhas já respeitam
 * (`leadArquivado.test.ts`), então o teste fica fora do funil sem uma coluna
 * nova que cada consulta precisaria lembrar de filtrar. A conversa continua
 * no Live Chat, marcada como teste.
 */
export async function cadastrarPelaPalavraChave(params: {
  corretorId: string;
  telefoneCliente: string;
  teste: boolean;
}): Promise<CadastroPelaPalavraChave> {
  const supabase = createServiceClient();

  const proprio = await encontrarLeadCadastrado(supabase, params);
  if (proprio) return { desfecho: "ja_e_lead", leadId: proprio };

  const { data: alheio, error: erroAlheio } = await supabase
    .from("leads")
    .select("id")
    .in("telefone_e164", candidatosTelefone(params.telefoneCliente))
    .neq("corretor_id", params.corretorId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erroAlheio) {
    // Sem saber se o número é de outro corretor, cadastrar poderia duplicar a
    // pessoa em duas carteiras. O lado seguro é não cadastrar.
    console.error("[palavra-chave] falha ao conferir outras carteiras:", erroAlheio.message);
    return { desfecho: "falhou" };
  }
  if (alheio) return { desfecho: "lead_de_outro_corretor", leadId: alheio.id };

  const agora = new Date().toISOString();
  const { data, error } = await supabase
    .from("leads")
    .insert({
      nome: `WhatsApp ${params.telefoneCliente.slice(-4)}`,
      telefone: params.telefoneCliente,
      corretor_id: params.corretorId,
      origem: params.teste ? "whatsapp/teste_do_corretor" : "whatsapp/ativado_pelo_corretor",
      origem_atribuicao: "manual",
      ...(params.teste ? { arquivado_em: agora } : {}),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[palavra-chave] falha ao cadastrar o lead:", error?.message);
    return { desfecho: "falhou" };
  }
  return { desfecho: "cadastrado", leadId: data.id };
}

/**
 * Registra a palavra-chave usada num lead de outro corretor (regra N6). É a
 * fonte do aviso no Início de quem acionou e o registro para a gestão.
 * Repetir a palavra no mesmo dia não gera uma segunda linha.
 */
export async function registrarAtivacaoEmLeadAlheio(params: {
  corretorId: string;
  leadId: string;
  telefone: string;
}): Promise<void> {
  const supabase = createServiceClient();
  const inicioDoDia = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { count } = await supabase
    .from("ativacoes_em_lead_alheio")
    .select("id", { count: "exact", head: true })
    .eq("corretor_id", params.corretorId)
    .eq("lead_id", params.leadId)
    .gte("created_at", inicioDoDia);
  if ((count ?? 0) > 0) return;

  const { error } = await supabase.from("ativacoes_em_lead_alheio").insert({
    corretor_id: params.corretorId,
    lead_id: params.leadId,
    telefone: params.telefone,
  });
  if (error) console.error("[palavra-chave] falha ao registrar lead de outro corretor:", error.message);
}

/**
 * Preenche o nome do contato onde ele FALTA, a partir do pushName que o
 * WhatsApp manda em toda mensagem.
 *
 * O nome era capturado só na CRIAÇÃO da conversa: quem escreveu antes de o
 * provedor entregar o pushName ficava sem nome para sempre. As duas guardas
 * são deliberadas: a conversa só recebe nome quando
 * está NULA (nome digitado pelo corretor nunca é sobrescrito por pushName,
 * que é texto livre do cliente), e o lead só troca quando ainda carrega o
 * placeholder `WhatsApp %` — lead com nome de verdade no CRM fica quieto.
 */
export async function preencherNomeContato(params: {
  conversaId: string;
  leadId?: string | null;
  nome: string;
}): Promise<void> {
  const nome = params.nome.trim().slice(0, 120);
  if (!nome) return;
  const supabase = createServiceClient();

  await supabase
    .from("whatsapp_conversas")
    .update({ nome_cliente: nome })
    .eq("id", params.conversaId)
    .is("nome_cliente", null);

  if (params.leadId) {
    await supabase.from("leads").update({ nome }).eq("id", params.leadId).like("nome", "WhatsApp %");
  }
}

/** Uma conversa por (corretor, telefone) — o `unique` da 0018 garante isso. */
export async function obterOuCriarConversa(params: {
  corretorId: string;
  telefoneCliente: string;
  nomeCliente?: string | null;
  origem?: "organica" | "campanha";
  /**
   * Convite reconhecido na primeira fala (mensagem do nosso link ou frase
   * que o corretor cadastrou). Só ele autoriza CADASTRAR quem ainda não é
   * lead — sem convite, a regra da 0111 continua inteira.
   */
  convite?: ConviteDeEntrada | null;
}): Promise<ConversaPersistida | null> {
  const supabase = createServiceClient();

  /*
   * Procura por TODAS as variantes do telefone, nunca pela string crua.
   *
   * O estoque tem conversa gravada sem DDI (`11981480402`) ao lado do mesmo
   * celular com DDI no lead. Casar por igualdade simples criaria uma SEGUNDA
   * conversa para a mesma pessoa — o `unique (corretor, telefone)` não
   * impede, porque as duas strings são diferentes — e a antiga, sem lead,
   * seria apagada com o histórico dentro.
   */
  const variantes = candidatosTelefone(params.telefoneCliente);

  const { data: encontradas } = await supabase
    .from("whatsapp_conversas")
    .select(SELECT_CONVERSA)
    .eq("corretor_id", params.corretorId)
    .in("telefone_cliente", variantes)
    .order("created_at", { ascending: true })
    .limit(1);

  const existente = encontradas?.[0] ?? null;

  if (existente) {
    // Conversa antiga sem lead (criada antes do vínculo por e164 existir, ou
    // antes de o lead ser cadastrado): tenta religar agora. É barato e é o
    // que permite ao dossiê desta mensagem ter um destino.
    if (!existente.lead_id) {
      const leadId =
        (await encontrarLeadCadastrado(supabase, params)) ??
        (params.convite ? await cadastrarLeadDeConvite(supabase, params) : null);
      if (leadId) {
        await supabase.from("whatsapp_conversas").update({ lead_id: leadId }).eq("id", existente.id);
        return mapConversa({ ...existente, lead_id: leadId });
      }
      // Estoque anterior à 0111: sem lead não pode continuar visível nem
      // reter mensagens. O cascade remove mensagens e follow-ups.
      await supabase.from("whatsapp_conversas").delete().eq("id", existente.id);
      return null;
    }
    return mapConversa(existente);
  }

  const leadId =
    (await encontrarLeadCadastrado(supabase, params)) ??
    (params.convite ? await cadastrarLeadDeConvite(supabase, params) : null);
  if (!leadId) return null;

  const origem = params.origem ?? "organica";

  /*
   * Lead transferido de outro corretor (plano de ativação, 3.3): a conversa
   * nova no número do novo dono nasce com a MEMÓRIA da anterior — o resumo
   * da negociação, não as mensagens. Com isso e o dossiê (que é do lead), a
   * IA do número novo não faz o cliente repetir o que já disse.
   */
  const { data: anterior } = await supabase
    .from("whatsapp_conversas")
    .select("memoria")
    .eq("lead_id", leadId)
    .neq("corretor_id", params.corretorId)
    .not("memoria", "is", null)
    .order("ultima_interacao_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: criada, error } = await supabase
    .from("whatsapp_conversas")
    .insert({
      corretor_id: params.corretorId,
      telefone_cliente: params.telefoneCliente,
      nome_cliente: params.nomeCliente ?? null,
      lead_id: leadId,
      origem,
      ...(anterior?.memoria ? { memoria: anterior.memoria } : {}),
    })
    .select(SELECT_CONVERSA)
    .single();

  if (error || !criada) return null;

  return mapConversa(criada);
}

/**
 * O corretor digitou a palavra-chave combinada no próprio chat: a IA está
 * autorizada a assumir esta conversa a partir de agora.
 *
 * Diferente de `pausarBotPorAtendimentoHumano`: esta mensagem específica é
 * o sinal de entrega, não de "estou cuidando pessoalmente" — por isso não
 * grava pausa nenhuma, só derruba a trava de espera.
 */
/**
 * O corretor digitou a palavra de TESTE: a conversa deixa de contar como
 * atendimento real, para sempre.
 *
 * Sem volta de propósito. Conversa usada para testar já está contaminada —
 * mensagens "Teste", repetição proposital, o próprio corretor fingindo ser
 * cliente. Nada disso vira exemplo bom depois, e o custo de um falso
 * positivo (uma conversa real marcada como teste) é um exemplo a menos no
 * corpus; o do falso negativo é o prompt aprendendo besteira.
 */
export async function marcarConversaComoTeste(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.from("whatsapp_conversas").update({ e_teste: true }).eq("id", conversaId);
}

/** Quanto tempo depois do clique no link a primeira mensagem ainda é dele. */
export const JANELA_DO_CLIQUE_MIN = 15;

export type CliqueDoLink = {
  cliqueId: string;
  /** Nome do imóvel do link; null no botão geral do site. */
  nomeImovel: string | null;
  /** O clique veio do anúncio (não do site). */
  doAnuncio: boolean;
};

/**
 * Quem escreve pela primeira vez, sem cadastro e sem a mensagem pronta,
 * clicou no link /wa/ do corretor há poucos minutos? (0143)
 *
 * O link registra todo clique com o corretor sorteado; a mensagem que chega
 * a ESSE corretor logo depois, de número sem lead, é de quem clicou — a
 * pessoa só apagou o texto pronto. A função do banco marca o clique como
 * usado no mesmo comando: dois números escrevendo juntos nunca levam o
 * mesmo clique, e cada clique cadastra uma pessoa só.
 *
 * Também é chamada quando a mensagem pronta chega, para gastar o clique
 * dela: sem isso o clique sobraria e abriria a porta para o próximo número
 * que escrevesse na janela, mesmo sendo um contato pessoal.
 */
export async function reivindicarCliqueDoLink(params: {
  corretorId: string;
  empreendimentoId?: string | null;
}): Promise<CliqueDoLink | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .rpc("reivindicar_clique_do_link", {
      p_corretor: params.corretorId,
      p_janela_min: JANELA_DO_CLIQUE_MIN,
      ...(params.empreendimentoId ? { p_empreendimento: params.empreendimentoId } : {}),
    })
    .maybeSingle<{ clique_id: string; empreendimento_id: string | null; origem: string }>();
  if (error) {
    // Sem a 0143 a função não existe: o porteiro segue como antes.
    console.error("[porteiro] falha ao reivindicar clique:", error.message);
    return null;
  }
  if (!data) return null;

  let nomeImovel: string | null = null;
  if (data.empreendimento_id) {
    const { data: imovel } = await supabase
      .from("empreendimentos")
      .select("nome")
      .eq("id", data.empreendimento_id)
      .maybeSingle();
    nomeImovel = imovel?.nome ?? null;
  }
  return {
    cliqueId: data.clique_id,
    nomeImovel,
    doAnuncio: data.origem.startsWith("anuncio/"),
  };
}

/**
 * Conta a mensagem que o porteiro vai ignorar (0159): número sem lead que
 * escreveu sem convite. Grava só o resumo do número, o tipo, quantos minutos
 * depois de um clique de pessoa no link ela chegou e se citou o imóvel
 * daquele clique. O texto nunca sai daqui.
 *
 * Uma linha por número, por corretor, por dia: a primeira mensagem do dia é
 * a que conta. Falha nunca derruba o webhook: é medição.
 */
export async function registrarMensagemBarrada(p: {
  corretorId: string;
  telefone: string;
  texto: string | null;
  tipo: "texto" | "audio" | "outro";
}): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data: cliques } = await supabase
      .from("cliques_whatsapp")
      .select("id, created_at, empreendimento_id, user_agent")
      .eq("corretor_id", p.corretorId)
      .eq("pelo_porteiro", true)
      .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    const clique = (cliques ?? []).find((c) => ehClienteDePessoa(c.user_agent)) ?? null;

    let citou = false;
    if (clique?.empreendimento_id && p.texto) {
      const { data: imovel } = await supabase
        .from("empreendimentos")
        .select("nome, nomes_alternativos")
        .eq("id", clique.empreendimento_id)
        .maybeSingle();
      if (imovel) citou = citaOImovel(p.texto, [imovel.nome, ...(imovel.nomes_alternativos ?? [])]);
    }

    const { error } = await supabase.from("porteiro_barrados").upsert(
      {
        corretor_id: p.corretorId,
        dia: diaEmSaoPauloISO(),
        remetente: remetenteResumido(p.telefone, segredoDaMedicao()),
        tipo: p.tipo,
        minutos_desde_clique: clique
          ? Math.max(0, Math.floor((Date.now() - new Date(clique.created_at).getTime()) / 60_000))
          : null,
        clique_id: clique?.id ?? null,
        empreendimento_id: clique?.empreendimento_id ?? null,
        citou_imovel: citou,
      },
      { onConflict: "corretor_id,remetente,dia", ignoreDuplicates: true },
    );
    if (error) console.error("[porteiro] falha ao contar mensagem barrada:", error.message);
  } catch (e) {
    console.error("[porteiro] falha ao contar mensagem barrada:", e);
  }
}

/** Quanto tempo a contagem de mensagens barradas fica guardada (0159). */
export const DIAS_DE_MENSAGENS_BARRADAS = 90;

/** Apaga a contagem antiga: depois de 90 dias ela já não decide nada. */
export async function limparMensagensBarradasAntigas(): Promise<number> {
  const supabase = createServiceClient();
  const limite = new Date(Date.now() - DIAS_DE_MENSAGENS_BARRADAS * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase.from("porteiro_barrados").delete().lt("dia", limite).select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

/** Grava no clique quem ele cadastrou, para conferir depois. */
export async function vincularCliqueAoLead(cliqueId: string, leadId: string): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase.from("cliques_whatsapp").update({ lead_id: leadId }).eq("id", cliqueId);
  if (error) console.error("[porteiro] falha ao ligar clique ao lead:", error.message);
}

/**
 * O lead chegou pela mensagem pronta de um anúncio (link porteiro
 * /wa/<campanha>): carimba a origem e o anúncio na ficha do CRM.
 *
 * O gate por `origem = 'whatsapp/organico'` é deliberado: só promove um
 * cadastro cuja origem ainda é o WhatsApp orgânico. Lead importado, vindo
 * de formulário do Lead Ads ou cadastrado manualmente mantém a origem
 * verdadeira — sobrescrever apagaria de onde ele veio de fato.
 */
export async function marcarLeadVindoDeAnuncio(leadId: string, nomeImovel: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("leads")
    .update({ origem: "meta/ctwa", anuncio_origem: nomeImovel.slice(0, 160) })
    .eq("id", leadId)
    .eq("origem", "whatsapp/organico");
}

/**
 * Ativa a IA nesta conversa — palavra-chave do corretor ou o botão "IA
 * assume agora" do painel.
 *
 * Escreve as DUAS condições da camada da conversa que o corretor controla
 * (`quandoAIaResponde.ts`): liga e tira a pausa. Ligar sem tirar a pausa foi
 * o defeito de 05/09/2026 — o corretor atendendo (cada fala pausa) digitava
 * "pode assumir" e a IA seguia muda.
 *
 * Não mexe no que é do cliente (pedido para sair) nem no que é do número
 * (modo e expediente): isso o corretor muda em outro lugar, e de propósito.
 */
export async function ativarIaNaConversa(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: true, pausado_humano_ate: null })
    .eq("id", conversaId);
}

/**
 * Grava a mensagem e devolve se ela é INÉDITA.
 *
 * `providerMessageId` (o `key.id` do provedor) alimenta o índice único da
 * 0027: reentrega de webhook — que todo provedor faz — bate no conflito e
 * devolve `inedita: false`, e o chamador encerra sem chamar a IA nem
 * responder de novo. Sem isso, cada retry do provedor virava resposta
 * duplicada no WhatsApp do cliente.
 */
/**
 * Grava uma mensagem da conversa.
 *
 * **`interacaoId` NÃO é parâmetro daqui, e a ausência é a correção.**
 *
 * `whatsapp_mensagens.interacao_id` tem chave estrangeira para
 * `ia_interacoes` (0040), e o webhook grava a mensagem do bot ANTES de
 * escrever a telemetria — o uuid existe, a linha ainda não. O insert violava
 * a FK, o erro caía no `console.error` abaixo, e a função devolvia
 * `{ inedita: true }` como se tivesse gravado.
 *
 * O efeito foi grande e silencioso: **nenhuma resposta do bot foi salva
 * entre 23/08 e 25/08/2026.** E como `historicoRecente` é o que alimenta o
 * prompt, a IA nunca via as próprias falas: ela cumprimentava do zero em
 * TODA mensagem ("Oi!" cinco vezes na mesma conversa) e repetia a mesma
 * oferta depois de o cliente já ter aceitado. Parecia perda de contexto;
 * era ausência de contexto.
 *
 * Por isso o vínculo saiu daqui e virou `vincularInteracaoNaMensagem`, que
 * roda DEPOIS da telemetria existir. A ordem passa a ser impossível de
 * inverter por engano — mesma escolha que tirou o parâmetro `legenda` de
 * `enviarMidiaWhatsapp`: quando um parâmetro só pode ser usado errado, ele
 * não deve existir.
 *
 * A regra por trás: **a conversa é o produto, a telemetria é instrumento.**
 * Instrumento nunca pode apagar produto.
 */
export async function gravarMensagem(params: {
  conversaId: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  /**
   * A conversa já foi liberada para atendimento?
   *
   * OBRIGATÓRIO, e não opcional com padrão: conversa nunca liberada guarda
   * a LINHA, não o texto (`privacidadeDaConversa.ts`). Um padrão aqui faria
   * o esquecimento de um chamador voltar a gravar a vida pessoal do
   * corretor em silêncio — o número da instância é o WhatsApp pessoal dele.
   * Mesma lição que tirou `interacaoId` destes parâmetros.
   */
  conversaLiberada: boolean;
  tipo?: "texto" | "audio" | "imagem" | "documento";
  midiaUrl?: string | null;
  providerMessageId?: string | null;
  /** Só para mensagem ENVIADA por nós: nasce 'enviada' e o ack promove. */
  statusEntrega?: "enviada" | null;
}): Promise<{ inedita: boolean; id: string | null }> {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("whatsapp_mensagens")
    .insert({
      conversa_id: params.conversaId,
      remetente: params.remetente,
      tipo: params.tipo ?? "texto",
      conteudo: conteudoParaGravar(params.conteudo, params.conversaLiberada),
      midia_url: params.conversaLiberada ? (params.midiaUrl ?? null) : null,
      provider_message_id: params.providerMessageId ?? null,
      status_entrega: params.statusEntrega ?? null,
    })
    .select("id")
    .maybeSingle();

  // 23505 = violação de unicidade: é a reentrega. Qualquer outro erro é
  // problema real, mas nunca pode derrubar o fluxo de resposta — loga e segue.
  if (error) {
    if (error.code === "23505") return { inedita: false, id: null };
    console.error("Falha ao gravar mensagem de WhatsApp:", error.message);
    return { inedita: true, id: null };
  }

  await supabase
    .from("whatsapp_conversas")
    .update({
      ultima_mensagem: resumoParaGravar(params.conteudo, params.conversaLiberada),
      ultima_interacao_em: new Date().toISOString(),
    })
    .eq("id", params.conversaId);

  return { inedita: true, id: data?.id ?? null };
}

const ORDEM_ENTREGA = { enviada: 1, entregue: 2, lida: 3 } as const;

/**
 * Aplica um ack de entrega/leitura vindo do MESSAGES_UPDATE (0051).
 *
 * Monotônico: ack chega fora de ordem com frequência (READ antes do
 * DELIVERY atrasado), e rebaixar "lida" para "entregue" seria o tick
 * andando para trás na tela do corretor. Mensagem não encontrada é o caso
 * normal — quase todo ack é de balão do bot, que não guarda provider id.
 */
export async function aplicarAckDeEntrega(
  providerMessageId: string,
  status: "entregue" | "lida",
): Promise<void> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("id, status_entrega")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (!data) return;
  const atual = data.status_entrega ? ORDEM_ENTREGA[data.status_entrega] : 0;
  if (ORDEM_ENTREGA[status] <= atual) return;

  await supabase.from("whatsapp_mensagens").update({ status_entrega: status }).eq("id", data.id);
}

/**
 * Liga a mensagem enviada à linha de telemetria que a produziu (0040).
 *
 * Roda DEPOIS de `registrarInteracao`, porque a FK exige que a linha de
 * `ia_interacoes` já exista. Falhar aqui custa a avaliação individual
 * daquela resposta no Live Chat — nunca a mensagem, que já está gravada.
 */
export async function vincularInteracaoNaMensagem(
  mensagemId: string | null,
  interacaoId: string,
): Promise<void> {
  if (!mensagemId) return;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("whatsapp_mensagens")
    .update({ interacao_id: interacaoId })
    .eq("id", mensagemId);

  if (error) {
    console.warn("[whatsapp] mensagem gravada, mas sem vínculo com a telemetria:", error.message);
  }
}

/**
 * A mensagem de cliente mais recente da conversa — o relógio do buffer de
 * rajada: a invocação cujo `providerMessageId` NÃO é o mais recente foi
 * absorvida por uma mensagem que chegou depois, e quem responde é a outra.
 */
export async function ultimaMensagemClienteId(conversaId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("provider_message_id")
    .eq("conversa_id", conversaId)
    .eq("remetente", "cliente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.provider_message_id ?? null;
}

/**
 * Debounce do alerta de lead quente: devolve true (e carimba) no máximo uma
 * vez por janela. Sem isso, TODA mensagem de uma conversa com score alto
 * disparava alerta novo — e alerta que spamma é alerta que o corretor
 * silencia.
 */
export async function podeAlertarLeadQuente(
  conversaId: string,
  janelaHoras = 6,
): Promise<boolean> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("alerta_quente_em")
    .eq("id", conversaId)
    .maybeSingle();

  const ultimo = data?.alerta_quente_em ? new Date(data.alerta_quente_em).getTime() : 0;
  if (Date.now() - ultimo < janelaHoras * 3600_000) return false;

  await supabase
    .from("whatsapp_conversas")
    .update({ alerta_quente_em: new Date().toISOString() })
    .eq("id", conversaId);

  return true;
}

/**
 * Quando o corretor recebeu o último aviso de EVOLUÇÃO desta conversa.
 *
 * Separado de `alerta_quente_em` (que guarda a janela de 6h do alerta de
 * lead quente) de propósito: um alerta urgente não pode ser silenciado pela
 * carência do aviso comum, nem o comum herdar a janela do urgente.
 */
export async function ultimoAvisoEvolucao(conversaId: string): Promise<Date | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_conversas")
    .select("ultimo_aviso_evolucao_em")
    .eq("id", conversaId)
    .maybeSingle();

  return data?.ultimo_aviso_evolucao_em ? new Date(data.ultimo_aviso_evolucao_em) : null;
}

export async function marcarAvisoEvolucao(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_conversas")
    .update({ ultimo_aviso_evolucao_em: new Date().toISOString() })
    .eq("id", conversaId);
}

/** Validação da data de visita proposta pela IA — nunca gravar lixo no funil. */
export function validarDataVisita(dataHoraISO: string, agora: Date = new Date()): Date | null {
  const data = new Date(dataHoraISO);
  if (Number.isNaN(data.getTime())) return null;
  if (data <= agora) return null;
  // Mais de 60 dias no futuro é quase certamente parse errado de "dia 30".
  if (data.getTime() - agora.getTime() > 60 * 86_400_000) return null;
  return data;
}

/**
 * O cliente confirmou um horário com a IA: vira compromisso de verdade —
 * data no lead E etapa do funil, o mesmo efeito de o corretor marcar à mão.
 *
 * ## Por que passa por uma função do banco (0074)
 *
 * Antes isto era um `update` direto, e tinha dois furos. O primeiro: um
 * horário que a IA inventasse virava compromisso no CRM, e o corretor
 * descobria na hora de não poder atender — "ofereça só o que existe" é
 * instrução de prompt, e instrução de prompt falha justo na resposta que
 * importa. O segundo: duas conversas confirmando o MESMO horário no mesmo
 * segundo levavam as duas, porque ler "está livre?" e gravar são duas idas
 * ao banco e entre elas cabe outra conversa — a mesma corrida que fez a
 * cota anti-ban morar numa função do banco.
 *
 * `reservar_horario_visita` confere a grade do corretor (no fuso de São
 * Paulo) e deixa o índice único parcial recusar o conflito. Devolve
 * `false` quando o horário não existe ou já é de outro lead — e aí o
 * chamador degrada para o alerta comum de "visita solicitada", que é o
 * mesmo desfecho de uma data inválida.
 *
 * Corretor sem grade configurada continua como antes: aceita qualquer
 * horário. Hoje isso vale para todos.
 */
export async function agendarVisitaLead(leadId: string, dataVisita: Date): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: antes } = await supabase
    .from("leads")
    .select("etapa, visita_agendada_em")
    .eq("id", leadId)
    .maybeSingle();

  const { data, error } = await supabase.rpc("reservar_horario_visita", {
    p_lead_id: leadId,
    p_quando: dataVisita.toISOString(),
  });

  if (error) {
    console.error(`[visita] não foi possível reservar para o lead ${leadId}: ${error.message}`);
    return false;
  }

  if (data === false) {
    // Não é erro: é a agenda funcionando. Vale log porque um recusa
    // frequente aqui significa que a IA está oferecendo horário que não
    // existe — e isso é defeito de prompt, não de agenda.
    console.warn(
      `[visita] horário recusado (fora da grade ou já ocupado) para o lead ${leadId}: ${dataVisita.toISOString()}`,
    );
  }

  if (data === true && antes?.etapa) {
    const { data: depois } = await supabase.from("leads").select("etapa").eq("id", leadId).maybeSingle();
    if (depois?.etapa) await registrarEtapaAutomatica(leadId, antes.etapa, depois.etapa, "ia");
  }

  /*
   * REMARCAÇÃO (A2): a data mudou. O lembrete de véspera ainda pendente era
   * da data velha e sairia no dia errado; a linha do tempo diz de onde para
   * onde, para o corretor não confiar na data que tinha anotado.
   */
  const anterior = antes?.visita_agendada_em ? new Date(antes.visita_agendada_em) : null;
  if (data === true && anterior && anterior.getTime() !== dataVisita.getTime()) {
    await apagarLembretesPendentesDeVisita(supabase, leadId);
    const { error: erroTimeline } = await supabase.from("lead_interacoes").insert({
      lead_id: leadId,
      corretor_id: null,
      tipo: "visita",
      conteudo: `O cliente remarcou a visita pela conversa: de ${rotuloDaVisita(anterior)} para ${rotuloDaVisita(dataVisita)}.`,
      detalhes: { de: anterior.toISOString(), para: dataVisita.toISOString(), por: "ia" },
    });
    if (erroTimeline) console.error("[visita] falha ao registrar a remarcação:", erroTimeline.message);
  }

  return data === true;
}

/**
 * O cliente disse que não vai poder ir: a visita sai do CRM (A2, 06/10/2026).
 *
 * Quem decide é o planner (`detectarMudancaDeVisita`), sobre a fala dele,
 * nunca o modelo. A etapa volta de "visita agendada" para "primeiro
 * contato" — só ela: lead em documentação não regride por desmarcar uma
 * visita. O lembrete de véspera pendente é apagado, a linha do tempo diz o
 * que aconteceu e o corretor é avisado pelo chamador.
 *
 * Devolve a data desmarcada, ou null quando não havia visita (nada a fazer).
 */
export async function cancelarVisitaLead(leadId: string): Promise<Date | null> {
  const supabase = createServiceClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("etapa, visita_agendada_em")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead?.visita_agendada_em) return null;

  const voltaEtapa = lead.etapa === "visita_agendada";
  const { error } = await supabase
    .from("leads")
    .update({
      visita_agendada_em: null,
      ...(voltaEtapa ? { etapa: "em_conversa" as const, etapa_alterada_em: new Date().toISOString() } : {}),
    })
    .eq("id", leadId)
    .eq("visita_agendada_em", lead.visita_agendada_em);
  if (error) {
    console.error(`[visita] não foi possível desmarcar a visita do lead ${leadId}: ${error.message}`);
    return null;
  }

  const desmarcada = new Date(lead.visita_agendada_em);
  await apagarLembretesPendentesDeVisita(supabase, leadId);
  if (voltaEtapa) await registrarEtapaAutomatica(leadId, "visita_agendada", "em_conversa", "ia");
  const { error: erroTimeline } = await supabase.from("lead_interacoes").insert({
    lead_id: leadId,
    corretor_id: null,
    tipo: "visita",
    conteudo: `O cliente desmarcou pela conversa a visita de ${rotuloDaVisita(desmarcada)}.`,
    detalhes: { desmarcada: desmarcada.toISOString(), por: "ia" },
  });
  if (erroTimeline) console.error("[visita] falha ao registrar o cancelamento:", erroTimeline.message);
  return desmarcada;
}

/** O lembrete de véspera ainda não enviado era da data velha. */
async function apagarLembretesPendentesDeVisita(
  supabase: ReturnType<typeof createServiceClient>,
  leadId: string,
): Promise<void> {
  const { data: conversas } = await supabase.from("whatsapp_conversas").select("id").eq("lead_id", leadId);
  const ids = (conversas ?? []).map((c) => c.id);
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("whatsapp_followups")
    .delete()
    .in("conversa_id", ids)
    .eq("tipo", "lembrete_visita")
    .eq("status", "pendente");
  if (error) console.error("[visita] falha ao apagar o lembrete da data velha:", error.message);
}

/**
 * A primeira resposta do bot É o primeiro contato — a etapa acompanha.
 *
 * Deterministico por construção: nenhum julgamento de IA decide isso, é um
 * FATO (uma resposta saiu). O `eq("etapa", "novo")` no update é a regra
 * inteira: só avança quem ainda está em "novo", nunca volta ninguém, e
 * chamar duas vezes não faz nada na segunda — o termostato do funil. As
 * etapas seguintes continuam humanas (fora a visita confirmada, que já é
 * automática): o dossiê da IA oscila entre leituras, e etapa que anda e
 * volta sozinha no quadro destrói a confiança do corretor no funil.
 */
/**
 * Marca uma tentativa de contato NOSSA neste lead.
 *
 * Chamada por todo caminho em que a iniciativa é da casa: disparo de
 * campanha, follow-up automático e mensagem que o corretor manda pelo Live
 * Chat. A resposta da IA a quem escreveu NÃO chama — responder não é tentar
 * alcançar alguém, e contá-la faria a conversa mais engajada parecer a mais
 * insistente.
 *
 * O incremento acontece no banco (`registrar_tentativa_contato`, 0060) e
 * não aqui: ler-somar-gravar perde contagem quando duas mensagens saem no
 * mesmo instante, e é exatamente isso que acontece com cron, corrente de
 * disparo e botão do painel tocando a mesma fila. Mesma razão das funções
 * de cota.
 */
export async function registrarTentativaDeContato(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  await supabase.rpc("registrar_tentativa_contato", { p_lead_id: leadId });
}

/**
 * O cliente falou: zera a contagem de insistência.
 *
 * O TOTAL não é tocado — ele é histórico, e histórico que o próprio sistema
 * reescreve não é histórico. O que zera é `tentativas_sem_resposta`, que é
 * a contagem que responde "já insisti demais aqui?".
 */
export async function registrarRespostaDoLead(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  await supabase.rpc("registrar_resposta_do_lead", { p_lead_id: leadId });
}

/**
 * Guarda o imóvel sobre o qual a conversa está acontecendo (0083).
 *
 * O foco já era calculado a cada mensagem por `focoDaConversa` — é ele que
 * encolhe o catálogo do prompt para a IA parar de desfilar empreendimento —
 * e era DESCARTADO. Medido em 01/09: 64 dos 112 leads ativos têm conversa
 * de WhatsApp e nenhum imóvel vinculado, então o corretor abre a ficha e
 * não sabe do que a pessoa está falando.
 *
 * Escreve `imovel_interesse_id`, NUNCA `empreendimento_id`: aquele é a
 * ORIGEM do lead (de qual página ele veio) e é atribuição de marketing —
 * reescrever destruiria a única medida de qual página traz cliente.
 *
 * O `neq` evita escrita à toa: o foco é o mesmo em quase toda mensagem de
 * uma conversa, e um UPDATE por resposta encheria o WAL sem mudar nada.
 */
export async function registrarImovelDeInteresse(
  leadId: string | null,
  empreendimentoId: string | null,
): Promise<void> {
  if (!leadId || !empreendimentoId) return;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("leads")
    .update({ imovel_interesse_id: empreendimentoId })
    .eq("id", leadId)
    .or(`imovel_interesse_id.is.null,imovel_interesse_id.neq.${empreendimentoId}`);

  if (error) console.error("[lead] falha ao gravar imóvel de interesse:", error.message);
}

export async function avancarLeadParaPrimeiroContato(
  leadId: string,
  por: QuemMudouAEtapa = "ia",
): Promise<void> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("leads")
    .update({ etapa: "primeiro_contato", etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .eq("etapa", "novo")
    .select("id");
  if (data && data.length > 0) await registrarEtapaAutomatica(leadId, "novo", "primeiro_contato", por);
}

/**
 * O cliente respondeu: o lead está EM CONVERSA (0165).
 *
 * Só avança quem está antes disso (novo ou mensagem enviada); nunca volta
 * ninguém, e chamar de novo não faz nada. Mesmo termostato do primeiro
 * contato.
 */
export async function avancarLeadParaEmConversa(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("leads").select("etapa").eq("id", leadId).maybeSingle();
  if (antes?.etapa !== "novo" && antes?.etapa !== "primeiro_contato") return;
  const { data } = await supabase
    .from("leads")
    .update({ etapa: "em_conversa", etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .in("etapa", ["novo", "primeiro_contato"])
    .select("id");
  if (data && data.length > 0) await registrarEtapaAutomatica(leadId, antes.etapa, "em_conversa", "ia");
}

/**
 * A IA já sabe renda, região e quartos: o lead está QUALIFICADO (0165).
 *
 * Os três têm de estar na FICHA (`leads`), que é o que o corretor vê — a
 * regra é sobre o que a ficha mostra, não sobre um palpite do dossiê. Só
 * avança quem está antes (até "em conversa"); quem já marcou visita não
 * volta para trás.
 */
export async function avancarLeadParaQualificado(leadId: string | null): Promise<void> {
  if (!leadId) return;
  const supabase = createServiceClient();
  const { data: antes } = await supabase
    .from("leads")
    .select("etapa")
    .eq("id", leadId)
    .maybeSingle();
  const { data } = await supabase
    .from("leads")
    .update({ etapa: "qualificado", etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .in("etapa", ["novo", "primeiro_contato", "em_conversa"])
    .not("renda_mensal", "is", null)
    .not("regiao_interesse", "is", null)
    .not("dormitorios_min", "is", null)
    .select("id");
  if (data && data.length > 0 && antes?.etapa) {
    await registrarEtapaAutomatica(leadId, antes.etapa, "qualificado", "ia");
  }
}

/** Quem moveu o lead no funil sem o corretor arrastar o cartão. */
export type QuemMudouAEtapa = "ia" | "lista" | "corretor_no_whatsapp";

const ROTULO_DA_ETAPA: Record<string, string> = {
  novo: "Novo",
  primeiro_contato: "Mensagem enviada",
  em_conversa: "Em conversa",
  qualificado: "Qualificado",
  visita_agendada: "Visita marcada",
  visitou: "Visitou",
  proposta: "Proposta",
  documentacao: "Documentação",
  fechado: "Fechado",
  perdido: "Perdido",
};

const QUEM_MUDOU: Record<QuemMudouAEtapa, string> = {
  ia: "Etapa alterada pela IA",
  lista: "Etapa alterada pelo envio da lista de transmissão",
  corretor_no_whatsapp: "Etapa alterada porque você respondeu pelo WhatsApp",
};

/**
 * Toda mudança de etapa que o SISTEMA faz entra na linha do tempo (plano de
 * ativação, 3.2). O arrastar do painel já registrava; as automáticas (a
 * primeira resposta, a visita confirmada, a recusa) mudavam o cartão de
 * coluna sem deixar rastro, e o corretor não sabia por que o lead andou.
 */
export async function registrarEtapaAutomatica(
  leadId: string,
  de: string,
  para: string,
  por: QuemMudouAEtapa,
): Promise<void> {
  if (de === para) return;
  const { error } = await createServiceClient()
    .from("lead_interacoes")
    .insert({
      lead_id: leadId,
      corretor_id: null,
      tipo: "etapa",
      conteudo: `${QUEM_MUDOU[por]}: ${ROTULO_DA_ETAPA[de] ?? de} → ${ROTULO_DA_ETAPA[para] ?? para}`,
      detalhes: { de, para, por },
    });
  if (error) console.error("[etapa] falha ao registrar na linha do tempo:", error.message);
}

// ---------------------------------------------------------------------------
// Follow-ups proativos (migration 0028)
// ---------------------------------------------------------------------------

/*
 * O REENGAJAMENTO automático (+24h e +72h) saiu em 03/10/2026 (plano de
 * ativação, regra N7): a IA só responde. Quem sumiu volta nas listas
 * sugeridas do Início. O lembrete de visita continua, e pós-visita e pedido
 * de indicação viraram sugestão para o corretor enviar.
 */

/**
 * O cliente respondeu: o REENGAJAMENTO pendente perde o motivo de existir.
 * O lembrete de visita NÃO é cancelado aqui de propósito — responder "ok!"
 * hoje não desmarca a visita de amanhã; quem desfaz o lembrete é a
 * revalidação do runner contra `leads.visita_agendada_em`.
 */
export async function cancelarFollowupsPendentes(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_followups")
    .update({ status: "cancelado", motivo: "cliente_respondeu" })
    .eq("conversa_id", conversaId)
    .eq("status", "pendente")
    .eq("tipo", "reengajamento");
}

/**
 * O cliente disse que não quer — e o sistema inteiro para de procurá-lo.
 *
 * Quatro efeitos, e eles não são alternativas: sem os quatro, a despedida
 * é só uma frase bonita antes de a máquina continuar cutucando.
 *
 *   1. a IA silencia NESTA conversa (`bot_ativo = false`);
 *   2. os follow-ups pendentes são cancelados — sem isso ela se despede e
 *      volta a cutucar em 24h, que é o defeito com outra roupa;
 *   3. o lead ganha o NÃO-PERTURBE, que é o que sobrevive à etapa;
 *   4. a etapa vira `perdido`, com o motivo na linha do tempo.
 *
 * Quem NÃO é barrado: o corretor. Live Chat e disparo manual continuam
 * livres — ele é uma pessoa decidindo, e às vezes é justamente ele quem
 * reabre a conversa.
 *
 * Best effort por partes: cada efeito é independente, e falhar num não
 * pode impedir os outros. O mais importante é o 3 — é ele que atravessa
 * campanha, follow-up e abertura por iniciativa da IA.
 */
export async function registrarRecusaDoCliente(params: {
  conversaId: string;
  leadId: string | null;
  familia: "desinteresse" | "ja_resolvido" | "parada";
}): Promise<void> {
  const supabase = createServiceClient();
  const agora = new Date().toISOString();

  const { error: erroConversa } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: false })
    .eq("id", params.conversaId);
  if (erroConversa) console.error("[recusa] falha ao silenciar a IA:", erroConversa.message);

  const { error: erroFollowups } = await supabase
    .from("whatsapp_followups")
    .update({ status: "cancelado", motivo: "cliente_recusou" })
    .eq("conversa_id", params.conversaId)
    .eq("status", "pendente");
  if (erroFollowups) console.error("[recusa] falha ao cancelar follow-ups:", erroFollowups.message);

  if (!params.leadId) return;

  const { data: antes } = await supabase.from("leads").select("etapa").eq("id", params.leadId).maybeSingle();
  if (antes?.etapa) await registrarEtapaAutomatica(params.leadId, antes.etapa, "perdido", "ia");

  const { error: erroLead } = await supabase
    .from("leads")
    .update({
      nao_contatar_em: agora,
      nao_contatar_motivo: params.familia,
      etapa: "perdido",
      etapa_alterada_em: agora,
    })
    .eq("id", params.leadId);
  if (erroLead) console.error("[recusa] falha ao marcar o lead:", erroLead.message);

  /*
   * E sai de verdade das listas (roadmap das listas, Fase 0). A linha do
   * tempo abaixo diz "ele saiu das campanhas", e até 03/10/2026 isso era
   * falso para quem já estava numa lista agendada: a mensagem saía horas
   * depois do "não quero mais". O disparador também confere antes de cada
   * envio; apagar aqui é para a lista mostrar a fila certa.
   */
  const { error: erroFila } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .eq("lead_id", params.leadId)
    .eq("status", "pendente");
  if (erroFila) console.error("[recusa] falha ao tirar das listas:", erroFila.message);

  /*
   * A linha do tempo registra UMA linha, com o motivo. É o que o corretor
   * lê para entender por que aquele lead saiu da fila — e o que permite
   * reabrir com conhecimento de causa, em vez de achar que foi engano.
   */
  const texto =
    params.familia === "parada"
      ? "O cliente pediu para não receber mais mensagens. A IA foi silenciada e ele saiu das campanhas."
      : params.familia === "ja_resolvido"
        ? "O cliente disse que já resolveu (comprou/alugou em outro lugar). A IA foi silenciada."
        : "O cliente disse que não tem interesse. A IA foi silenciada e ele saiu das campanhas.";

  const { error: erroTimeline } = await supabase.from("lead_interacoes").insert({
    lead_id: params.leadId,
    corretor_id: null,
    tipo: "sistema",
    conteudo: texto,
    detalhes: { familia: params.familia, conversa_id: params.conversaId },
  });
  if (erroTimeline) console.error("[recusa] falha ao registrar na linha do tempo:", erroTimeline.message);
}

/**
 * Registra uma decisão de recusa (0162). Nunca lança: perder a linha custa
 * uma medida; derrubar o atendimento por causa dela custa o cliente.
 */
export async function registrarDecisaoDeRecusa(params: {
  conversaId: string;
  leadId: string | null;
  corretorId: string;
  classificacao: ClassificacaoDeRecusa;
  caminho: "turno_ia" | "ia_calada";
  acao: "acolheu" | "encerrou" | "marcou" | "registrou";
}): Promise<void> {
  const c = params.classificacao;
  const familia = c.recusa?.familia ?? c.veredito?.familia;
  // "nenhuma" não é decisão: registrar toda mensagem com "não" encheria a
  // tabela de linhas que ninguém revisa.
  if (!familia || familia === "nenhuma") return;
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from("recusas_detectadas").insert({
      conversa_id: params.conversaId,
      lead_id: params.leadId,
      corretor_id: params.corretorId,
      familia,
      decidido_por: c.decididoPor ?? "ia",
      confianca: c.veredito?.confianca ?? null,
      modelo: c.modelo,
      trecho: (c.recusa?.trecho ?? c.veredito?.trecho ?? "").slice(0, 200) || null,
      caminho: params.caminho,
      acao: params.acao,
    });
    if (error) console.warn("[recusa] falha ao registrar a decisão:", error.message);
  } catch (err) {
    console.warn("[recusa] falha ao registrar a decisão:", err);
  }
}

/**
 * Quantas recusas desta conversa foram reconhecidas pela IA e tratadas. A
 * regex as conta lendo o histórico; as da IA só existem neste registro.
 */
export async function contarRecusasPelaIA(conversaId: string): Promise<number> {
  try {
    const supabase = createServiceClient();
    const { count } = await supabase
      .from("recusas_detectadas")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversaId)
      .eq("decidido_por", "ia")
      .in("acao", ["acolheu", "encerrou"])
      .is("desfeito_em", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * O "Liberar contato" carimba as decisões que marcaram este lead: é o
 * rótulo de falso positivo. Chamado DEPOIS de a action conferir, pela RLS da
 * sessão, que o lead é de quem clicou.
 */
export async function marcarRecusasDesfeitas(leadId: string, corretorId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase
      .from("recusas_detectadas")
      .update({ desfeito_em: new Date().toISOString(), desfeito_por: corretorId })
      .eq("lead_id", leadId)
      .in("acao", ["encerrou", "marcou"])
      .is("desfeito_em", null);
    if (error) console.warn("[recusa] falha ao marcar como desfeita:", error.message);
  } catch (err) {
    console.warn("[recusa] falha ao marcar como desfeita:", err);
  }
}

/**
 * Pedido de parada numa conversa em que a IA está calada (06/10/2026).
 *
 * O detector de recusa só rodava no turno da IA, e desde a 0152 a IA desliga
 * quando o corretor fala: na maioria das conversas, "me tira da lista" não
 * era gravado, e o lead voltava a receber a próxima lista de transmissão.
 *
 * Aqui só vale a família `parada`, e o efeito é menor que o de
 * `registrarRecusaDoCliente`, de propósito: a conversa é do corretor. Grava o
 * FATO (`nao_contatar_em`), tira o lead das listas pendentes e avisa o
 * corretor pelo WhatsApp dele. Não muda a etapa nem a IA: quem decide o resto
 * é o corretor, que está tocando a conversa. Desinteresse comum não entra:
 * ele ganha a pergunta do motivo, e isso só a IA faz.
 *
 * Devolve `true` quando a marca foi gravada agora (a primeira vez).
 */
export async function registrarParadaSemIA(params: {
  conversaId: string;
  leadId: string | null;
  corretorId: string;
  trecho: string;
}): Promise<boolean> {
  if (!params.leadId) return false;
  const supabase = createServiceClient();
  const agora = new Date().toISOString();

  // Uma vez só: o carimbo diz QUANDO ele pediu, e reescrever mentiria.
  const { data: marcado, error } = await supabase
    .from("leads")
    .update({ nao_contatar_em: agora, nao_contatar_motivo: "parada" })
    .eq("id", params.leadId)
    .is("nao_contatar_em", null)
    .select("id, nome, telefone");
  if (error) {
    console.error("[recusa sem IA] falha ao marcar o lead:", error.message);
    return false;
  }
  const lead = marcado?.[0];
  if (!lead) return false;

  const { error: erroFila } = await supabase
    .from("whatsapp_campanhas_fila")
    .delete()
    .eq("lead_id", params.leadId)
    .eq("status", "pendente");
  if (erroFila) console.error("[recusa sem IA] falha ao tirar das listas:", erroFila.message);

  const { error: erroTimeline } = await supabase.from("lead_interacoes").insert({
    lead_id: params.leadId,
    corretor_id: null,
    tipo: "sistema",
    conteudo: `O cliente pediu para não receber mais mensagens ("${params.trecho}"). Saiu das listas de transmissão; a conversa continua com o corretor.`,
    detalhes: { familia: "parada", conversa_id: params.conversaId, ia_calada: true },
  });
  if (erroTimeline) console.error("[recusa sem IA] falha ao registrar na linha do tempo:", erroTimeline.message);

  const nome = nomeParaExibir({ nome: lead.nome, telefone: lead.telefone });
  await avisarCorretor(
    supabase,
    params.corretorId,
    `🚫 ${nome} pediu para não receber mais mensagens ("${params.trecho}"). Tirei das listas de transmissão. A conversa é sua: se foi engano, dá para reverter na ficha.\n${site.url}/corretor/conversas?c=${params.conversaId}`,
  );
  return true;
}


/**
 * Carimba o FATO: a IA atendeu esta conversa (0106).
 *
 * Uma vez só — `where atendida_em is null`. Reescrever a cada resposta faria
 * a marca mentir sobre QUANDO o atendimento começou, o mesmo motivo pelo qual
 * `desconectado_em` (0071) é gravado uma vez e não a cada ciclo do cron.
 *
 * É um FATO e não entra na decisão de responder (`quandoAIaResponde.ts`).
 *
 * Falha vira log, como o resto da telemetria de conversa: perder o carimbo
 * custa o texto das próximas mensagens até a resposta seguinte carimbar de
 * novo; derrubar a resposta ao cliente custa o cliente.
 */
/**
 * Quantas falas desta conversa foram gravadas SEM texto.
 *
 * É o número que separa "a IA não considerou o que eu disse" de "a IA não
 * RECEBEU o que você disse" — duas queixas idênticas na tela do corretor que
 * pedem correções opostas. Aparece no "por quê?" de cada balão (0105).
 *
 * Precisa vir de uma consulta própria porque a janela do histórico DESCARTA a
 * marca desde a 0106: contá-la lá daria zero para sempre. `head: true`, então
 * volta só o número — nenhuma linha trafega.
 */
export async function contarFalasNaoGravadas(conversaId: string): Promise<number> {
  const supabase = createServiceClient();

  const { count } = await supabase
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("conversa_id", conversaId)
    .eq("conteudo", TEXTO_NAO_GUARDADO);

  return count ?? 0;
}

export async function marcarConversaAtendida(conversaId: string): Promise<void> {
  const supabase = createServiceClient();

  const { error } = await supabase
    .from("whatsapp_conversas")
    .update({ atendida_em: new Date().toISOString() })
    .eq("id", conversaId)
    .is("atendida_em", null);

  if (error) console.error("[conversa] falha ao carimbar atendida_em:", error.message);
}

/**
 * O corretor falou na conversa: a IA fica DESLIGADA nela até a ativação — a
 * palavra-chave no chat ou "IA assume agora" (decisão do Matheus,
 * 03/10/2026).
 *
 * Era uma pausa de 3h que vencia sozinha, e a IA voltava a responder uma
 * conversa que o corretor tinha assumido. Gravar de fato é o ponto: devolver
 * "IA desligada" só no corpo da resposta HTTP não desligaria nada.
 */
/**
 * Os três instantes que `ehSaudacaoAutomatica` precisa, lidos ANTES de
 * gravar a fala do corretor que está chegando (senão ela mesma contaria
 * como "o corretor falou agora").
 */
export async function momentosParaSaudacao(params: {
  conversaId: string;
  leadId: string | null;
}): Promise<{ leadCriadoEm: string | null; ultimaFalaDoClienteEm: string | null; ultimaFalaDoCorretorEm: string | null }> {
  const supabase = createServiceClient();
  const ultima = (remetente: "cliente" | "corretor") =>
    supabase
      .from("whatsapp_mensagens")
      .select("created_at")
      .eq("conversa_id", params.conversaId)
      .eq("remetente", remetente)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  const [lead, cliente, corretor] = await Promise.all([
    params.leadId
      ? supabase.from("leads").select("created_at").eq("id", params.leadId).maybeSingle()
      : Promise.resolve({ data: null }),
    ultima("cliente"),
    ultima("corretor"),
  ]);
  return {
    leadCriadoEm: lead.data?.created_at ?? null,
    ultimaFalaDoClienteEm: cliente.data?.created_at ?? null,
    ultimaFalaDoCorretorEm: corretor.data?.created_at ?? null,
  };
}

export async function desligarIaPorFalaDoCorretor(conversaId: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: false, pausado_humano_ate: null })
    .eq("id", conversaId);
}

/**
 * Quando o corretor falou pela última vez nesta conversa.
 *
 * É o relógio do modo co-piloto: enquanto o humano está ativo, o bot espera.
 */
export async function ultimaFalaDoCorretor(conversaId: string): Promise<string | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("created_at")
    .eq("conversa_id", conversaId)
    .eq("remetente", "corretor")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.created_at ?? null;
}

/**
 * A situação da conversa no formato que `decidirSeAIaResponde` lê — o único
 * lugar que decide se a IA fala (ver `quandoAIaResponde.ts`).
 */
export function situacaoDaConversa(conversa: ConversaPersistida): SituacaoDaConversa {
  return {
    botAtivo: conversa.botAtivo,
    naoContatar: conversa.naoContatar,
    leadDeOutroCorretor: conversa.leadDeOutroCorretor,
  };
}

/**
 * Últimas mensagens para dar memória ao agente — sem isso ele repete a
 * saudação a cada turno.
 *
 * Eram 12, e 12 é pouco: com o bot respondendo a quase toda fala, isso
 * cobre umas seis trocas. A queixa "a IA não leva em conta o histórico"
 * tinha aqui uma de suas causas — a região, a tipologia e o imóvel que o
 * cliente elogiou saíam da janela e ela recomeçava do zero. Subiu para 20,
 * e o custo em tokens é menor que a economia do catálogo encolhido pelo
 * foco (dez fichas viram três, ver `focoDaConversa.ts`).
 */
export async function historicoRecente(
  conversaId: string,
  limite = 40,
): Promise<{ remetente: "cliente" | "bot" | "corretor"; texto: string; em: string }[]> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("whatsapp_mensagens")
    .select("remetente, conteudo, created_at")
    .eq("conversa_id", conversaId)
    /*
     * A marca de mensagem não gravada NÃO ocupa linha da janela.
     *
     * Ela existe para a TELA não parecer defeito (`privacidadeDaConversa`).
     * No prompt não ensina nada e gasta um dos 40 lugares para dizer "aqui
     * havia algo que você não pode ler" — e havia conversa com 53 delas em
     * 209 mensagens. Filtrar na CONSULTA, e não depois, é o que faz o corte
     * trazer 40 falas ÚTEIS em vez de 40 linhas das quais metade é
     * placeholder.
     *
     * A comparação sai da constante, nunca de um literal copiado: duas
     * cópias do mesmo texto divergem no dia em que alguém melhora a frase.
     */
    .neq("conteudo", TEXTO_NAO_GUARDADO)
    .order("created_at", { ascending: false })
    .limit(limite);

  /*
   * O horário vem junto (coluna a mais na MESMA consulta, custo zero) e é o
   * que permite saber quanto tempo a conversa ficou parada — a jogada
   * `retomar` precisa disso, e `Fala` não carregava nada de relógio.
   */
  return (data ?? [])
    .reverse()
    .map((m) => ({ remetente: m.remetente, texto: m.conteudo, em: m.created_at }));
}

export type VezDeDisparar =
  | { permitido: true }
  | {
      permitido: false;
      /**
       * `aguardando_intervalo` é o único motivo em que vale a pena ESPERAR:
       * a vez chega em segundos. Os outros são do dia inteiro.
       */
      motivo: "aguardando_intervalo" | "cota_diaria" | "numero_bloqueado" | "falha";
      detalhe: string;
      /** Quanto falta para a próxima vez, quando isso é conhecido. */
      esperaMs: number;
    };

/**
 * Pede a vez de disparar por este número: cota diária E espaçamento.
 *
 * A conta roda no banco (`consumir_cota_campanha_espacada`, 0062) porque
 * pg_cron, corrente da Vercel e botão do painel tocam a mesma fila. Dois
 * disparos simultâneos leriam o mesmo contador e ambos se achariam dentro do
 * limite — e, pior, os dois se achariam autorizados a mandar no mesmo
 * segundo.
 *
 * O espaçamento entrou aqui, e não no laço do disparador, por causa de um
 * defeito medido em produção: o intervalo de 35-75s vivia só em
 * `agendado_para`, calculado na criação da campanha. Item VENCIDO tinha
 * espera negativa e saía na hora, um atrás do outro — 15 mensagens em 57
 * segundos quando a fila ficou 28 minutos parada. Piso de tempo real que
 * depende do chamador não é piso: é convenção. Este é o único ponto por onde
 * todo disparo iniciado por nós passa (campanha e follow-up), então é aqui
 * que a garantia cabe.
 */
/**
 * O limite de hoje deste número, pelo USO REAL (0158). A mesma conta para o
 * disparador e para a tela (`limiteDoDia`). Falha ao ler o histórico cai no
 * PISO, nunca no teto: na dúvida, manda menos.
 */
export async function calcularLimiteDoDia(instanciaId: string, conectadoEm: Date): Promise<LimiteDoDia> {
  const supabase = createServiceClient();
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const desde = new Date(Date.now() - (DIAS_DE_USO_RECENTE + 1) * 86_400_000);
  const desdeDia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(desde);

  const [{ data: historico, error }, { data: instancia }] = await Promise.all([
    supabase
      .from("whatsapp_envios_por_dia")
      .select("dia, enviados")
      .eq("instancia_id", instanciaId)
      .gte("dia", desdeDia),
    supabase.from("corretor_whatsapp_instancias").select("corretor_id").eq("id", instanciaId).maybeSingle(),
  ]);

  let recusas = 0;
  if (instancia?.corretor_id) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("corretor_id", instancia.corretor_id)
      .gte("nao_contatar_em", desde.toISOString());
    recusas = count ?? 0;
  }

  return limiteDoDia({
    diasDesdeConexao: diasDesdeConexao(conectadoEm),
    historico: error ? [] : (historico ?? []),
    hoje,
    recusasNaSemana: recusas,
  });
}

export async function reservarCotaCampanha(
  instanciaId: string,
  conectadoEm: Date | null,
): Promise<VezDeDisparar> {
  if (!conectadoEm) {
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Número ainda não foi pareado.",
      esperaMs: 0,
    };
  }

  // Pelo uso real, não só pela idade do número (0158).
  const { limite } = await calcularLimiteDoDia(instanciaId, conectadoEm);
  const supabase = createServiceClient();

  const { data, error } = await supabase.rpc("consumir_cota_campanha_espacada", {
    p_instancia_id: instanciaId,
    p_limite: limite,
    p_intervalo_min: INTERVALO_MINIMO_SEGUNDOS,
    p_intervalo_max: INTERVALO_MAXIMO_SEGUNDOS,
  });

  if (error) {
    /*
     * Falha ao PERGUNTAR não pode virar permissão. Antes de 0062 um erro
     * aqui já recusava o envio, e isso continua: sem resposta do banco não
     * há como saber se o intervalo foi cumprido, e mandar assim mesmo é
     * exatamente o risco que a trava existe para remover.
     */
    console.error("[anti-ban] não foi possível reservar a vez de disparo:", error.message);
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Falha ao verificar a cota diária.",
      esperaMs: 0,
    };
  }

  const resposta = data;

  if (!resposta) {
    /*
     * Sem `error` e sem corpo: não deveria acontecer, e é justamente por
     * isso que precisa de um lado definido. Numa trava anti-ban o lado
     * seguro de errar é NÃO mandar — "não sei se já passou o intervalo"
     * tem de valer como "ainda não passou".
     */
    console.error("[anti-ban] resposta vazia ao reservar a vez de disparo.");
    return {
      permitido: false,
      motivo: "falha",
      detalhe: "Falha ao verificar a cota diária.",
      esperaMs: 0,
    };
  }

  if (resposta.ok) return { permitido: true };

  const esperaMs = Math.max(0, (resposta.espera_segundos ?? 0) * 1000);

  if (resposta.motivo === "aguardando_intervalo") {
    return {
      permitido: false,
      motivo: "aguardando_intervalo",
      detalhe: `Aguardando o intervalo anti-ban entre disparos (${Math.ceil(esperaMs / 1000)}s).`,
      esperaMs,
    };
  }

  if (resposta.motivo === "numero_bloqueado") {
    return {
      permitido: false,
      motivo: "numero_bloqueado",
      detalhe: "Envios deste número estão pausados após falhas seguidas do provedor.",
      esperaMs,
    };
  }

  return {
    permitido: false,
    motivo: "cota_diaria",
    detalhe: `Cota diária de ${limite} disparos atingida.`,
    esperaMs: 0,
  };
}

/**
 * Devolve à cota do dia um disparo que não chegou a acontecer.
 *
 * A cota é reservada ANTES do envio — é o que evita corrida entre o cron, a
 * corrente da Vercel e o botão do painel. O preço disso é que uma falha
 * gasta cota mesmo sem entregar nada. Para a maioria das falhas isso é
 * aceitável (o provedor tentou, o número foi exercitado), mas para
 * destinatário sem WhatsApp não: a mensagem não existiu para ninguém.
 *
 * Em produção isso não foi detalhe — 15 disparos da cota do dia foram
 * consumidos para entregar 3 mensagens, porque a lista tinha telefone
 * digitado errado no cadastro.
 *
 * Silenciosa de propósito: devolver cota é otimização, não etapa crítica.
 * Falhar aqui não pode derrubar o laço de disparo.
 */
export async function devolverCotaCampanha(instanciaId: string): Promise<void> {
  try {
    const supabase = createServiceClient();
    await supabase.rpc("devolver_cota_campanha", { p_instancia_id: instanciaId });
  } catch (err) {
    console.warn("[whatsapp] não consegui devolver a cota:", err);
  }
}

/**
 * A última lista de transmissão enviada a este lead (Fase 2, 03/10/2026).
 *
 * Por `lead_id`, não por telefone: 52 dos 111 itens enviados até 03/10
 * tinham o telefone gravado fora do padrão com 55, e a busca por igualdade
 * de telefone não achava a resposta deles. Por isso o contador "Responderam"
 * vivia perto de zero.
 */
export async function ultimaListaDoLead(leadId: string): Promise<ListaRecenteDoLead | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_campanhas_fila")
    .select(
      "id, campanha_id, status, enviado_em, mensagem_personalizada, campanha:whatsapp_campanhas(titulo, empreendimento:empreendimentos(nome))",
    )
    .eq("lead_id", leadId)
    .in("status", ["enviado", "respondido"])
    .not("enviado_em", "is", null)
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.enviado_em) return null;

  const campanha = (Array.isArray(data.campanha) ? data.campanha[0] : data.campanha) as {
    titulo: string | null;
    empreendimento: { nome: string } | { nome: string }[] | null;
  } | null;
  const emp = Array.isArray(campanha?.empreendimento) ? campanha?.empreendimento[0] : campanha?.empreendimento;
  return {
    itemId: data.id,
    campanhaId: data.campanha_id,
    status: data.status as ListaRecenteDoLead["status"],
    enviadoEm: data.enviado_em,
    titulo: campanha?.titulo ?? null,
    imovel: emp?.nome ?? null,
    mensagemEnviada: data.mensagem_personalizada,
  };
}

/**
 * O cliente respondeu a uma lista: marca o item como `respondido` e reconta
 * o placar da lista.
 *
 * Vale para qualquer conversa, não só as nascidas de campanha: lead que já
 * conversava recebe a lista na conversa que já existia (origem orgânica), e
 * a resposta dele também é resposta à lista. Quem decide se conta é
 * `contaComoRespostaDaLista` (item ainda `enviado`, até 30 dias).
 */
export async function marcarRespostaCampanha(lista: ListaRecenteDoLead): Promise<void> {
  if (!contaComoRespostaDaLista(lista)) return;
  const supabase = createServiceClient();

  const { data: mudou } = await supabase
    .from("whatsapp_campanhas_fila")
    .update({ status: "respondido", resposta_em: new Date().toISOString() })
    .eq("id", lista.itemId)
    .eq("status", "enviado")
    .select("id");
  if (!mudou || mudou.length === 0) return;

  // Recontado do zero, não incrementado: a contagem de linhas na fila é a
  // fonte da verdade, e recalcular dela é imune a corrida entre dois
  // webhooks concorrentes.
  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .eq("campanha_id", lista.campanhaId)
    .eq("status", "respondido");

  await supabase
    .from("whatsapp_campanhas")
    .update({ total_respondidos: count ?? 0 })
    .eq("id", lista.campanhaId);
}

/**
 * Contabiliza o resultado de um envio.
 *
 * Falhas seguidas quase sempre significam número já restrito pelo
 * WhatsApp; insistir a partir daí é o que transforma restrição em
 * banimento. Ao cruzar o limite, o disjuntor abre sozinho.
 */
export async function registrarResultadoEnvio(
  instanciaId: string,
  sucesso: boolean,
): Promise<void> {
  const supabase = createServiceClient();

  if (sucesso) {
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ falhas_seguidas: 0 })
      .eq("id", instanciaId);
    return;
  }

  const { data } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("falhas_seguidas")
    .eq("id", instanciaId)
    .maybeSingle();

  const falhas = (data?.falhas_seguidas ?? 0) + 1;

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      falhas_seguidas: falhas,
      ...(deveAbrirDisjuntor(falhas)
        ? { bloqueado_ate: bloqueadoAtePor().toISOString() }
        : {}),
    })
    .eq("id", instanciaId);
}

/**
 * O dossiê como estava ANTES desta mensagem — buscar antes de `salvarDossie`
 * sobrescrever é o que permite ao webhook saber o que mudou de fato na
 * conversa (ver `resumirMudancasDossie` em dossierExtractor.ts) e mandar ao
 * corretor uma atualização incremental, em vez de só o alerta único de lead
 * quente.
 */
export async function buscarDossieAtual(leadId: string): Promise<DossieClienteIA | null> {
  const supabase = createServiceClient();

  const [{ data }, { data: lead }] = await Promise.all([
    supabase.from("lead_observacoes_ia").select("*").eq("lead_id", leadId).maybeSingle(),
    supabase.from("leads").select("renda_mensal, regiao_interesse, dormitorios_min").eq("id", leadId).maybeSingle(),
  ]);

  if (!data) return null;
  // `numeric` chega como string no supabase-js.
  const rendaDaFicha = lead?.renda_mensal != null && Number(lead.renda_mensal) > 0 ? Number(lead.renda_mensal) : null;

  return {
    id: data.id,
    leadId: data.lead_id,
    orcamentoMin: data.orcamento_min,
    orcamentoMax: data.orcamento_max,
    /*
     * Renda, região e dormitórios moram em `leads`, e é de lá que vêm. Até
     * 01/10/2026 entravam como null aqui: a extração gravava a renda na ficha
     * e o atendimento nunca a lia, então a IA calculava o teto só pelo que
     * achava no histórico (e errava "1500 do meu marido e 2644 meu").
     */
    rendaMensal: rendaDaFicha,
    regiaoInteresse: lead?.regiao_interesse ?? null,
    dormitoriosMin: lead?.dormitorios_min ?? null,
    /*
     * Nome e e-mail também moram em `leads` — a extração os descobre e
     * `salvarDossie` os escreve lá, que é de onde a ficha do CRM lê.
     *
     * A MEMÓRIA mora em `whatsapp_conversas`, não aqui: ela é da CONVERSA,
     * não do lead. O mesmo telefone pode ter duas conversas, e misturar as
     * duas memórias faria a IA falar de um imóvel que foi assunto da outra.
     */
    nomeCliente: null,
    email: null,
    memoria: null,
    formaPagamento: data.forma_pagamento,
    // Ainda sem coluna própria: chegam na extração e entram no prompt da
    // mesma conversa. Persistir exigiria migration, e o valor deles é
    // orientar a resposta agora — não virar relatório.
    profissao: null,
    compraEmConjunto: null,
    perfilFamiliar: data.perfil_familiar,
    urgenciaMudanca: data.urgencia_mudanca,
    /*
     * As duas colunas são `jsonb`: o banco não garante que o array só tem
     * texto, e o dossiê é escrito por IA. `Array.isArray` sozinho deixava
     * passar `[null, 42]` e a tela renderizaria isso — filtrar por string é
     * o que torna o tipo verdadeiro.
     */
    exigenciasEspecificas: apenasTextos(data.exigencias_especificas),
    objecoesIdentificadas: apenasTextos(data.objecoes_identificadas),
    temperaturaScore: data.temperatura_score,
    temperaturaLabel: data.temperatura_label,
    resumoExecutivo: data.resumo_executivo,
    proximoPassoSugerido: data.proximo_passo_sugerido,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/** Um dossiê por lead (`unique` na 0018) — cada análise substitui a anterior. */
export async function salvarDossie(leadId: string, dossie: DossieClienteIA): Promise<void> {
  const supabase = createServiceClient();

  /*
   * O dossiê se apagava sozinho: o upsert grava TODAS as colunas, e a
   * extração só enxerga a janela do histórico — assunto que sai da janela
   * volta `null` e o null sobrescrevia o que o cliente já tinha dito. Medido
   * antes: 16 dossiês para 131 leads, orçamento 0/16.
   *
   * A leitura da linha anterior acontece AQUI, não no chamador. O webhook tem
   * um `dossieAnterior` em mãos, mas passá-lo faria a guarda depender de o
   * chamador lembrar — e é o esquecimento de um chamador que este projeto já
   * pagou caro (foi o que tirou `interacaoId` dos parâmetros de
   * `gravarMensagem`). Uma consulta a mais por resposta, e a regra passa a
   * valer para todo chamador que existir depois.
   */
  const { data: linhaAnterior } = await supabase
    .from("lead_observacoes_ia")
    .select(
      "orcamento_min, orcamento_max, forma_pagamento, perfil_familiar, urgencia_mudanca, exigencias_especificas, objecoes_identificadas, temperatura_score, temperatura_label, resumo_executivo, proximo_passo_sugerido",
    )
    .eq("lead_id", leadId)
    .maybeSingle();

  const mesclado = mesclarDossie(
    linhaAnterior
      ? {
          orcamento_min: linhaAnterior.orcamento_min,
          orcamento_max: linhaAnterior.orcamento_max,
          forma_pagamento: linhaAnterior.forma_pagamento,
          perfil_familiar: linhaAnterior.perfil_familiar,
          urgencia_mudanca: linhaAnterior.urgencia_mudanca,
          exigencias_especificas: apenasTextos(linhaAnterior.exigencias_especificas),
          objecoes_identificadas: apenasTextos(linhaAnterior.objecoes_identificadas),
          temperatura_score: linhaAnterior.temperatura_score,
          temperatura_label: linhaAnterior.temperatura_label,
          resumo_executivo: linhaAnterior.resumo_executivo,
          proximo_passo_sugerido: linhaAnterior.proximo_passo_sugerido,
        }
      : null,
    {
      orcamento_min: dossie.orcamentoMin,
      orcamento_max: dossie.orcamentoMax,
      forma_pagamento: dossie.formaPagamento,
      perfil_familiar: dossie.perfilFamiliar,
      urgencia_mudanca: dossie.urgenciaMudanca,
      exigencias_especificas: dossie.exigenciasEspecificas,
      objecoes_identificadas: dossie.objecoesIdentificadas,
      temperatura_score: dossie.temperaturaScore,
      temperatura_label: dossie.temperaturaLabel,
      resumo_executivo: dossie.resumoExecutivo,
      proximo_passo_sugerido: dossie.proximoPassoSugerido,
    },
  );

  await supabase.from("lead_observacoes_ia").upsert(
    { lead_id: leadId, ...mesclado, updated_at: new Date().toISOString() },
    { onConflict: "lead_id" },
  );

  /*
   * A ficha do lead.
   *
   * Renda, orçamento, região e dormitórios vão para `leads` porque é de lá
   * que a ficha do CRM lê — dado gravado que nenhuma tela mostra é
   * indistinguível de dado perdido (a lição do `historico_envios`, 53
   * linhas e zero leitores). Nome e e-mail entraram em 11/09/2026, quando
   * se mediu que os 55 leads que conversaram com a IA se chamavam todos
   * "WhatsApp 2461".
   *
   * As três regras (null não apaga, o cliente pode mudar de ideia, o
   * corretor vence) moram em `camposDaFicha`, que é PURA e testada. Montar
   * o objeto à mão aqui foi o que fez este bloco crescer sem régua — e
   * acrescentar um campo era exatamente o momento em que alguém esqueceria
   * a marca do corretor e desfaria a correção de uma pessoa.
   */
  const { data: leadAtual } = await supabase
    .from("leads")
    .select("nome, email, campos_do_corretor")
    .eq("id", leadId)
    .maybeSingle();

  const doLead = camposDaFicha(
    dossie,
    apenasTextos(leadAtual?.campos_do_corretor),
    leadAtual?.nome ?? "",
    leadAtual?.email,
  );

  if (Object.keys(doLead).length > 0) {
    await supabase.from("leads").update(doLead).eq("id", leadId);
  }

  await avancarLeadParaQualificado(leadId);
}

/**
 * Grava a MEMÓRIA da conversa (0110).
 *
 * A mescla mora em `mesclarMemoria`, que é pura e testada; aqui só se
 * persiste. `porCorretor` carimba `memoria_do_corretor`, e é isso que faz a
 * extração seguinte preservar o texto dele em vez de reescrevê-lo.
 *
 * Falha só loga: a memória é melhoria de contexto, e derrubar o ciclo de
 * atendimento por causa dela seria trocar um contexto melhor por nenhuma
 * resposta. Mesma escolha de `registrarInteracao`.
 */
/**
 * Quando o dossiê deste lead foi extraído pela última vez.
 *
 * É o relógio do debounce de `devoExtrair`: uma rajada de cinco balões é
 * UMA extração, não cinco. Uma consulta magra (uma coluna) contra cinco
 * chamadas de LLM evitadas.
 */
export async function ultimaExtracaoDoLead(leadId: string): Promise<Date | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("lead_observacoes_ia")
    .select("updated_at")
    .eq("lead_id", leadId)
    .maybeSingle();

  return data?.updated_at ? new Date(data.updated_at) : null;
}

export async function salvarMemoriaDaConversa(
  conversaId: string,
  texto: string | null,
  porCorretor = false,
): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("whatsapp_conversas")
    .update({
      memoria: texto,
      memoria_atualizada_em: new Date().toISOString(),
      /*
       * Só SOBE para true. A IA gravando por cima não apaga a marca: se
       * apagasse, a mensagem seguinte voltaria a reescrever o texto do
       * corretor, que é exatamente o que a marca existe para impedir.
       */
      ...(porCorretor ? { memoria_do_corretor: true } : {}),
    })
    .eq("id", conversaId);

  if (error) console.error("[conversa] falha ao gravar memória:", error.message);
}

// ---------------------------------------------------------------------------
// Estado de conexão da instância
// ---------------------------------------------------------------------------

export type EstadoInstancia = {
  conectado: boolean;
  estado: string;
  /** Marco do pareamento — base da curva de aquecimento em `antiBan.ts`. */
  conectadoEm: Date | null;
  detalhe?: string;
};

/**
 * Reconcilia o estado de conexão guardado no banco com o que o provedor
 * diz agora, e devolve o resultado já normalizado.
 *
 * Esta função é a correção do bug que travava TODA campanha: `conectado_em`
 * não era escrito em lugar nenhum do sistema, então `reservarCotaCampanha`
 * lia `null`, respondia "número ainda não foi pareado" e o disparador
 * parava — com a fila inteira parecendo apenas "pendente", sem erro
 * nenhum registrado para o corretor ver.
 *
 * Sobre carimbar `conectado_em = agora` quando descobrimos um número já
 * pareado: é deliberadamente conservador. O marco real do pareamento pode
 * ter sido semanas atrás, mas não temos como saber — e errar para o lado
 * "número novo" só custa uma cota diária menor nos primeiros dias, que
 * sobe sozinha. Errar para o outro lado custa o número.
 */
export async function sincronizarConexaoInstancia(params: {
  instanciaId: string;
  instanceName: string;
  conectadoEmAtual: string | null;
  /** Número guardado hoje — é a base para detectar troca de chip. */
  telefoneAtual?: string | null;
}): Promise<EstadoInstancia> {
  const supabase = createServiceClient();

  const estado = await consultarEstadoConexao(params.instanceName);

  if (!estado.ok) {
    // Provedor fora do ar não é motivo para apagar um marco de conexão que
    // já existe: mantemos o que o banco sabe e deixamos o chamador decidir.
    return {
      conectado: Boolean(params.conectadoEmAtual),
      estado: "indisponivel",
      conectadoEm: params.conectadoEmAtual ? new Date(params.conectadoEmAtual) : null,
      detalhe: estado.detalhe,
    };
  }

  if (!estado.conectado) {
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ status_conexao: estado.estado === "connecting" ? "conectando" : "desconectado" })
      .eq("id", params.instanciaId);

    /*
     * Carimba o marco da queda UMA VEZ (0065). O `is(..., null)` é a parte
     * que importa: este caminho roda a cada ciclo do cron, e reescrever a
     * cada passagem faria um apagão de três dias aparecer eternamente como
     * "faz um minuto" — o defeito ficaria invisível justamente por ser
     * contínuo. É este marco que sustenta o "faz 3 dias" do aviso.
     */
    await supabase
      .from("corretor_whatsapp_instancias")
      .update({ desconectado_em: new Date().toISOString() })
      .eq("id", params.instanciaId)
      .is("desconectado_em", null);

    return { conectado: false, estado: estado.estado, conectadoEm: null };
  }

  // Chip diferente = reputação diferente: zera cota, bloqueio e reinicia a
  // curva de aquecimento (ver trocaDeNumero.ts). Reconexão do MESMO número
  // não zera nada.
  const reset = resetPorTrocaDeNumero(params.telefoneAtual, estado.telefone);
  const conectadoEm = reset?.conectado_em ?? params.conectadoEmAtual ?? new Date().toISOString();

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: "conectado",
      conectado_em: conectadoEm,
      ...(estado.telefone ? { telefone_conectado: estado.telefone } : {}),
      // Um número que responde "open" não está mais em falha: zera o
      // contador para o disjuntor não abrir por histórico velho.
      falhas_seguidas: 0,
      // O número voltou: apaga o marco da queda e a marca do aviso (0065).
      // É o que arma o alerta da PRÓXIMA vez — queda nova é notícia nova,
      // mesmo que a anterior tenha sido ontem.
      desconectado_em: null,
      aviso_queda_enviado_em: null,
      ...(reset
        ? {
            envios_campanha_contador: reset.envios_campanha_contador,
            envios_campanha_data: reset.envios_campanha_data,
            bloqueado_ate: reset.bloqueado_ate,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.instanciaId);

  if (reset) {
    console.warn(
      `[whatsapp] número trocado em ${params.instanceName}: cota, bloqueio e aquecimento zerados.`,
    );
  }

  return { conectado: true, estado: estado.estado, conectadoEm: new Date(conectadoEm) };
}

/**
 * Aplica o `connection.update` que o provedor empurra pelo webhook.
 *
 * Mesmo efeito da sincronização ativa, sem a ida à rede — aqui o estado
 * chegou de graça, junto do evento.
 */
export async function registrarEventoConexao(params: {
  instanceName: string;
  estado: string;
  telefone?: string | null;
}): Promise<void> {
  const supabase = createServiceClient();
  const conectado = params.estado === "open";

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, conectado_em, telefone_conectado")
    .eq("instance_name", params.instanceName)
    .maybeSingle();

  if (!instancia) return;

  // Chip diferente = reputação diferente. Zera cota do dia, bloqueio e
  // reinicia o aquecimento (ver trocaDeNumero.ts); reconexão do MESMO
  // número não zera nada.
  const reset = conectado
    ? resetPorTrocaDeNumero(instancia.telefone_conectado, params.telefone)
    : null;

  await supabase
    .from("corretor_whatsapp_instancias")
    .update({
      status_conexao: conectado ? "conectado" : params.estado === "connecting" ? "conectando" : "desconectado",
      // Só carimba na primeira vez: uma reconexão (queda de internet, troca
      // de celular) não pode zerar a curva de aquecimento de um número que
      // já vinha maduro. A exceção é a troca de número, tratada acima.
      ...(conectado && !instancia.conectado_em ? { conectado_em: new Date().toISOString() } : {}),
      ...(conectado && params.telefone ? { telefone_conectado: params.telefone } : {}),
      ...(conectado ? { falhas_seguidas: 0 } : {}),
      ...(reset
        ? {
            conectado_em: reset.conectado_em,
            envios_campanha_contador: reset.envios_campanha_contador,
            envios_campanha_data: reset.envios_campanha_data,
            bloqueado_ate: reset.bloqueado_ate,
          }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", instancia.id);

  if (reset) {
    console.warn(
      `[whatsapp] número trocado em ${params.instanceName}: cota, bloqueio e aquecimento zerados.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Trava de disparo (migration 0024)
// ---------------------------------------------------------------------------

/**
 * Garante que só um disparador por vez use um número de WhatsApp.
 *
 * Três gatilhos independentes chamam o mesmo disparador — o cron diário, o
 * botão "Processar fila agora" e o auto-encadeamento. Sem trava, dois deles
 * chegando juntos leem a mesma linha `pendente` e mandam a mesma mensagem
 * duas vezes, no mesmo segundo: rajada e texto repetido, os dois padrões
 * que a fila existe para evitar.
 */
export async function travarDisparo(escopo: string, dono: string, segundos: number): Promise<boolean> {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("travar_disparo", {
    p_escopo: escopo,
    p_dono: dono,
    p_segundos: segundos,
  });

  // Falha ao falar com o banco: não assumimos a trava. Perder um ciclo de
  // disparo é barato; mandar em duplicidade, não.
  if (error) return false;
  return data === true;
}

export async function destravarDisparo(escopo: string, dono: string): Promise<void> {
  const supabase = createServiceClient();
  await supabase.rpc("destravar_disparo", { p_escopo: escopo, p_dono: dono });
}

/**
 * Quando saiu o último pós-visita desta conversa (0121). É o que permite ao
 * webhook reconhecer a resposta a ele (`respondeAoPosVisita`) e dar à IA a
 * instrução do passo seguinte. Falha vira `null`: sem a instrução, a
 * resposta segue o planner normal — nada quebra.
 */
export async function ultimoPosVisitaEnviado(conversaId: string): Promise<string | null> {
  return ultimoFollowupEnviado(conversaId, "pos_visita");
}

/** Quando saiu o último follow-up deste tipo nesta conversa, ou `null`. */
export async function ultimoFollowupEnviado(
  conversaId: string,
  tipo: "pos_visita" | "lembrete_visita" | "indicacao",
): Promise<string | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("whatsapp_followups")
    .select("enviado_em")
    .eq("conversa_id", conversaId)
    .eq("tipo", tipo)
    .eq("status", "enviado")
    .order("enviado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.enviado_em ?? null;
}

/**
 * O cliente confirmou a visita respondendo ao lembrete (0123). Carimba uma
 * vez; mudar a data da visita apaga o carimbo (trigger da 0124).
 */
export async function registrarVisitaConfirmada(leadId: string): Promise<boolean> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("leads")
    .update({ visita_confirmada_em: new Date().toISOString() })
    .eq("id", leadId)
    .is("visita_confirmada_em", null)
    .not("visita_agendada_em", "is", null)
    .select("id");
  return (data?.length ?? 0) > 0;
}

/**
 * Guarda a visita que o corretor parece ter combinado no chat, para o Início
 * perguntar "registrar?" (0163). Nunca grava em `leads`: só o toque dele.
 */
export async function guardarVisitaSugerida(conversaId: string, quando: Date): Promise<void> {
  const { error } = await createServiceClient()
    .from("whatsapp_conversas")
    .update({ visita_sugerida_para: quando.toISOString(), visita_sugerida_em: new Date().toISOString() })
    .eq("id", conversaId);
  if (error) console.error("[visita] falha ao guardar a visita combinada no chat:", error.message);
}
