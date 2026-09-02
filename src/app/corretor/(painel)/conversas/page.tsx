import type { Metadata } from "next";
import { after } from "next/server";
import Link from "next/link";
import { garantirEventosWebhook } from "@/lib/whatsapp/provider";
import { ConversasClient, type ConversaResumo } from "./ConversasClient";
import { RevisaoRespostas, type ItemRevisao } from "./RevisaoRespostas";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { AbasWhatsapp } from "@/app/corretor/(painel)/_componentes/AbasWhatsapp";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { ROTULO_MODO } from "@/lib/whatsapp/modoBot";
import { createClient } from "@/lib/supabase/server";
import type { ModoBotWhatsapp } from "@/lib/whatsapp/types";
import { lerSinaisDoMundo, type LeituraDoMundo } from "@/lib/whatsapp/rotuloAutomatico";

export const metadata: Metadata = { title: "Conversas do WhatsApp" };

export const dynamic = "force-dynamic";

export default async function ConversasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // `?c=<id>` chega da lista de Pessoas, que é a porta única do painel.
  const bruto = (await searchParams).c;
  const conversaInicial = (Array.isArray(bruto) ? bruto[0] : bruto) ?? null;

  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const supabase = await createClient();

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
  const [{ data: conversas }, { data: instancia }] = await Promise.all([
    supabase
      .from("whatsapp_conversas")
      .select("id, telefone_cliente, nome_cliente, bot_ativo, pausado_humano_ate, liberado_por_palavra_chave, ultima_mensagem, ultima_interacao_em, lead_id, nao_lidas")
      .eq("corretor_id", corretor.id)
      .order("ultima_interacao_em", { ascending: false })
      .limit(100),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("modo_bot, status_conexao, instance_name")
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
   * "Está pausada agora?" não é calculado aqui: a resposta depende do
   * relógio, e um booleano gravado no HTML já nasce velho — a pausa vence
   * enquanto a página está aberta. O cliente deriva de `pausadoAte`.
   */
  const lista: ConversaResumo[] = (conversas ?? []).map((c) => ({
    id: c.id,
    telefone: c.telefone_cliente,
    nome: c.nome_cliente,
    botAtivo: c.bot_ativo,
    liberada: c.liberado_por_palavra_chave,
    pausadoAte: c.pausado_humano_ate,
    ultimaMensagem: c.ultima_mensagem,
    ultimaInteracaoEm: c.ultima_interacao_em,
    temLead: Boolean(c.lead_id),
    naoLidas: c.nao_lidas,
  }));

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
        titulo="Conversas"
        descricao="Quem está falando com o seu número e se a IA está atendendo. Quando você responde pelo celular, ela se cala naquela conversa — aqui você devolve a palavra a ela."
      />

      <div className="mt-5">
        <AbasWhatsapp
          ativa="conversas"
          semRevisao={itensRevisao.length}
          conectado={instancia?.status_conexao === "conectado"}
        />
      </div>

      {modo && (
        <p className="text-fluid-sm text-apoio mt-4">
          Modo do seu número: <span className="text-titulo font-medium">{ROTULO_MODO[modo]}</span>{" "}
          <Link
            href="/corretor/whatsapp"
            className="text-acento-suave underline-offset-4 hover:underline"
          >
            trocar
          </Link>
        </p>
      )}

      <RevisaoRespostas itens={itensRevisao} />

      <ConversasClient
        conversas={lista}
        podeEnviar={instancia?.status_conexao === "conectado"}
        conversaInicial={conversaInicial}
      />
    </div>
  );
}
