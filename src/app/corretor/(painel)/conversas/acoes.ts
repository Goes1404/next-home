"use server";

import { ehMotivoDaAvaliacao, type MotivoDaAvaliacao } from "@/lib/whatsapp/motivosDaAvaliacao";
import { revalidatePath } from "next/cache";
import { MENSAGENS_POR_PAGINA } from "./chatModelo";
import type { ContextoDaInteracao } from "@/lib/whatsapp/contextoDaInteracao";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  enviarMensagemWhatsapp,
  enviarMidiaWhatsapp,
  type TipoMidiaWhatsapp,
} from "@/lib/whatsapp/provider";
import { decidirPorFalaDoCorretor } from "@/lib/whatsapp/modoBot";
import { gerarEEnviarPelaIA } from "@/lib/whatsapp/aberturaPelaIA";
import {
  buscarDossieAtual,
  gravarMensagem,
  historicoRecente,
  ativarIaNaConversa,
  marcarConversaComoTeste,
  pausarBotPorAtendimentoHumano,
  registrarTentativaDeContato,
  resolverInstancia,
} from "@/lib/whatsapp/repositorio";
import { getEmpreendimentos } from "@/lib/queries";
import { horariosDeVisitaSeguros } from "@/lib/crm/agendaDoCorretor";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { TETO_DA_MEMORIA } from "@/lib/whatsapp/memoriaDaConversa";
import { lerResumoDoLead, type ResumoDoLead } from "@/lib/crm/resumoDoLead";

export type ResultadoConversa = { erro?: string; ok?: string };

/**
 * Server Action é POST na rota, não navegação: o `proxy.ts` não cobre isto.
 */
async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return supabase;
}

/*
 * `retomarBotNaConversa` saiu em 03/10/2026 (plano de ativação, 6.1): não
 * tinha botão na tela. Religar a IA numa conversa é o "IA assume agora"
 * (`assumirConversaComIA`), que também responde quem estava esperando.
 */

/**
 * Silencia a IA nesta conversa por tempo indeterminado.
 *
 * Diferente da pausa automática de 24h, esta é uma decisão explícita: fica
 * em `bot_ativo = false` até o corretor reativar. É o caso do cliente que
 * pediu para falar só com gente, e do número que atende também a conversa
 * pessoal do corretor.
 */
export async function silenciarBotNaConversa(conversaId: string): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: false })
    .eq("id", conversaId)
    .select("id");

  if (error) {
    console.error("[conversas] falha ao silenciar bot:", error.message);
    return { erro: "Não foi possível desligar a IA agora." };
  }
  if (!data || data.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  return { ok: "IA desligada nesta conversa." };
}

export type MensagemConversa = {
  id: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  criadoEm: string;
  tipo: "texto" | "audio" | "imagem" | "documento";
  /** URL da mídia quando houver — é o que permite tocar o áudio no painel. */
  midiaUrl: string | null;
  /** ✓✓ das mensagens enviadas pelo painel (0051); null = sem rastreio. */
  statusEntrega: "enviada" | "entregue" | "lida" | null;
  /** Vínculo com a telemetria (0040) — é o que torna ESTE balão avaliável. */
  interacaoId: string | null;
  /** Avaliação já dada a esta resposta, se houver. */
  avaliacao: "boa" | "ruim" | null;
  /** O motivo do 👎 (0131), quando o corretor tocou num. */
  motivoAvaliacao: MotivoDaAvaliacao | null;
  /**
   * Por que a IA respondeu isso (0105). Nulo em resposta anterior à coluna —
   * e é assim que a tela diz "contexto não registrado" em vez de inventar uma
   * razão que não foi a real.
   */
  contexto: ContextoDaInteracao | null;
};

/**
 * Uma página de mensagens (100), da mais recente para trás. `antesDe`
 * pagina o histórico: passa o `criadoEm` da mensagem mais antiga na tela e
 * vem a página anterior — o "carregar mensagens antigas" do chat.
 */
