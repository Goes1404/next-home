import type { Metadata } from "next";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { sinaisDoLead, type ContextoDaIA } from "./chatModelo";
import { after } from "next/server";
import Link from "next/link";
import { garantirEventosWebhook } from "@/lib/whatsapp/provider";
import { ConversasClient, type ConversaResumo } from "./ConversasClient";
import { faltaNaLista, garantirNaLista } from "./listaDeConversas";
import { RevisaoRespostas, type ItemRevisao } from "./RevisaoRespostas";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { ROTULO_MODO } from "@/lib/whatsapp/modoBot";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp } from "@/lib/whatsapp/types";
import { lerSinaisDoMundo, type LeituraDoMundo } from "@/lib/whatsapp/rotuloAutomatico";

export const metadata: Metadata = { title: "Respostas da IA" };

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // `?c=<id>` chega da lista de Pessoas, que é a porta única do painel.
  const params = await searchParams;
  const bruto = params.c;
  const conversaInicial = (Array.isArray(bruto) ? bruto[0] : bruto) ?? null;
  // `?lista=<id>`: só as conversas de quem RESPONDEU a uma lista de
  // transmissão (roadmap das listas, Fase 3).
  const listaBruta = Array.isArray(params.lista) ? params.lista[0] : params.lista;
  const listaId = listaBruta && /^[0-9a-f-]{36}$/i.test(listaBruta) ? listaBruta : null;

  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const supabase = await createClient();

  let filtroDaLista: { titulo: string; leadIds: string[] } | null = null;
  if (listaId) {
    const { data: lista } = await supabase
      .from("whatsapp_campanhas")
      .select("titulo")
      .eq("id", listaId)
      .eq("corretor_id", corretor.id)
      .maybeSingle();
    if (lista) {
      const { data: responderam } = await supabase
        .from("whatsapp_campanhas_fila")
        .select("lead_id")
        .eq("campanha_id", listaId)
        .eq("status", "respondido")
        .not("lead_id", "is", null);
      filtroDaLista = {
        titulo: lista.titulo,
        leadIds: [...new Set((responderam ?? []).map((r) => r.lead_id as string))],
      };
    }
  }

  /*
   * O filtro por corretor é OBRIGATÓRIO aqui.
   *
   * Antes ele era omitido de propósito, porque a policy da 0018 recortava
   * sozinha. A 0031 abriu essas tabelas para o gestor (a administração
   * precisa enxergar a operação da equipe) — e, sem o filtro, o
   * `maybeSingle()` da instância passa a receber N linhas e explode
   * justamente na tela do gestor.
   *
   * Esta continua sendo a CAIXA PESSOAL de quem está logado; a visão da
   * equipe mora em /corretor/admin/whatsapp.
   */
  let consultaConversas = supabase
    .from("whatsapp_conversas")
    .select("id, telefone_cliente, nome_cliente, bot_ativo, ultima_mensagem, ultima_interacao_em, lead_id, nao_lidas, memoria, memoria_do_corretor, historico_anterior, lead:leads!whatsapp_conversas_lead_id_fkey(nao_contatar_em)")
    .eq("corretor_id", corretor.id)
    // Defesa durante a transição até a 0111: conversa sem cadastro não aparece.
    .not("lead_id", "is", null);
  // Com `?lista=`, só quem respondeu àquela lista. Lista sem resposta = vazio.
  if (filtroDaLista) {
    consultaConversas = consultaConversas.in(
      "lead_id",
      filtroDaLista.leadIds.length ? filtroDaLista.leadIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }

  const [{ data: conversas }, { data: instancia }] = await Promise.all([
    // 150 e não 100: as conversas sem fala do cliente saem logo abaixo.
    consultaConversas.order("ultima_interacao_em", { ascending: false }).limit(150),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("modo_bot, status_conexao, instance_name, expediente_inicio, expediente_fim")
      .eq("corretor_id", corretor.id)
      .maybeSingle(),
  ]);

  /*
   * O MESSAGES_UPDATE (✓✓ de entrega, 0051) entrou na lista de eventos
   * DEPOIS de a instância de produção existir, e `instance/create` não
   * reconfigura instância viva. O `webhook/set` aqui, fora do caminho da
   * resposta (`after`), garante o evento sem exigir reconexão — idempotente
   * e falha-silenciosa: o pior caso é seguir sem tick.
   */
  if (instancia?.instance_name) {
    const nomeInstancia = instancia.instance_name;
    after(() => garantirEventosWebhook(nomeInstancia));
  }

  /*
   * Só aparece quem JÁ CONVERSOU: o cliente falou ao menos uma vez (0156).
   * Conversa sem mensagem, só com a lista de transmissão que ninguém
   * respondeu ou só com fala do corretor é um lado falando sozinho — enchia
   * a tela de linhas mortas. O deep link `?c=` continua abrindo qualquer
   * conversa (ver `faltaNaLista` abaixo): é o corretor pedindo aquela.
   * Se a conferência falhar, a tela mostra todas em vez de nenhuma.
   */
  const idsCarregados = (conversas ?? []).map((c) => c.id);
  const { data: comFala, error: erroComFala } = idsCarregados.length
    ? await supabase.rpc("conversas_com_fala_do_cliente", { p_ids: idsCarregados })
    : { data: [] as string[], error: null };
  const conversou = new Set((comFala ?? []) as string[]);
  const conversasVisiveis = erroComFala ? (conversas ?? []) : (conversas ?? []).filter((c) => conversou.has(c.id));

  /*
   * A lista que cada cliente recebeu na última semana (Fase 3): a conversa
   * diz "veio da lista X". Uma consulta para as conversas da tela.
   */
  const leadsDaTela = [...new Set(conversasVisiveis.map((c) => c.lead_id as string))];
  const listaPorLead = new Map<string, string>();
  if (leadsDaTela.length > 0) {
    const { data: recebidas } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("lead_id, enviado_em, campanha:whatsapp_campanhas!inner(titulo, corretor_id)")
      .in("lead_id", leadsDaTela)
      .eq("campanha.corretor_id", corretor.id)
      .in("status", ["enviado", "respondido"])
      .gte("enviado_em", janelaDeDias(7).corte.toISOString())
      .order("enviado_em", { ascending: true });
    for (const r of recebidas ?? []) {
      const c = (Array.isArray(r.campanha) ? r.campanha[0] : r.campanha) as { titulo: string } | null;
      if (r.lead_id && c) listaPorLead.set(r.lead_id, c.titulo);
    }
  }

  const lista: ConversaResumo[] = conversasVisiveis.map((c) => ({
    id: c.id,
    telefone: c.telefone_cliente,
    nome: c.nome_cliente,
    botAtivo: c.bot_ativo,
    ultimaMensagem: c.ultima_mensagem,
    memoria: c.memoria ?? null,
    memoriaDoCorretor: c.memoria_do_corretor ?? false,
    ultimaInteracaoEm: c.ultima_interacao_em,
    temLead: Boolean(c.lead_id),
    naoLidas: c.nao_lidas,
    historicoIndisponivel: c.historico_anterior === "indisponivel",
    listaRecente: c.lead_id ? (listaPorLead.get(c.lead_id) ?? null) : null,
    ...sinaisDoLead(c),
  }));

  /*
   * O deep link tem de abrir a conversa, mesmo fora das 100 carregadas.
   *
   * São 140 conversas em produção e a lista traz 100: tocar numa das 40 mais
   * antigas pela lista de Pessoas mandava `?c=<id>`, ela não estava aqui, e no
   * celular o painel é `hidden md:flex` — a tela simplesmente não mudava.
   *
   * Uma consulta a mais, e SÓ quando falta: `faltaNaLista` é a porta.
   */
  let listaFinal = lista;
  if (faltaNaLista(lista, conversaInicial)) {
    const { data: solta } = await supabase
      .from("whatsapp_conversas")
      .select(
        "id, telefone_cliente, nome_cliente, bot_ativo, ultima_mensagem, ultima_interacao_em, lead_id, nao_lidas, memoria, memoria_do_corretor, historico_anterior, lead:leads!whatsapp_conversas_lead_id_fkey(nao_contatar_em)",
      )
      .eq("id", conversaInicial as string)
      .not("lead_id", "is", null)
      // A RLS já recorta pelo dono; o filtro explícito é a segunda linha, pela
      // mesma razão da 0031 (policy aberta para o gestor faz `maybeSingle`
      // receber N linhas quando ninguém esperava).
      .eq("corretor_id", corretor.id)
      .maybeSingle();

    if (solta) {
      listaFinal = garantirNaLista(lista, {
        id: solta.id,
        telefone: solta.telefone_cliente,
        nome: solta.nome_cliente,
        botAtivo: solta.bot_ativo,
        ultimaMensagem: solta.ultima_mensagem,
        memoria: solta.memoria ?? null,
        memoriaDoCorretor: solta.memoria_do_corretor ?? false,
        ultimaInteracaoEm: solta.ultima_interacao_em,
        temLead: Boolean(solta.lead_id),
        naoLidas: solta.nao_lidas,
        historicoIndisponivel: solta.historico_anterior === "indisponivel",
        ...sinaisDoLead(solta),
      });
    }
  }

  const modo = (instancia?.modo_bot ?? null) as ModoBotWhatsapp | null;

  /*
   * Fila de revisão: respostas do bot ainda sem 👍/👎, com o contexto
   * mínimo para julgar (a fala do cliente imediatamente anterior). Vem
   * ANTES da lista de conversas porque é a única coisa da tela que pede
   * ação — rótulo é o combustível do golden dataset, e rótulo que depende
   * de abrir conversa por conversa não acontece (medido: zero em produção).
   */
  const { data: semAvaliacao } = await supabase
    .from("ia_interacoes")
    .select("id, conversa_id, created_at")
    .eq("corretor_id", corretor.id)
    .in("origem", ["webhook", "followup"])
    .eq("e_teste", false)
    .in("acao", ["respondida", "visita_confirmada"])
    .is("avaliacao", null)
    .not("conversa_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);

  let itensRevisao: ItemRevisao[] = [];
  if (semAvaliacao && semAvaliacao.length > 0) {
    const idsInteracao = semAvaliacao.map((i) => i.id);
    const conversaIds = [...new Set(semAvaliacao.map((i) => i.conversa_id as string))];

    /*
     * O histórico INTEIRO das conversas envolvidas, não só a fala do
     * cliente: é dele que saem os sinais do mundo (`rotuloAutomatico.ts`).
     * O corretor já rotula toda vez que assume o teclado depois de uma
     * resposta — ele só não clica.
     */
    const [{ data: respostas }, { data: mensagens }] = await Promise.all([
      supabase
        .from("whatsapp_mensagens")
        .select("conversa_id, conteudo, created_at, interacao_id")
        .in("interacao_id", idsInteracao),
      supabase
        .from("whatsapp_mensagens")
        .select("conversa_id, remetente, conteudo, created_at, interacao_id")
        .in("conversa_id", conversaIds)
        .order("created_at", { ascending: true })
        .limit(600),
    ]);

    const nomes = new Map(lista.map((c) => [c.id, c.nome || c.telefone]));

    // Uma leitura por conversa; depois é só casar pelo id da interação.
    const leituraPorInteracao = new Map<string, LeituraDoMundo>();
    for (const conversaId of conversaIds) {
      const historico = (mensagens ?? [])
        .filter((m) => m.conversa_id === conversaId)
        .map((m) => ({
          remetente: m.remetente as "cliente" | "bot" | "corretor",
          texto: m.conteudo,
          interacaoId: m.interacao_id,
        }));
      for (const leitura of lerSinaisDoMundo(historico)) {
        if (leitura.interacaoId) leituraPorInteracao.set(leitura.interacaoId, leitura);
      }
    }

    // Interação sem mensagem vinculada (anterior ao backfill que falhou a
    // janela) fica de fora: sem o texto não há o que julgar.
    itensRevisao = (respostas ?? [])
      .filter((r) => r.interacao_id !== null)
      .map((r) => {
        const fala = (mensagens ?? [])
          .filter((m) => m.conversa_id === r.conversa_id && m.remetente === "cliente" && m.created_at < r.created_at)
          .at(-1);
        const leitura = leituraPorInteracao.get(r.interacao_id as string);
        return {
          interacaoId: r.interacao_id as string,
          clienteNome: nomes.get(r.conversa_id) ?? "Cliente",
          falaCliente: fala?.conteudo ?? null,
          respostaBot: r.conteudo,
          criadoEm: r.created_at,
          sinais: leitura?.sinais.filter((s) => s !== "cliente_seguiu" && s !== "corretor_assumiu_para_fechar"),
          correcaoDoCorretor: leitura?.correcaoDoCorretor ?? null,
        };
      })
      /*
       * O que o mundo já apontou vem primeiro. Vinte respostas sem ordem
       * nenhuma é uma lista; vinte com as três problemáticas no topo é uma
       * fila de trabalho — e é a diferença entre colher rótulo e não colher
       * (medido: zero rótulos desde a 0040).
       */
      .sort((a, b) => {
        const peso = (i: typeof a) => (i.sinais && i.sinais.length > 0 ? 0 : 1);
        if (peso(a) !== peso(b)) return peso(a) - peso(b);
        return a.criadoEm < b.criadoEm ? 1 : -1;
      });
  }

  return (
    <div>
      {/*
        Chamava-se "WhatsApp", igual à tela de campanhas: o título não dizia
        em qual das duas o corretor estava. Agora nomeia o que se faz aqui.
      */}
      <CabecalhoDeTela
        titulo="Respostas da IA"
        descricao="O que a IA respondeu no seu número, para você revisar com 👍 ou 👎."
      />


      {modo && (
        <p className="text-fluid-sm text-apoio mt-4">
          Quando a IA responde por você: <span className="text-titulo font-medium">{ROTULO_MODO[modo]}</span>{" "}
          <Link
            href="/corretor/whatsapp"
            className="text-acento-suave underline-offset-4 hover:underline"
          >
            trocar
          </Link>
        </p>
      )}

      {filtroDaLista ? (
        <p className="border-acento-linha bg-acento-lavado text-fluid-sm text-corpo mt-4 rounded-xl border px-4 py-3">
          Mostrando quem respondeu à lista <span className="text-titulo font-medium">“{filtroDaLista.titulo}”</span> (
          {filtroDaLista.leadIds.length}).{" "}
          <Link href="/corretor/conversas" className="text-acento-suave font-medium underline-offset-4 hover:underline">
            Ver todas as conversas
          </Link>
        </p>
      ) : (
        <RevisaoRespostas itens={itensRevisao} />
      )}

      <ConversasClient
        conversas={listaFinal}
        podeEnviar={instancia?.status_conexao === "conectado"}
        contextoDaIA={
          instancia
            ? {
                modo: instancia.modo_bot as NonNullable<ContextoDaIA>["modo"],
                expediente: { inicioHora: instancia.expediente_inicio, fimHora: instancia.expediente_fim },
              }
            : null
        }
        conversaInicial={conversaInicial}
      />
    </div>
  );
}
