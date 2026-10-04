"use client";

import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

import type { FiltroLeadsCampanha, OpcoesDeRecorte, RecorteDeOrigem } from "@/lib/crm/publicoDaCampanha";
import type { Canal } from "@/lib/graficos/calculos";
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CalendarClock,
  CheckCheck,
  ImageIcon,
  Rocket,
  Save,
  Search,
  Shield,
  Sparkles,
  UsersRound,
  WifiOff,
  X,
} from "lucide-react";
import {
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  STATUS_LABEL,
  type Empreendimento,
  type EtapaFunil,
  type TemplateMensagem,
} from "@/lib/types";
import { preencherTemplate } from "@/lib/mensagem";
import { VARIAVEIS_DA_MENSAGEM } from "@/lib/whatsapp/listaDeTransmissao";
import { criarTemplate } from "@/app/corretor/actions";
import {
  criarCampanha,
  gerarPreviewCampanha,
  salvarRascunho,
  sugerirAberturas,
  listarLeadsElegiveis,
  listarOpcoesDeOrigem,
  preverPublicoCampanha,
  type CampanhaListada,
  type LeadElegivel,
  type ListaParaReabrir,
  type ParametrosDaLista,
  type PreviaPublicoCampanha,
} from "../acoes";
import { listaRecemCriada } from "./listaRecemCriada";

/**
 * Criar lista de transmissão em três passos: quem recebe → o que dizer →
 * confirmar.
 *
 * Roadmap das listas (03/10/2026): a mensagem ganha fotos do imóvel,
 * variáveis do cadastro ({bairro}, {link}, {horarios}...), modelos com a
 * taxa de resposta de cada um, o passo 3 mostra as duas versões do teste, a
 * lista pode ficar viva por 30 dias, virar rascunho, e o assistente avisa —
 * e não deixa enviar — quando o número do corretor não está conectado.
 */

const PUBLICOS: { valor: FiltroLeadsCampanha; titulo: string; descricao: string }[] = [
  {
    valor: "parados_15d",
    titulo: "Quem esfriou",
    descricao:
      "Leads sem conversa há mais de 15 dias. É a base que mais responde a reativação.",
  },
  {
    valor: "novos_sem_contato",
    titulo: "Quem acabou de chegar",
    descricao:
      "Leads na etapa “Novo lead”, que ainda não receberam seu primeiro contato.",
  },
  {
    valor: "sem_resposta",
    titulo: "Abordado e sem resposta",
    descricao:
      "Quem já recebeu mensagem nossa e não respondeu — até 2 tentativas. Quem passou disso fica de fora: a terceira não converte e cansa o número.",
  },
  {
    valor: "todos",
    titulo: "Todos os meus leads",
    descricao:
      "A sua carteira inteira. Use com cuidado: mensagem repetida cansa quem já respondeu.",
  },
  {
    valor: "compradores",
    titulo: "Compradores deste imóvel",
    descricao:
      "Quem já fechou no imóvel escolhido. Para avisar avanço da obra, vistoria e entrega das chaves — nunca para vender de novo.",
  },
  {
    valor: "selecionados",
    titulo: "Escolher um por um",
    descricao: "Você marca exatamente quem recebe — busque pelo nome e monte a lista.",
  },
];

/** Minúsculas e sem acento, para a busca achar "João" digitando "joao". */
function chaveBusca(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function horarioDeBrasiliaParaIso(valor: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) return null;
  const data = new Date(`${valor}:00-03:00`);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}

function horarioEstaNaJanelaSegura(valor: string): boolean {
  const iso = horarioDeBrasiliaParaIso(valor);
  if (!iso) return false;
  const hora = Number(valor.slice(11, 13));
  const domingo = new Date(iso).getUTCDay() === 0;
  return !domingo && hora >= 9 && hora <= 20;
}

const MENSAGEM_PADRAO =
  "Olá, {nome}! Tudo bem? Lembrei do seu interesse e acabou de sair uma condição nova no {imovel}, em {bairro}. Quer que eu te mande os detalhes?";

const CONVITE_COM_HORARIOS = " Se quiser conhecer pessoalmente, tenho {horarios}. Qual fica melhor?";

/** Variáveis que só existem quando há imóvel escolhido. */
const DO_IMOVEL = new Set(["imovel", "bairro", "cidade", "a_partir_de", "dormitorios", "link"]);

export type InicialDaLista = {
  imovelSlug?: string;
  leadIds: string[];
  publico?: FiltroLeadsCampanha;
  /** Quem é o público em palavras, vindo de uma lista sugerida. */
  descricaoDoPublico?: string;
  /** Lista reaberta para repetir, ou rascunho para continuar (0155). */
  reabrir?: ListaParaReabrir & { modo: "repetir" | "rascunho" };
};