export async function lerMensagens(
  conversaId: string,
  antesDe?: string,
  limite: number = MENSAGENS_POR_PAGINA,
): Promise<MensagemConversa[]> {
  const supabase = await exigirSessao();
  // Action é endpoint: o número vem do navegador e é contido aqui.
  const quantas = Math.min(100, Math.max(1, Math.floor(Number(limite) || MENSAGENS_POR_PAGINA)));

  let consulta = supabase
    .from("whatsapp_mensagens")
    .select("id, remetente, conteudo, created_at, tipo, midia_url, status_entrega, interacao_id")
    .eq("conversa_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(quantas);
  if (antesDe) consulta = consulta.lt("created_at", antesDe);

  const { data, error } = await consulta;

  if (error) {
    console.error("[conversas] falha ao ler mensagens:", error.message);
    return [];
  }

  /*
   * A avaliação mora em ia_interacoes, não na mensagem. Segunda query em
   * vez de embed do PostgREST: o tipo gerado à mão (types.ts) não conhece
   * a relação, e duas queries simples valem mais que um cast.
   */
  const idsInteracao = (data ?? []).map((m) => m.interacao_id).filter((v): v is string => v !== null);
  const avaliacoes = new Map<string, "boa" | "ruim" | null>();
  const motivos = new Map<string, MotivoDaAvaliacao | null>();
  const contextos = new Map<string, ContextoDaInteracao | null>();
  if (idsInteracao.length > 0) {
    const { data: interacoes } = await supabase
      .from("ia_interacoes")
      .select("id, avaliacao, motivo_avaliacao, contexto")
      .in("id", idsInteracao);
    for (const i of interacoes ?? []) {
      avaliacoes.set(i.id, i.avaliacao);
      motivos.set(i.id, i.motivo_avaliacao);
      // O jsonb volta como `Json`; o formato é o que `montarContextoDaInteracao`
      // gravou, e a conversão fica nesta fronteira em vez de vazar para a tela.
      contextos.set(i.id, (i.contexto as ContextoDaInteracao | null) ?? null);
    }
  }

  return (data ?? [])
    .map((m) => ({
      id: m.id,
      remetente: m.remetente as MensagemConversa["remetente"],
      conteudo: m.conteudo,
      criadoEm: m.created_at,
      tipo: m.tipo as MensagemConversa["tipo"],
      midiaUrl: m.midia_url,
      statusEntrega: m.status_entrega,
      interacaoId: m.interacao_id,
      avaliacao: m.interacao_id ? (avaliacoes.get(m.interacao_id) ?? null) : null,
      motivoAvaliacao: m.interacao_id ? (motivos.get(m.interacao_id) ?? null) : null,
      contexto: m.interacao_id ? (contextos.get(m.interacao_id) ?? null) : null,
    }))
    .reverse();
}

/**
 * O corretor abriu a conversa: o badge de não-lidas zera e a leitura fica
 * carimbada. Chamado ao abrir o chat e sempre que chega mensagem com o
 * chat já aberto — como no WhatsApp, ler é estar com a conversa na tela.
 */
export async function marcarConversaLida(conversaId: string): Promise<void> {
  const supabase = await exigirSessao();
  await supabase
    .from("whatsapp_conversas")
    .update({ nao_lidas: 0, corretor_leu_ate: new Date().toISOString() })
    .eq("id", conversaId);
}

/**
 * O corretor avaliou UMA resposta específica do bot.
 *
 * Substitui `avaliarUltimaResposta`, que só alcançava a interação mais
 * recente da conversa — se o bot respondeu cinco vezes e a terceira foi
 * ruim, o rótulo mais valioso do golden dataset era impossível de gravar.
 * O vínculo balão→interação (0040) resolve: o Live Chat passa o id exato.
 *
 * É o gesto mais barato do loop de melhoria contínua: a marcação fica em
 * `ia_interacoes.avaliacao` e o export do golden dataset
 * (scripts/eval/exportarGolden.ts) transforma cada `ruim` num caso de
 * teste — a falha real de hoje vira o teste automático que impede a mesma
 * falha amanhã. A RLS da 0029 garante que só o dono da conversa avalia.
 */
export async function avaliarInteracao(
  interacaoId: string,
  avaliacao: "boa" | "ruim",
): Promise<ResultadoConversa> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("ia_interacoes")
    // 👍 apaga o motivo de um 👎 anterior: motivo órfão falsearia o relatório.
    .update(avaliacao === "boa" ? { avaliacao, motivo_avaliacao: null } : { avaliacao })
    .eq("id", interacaoId)
    .select("id");

  if (error) return { erro: "Não foi possível registrar a avaliação." };
  if (!data || data.length === 0) return { erro: "Resposta não encontrada na sua carteira." };

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  return { ok: avaliacao === "ruim" ? "Anotado — esta resposta vira caso de teste do próximo ajuste da IA." : "Avaliação registrada." };
}

/**
 * O motivo do 👎, em um toque (0131). Só vale para resposta já marcada como
 * ruim: motivo sem 👎 seria um defeito que ninguém apontou.
 */
export async function motivoDaAvaliacao(
  interacaoId: string,
  motivo: MotivoDaAvaliacao,
): Promise<ResultadoConversa> {
  if (!ehMotivoDaAvaliacao(motivo)) return { erro: "Motivo inválido." };
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("ia_interacoes")
    .update({ motivo_avaliacao: motivo })
    .eq("id", interacaoId)
    .eq("avaliacao", "ruim")
    .select("id");

  if (error) return { erro: "Não foi possível registrar o motivo." };
  if (!data || data.length === 0) return { erro: "Marque a resposta como ruim antes de escolher o motivo." };

  revalidatePath("/corretor/conversas");
  return { ok: "Anotado." };
}

/**
 * Conversa (via RLS — a de outro corretor simplesmente não aparece) + a
 * instância de quem é DONO dela, conectada. Compartilhado entre o envio de
 * texto e o de mídia para as duas portas aplicarem exatamente as mesmas
 * condições.
 */
async function carregarConversaEInstancia(
  supabase: Awaited<ReturnType<typeof exigirSessao>>,
  conversaId: string,
) {
  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("id, corretor_id, telefone_cliente, origem, lead_id, e_teste")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa) return { erro: "Conversa não encontrada na sua carteira." } as const;

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(
      "id, corretor_id, instance_name, status_conexao, palavra_chave_ativacao, palavra_chave_teste, nome_assistente, tom_voz, conectado_em",
    )
    .eq("corretor_id", conversa.corretor_id)
    .maybeSingle();

  if (!instancia || instancia.status_conexao !== "conectado") {
    return {
      erro: "O número não está conectado — conecte o WhatsApp antes de responder por aqui.",
    } as const;
  }

  return { conversa, instancia };
}

export type ResultadoEnvioPainel = {
  erro?: string;
  /** O envio pausou a IA nesta conversa (mesma regra da fala pelo celular). */
  iaPausada?: boolean;
  /** A mensagem era a palavra-chave: a IA foi LIGADA em vez de pausada. */
  iaAtivada?: boolean;
  /** Quantos balões a IA mandou, quando o corretor pediu que ela respondesse. */
  baloesEnviados?: number;
};

/**
 * O corretor respondeu o cliente PELO PAINEL — o teclado do Live Chat.
 *
 * O envio pela API do provedor NÃO ecoa de volta no webhook (é por isso que
 * o bot não pausa a si mesmo a cada resposta), então este caminho precisa
 * fazer sozinho o que o webhook faz quando o corretor fala do celular:
 * gravar a mensagem como `corretor` e aplicar `decidirPorFalaDoCorretor` —
 * a MESMA regra, para o painel e o celular nunca divergirem. Digitar a
 * palavra-chave aqui liga a IA, como no chat; qualquer outra fala pausa.
 */