export function NovaCampanha({
  empreendimentos,
  aoCriar,
  inicial,
  modelos,
  temAgenda,
  numeroConectado,
  corretor,
}: {
  empreendimentos: Empreendimento[];
  aoCriar: (campanha: CampanhaListada, aviso: string) => void;
  inicial?: InicialDaLista;
  /** Modelos de mensagem do corretor (templates_mensagens). */
  modelos: TemplateMensagem[];
  /** Há horários de visita na agenda? Sem isso `{horarios}` não tem o que oferecer. */
  temAgenda: boolean;
  /** O número do corretor está conectado? Sem isso a lista nasceria parada. */
  numeroConectado: boolean;
  corretor: { nome: string; whatsapp: string };
}) {
  const reabrir = inicial?.reabrir;
  const veioMarcado = (inicial?.leadIds.length ?? 0) > 0 || (reabrir?.leadIds.length ?? 0) > 0;
  const [passo, setPasso] = useState<1 | 2 | 3>(reabrir ? 2 : 1);
  const [publico, setPublico] = useState<FiltroLeadsCampanha>(
    reabrir?.filtro ?? inicial?.publico ?? (veioMarcado ? "selecionados" : "parados_15d"),
  );
  const slugInicial = reabrir ? reabrir.imovelSlug : inicial?.imovelSlug;
  const [imovelSlug, setImovelSlug] = useState(
    (slugInicial && empreendimentos.some((e) => e.slug === slugInicial) ? slugInicial : undefined) ??
      (reabrir ? "" : (empreendimentos[0]?.slug ?? "")),
  );
  const [mensagemBase, setMensagemBase] = useState(reabrir?.mensagemBase || MENSAGEM_PADRAO);
  const [mensagemB, setMensagemB] = useState(reabrir?.mensagemBaseB ?? "");
  const [testandoDuas, setTestandoDuas] = useState(Boolean(reabrir?.mensagemBaseB));
  const [titulo, setTitulo] = useState(reabrir?.modo === "rascunho" ? reabrir.titulo : "");
  const [modoEnvio, setModoEnvio] = useState<"automatico" | "agendado">("automatico");
  const [agendarPara, setAgendarPara] = useState("");
  const [exemplos, setExemplos] = useState<string[]>([]);
  const [exemploB, setExemploB] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [sugerindo, setSugerindo] = useState(false);
  const [criando, iniciarCriacao] = useTransition();
  const [salvandoRascunho, iniciarRascunho] = useTransition();
  const [midias, setMidias] = useState<string[]>(reabrir?.midias ?? []);
  const [viva, setViva] = useState(reabrir?.viva ?? false);
  const [templateId, setTemplateId] = useState<string | null>(reabrir?.templateId ?? null);
  const [rascunhoId, setRascunhoId] = useState<string | null>(
    reabrir?.modo === "rascunho" ? reabrir.id : null,
  );
  const { avisar, falhar } = useAvisos();

  // ---- Seleção manual ("Escolher um por um") -------------------------
  const [carteira, setCarteira] = useState<LeadElegivel[] | null>(null);
  const [buscaLead, setBuscaLead] = useState("");
  const [etapaLead, setEtapaLead] = useState<EtapaFunil | "todas">("todas");
  const [escolhidos, setEscolhidos] = useState<Set<string>>(
    new Set(reabrir?.leadIds.length ? reabrir.leadIds : (inicial?.leadIds ?? [])),
  );
  const [previaPublico, setPreviaPublico] = useState<
    (PreviaPublicoCampanha & { chave: string; erro?: boolean }) | null
  >(null);

  /*
   * Recorte por origem (Fase 3): canal e anúncio de onde o lead veio. Só
   * oferece o que existe na carteira. Não vale para a escolha a dedo.
   */
  const [opcoesOrigem, setOpcoesOrigem] = useState<OpcoesDeRecorte | null>(null);
  const [canal, setCanal] = useState<Canal | "">((reabrir?.recorte?.canal as Canal | undefined) ?? "");
  const [anuncio, setAnuncio] = useState(reabrir?.recorte?.anuncio ?? "");
  const recorte: RecorteDeOrigem | null =
    publico === "selecionados" || (!canal && !anuncio) ? null : { canal: canal || null, anuncio: anuncio || null };
  const chavePrevia = `${publico}|${publico === "compradores" ? imovelSlug : ""}|${recorte?.canal ?? ""}|${recorte?.anuncio ?? ""}`;

  useEffect(() => {
    let vivo = true;
    listarOpcoesDeOrigem()
      .then((o) => {
        if (vivo) setOpcoesOrigem(o);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    const filtroDaVez: RecorteDeOrigem | null =
      publico === "selecionados" || (!canal && !anuncio) ? null : { canal: canal || null, anuncio: anuncio || null };
    preverPublicoCampanha(publico, publico === "compradores" ? imovelSlug : null, filtroDaVez)
      .then((previa) => {
        if (vivo) setPreviaPublico({ ...previa, chave: chavePrevia });
      })
      .catch(() => {
        if (vivo) {
          setPreviaPublico({ total: 0, protegidos: 0, chave: chavePrevia, erro: true });
        }
      });
    return () => {
      vivo = false;
    };
  }, [publico, imovelSlug, canal, anuncio, chavePrevia]);

  useEffect(() => {
    if (publico !== "selecionados" || carteira !== null) return;
    let vivo = true;
    listarLeadsElegiveis("selecionados").then((leads) => {
      if (vivo) setCarteira(leads);
    });
    return () => {
      vivo = false;
    };
  }, [publico, carteira]);

  const carteiraFiltrada = useMemo(() => {
    if (!carteira) return [];
    const termo = chaveBusca(buscaLead.trim());
    return carteira.filter((lead) => {
      if (etapaLead !== "todas" && lead.etapa !== etapaLead) return false;
      if (!termo) return true;
      return chaveBusca(`${lead.nome} ${lead.telefone}`).includes(termo);
    });
  }, [carteira, buscaLead, etapaLead]);

  const escolhidosDetalhados = useMemo(
    () => carteira?.filter((lead) => escolhidos.has(lead.id)) ?? [],
    [carteira, escolhidos],
  );
  const todosVisiveisEscolhidos =
    carteiraFiltrada.length > 0 &&
    carteiraFiltrada.every((lead) => escolhidos.has(lead.id));

  function alternarLead(id: string) {
    setEscolhidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function alternarVisiveis() {
    setEscolhidos((atual) => {
      const proximo = new Set(atual);
      if (todosVisiveisEscolhidos) {
        carteiraFiltrada.forEach((lead) => proximo.delete(lead.id));
      } else {
        carteiraFiltrada.forEach((lead) => proximo.add(lead.id));
      }
      return proximo;
    });
  }

  const imovel = empreendimentos.find((e) => e.slug === imovelSlug) ?? null;
  const nomeImovel = imovel?.nome ?? "Sem imóvel específico";
  const publicoEscolhido = PUBLICOS.find((p) => p.valor === publico)!;
  const selecaoManual = publico === "selecionados";
  const leadIds = selecaoManual ? [...escolhidos] : undefined;
  const previaAtual = previaPublico?.chave === chavePrevia ? previaPublico : null;
  const carregandoPublico = previaAtual === null;
  const totalPrevisto = selecaoManual
    ? escolhidos.size
    : previaAtual?.erro
      ? undefined
      : previaAtual?.total;
  /** No modo manual, o rótulo carrega o número — é o que o corretor confere. */
  const rotuloPublico = selecaoManual
    ? `${escolhidos.size} lead${escolhidos.size === 1 ? "" : "s"} escolhido${escolhidos.size === 1 ? "" : "s"} a dedo`
    : publicoEscolhido.titulo;

  /** Fotos e plantas do imóvel escolhido, para anexar (0155). */
  const midiasDoImovel = useMemo(
    () =>
      imovel
        ? [
            ...imovel.galeria.map((m) => ({ url: m.url, alt: m.alt, tipo: "Foto" })),
            ...imovel.plantas.map((m) => ({ url: m.url, alt: m.alt, tipo: "Planta" })),
          ].slice(0, 16)
        : [],
    [imovel],
  );

  function trocarImovel(slug: string) {
    setImovelSlug(slug);
    // Foto de outro imóvel não pode seguir marcada.
    setMidias([]);
  }

  function alternarMidia(url: string) {
    setMidias((atual) =>
      atual.includes(url) ? atual.filter((u) => u !== url) : atual.length >= 2 ? atual : [...atual, url],
    );
  }

  function inserirVariavel(chave: string) {
    setMensagemBase((m) => `${m.trimEnd()} {${chave}}`);
    setExemplos([]);
  }

  function usarModelo(id: string) {
    const modelo = modelos.find((m) => m.id === id);
    if (!modelo) {
      setTemplateId(null);
      return;
    }
    setMensagemBase(
      preencherTemplate(modelo.conteudo, {
        nomeLead: "{nome}",
        nomeCorretor: corretor.nome,
        telefoneCorretor: corretor.whatsapp,
      }),
    );
    setTemplateId(modelo.id);
    setExemplos([]);
  }

  async function salvarComoModelo() {
    const nome = prompt("Nome do modelo (só para você achar depois):", titulo || `Mensagem · ${nomeImovel}`);
    if (!nome) return;
    try {
      const r = await criarTemplate(nome, mensagemBase.replace(/\{nome\}/gi, "{{nome_lead}}"), false);
      if (r.erro) falhar(r.erro);
      else avisar("Modelo salvo. Ele aparece em Modelos de mensagem, com a taxa de resposta de cada lista.");
    } catch (err) {
      falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
    }
  }

  function verExemplos() {
    setGerando(true);
    iniciarCriacao(async () => {
      try {
        const resultado = await gerarPreviewCampanha({
          filtro: publico,
          empreendimentoId: imovel?.id ?? null,
          mensagemBase,
          mensagemBaseB: testandoDuas ? mensagemB : null,
          leadIds,
          imovelSlug: publico === "compradores" ? imovelSlug : null,
          recorte,
        });
        if ("erro" in resultado) {
          falhar(resultado.erro);
          setExemplos([]);
          setExemploB(null);
          return;
        }
        setExemplos(resultado.mensagens);
        setExemploB(resultado.mensagemB);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      } finally {
        setGerando(false);
      }
    });
  }

  async function sugerirComIA() {
    setSugerindo(true);
    try {
      const r = await sugerirAberturas({
        imovel: imovel?.nome ?? "nossos imóveis",
        bairro: imovel?.bairro ?? null,
        cidade: imovel?.cidade ?? null,
        estagio: imovel ? STATUS_LABEL[imovel.status] : null,
        publico: selecaoManual
          ? (inicial?.descricaoDoPublico ?? "leads escolhidos pelo corretor")
          : publicoEscolhido.titulo,
      });
      if ("erro" in r) {
        falhar(r.erro);
        return;
      }
      setMensagemBase(r.a);
      setMensagemB(r.b);
      setTestandoDuas(true);
      setTemplateId(null);
      setExemplos([]);
    } catch (err) {
      falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
    } finally {
      setSugerindo(false);
    }
  }

  function parametros(iniciarEm: string | null, nomeLista: string): ParametrosDaLista {
    return {
      titulo: nomeLista,
      empreendimentoId: imovel?.id ?? null,
      filtro: publico,
      mensagemBase,
      mensagemBaseB: testandoDuas ? mensagemB : null,
      leadIds,
      iniciarEm,
      recorte,
      midias,
      viva: viva && !selecaoManual,
      templateId,
      rascunhoId,
    };
  }

  function reiniciar() {
    setPasso(1);
    setPublico("parados_15d");
    setTitulo("");
    setExemplos([]);
    setExemploB(null);
    setEscolhidos(new Set());
    setBuscaLead("");
    setEtapaLead("todas");
    setModoEnvio("automatico");
    setAgendarPara("");
    setMensagemBase(MENSAGEM_PADRAO);
    setMensagemB("");
    setTestandoDuas(false);
    setCanal("");
    setAnuncio("");
    setMidias([]);
    setViva(false);
    setTemplateId(null);
    setRascunhoId(null);
  }

  function guardarRascunho() {
    iniciarRascunho(async () => {
      try {
        const r = await salvarRascunho(parametros(null, titulo.trim() || `${rotuloPublico} · ${nomeImovel}`));
        if ("erro" in r) {
          falhar(r.erro);
          return;
        }
        setRascunhoId(r.id);
        avisar("Rascunho salvo. Ele fica no histórico, pronto para continuar.");
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  function disparar() {
    const iniciarEm =
      modoEnvio === "agendado" ? horarioDeBrasiliaParaIso(agendarPara) : null;
    if (modoEnvio === "agendado" && !iniciarEm) {
      falhar("Escolha a data e a hora em que o envio deve começar.");
      return;
    }
    if (modoEnvio === "agendado" && !horarioEstaNaJanelaSegura(agendarPara)) {
      falhar("Escolha um horário entre 9h e 20h59, de segunda a sábado.");
      return;
    }
    // Sem título digitado, o público, o imóvel e a data já descrevem a lista.
    const nomeLista =
      titulo.trim() ||
      `${rotuloPublico} · ${nomeImovel} · ${new Date().toLocaleDateString("pt-BR")}`;
    iniciarCriacao(async () => {
      try {
        const resultado = await criarCampanha(parametros(iniciarEm, nomeLista));

        if ("erro" in resultado) {
          falhar(resultado.erro);
          return;
        }

        aoCriar(
          listaRecemCriada({
            id: resultado.campanhaId,
            titulo: nomeLista,
            empreendimentoNome: imovel?.nome ?? null,
            totalLeads: resultado.totalLeads,
            midias: midias.length,
            viva: viva && !selecaoManual,
          }),
          modoEnvio === "agendado"
            ? `Lista agendada para ${new Date(iniciarEm!).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}, com ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}.`
            : `Lista de transmissão criada para ${resultado.totalLeads} pessoa${resultado.totalLeads === 1 ? "" : "s"}. As mensagens começam a sair sozinhas no próximo horário seguro.`,
        );

        // Volta ao começo para a próxima lista, sem nada da anterior.
        reiniciar();
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  const variaveisDisponiveis = VARIAVEIS_DA_MENSAGEM.filter(
    (v) => (imovel || !DO_IMOVEL.has(v.chave)) && (temAgenda || v.chave !== "horarios"),
  );

  return (
    <section className="cartao p-5 sm:p-6">
      {!numeroConectado && (
        <div className="border-alerta-linha bg-alerta-lavado text-fluid-sm mb-4 flex items-start gap-3 rounded-xl border p-3.5">
          <WifiOff aria-hidden className="text-alerta mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-corpo min-w-0">
            Seu WhatsApp não está conectado, então nenhuma lista consegue sair. Você pode montar e
            salvar como rascunho.{" "}
            <Link href="/corretor/whatsapp" className="text-titulo font-semibold underline underline-offset-2">
              Conectar o número
            </Link>
          </p>
        </div>
      )}

      {reabrir && (
        <p className="text-fluid-xs text-apoio mb-3">
          {reabrir.modo === "repetir"
            ? `Repetindo “${reabrir.titulo}”. O público é recalculado agora: quem recebeu nos últimos 7 dias fica de fora.`
            : `Continuando o rascunho “${reabrir.titulo}”.`}
        </p>
      )}

      <div className="flex items-baseline gap-2.5">
        <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase tabular-nums">
          Passo {passo} de 3
        </span>
        <h2 className="font-display text-titulo text-lg">
          {passo === 1 && "Quem vai receber?"}
          {passo === 2 && "O que você quer dizer?"}
          {passo === 3 && "Tudo certo?"}
        </h2>
      </div>

      {/* ------------------------------------------------ 1. quem recebe */}
      {passo === 1 && (
        <div className="mt-4 space-y-3">
          {PUBLICOS.map((opcao) => (
            <button
              key={opcao.valor}
              type="button"
              onClick={() => setPublico(opcao.valor)}
              aria-pressed={publico === opcao.valor}
              className={`w-full cursor-pointer rounded-xl border p-4 text-left transition-colors ${
                publico === opcao.valor
                  ? "border-acento-linha bg-acento-lavado"
                  : "border-linha hover:border-linha-forte"
              }`}
            >
              <p className="text-fluid-sm text-titulo font-medium">{opcao.titulo}</p>
              <p className="text-fluid-xs text-apoio mt-1 leading-snug">
                {opcao.descricao}
              </p>
            </button>
          ))}

          {!selecaoManual && opcoesOrigem && (opcoesOrigem.canais.length > 1 || opcoesOrigem.anuncios.length > 0) && (
            <div className="border-linha flex flex-col gap-2 rounded-2xl border p-3 sm:flex-row sm:p-4">
              <label className="min-w-0 flex-1">
                <span className="text-fluid-xs text-apoio mb-1 block">De onde o lead veio</span>
                <select
                  value={canal}
                  onChange={(e) => setCanal(e.target.value as Canal | "")}
                  className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none"
                >
                  <option value="">Qualquer origem</option>
                  {opcoesOrigem.canais.map((c) => (
                    <option key={c.canal} value={c.canal}>
                      {c.rotulo} ({c.total})
                    </option>
                  ))}
                </select>
              </label>
              {opcoesOrigem.anuncios.length > 0 && (
                <label className="min-w-0 flex-1">
                  <span className="text-fluid-xs text-apoio mb-1 block">Anúncio</span>
                  <select
                    value={anuncio}
                    onChange={(e) => setAnuncio(e.target.value)}
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none"
                  >
                    <option value="">Qualquer anúncio</option>
                    {opcoesOrigem.anuncios.map((a) => (
                      <option key={a.nome} value={a.nome}>
                        {a.nome} ({a.total})
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="border-linha bg-elevado flex items-start gap-3 rounded-2xl border p-4 shadow-sm">
            <span className="bg-acento-lavado text-acento-suave flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
              <UsersRound aria-hidden className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p aria-live="polite" className="text-fluid-sm text-titulo font-semibold">
                {carregandoPublico
                  ? "Conferindo o público…"
                  : totalPrevisto === undefined
                    ? "Não foi possível contar agora"
                    : `${totalPrevisto} pessoa${totalPrevisto === 1 ? "" : "s"} receberá${totalPrevisto === 1 ? "" : "ão"}`}
              </p>
              <p className="text-fluid-xs text-apoio mt-0.5 leading-relaxed">
                {previaAtual && previaAtual.protegidos > 0
                  ? `${previaAtual.protegidos} contato${previaAtual.protegidos === 1 ? "" : "s"} protegido${previaAtual.protegidos === 1 ? "" : "s"}: ${previaAtual.protegidos === 1 ? "já recebeu lista nos últimos 7 dias ou está em outra lista" : "já receberam lista nos últimos 7 dias ou estão em outra lista"}.`
                  : "Só leads da sua carteira. A contagem é conferida de novo antes de criar a lista."}
              </p>
            </div>
          </div>

          {selecaoManual && (
            <div className="border-acento-linha bg-acento-lavado rounded-2xl border p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">Buscar lead por nome ou telefone</span>
                  <Search
                    aria-hidden
                    className="text-tenue pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2"
                  />
                  <input
                    type="search"
                    value={buscaLead}
                    onChange={(e) => setBuscaLead(e.target.value)}
                    placeholder="Nome ou telefone"
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border pr-10 pl-10 focus:outline-none"
                  />
                  {buscaLead && (
                    <button
                      type="button"
                      onClick={() => setBuscaLead("")}
                      aria-label="Limpar busca"
                      className="text-tenue hover:text-titulo absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </label>

                <label>
                  <span className="sr-only">Filtrar por etapa do funil</span>
                  <select
                    value={etapaLead}
                    onChange={(e) =>
                      setEtapaLead(e.target.value as EtapaFunil | "todas")
                    }
                    className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none sm:w-44"
                  >
                    <option value="todas">Todas as etapas</option>
                    {ETAPAS_FUNIL.filter((etapa) =>
                      carteira?.some((lead) => lead.etapa === etapa),
                    ).map((etapa) => (
                      <option key={etapa} value={etapa}>
                        {ETAPA_LABEL[etapa]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="border-linha mt-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <p aria-live="polite" className="text-fluid-xs text-apoio tabular-nums">
                  {carteiraFiltrada.length} resultado
                  {carteiraFiltrada.length === 1 ? "" : "s"} · {escolhidos.size}{" "}
                  selecionado
                  {escolhidos.size === 1 ? "" : "s"}
                </p>
                {carteiraFiltrada.length > 0 && (
                  <button
                    type="button"
                    onClick={alternarVisiveis}
                    className="text-fluid-xs text-acento-suave hover:text-titulo flex min-h-11 items-center gap-1.5 font-semibold transition-colors"
                  >
                    <CheckCheck aria-hidden className="h-4 w-4" />
                    {todosVisiveisEscolhidos
                      ? "Desmarcar resultados"
                      : "Selecionar resultados"}
                  </button>
                )}
              </div>

              {/* Teto de altura + rolagem própria: a carteira pode ter 100
                  nomes e o passo 1 não pode virar uma página infinita. */}
              <div className="mt-2 max-h-72 space-y-1 overflow-y-auto pr-1">
                {carteira === null && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">
                    Carregando seus leads…
                  </p>
                )}
                {carteira !== null && carteiraFiltrada.length === 0 && (
                  <p className="text-fluid-xs text-apoio px-1 py-3">
                    {carteira.length === 0
                      ? "Nenhum lead com WhatsApp disponível para a lista."
                      : "Ninguém combina com essa busca e etapa."}
                  </p>
                )}
                {carteiraFiltrada.map((lead) => (
                  <label
                    key={lead.id}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                      escolhidos.has(lead.id)
                        ? "border-acento-linha bg-elevado"
                        : "hover:border-linha hover:bg-vidro border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={escolhidos.has(lead.id)}
                      onChange={() => alternarLead(lead.id)}
                      className="accent-acento h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-fluid-sm text-titulo block truncate font-medium">
                        {lead.nome}
                      </span>
                      <span className="text-fluid-xs text-apoio block truncate tabular-nums">
                        {lead.telefone} · {ETAPA_LABEL[lead.etapa]}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {escolhidosDetalhados.length > 0 && (
                <div className="border-linha mt-3 border-t pt-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-fluid-xs text-titulo font-semibold">
                      Quem vai receber
                    </p>
                    <button
                      type="button"
                      onClick={() => setEscolhidos(new Set())}
                      className="text-fluid-xs text-apoio hover:text-perigo min-h-9 transition-colors"
                    >
                      Limpar seleção
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {escolhidosDetalhados.slice(0, 6).map((lead) => (
                      <button
                        key={lead.id}
                        type="button"
                        onClick={() => alternarLead(lead.id)}
                        aria-label={`Remover ${lead.nome} da lista`}
                        className="border-linha bg-elevado text-corpo hover:border-perigo-linha hover:text-perigo flex min-h-9 max-w-full items-center gap-1.5 rounded-full border px-3 text-xs transition-colors"
                      >
                        <span className="min-w-0 truncate">{lead.nome}</span>
                        <X aria-hidden className="h-3.5 w-3.5 shrink-0" />
                      </button>
                    ))}
                    {escolhidosDetalhados.length > 6 && (
                      <span className="bg-vidro text-apoio flex min-h-9 items-center rounded-full px-3 text-xs">
                        +{escolhidosDetalhados.length - 6} pessoas
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <label className="text-fluid-xs text-apoio block" htmlFor="imovel-campanha">
              Sobre qual imóvel?
            </label>
            <select
              id="imovel-campanha"
              value={imovelSlug}
              onChange={(e) => trocarImovel(e.target.value)}
              className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-12 w-full cursor-pointer rounded-xl border px-3.5 focus:outline-none"
            >
              {publico !== "compradores" && <option value="">Nenhum imóvel específico</option>}
              {empreendimentos.map((emp) => (
                <option key={emp.slug} value={emp.slug}>
                  {emp.nome} ({emp.bairro})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- 2. mensagem */}
      {passo === 2 && (
        <div className="mt-4 space-y-3">
          {modelos.length > 0 && (
            <label className="block">
              <span className="text-fluid-xs text-apoio mb-1 block">Partir de um modelo</span>
              <select
                value={templateId ?? ""}
                onChange={(e) => usarModelo(e.target.value)}
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none"
              >
                <option value="">Escrever do zero</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.titulo}
                  </option>
                ))}
              </select>
            </label>
          )}

          <p className="text-fluid-xs text-apoio">
            Escreva como você falaria.{" "}
            {testandoDuas
              ? "Durante o teste de duas versões a IA não reescreve o texto, para a comparação ser justa: cada pessoa recebe a versão como está, com o nome dela."
              : "A IA reescreve cada mensagem com palavras um pouco diferentes — mensagens idênticas em massa é o que faz o WhatsApp bloquear números."}
          </p>
          <textarea
            rows={4}
            value={mensagemBase}
            onChange={(e) => {
              setMensagemBase(e.target.value);
              setExemplos([]);
            }}
            aria-label="Mensagem da lista de transmissão"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border p-3.5 focus:outline-none"
          />

          {/* Variáveis do cadastro em um toque (Fase 2). Só aparecem as que
              têm valor: sem imóvel, nada de {bairro}; sem agenda, nada de
              {horarios}. */}
          <div className="flex flex-wrap gap-1.5" aria-label="Inserir variável na mensagem">
            {variaveisDisponiveis.map((v) => (
              <button
                key={v.chave}
                type="button"
                onClick={() => inserirVariavel(v.chave)}
                title={`Vira ${v.descricao}`}
                className="border-linha bg-elevado text-corpo hover:border-acento-linha min-h-9 rounded-full border px-3 font-mono text-xs transition-colors"
              >
                {`{${v.chave}}`}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={sugerirComIA}
              disabled={sugerindo}
              className="text-fluid-sm border-acento-linha bg-acento-lavado text-titulo hover:border-acento flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
            >
              <Sparkles className="h-4 w-4" />
              {sugerindo ? "Escrevendo duas versões…" : "Sugerir duas aberturas com IA"}
            </button>
            {temAgenda && !/\{horarios\}/i.test(mensagemBase) && (
              <button
                type="button"
                onClick={() => setMensagemBase((m) => `${m.trimEnd()}${CONVITE_COM_HORARIOS}`)}
                className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors"
              >
                <CalendarClock className="h-4 w-4" />
                Convidar com horários da sua agenda
              </button>
            )}
            <button
              type="button"
              onClick={salvarComoModelo}
              className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors"
            >
              <BookmarkPlus className="h-4 w-4" />
              Salvar como modelo
            </button>
          </div>

          {/* Fotos e planta do cadastro do imóvel (Fase 2): saem depois do
              texto, no mesmo contato. Até duas. */}
          {midiasDoImovel.length > 0 && (
            <div className="border-linha rounded-xl border p-3">
              <p className="text-fluid-xs text-titulo flex items-center gap-1.5 font-medium">
                <ImageIcon aria-hidden className="h-4 w-4" />
                Mandar fotos junto (até 2) · {midias.length} escolhida{midias.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {midiasDoImovel.map((m) => {
                  const marcada = midias.includes(m.url);
                  return (
                    <button
                      key={m.url}
                      type="button"
                      onClick={() => alternarMidia(m.url)}
                      aria-pressed={marcada}
                      aria-label={`${m.tipo}: ${m.alt}`}
                      title={`${m.tipo}: ${m.alt}`}
                      className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
                        marcada ? "border-acento" : "border-transparent opacity-80 hover:opacity-100"
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de escolha, sem otimização */}
                      <img src={m.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                      {marcada && (
                        <span className="bg-acento text-sobre-cor absolute top-1 right-1 rounded-full px-1.5 text-[10px] font-bold">
                          {midias.indexOf(m.url) + 1}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={verExemplos}
            disabled={gerando}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {gerando ? "Gerando…" : "Ver como vai ficar"}
          </button>

          {exemplos.length > 0 && (
            <div className="border-acento-linha bg-acento-lavado space-y-2 rounded-xl border p-4">
              {exemplos.map((msg, i) => (
                <p key={i} className="text-fluid-xs text-corpo leading-relaxed break-words">
                  {testandoDuas && i === 0 && <span className="text-tenue">Versão A · </span>}“{msg}”
                </p>
              ))}
              {exemploB && (
                <p className="text-fluid-xs text-corpo leading-relaxed break-words">
                  <span className="text-tenue">Versão B · </span>“{exemploB}”
                </p>
              )}
            </div>
          )}

          {/*
            Testar duas aberturas. Fica atrás de um clique porque o caminho
            normal é uma mensagem só — e porque a comparação só vale a pena
            com lista grande o bastante para dar 30 envios de cada lado.
          */}
          {!testandoDuas ? (
            <button
              type="button"
              onClick={() => setTestandoDuas(true)}
              className="text-fluid-xs text-apoio hover:text-titulo min-h-11 underline underline-offset-2 transition-colors"
            >
              + Testar duas aberturas e ver qual responde mais
            </button>
          ) : (
            <div className="border-linha space-y-2 rounded-xl border p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-fluid-sm text-titulo font-medium">Versão B</p>
                <button
                  type="button"
                  onClick={() => {
                    setTestandoDuas(false);
                    setMensagemB("");
                  }}
                  className="text-fluid-xs text-apoio hover:text-titulo min-h-9 transition-colors"
                >
                  remover
                </button>
              </div>
              <p className="text-fluid-xs text-apoio">
                Metade da lista recebe cada versão, alternadas. Quando cada lado tiver 30 envios e
                uma responder mais, a plataforma passa a mandar SÓ a vencedora para quem ainda não
                recebeu — e o histórico mostra quando trocou.
              </p>
              <textarea
                rows={4}
                value={mensagemB}
                onChange={(e) => setMensagemB(e.target.value)}
                placeholder="Escreva a segunda abertura — mude uma coisa só, senão não dá para saber o que funcionou."
                aria-label="Segunda versão da mensagem"
                className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento placeholder:text-tenue w-full rounded-xl border p-3.5 focus:outline-none"
              />
            </div>
          )}
        </div>
      )}

      {/* -------------------------------------------------- 3. confirmar */}
      {passo === 3 && (
        <div className="mt-4 space-y-4">
          <dl className="text-fluid-sm space-y-2">
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">Para:</dt>
              <dd className="text-titulo">
                {rotuloPublico}
                {totalPrevisto !== undefined && !selecaoManual && ` · ${totalPrevisto} pessoa${totalPrevisto === 1 ? "" : "s"}`}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">Sobre:</dt>
              <dd className="text-titulo">{nomeImovel}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-apoio shrink-0">{testandoDuas ? "Versão A:" : "Diz:"}</dt>
              <dd className="text-corpo min-w-0 break-words">“{mensagemBase}”</dd>
            </div>
            {testandoDuas && mensagemB.trim() && (
              <div className="flex gap-2">
                <dt className="text-apoio shrink-0">Versão B:</dt>
                <dd className="text-corpo min-w-0 break-words">“{mensagemB}”</dd>
              </div>
            )}
            {midias.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-apoio shrink-0">Junto:</dt>
                <dd className="text-titulo">
                  {midias.length} foto{midias.length === 1 ? "" : "s"} do imóvel
                </dd>
              </div>
            )}
          </dl>

          {!selecaoManual && (
            <label
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                viva ? "border-acento-linha bg-acento-lavado" : "border-linha hover:border-linha-forte"
              }`}
            >
              <input
                type="checkbox"
                checked={viva}
                onChange={(e) => setViva(e.target.checked)}
                className="accent-acento mt-1 h-4 w-4"
              />
              <span>
                <span className="text-fluid-sm text-titulo block font-medium">Manter a lista viva por 30 dias</span>
                <span className="text-fluid-xs text-apoio mt-0.5 block">
                  Quem passar a se encaixar em “{publicoEscolhido.titulo}” entra sozinho e recebe a mesma
                  mensagem. As proteções continuam: ninguém recebe duas vezes nem dentro de 7 dias.
                </span>
              </span>
            </label>
          )}

          <fieldset className="border-linha rounded-2xl border p-4">
            <legend className="text-fluid-xs text-apoio px-1">Quando começar?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  modoEnvio === "automatico"
                    ? "border-acento-linha bg-acento-lavado"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                <input
                  type="radio"
                  name="quando-enviar"
                  checked={modoEnvio === "automatico"}
                  onChange={() => setModoEnvio("automatico")}
                  className="accent-acento mt-1 h-4 w-4"
                />
                <span>
                  <span className="text-fluid-sm text-titulo block font-medium">
                    Próximo horário seguro
                  </span>
                  <span className="text-fluid-xs text-apoio mt-0.5 block">
                    A plataforma escolhe e respeita a fila e o seu expediente.
                  </span>
                </span>
              </label>
              <label
                className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  modoEnvio === "agendado"
                    ? "border-acento-linha bg-acento-lavado"
                    : "border-linha hover:border-linha-forte"
                }`}
              >
                <input
                  type="radio"
                  name="quando-enviar"
                  checked={modoEnvio === "agendado"}
                  onChange={() => setModoEnvio("agendado")}
                  className="accent-acento mt-1 h-4 w-4"
                />
                <span>
                  <span className="text-fluid-sm text-titulo flex items-center gap-1.5 font-medium">
                    <CalendarClock aria-hidden className="h-4 w-4" /> Agendar
                  </span>
                  <span className="text-fluid-xs text-apoio mt-0.5 block">
                    Escolha dia e hora de Brasília.
                  </span>
                </span>
              </label>
            </div>

            {modoEnvio === "agendado" && (
              <div className="mt-3">
                <label
                  className="text-fluid-xs text-apoio block"
                  htmlFor="inicio-campanha"
                >
                  Início do envio
                </label>
                <input
                  id="inicio-campanha"
                  type="datetime-local"
                  step="300"
                  value={agendarPara}
                  onChange={(e) => setAgendarPara(e.target.value)}
                  aria-describedby="janela-segura-campanha"
                  className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento mt-1 min-h-12 w-full rounded-xl border px-3.5 focus:outline-none"
                />
                <p
                  id="janela-segura-campanha"
                  className="text-fluid-xs text-apoio mt-1.5"
                >
                  Segunda a sábado, entre 9h e 20h59. A pausa de 35–75 segundos continua
                  valendo.
                </p>
              </div>
            )}
          </fieldset>

          <div className="space-y-1.5">
            <label className="text-fluid-xs text-apoio block" htmlFor="titulo-campanha">
              Nome desta lista (opcional — só para você achar depois)
            </label>
            <input
              id="titulo-campanha"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={`${rotuloPublico} · ${nomeImovel}`}
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-12 w-full rounded-xl border px-3.5 focus:outline-none"
            />
          </div>

          <p className="text-fluid-xs text-apoio flex items-start gap-2">
            <Shield aria-hidden className="text-ok mt-0.5 h-4 w-4 shrink-0" />
            As mensagens saem uma a uma, com 35 a 75 segundos entre elas e só em horário comercial
            — é o que mantém seu número seguro. Quem pedir para sair no meio do caminho não recebe.
          </p>
        </div>
      )}

      {/* Navegação entre os passos, sempre no mesmo lugar. */}
      <div className="border-linha mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        {passo > 1 ? (
          <button
            type="button"
            onClick={() => setPasso((p) => (p === 3 ? 2 : 1))}
            className="text-fluid-sm text-apoio hover:text-titulo flex min-h-11 cursor-pointer items-center gap-1.5 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        ) : (
          <span />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {passo > 1 && (
            <button
              type="button"
              onClick={guardarRascunho}
              disabled={salvandoRascunho}
              className="text-fluid-sm border-linha-forte text-corpo hover:text-titulo flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl border px-4 transition-colors disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {salvandoRascunho ? "Salvando…" : rascunhoId ? "Atualizar rascunho" : "Salvar rascunho"}
            </button>
          )}

          {passo < 3 ? (
            <button
              type="button"
              onClick={() => {
                // No modo manual, seguir sem ninguém marcado geraria uma
                // lista vazia lá no fim — melhor barrar aqui, com contexto.
                if (passo === 1 && selecaoManual && escolhidos.size === 0) {
                  falhar("Marque ao menos um lead antes de continuar.");
                  return;
                }
                if (passo === 1 && !selecaoManual && previaAtual?.total === 0) {
                  falhar("Não há pessoas disponíveis nesse público agora.");
                  return;
                }
                if (passo === 1 && publico === "compradores" && !imovel) {
                  falhar("Escolha o imóvel dos compradores.");
                  return;
                }
                setPasso((p) => (p === 1 ? 2 : 3));
              }}
              className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium transition-colors"
            >
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={disparar}
              disabled={criando || !numeroConectado}
              title={numeroConectado ? undefined : "Conecte seu WhatsApp para enviar"}
              className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-5 font-medium transition-colors disabled:opacity-60"
            >
              <Rocket className="h-4 w-4" />
              {criando ? "Criando…" : "Começar a enviar"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