export async function enviarMensagemDoPainel(
  conversaId: string,
  texto: string,
): Promise<ResultadoEnvioPainel> {
  const supabase = await exigirSessao();

  const conteudo = texto.trim();
  if (!conteudo) return { erro: "Escreva a mensagem antes de enviar." };
  if (conteudo.length > 4000) return { erro: "Mensagem longa demais para o WhatsApp." };

  const alvo = await carregarConversaEInstancia(supabase, conversaId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { conversa, instancia } = alvo;

  const envio = await enviarMensagemWhatsapp({
    instanceName: instancia.instance_name,
    telefone: conversa.telefone_cliente,
    texto: conteudo,
  });

  if (!envio.enviado) {
    console.error("[conversas] falha ao enviar pelo painel:", envio.detalhe ?? envio.motivo);
    return { erro: "Não foi possível enviar agora. Tente de novo em instantes." };
  }

  // Só grava o que de fato saiu: gravar antes do envio registraria no
  // histórico uma mensagem que o cliente nunca recebeu. O id do provedor e
  // o status inicial são o que liga esta linha aos ✓✓ (0051).
  await gravarMensagem({
    /*
     * Escrita DELIBERADA na ferramenta de trabalho, não espelho do celular.
     * A regra de privacidade existe para não copiar a vida pessoal de
     * terceiros que chega pelo webhook; o que o corretor digita aqui é
     * dele, sobre trabalho, e some do painel se não for guardado.
     */
    conversaLiberada: true,
    conversaId,
    remetente: "corretor",
    conteudo,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });

  /*
   * Mensagem que o corretor manda pelo Live Chat é iniciativa da casa:
   * conta como tentativa de contato (0060). Diferente da resposta da IA,
   * que não conta — ali quem puxou conversa foi o cliente.
   */
  await registrarTentativaDeContato(conversa.lead_id);

  const decisao = decidirPorFalaDoCorretor({
    mensagem: conteudo,
    palavraChaveConfigurada: instancia.palavra_chave_ativacao,
    palavraChaveTeste: instancia.palavra_chave_teste,
  });

  if (decisao.acao === "ativar_ia") {
    await ativarIaNaConversa(conversaId);
    if (decisao.marcarComoTeste) await marcarConversaComoTeste(conversaId);
    /*
     * O cliente estava esperando? A IA responde agora (plano de ativação,
     * 2.3), como faz a palavra digitada no celular. Sem pendência, nada sai.
     */
    const resposta = await gerarEEnviarPelaIA({
      conversa: {
        id: conversa.id,
        telefoneCliente: conversa.telefone_cliente,
        leadId: conversa.lead_id,
        eTeste: Boolean(conversa.e_teste) || decisao.marcarComoTeste,
      },
      instancia,
      instrucaoAbertura: "",
      desconsiderarUltimaFalaDoCorretor: true,
      somenteResposta: true,
    });
    if (resposta.erro) console.warn("[conversas] a IA não respondeu a pendência:", resposta.erro);
    revalidatePath("/corretor/conversas");
    revalidatePath("/corretor/pessoas");
    return { iaAtivada: true };
  }

  await pausarBotPorAtendimentoHumano(conversaId);

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  return { iaPausada: true };
}

export type MidiaDoCatalogo = {
  id: string;
  imovelNome: string;
  tipo: "foto" | "planta";
  url: string;
  titulo: string;
};

/**
 * Fotos e plantas dos imóveis publicados, para o botão de anexo do chat.
 *
 * Só imagem: vídeo e tour pesam demais para mandar num toque distraído, e
 * "manda a planta/foto" é o pedido real do cliente. A URL vem junto porque
 * a grade do seletor É a miniatura — não há download nem etapa extra.
 */
export async function listarCatalogoDeMidias(): Promise<
  { imoveis: { nome: string; midias: MidiaDoCatalogo[] }[] } | { erro: string }
> {
  const supabase = await exigirSessao();

  const { data, error } = await supabase
    .from("empreendimentos")
    .select("nome, midias(id, tipo, url, alt, ordem)")
    .eq("publicado", true)
    .order("nome");

  if (error) {
    console.error("[conversas] falha ao listar catálogo de mídias:", error.message);
    return { erro: "Não foi possível carregar as fotos do catálogo." };
  }

  const imoveis = (data ?? [])
    .map((imovel) => ({
      nome: imovel.nome,
      midias: (imovel.midias ?? [])
        .filter((m) => m.tipo === "foto" || m.tipo === "planta")
        .sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99))
        .map((m) => ({
          id: m.id,
          imovelNome: imovel.nome,
          tipo: m.tipo as "foto" | "planta",
          url: m.url,
          titulo: m.alt || imovel.nome,
        })),
    }))
    .filter((imovel) => imovel.midias.length > 0);

  return { imoveis };
}

/**
 * Envia uma foto/planta do catálogo como anexo nativo do WhatsApp.
 *
 * A mídia vem do BANCO pelo id — o cliente do navegador nunca dita a URL —
 * pelo mesmo motivo do `resolverMidia`: URL montada fora do catálogo é
 * como anexo errado nasce. A nota `📎 título: url` gravada na conversa é o
 * formato que `midiasJaEnviadas` lê, então a IA não reenvia o que o
 * corretor já mandou. Enviar mídia é fala do corretor: pausa a IA como
 * qualquer outra resposta dele.
 */
export async function enviarMidiaDoPainel(
  conversaId: string,
  midiaId: string,
): Promise<ResultadoEnvioPainel> {
  const supabase = await exigirSessao();

  const alvo = await carregarConversaEInstancia(supabase, conversaId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { conversa, instancia } = alvo;

  const { data: midia } = await supabase
    .from("midias")
    .select("id, tipo, url, alt, empreendimentos(nome)")
    .eq("id", midiaId)
    .maybeSingle();

  if (!midia || (midia.tipo !== "foto" && midia.tipo !== "planta")) {
    return { erro: "Essa mídia não está mais no catálogo." };
  }

  const envio = await enviarMidiaWhatsapp({
    instanceName: instancia.instance_name,
    telefone: conversa.telefone_cliente,
    tipo: midia.tipo as TipoMidiaWhatsapp,
    url: midia.url,
  });

  if (!envio.enviado) {
    console.error("[conversas] falha ao enviar mídia pelo painel:", envio.detalhe ?? envio.motivo);
    return { erro: "Não foi possível enviar a imagem agora. Tente de novo em instantes." };
  }

  const titulo = midia.alt || midia.empreendimentos?.nome || "Imagem do imóvel";
  await gravarMensagem({
    /*
     * Escrita DELIBERADA na ferramenta de trabalho, não espelho do celular.
     * A regra de privacidade existe para não copiar a vida pessoal de
     * terceiros que chega pelo webhook; o que o corretor digita aqui é
     * dele, sobre trabalho, e some do painel se não for guardado.
     */
    conversaLiberada: true,
    conversaId,
    remetente: "corretor",
    conteudo: `📎 ${titulo}: ${midia.url}`,
    tipo: "imagem",
    midiaUrl: midia.url,
    providerMessageId: envio.messageId ?? null,
    statusEntrega: envio.messageId ? "enviada" : null,
  });

  // Anexo nunca é palavra-chave: é sempre fala de atendimento, e pausa a IA.
  await pausarBotPorAtendimentoHumano(conversaId);

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  return { iaPausada: true };
}

export type FichaDoLead = {
  leadId: string;
  nome: string;
  etapa: string;
  orcamentoMin: number | null;
  orcamentoMax: number | null;
  rendaMensal: number | null;
  regiaoInteresse: string | null;
  dormitoriosMin: number | null;
  visitaAgendadaEm: string | null;
  criadoEm: string;
  /** Última leitura da IA sobre este lead, se o dossiê já rodou. */
  temperatura: { label: "quente" | "morno" | "frio"; score: number } | null;
  resumoIA: string | null;
  /** O resumo completo do lead (plano de ativação, 3.1), o mesmo da ficha. */
  resumo: ResumoDoLead | null;
};

/** `numeric` do Postgres chega como STRING no supabase-js — sempre converter. */
function numeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * A ficha resumida do lead desta conversa, para a gaveta do chat — o
 * corretor decide o que responder olhando funil, orçamento e a leitura da
 * IA SEM sair da conversa. A RLS recorta as duas consultas.
 */
export async function lerFichaDoLead(conversaId: string): Promise<FichaDoLead | null> {
  const supabase = await exigirSessao();

  const { data: conversa } = await supabase
    .from("whatsapp_conversas")
    .select("lead_id")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa?.lead_id) return null;

  const [{ data: lead }, { data: dossie }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, nome, etapa, orcamento_min, orcamento_max, renda_mensal, regiao_interesse, dormitorios_min, visita_agendada_em, created_at",
      )
      .eq("id", conversa.lead_id)
      .maybeSingle(),
    supabase
      .from("lead_observacoes_ia")
      .select("temperatura_label, temperatura_score, resumo_executivo")
      .eq("lead_id", conversa.lead_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!lead) return null;
  const resumo = await lerResumoDoLead(supabase, conversa.lead_id);

  return {
    resumo,
    leadId: lead.id,
    nome: lead.nome,
    etapa: lead.etapa,
    orcamentoMin: numeroOuNull(lead.orcamento_min),
    orcamentoMax: numeroOuNull(lead.orcamento_max),
    rendaMensal: numeroOuNull(lead.renda_mensal),
    regiaoInteresse: lead.regiao_interesse,
    dormitoriosMin: lead.dormitorios_min,
    visitaAgendadaEm: lead.visita_agendada_em,
    criadoEm: lead.created_at,
    temperatura: dossie
      ? { label: dossie.temperatura_label, score: dossie.temperatura_score }
      : null,
    resumoIA: dossie?.resumo_executivo ?? null,
  };
}

/**
 * A IA responde ESTA conversa agora, sob comando do corretor.
 *
 * ## Por que existe
 *
 * Quando a trava de campanha estava quebrada (01/09), 6 clientes
 * responderam ao disparo e ficaram sem resposta — um deles desde 27/08. O
 * conserto destravou o futuro, mas quem já escreveu não volta sozinho: o
 * webhook só age quando chega mensagem nova.
 *
 * Isto não é caminho paralelo: usa `executarTurnoDeAtendimento`, a MESMA
 * função do webhook, do follow-up, do playground e do eval. Duas vezes
 * neste projeto um caminho paralelo divergiu e o teste passou a medir um
 * agente que não existia.
 *
 * ## O que ela NÃO faz
 *
 * Não manda nada se a última palavra já for nossa. Responder quem não
 * perguntou nada é a definição de mensagem inconveniente — e num número
 * que o WhatsApp observa, é também risco de denúncia.
 */
export async function responderComIA(conversaId: string): Promise<ResultadoEnvioPainel> {
  const supabase = await exigirSessao();

  const alvo = await carregarConversaEInstancia(supabase, conversaId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const { conversa, instancia } = alvo;

  /*
   * A identidade (nome do corretor, CRECI, tom de voz) vem de
   * `resolverInstancia`, a MESMA que o webhook usa. Montar aqui um objeto
   * "parecido" é como um caminho paralelo começa.
   */
  const identidade = await resolverInstancia(instancia.instance_name);
  if (!identidade) return { erro: "Número não configurado." };

  const historico = await historicoRecente(conversaId);
  const ultima = historico[historico.length - 1];
  if (!ultima || ultima.remetente !== "cliente") {
    return { erro: "A última mensagem não é do cliente — não há o que responder." };
  }

  const [catalogo, dossie] = await Promise.all([
    getEmpreendimentos(),
    conversa.lead_id ? buscarDossieAtual(conversa.lead_id) : Promise.resolve(null),
  ]);

  const turno = await executarTurnoDeAtendimento({
    identidade: {
      nomeCorretor: identidade.nomeCorretor,
      slugCorretor: identidade.slugCorretor ?? undefined,
      creciCorretor: identidade.creciCorretor,
      telefoneCorretor: identidade.whatsappCorretor,
      nomeAssistente: identidade.nomeAssistente,
      tomVoz: identidade.tomVoz,
    },
    catalogo,
    historico,
    dossie,
    fewShot: { corretorId: identidade.corretorId, conversaAtualId: conversaId },
    horariosReais: await horariosDeVisitaSeguros(identidade.corretorId),
  });

  if (turno.baloes.length === 0) {
    return { erro: "A IA não conseguiu gerar uma resposta agora. Tente de novo." };
  }

  /*
   * Um balão por vez, com a mesma pausa do webhook: o WhatsApp entrega um a
   * um, e disparar os três no mesmo segundo é o padrão que a proteção
   * anti-ban existe para evitar.
   */
  for (const balao of turno.baloes) {
    const envio = await enviarMensagemWhatsapp({
      instanceName: instancia.instance_name,
      telefone: conversa.telefone_cliente,
      texto: balao,
    });

    if (!envio.enviado) {
      console.error("[conversas] IA não conseguiu enviar:", envio.detalhe ?? envio.motivo);
      return { erro: "A resposta foi gerada, mas o envio falhou. Tente de novo." };
    }

    await gravarMensagem({
      // O corretor pediu a resposta: é atendimento por definição.
      conversaLiberada: true,
      conversaId,
      remetente: "bot",
      conteudo: balao,
      providerMessageId: envio.messageId ?? null,
      statusEntrega: envio.messageId ? "enviada" : null,
    });
  }

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  revalidatePath("/corretor");
  return { baloesEnviados: turno.baloes.length };
}

/**
 * O corretor corrige a MEMÓRIA da conversa (0110).
 *
 * A memória é o que a IA carrega para a próxima mensagem — o estado da
 * negociação em prosa, que sobrevive à janela de 40 falas. Deixá-la
 * editável não é enfeite: resumo errado que ninguém conserta vira erro
 * repetido em TODA mensagem seguinte.
 *
 * Gravar por aqui carimba `memoria_do_corretor`, e a partir daí a extração
 * PRESERVA o texto dele e só acrescenta o que for novo. Sem esse carimbo, a
 * correção seria desfeita na mensagem seguinte — e é assim que alguém para
 * de corrigir.
 *
 * Quem recorta é a RLS: conversa de outro corretor simplesmente não é
 * atualizada, e o `.select()` de volta é o que separa "não pude" de "não
 * havia" (sem ele, um id alheio devolveria sucesso sem ter mudado nada).
 */
export async function salvarMemoriaDaConversaNoPainel(
  conversaId: string,
  texto: string,
): Promise<{ ok: string } | { erro: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: "Sessão expirada. Entre de novo." };

  const limpo = texto.trim().slice(0, TETO_DA_MEMORIA);

  const { data, error } = await supabase
    .from("whatsapp_conversas")
    .update({
      // Texto vazio APAGA a memória, de propósito: é o jeito de dizer "o
      // que estava aqui não vale". A marca continua, então a IA volta a
      // escrever do zero em vez de ressuscitar o texto errado.
      memoria: limpo || null,
      memoria_atualizada_em: new Date().toISOString(),
      memoria_do_corretor: true,
    })
    .eq("id", conversaId)
    .select("id");

  if (error) return { erro: "Não foi possível salvar agora." };
  if (!data?.length) return { erro: "Sem permissão para editar esta conversa." };

  revalidatePath("/corretor/conversas");
  revalidatePath("/corretor/pessoas");
  return { ok: "Memória atualizada. A IA passa a usar o seu texto." };
}

/**
 * "Como você responderia?" (0125): a resposta que o corretor daria no lugar
 * da IA vira exemplo nas conversas seguintes DELE. Grava também o 👎 —
 * ensinar é, por definição, dizer que aquela resposta não serviu.
 *
 * O contexto (a fala do cliente) é lido do banco, nunca do navegador: é ele
 * que decide em que situação a correção volta ao prompt.
 */
export async function ensinarIA(
  interacaoId: string,
  respostaCerta: string,
): Promise<{ ok?: string; erro?: string }> {
  const supabase = await exigirSessao();
  const texto = respostaCerta.trim();
  if (texto.length < 2) return { erro: "Escreva como você responderia." };
  if (texto.length > 1500) return { erro: "Resposta longa demais — o cliente leria no celular." };

  const { data: interacao } = await supabase
    .from("ia_interacoes")
    .select("id, conversa_id, corretor_id")
    .eq("id", interacaoId)
    .maybeSingle();
  if (!interacao?.conversa_id || !interacao.corretor_id) return { erro: "Resposta não encontrada na sua carteira." };

  const { data: balao } = await supabase
    .from("whatsapp_mensagens")
    .select("conteudo, created_at")
    .eq("interacao_id", interacaoId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const { data: falas } = await supabase
    .from("whatsapp_mensagens")
    .select("conteudo")
    .eq("conversa_id", interacao.conversa_id)
    .eq("remetente", "cliente")
    .lt("created_at", balao?.created_at ?? new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(3);
  const falaCliente = (falas ?? [])
    .map((f) => f.conteudo)
    .filter((c) => c && !c.startsWith("[mensagem não gravada"))
    .reverse()
    .join(" | ")
    .slice(0, 2000);
  if (!falaCliente) return { erro: "Não achei a fala do cliente que esta resposta respondia." };

  // Uma correção por resposta: ensinar de novo substitui a anterior.
  await supabase.from("ia_correcoes").delete().eq("interacao_id", interacaoId);
  const { error } = await supabase.from("ia_correcoes").insert({
    corretor_id: interacao.corretor_id,
    interacao_id: interacaoId,
    conversa_id: interacao.conversa_id,
    fala_cliente: falaCliente,
    resposta_ia: balao?.conteudo?.slice(0, 4000) ?? null,
    resposta_certa: texto,
  });
  if (error) return { erro: "Não consegui guardar a correção. Tente de novo." };
  await supabase.from("ia_interacoes").update({ avaliacao: "ruim" }).eq("id", interacaoId);

  revalidatePath("/corretor/conversas");
  return { ok: "Anotado. Em conversas parecidas, a IA vai seguir o seu jeito." };
}
