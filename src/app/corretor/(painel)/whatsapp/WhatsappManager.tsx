"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModoBotWhatsapp, StatusConexaoWhatsapp, TomVozBot } from "@/lib/whatsapp/types";
import {
  conectarWhatsapp,
  desconectarWhatsapp,
  salvarConfiguracaoWhatsapp,
  testarAgenteIA,
  verificarConexaoWhatsapp,
} from "./acoes";
import { CatalogoDoCorretor } from "./CatalogoDoCorretor";
import { Smartphone, ClipboardList, TestTube, Bot, Moon, Ruler, Lightbulb, Calendar, AlertTriangle, Check, ArrowRight, Timer, BellOff } from 'lucide-react';
import { EXPEDIENTE, MINUTOS_COPILOTO } from "@/lib/whatsapp/modoBot";

/**
 * As quatro opções de quando a IA fala, com a descrição do comportamento
 * real — os números vêm de `modoBot.ts`, que é quem decide de fato, para o
 * texto não envelhecer separado da regra.
 */
const MODOS: {
  valor: ModoBotWhatsapp;
  titulo: string;
  descricao: string;
  icone: typeof Bot;
}[] = [
  {
    valor: "24_7",
    titulo: "Sempre ativa (24/7)",
    descricao: "Responde qualquer mensagem, a qualquer hora do dia.",
    icone: Bot,
  },
  {
    valor: "noturno_e_fds",
    titulo: "Noturno e fim de semana",
    descricao: `Só fora do expediente: depois das ${EXPEDIENTE.fimHora}h, antes das ${EXPEDIENTE.inicioHora}h e nos fins de semana.`,
    icone: Moon,
  },
  {
    valor: "co_piloto_3min",
    titulo: `Co-piloto (${MINUTOS_COPILOTO} min)`,
    descricao: `Fica quieta enquanto você responde e assume depois de ${MINUTOS_COPILOTO} minutos sem você falar na conversa.`,
    icone: Timer,
  },
  {
    valor: "desativado",
    titulo: "Desligada",
    descricao: "Nunca responde. As mensagens continuam sendo registradas no painel.",
    icone: BellOff,
  },
];

interface Props {
  corretorNome: string;
  /** Catálogo em PDF já cadastrado, que a IA manda quando pedem as opções. */
  catalogo?: { url: string; nome: string } | null;
  /** WhatsApp do cadastro, usado só para pré-preencher o campo de pareamento. */
  whatsappCadastro?: string;
  /** Configuração já gravada, quando a instância existe. */
  configInicial?: {
    nomeAssistente: string;
    tomVoz: TomVozBot;
    modoBot: ModoBotWhatsapp;
    statusConexao: StatusConexaoWhatsapp;
    telefoneConectado: string | null;
    /** Frase que, digitada pelo próprio corretor no chat, "liga" a IA na conversa. */
    palavraChaveAtivacao: string | null;
  } | null;
}

/**
 * O que dizer quando a resposta veio da contingência.
 *
 * Existia uma frase só, culpando a falta de `GEMINI_API_KEY` para qualquer
 * falha. Na prática o que acontecia era timeout — com a chave configurada e
 * funcionando — e o corretor era mandado caçar um problema de configuração
 * inexistente. Cada motivo agora tem a sua frase, e a saída dizia por qual
 * caminho seguir.
 */
function explicarFallback(motivo?: string | null): string {
  /*
   * Estas frases nomeavam o Gemini em TODAS elas — foram escritas quando ele
   * era o único provedor. Hoje a cascata tem quatro, e o texto mandava o
   * corretor investigar a chave do Gemini por uma falha que podia ser de
   * qualquer um deles. Pior: "não há GEMINI_API_KEY" aparecia quando o que
   * de fato acontece é NENHUM provedor ter chave — a diferença entre trocar
   * uma variável e configurar o ambiente do zero.
   *
   * A cascata só cai em contingência quando TODOS falham, e é isso que as
   * frases dizem agora. Um provedor sozinho falhando é invisível aqui de
   * propósito: o próximo da fila atende e o cliente nem percebe.
   */
  switch (motivo) {
    case "timeout":
      return "Todos os provedores de IA passaram do tempo limite e a resposta veio pelo modo de contingência. Costuma ser passageiro — mande a mensagem de novo.";
    case "sem_api_key":
      return "Nenhum provedor de IA tem chave configurada neste ambiente (GROQ_API_KEY, GEMINI_API_KEY, NVIDIA_API_KEY ou OPENAI_API_KEY). A resposta veio pelo modo de contingência.";
    case "http_429":
      return "Todos os provedores de IA disponíveis estão no limite de uso agora — a resposta veio pelo modo de contingência. Configurar mais de um provedor evita isto.";
    case "http_4xx":
      return "Os provedores de IA recusaram a chamada (chave inválida, expirada ou sem permissão) e a resposta veio pelo modo de contingência. Confira as chaves no ambiente.";
    case "http_5xx":
      return "Os provedores de IA estão instáveis agora; a resposta veio pelo modo de contingência. Tente de novo em instantes.";
    case "resposta_vazia":
      return "A IA respondeu vazio e o texto veio pelo modo de contingência. Tente reformular a mensagem.";
    default:
      return "A IA respondeu pelo modo de contingência — este texto não reflete o agente real.";
  }
}

interface MensagemPlayground {
  remetente: "cliente" | "bot";
  texto: string;
  hora: string;
  /** Qual modelo respondeu — o A/B mais barato entre os provedores. */
  modelo?: string | null;
  anexos?: { tipo: string; url: string; titulo: string }[];
}

export function WhatsappManager({ corretorNome, catalogo, whatsappCadastro, configInicial }: Props) {
  const [abaAtiva, setAbaAtiva] = useState<"configuracoes" | "playground">("configuracoes");
  // O status vem do que está gravado na instância, não da existência de um
  // telefone no cadastro — ter WhatsApp no perfil não significa ter um
  // número pareado com o provedor.
  const [statusConexao, setStatusConexao] = useState<StatusConexaoWhatsapp>(
    configInicial?.statusConexao ?? "desconectado",
  );
  const [telefoneConectado, setTelefoneConectado] = useState<string | null>(
    configInicial?.telefoneConectado ?? null,
  );
  const [modoBot, setModoBot] = useState<ModoBotWhatsapp>(configInicial?.modoBot ?? "24_7");
  const [nomeAssistente, setNomeAssistente] = useState(configInicial?.nomeAssistente ?? "Sofia");
  const [tomVoz, setTomVoz] = useState<TomVozBot>(
    configInicial?.tomVoz ?? "consultivo_alto_padrao",
  );
  const [palavraChaveAtivacao, setPalavraChaveAtivacao] = useState(
    configInicial?.palavraChaveAtivacao ?? "",
  );
  const [mostrarQrCode, setMostrarQrCode] = useState(false);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [avisoIa, setAvisoIa] = useState<string | null>(null);

  // Estados do Playground de Teste da IA
  const [mensagensChat, setMensagensChat] = useState<MensagemPlayground[]>([
    {
      remetente: "bot",
      texto: `Olá! Sou a ${nomeAssistente}, assistente pessoal do consultor ${corretorNome} da Next Home em Alphaville. Como posso te ajudar hoje?`,
      hora: "Agora",
    },
  ]);
  const [inputChat, setInputChat] = useState("");
  const [telefoneParaParear, setTelefoneParaParear] = useState(whatsappCadastro ?? "");
  const [codigoPareamento, setCodigoPareamento] = useState<string | null>(null);
  /*
   * `null` = ainda escolhendo. É a correção da causa raiz: antes o painel
   * já abria em "qr" e disparava o QR na hora, o que colocava a instância
   * em `connecting` — estado em que a Evolution IGNORA o número e nunca
   * devolve o código de 8 caracteres. Agora nada é pedido ao provedor até
   * o corretor dizer por qual caminho quer conectar.
   */
  const [modoPareamento, setModoPareamento] = useState<"qr" | "codigo" | null>(null);
  const [desconectando, setDesconectando] = useState(false);
  const [iaDigitando, setIaDigitando] = useState(false);
  // Começa vazio: preencher com um dossiê fictício faria o corretor validar
  // uma leitura que a IA nunca fez.
  const [dossiePlayground, setDossiePlayground] = useState<{
    resumo: string | null;
    temperatura: number | null;
  }>({ resumo: null, temperatura: null });

  /**
   * Pareamento. Sem telefone, vem o QR de sempre; com telefone, vem o
   * código de 8 caracteres para digitar no próprio celular — o caminho de
   * quem abre o painel PELO celular e não tem uma segunda tela para
   * apontar a câmera.
   */
  const parear = async (porCodigo: boolean) => {
    if (porCodigo && !telefoneParaParear.trim()) {
      setErroConexao("Digite o número do WhatsApp que você quer conectar.");
      return;
    }

    setConectando(true);
    setErroConexao(null);
    setCodigoPareamento(null);
    setQrCodeBase64(null);
    setModoPareamento(porCodigo ? "codigo" : "qr");
    setMostrarQrCode(true);

    const resultado = await conectarWhatsapp(porCodigo ? telefoneParaParear : undefined);
    setConectando(false);

    if (resultado.erro) {
      setErroConexao(resultado.erro);
      setStatusConexao("desconectado");
      return;
    }

    setQrCodeBase64(resultado.qrcodeBase64 ?? null);
    setCodigoPareamento(resultado.codigoPareamento ?? null);
    setStatusConexao(resultado.jaConectado ? "conectado" : "conectando");

    /*
     * Um pedido que volta sem nada para mostrar PRECISA dizer isso. Esta é
     * a falha que o corretor relatou: o campo do telefone simplesmente
     * reaparecia vazio — sem código, sem QR e sem erro — e não havia como
     * saber se tinha carregado, quebrado ou dado certo.
     */
    if (resultado.desfecho === "ja_conectado") {
      setErroConexao(
        "Este número já está conectado. Para parear outro aparelho, use Desconectar primeiro — a IA para de responder até o novo pareamento terminar.",
      );
      return;
    }
    if (resultado.desfecho === "sem_codigo") {
      setErroConexao(
        porCodigo
          ? "O provedor não devolveu o código desta vez. Tente de novo em alguns segundos ou conecte pelo QR Code."
          : "O provedor não devolveu o QR Code desta vez. Tente de novo em alguns segundos.",
      );
    }
  };

  /**
   * Pergunta ao servidor, de tempos em tempos, se o pareamento terminou.
   *
   * O pareamento acaba fora da tela: o corretor digita o código no celular
   * e quem sabe disso é a Evolution. Sem esta pergunta o painel ficava em
   * "Aguardando Leitura" para sempre — e um pareamento que funcionou
   * parecia ter falhado.
   */
  const confirmarConexao = useCallback(async () => {
    const estado = await verificarConexaoWhatsapp();
    if (!estado.conectado) return false;

    setStatusConexao("conectado");
    setTelefoneConectado(estado.telefone ?? null);
    setMostrarQrCode(false);
    setQrCodeBase64(null);
    setCodigoPareamento(null);
    setModoPareamento(null);
    setFeedback("Número conectado! Sua IA já pode atender.");
    setTimeout(() => setFeedback(null), 6000);
    return true;
  }, []);

  const painelAberto = mostrarQrCode && (Boolean(codigoPareamento) || Boolean(qrCodeBase64));
  const tentativasRef = useRef(0);

  useEffect(() => {
    if (!painelAberto) {
      tentativasRef.current = 0;
      return;
    }

    // Teto de ~2 min: além disso o código já expirou e insistir só gastaria
    // chamada ao provedor com o corretor longe da tela.
    tentativasRef.current = 0;
    const id = setInterval(async () => {
      tentativasRef.current += 1;
      if (tentativasRef.current > 24) {
        clearInterval(id);
        return;
      }
      if (await confirmarConexao()) clearInterval(id);
    }, 5000);

    return () => clearInterval(id);
  }, [painelAberto, confirmarConexao]);

  /**
   * Desconecta DE VERDADE. A versão anterior só mexia no estado local e
   * dizia "Instância desconectada": o número seguia pareado no provedor, e
   * a única saída real era o celular (WhatsApp → Aparelhos conectados).
   */
  const desconectar = async () => {
    if (!confirm("Desconectar este número? A IA para de responder até você conectar de novo.")) {
      return;
    }

    setDesconectando(true);
    setErroConexao(null);
    const resultado = await desconectarWhatsapp();
    setDesconectando(false);

    if (resultado.erro) {
      setErroConexao(resultado.erro);
      return;
    }

    setStatusConexao("desconectado");
    setTelefoneConectado(null);
    setMostrarQrCode(false);
    setQrCodeBase64(null);
    setCodigoPareamento(null);
    setFeedback(resultado.ok ?? "Número desconectado.");
    setTimeout(() => setFeedback(null), 5000);
  };

  const salvarConfiguracoes = async () => {
    setSalvando(true);
    const resultado = await salvarConfiguracaoWhatsapp({
      nomeAssistente,
      tomVoz,
      modoBot,
      palavraChaveAtivacao,
    });
    setSalvando(false);
    setFeedback(resultado.erro ?? resultado.ok ?? null);
    setTimeout(() => setFeedback(null), 4000);
  };

  /**
   * Chama o MESMO agente que atende o cliente no WhatsApp (Gemini + catálogo
   * real), não uma simulação — é isso que torna o playground um teste de
   * verdade do tom de voz e das recomendações antes de pôr o número no ar.
   */
  const enviarMensagemPlayground = async (textoOpcao?: string) => {
    const texto = textoOpcao || inputChat;
    if (!texto.trim() || iaDigitando) return;

    const historico = mensagensChat.map((m) => ({
      remetente: m.remetente,
      texto: m.texto,
    }));

    setMensagensChat((prev) => [...prev, { remetente: "cliente", texto, hora: "Agora" }]);
    setInputChat("");
    setIaDigitando(true);
    setAvisoIa(null);

    const resposta = await testarAgenteIA(texto, historico);
    setIaDigitando(false);

    if ("erro" in resposta) {
      setAvisoIa(resposta.erro);
      return;
    }

    if (!resposta.iaAtiva) {
      setAvisoIa(explicarFallback(resposta.motivoFalha));
    } else {
      // Uma resposta boa apaga o aviso da anterior: deixá-lo na tela faria
      // parecer que a IA continua quebrada.
      setAvisoIa(null);
    }

    setMensagensChat((prev) => [
      ...prev,
      {
        remetente: "bot",
        texto: resposta.texto,
        hora: "Agora",
        modelo: resposta.modelo,
        anexos: resposta.anexos.length > 0 ? resposta.anexos : undefined,
      },
    ]);

    setDossiePlayground({ resumo: resposta.resumoDossie, temperatura: resposta.score });
  };

  return (
    <div className="space-y-8">
      {/* Navegação entre Abas */}
      <div className="flex items-center gap-2 border-b border-linha pb-4">
        <button
          onClick={() => setAbaAtiva("configuracoes")}
          className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer ${
            abaAtiva === "configuracoes"
              ? "bg-acento text-white shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo hover:bg-vidro-forte"
          }`}
        >
           <Smartphone className="inline-block w-5 h-5 align-text-bottom mr-1" />  Conexão & Configurações
        </button>

        <button
          onClick={() => setAbaAtiva("playground")}
          className={`px-4 py-2 rounded-xl text-fluid-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            abaAtiva === "playground"
              ? "bg-acento text-white shadow-md shadow-acento/20"
              : "bg-vidro text-apoio hover:text-titulo hover:bg-vidro-forte"
          }`}
        >
          <span> <TestTube className="inline-block w-5 h-5 align-text-bottom mr-1" />  Testar Minha IA ao Vivo</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] bg-ok-lavado text-ok border border-ok-linha">
            Playground
          </span>
        </button>
      </div>

      {feedback && (
        <div className="rounded-2xl border border-ok-linha bg-ok-lavado p-4 text-fluid-xs font-semibold text-ok backdrop-blur duration-200">
           <Check className="inline-block w-5 h-5 align-text-bottom mr-1" />  {feedback}
        </div>
      )}

      {avisoIa && (
        <div className="rounded-2xl border border-alerta-linha bg-alerta-lavado p-4 text-fluid-xs font-semibold text-alerta backdrop-blur duration-200">
           <AlertTriangle className="inline-block w-5 h-5 align-text-bottom mr-1" />  {avisoIa}
        </div>
      )}

      {/* ABA 1: Conexão e Regras */}
      {abaAtiva === "configuracoes" && (
        <div className="space-y-8 duration-200">
          {/* Card de Conexão */}
          <div className="rounded-3xl border border-linha bg-superficie p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-linha pb-6">
              <div>
                <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
                  Conexão Individual
                </span>
                <h2 className="text-fluid-lg font-bold text-titulo">
                  WhatsApp do Consultor ({corretorNome})
                </h2>
                <p className="text-fluid-xs text-apoio mt-1">
                  Conecte o seu número pessoal para que sua IA atenda e qualifique leads diretamente no seu WhatsApp.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-fluid-xs font-semibold border ${
                    statusConexao === "conectado"
                      ? "bg-ok-lavado border-ok-linha text-ok"
                      : statusConexao === "conectando"
                      ? "bg-alerta-lavado border-alerta-linha text-alerta animate-pulse"
                      : "bg-perigo-lavado border-perigo-linha text-perigo"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      statusConexao === "conectado"
                        ? "bg-ok"
                        : statusConexao === "conectando"
                        ? "bg-alerta"
                        : "bg-perigo"
                    }`}
                  />
                  {statusConexao === "conectado"
                    ? `Conectado: ${telefoneConectado}`
                    : statusConexao === "conectando"
                    ? "Aguardando Leitura"
                    : "Desconectado"}
                </span>

                {statusConexao === "conectado" ? (
                  <button
                    onClick={desconectar}
                    disabled={desconectando}
                    className="px-4 py-2 rounded-xl bg-perigo-lavado hover:bg-perigo text-perigo hover:text-titulo text-fluid-xs font-semibold transition-colors border border-perigo-linha cursor-pointer disabled:opacity-60"
                  >
                    {desconectando ? "Desconectando…" : "Desconectar"}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      // Abre a escolha, sem pedir nada ao provedor ainda —
                      // ver o comentário de `modoPareamento`.
                      setModoPareamento(null);
                      setCodigoPareamento(null);
                      setQrCodeBase64(null);
                      setErroConexao(null);
                      setMostrarQrCode(true);
                    }}
                    className="px-5 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-semibold transition-all shadow-md cursor-pointer"
                  >
                    Conectar
                  </button>
                )}
              </div>
            </div>

            {mostrarQrCode && (
              <div className="p-6 rounded-2xl border border-acento-linha bg-fundo/90 text-center space-y-4 max-w-md mx-auto">
                {/* Dois caminhos: QR (quando há uma segunda tela) e código
                    digitável (quando o painel está aberto no próprio
                    celular que vai ser conectado — apontar a câmera para si
                    mesmo é impossível). */}
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => {
                      setErroConexao(null);
                      setCodigoPareamento(null);
                      parear(false);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-fluid-xs font-semibold cursor-pointer transition-colors ${
                      modoPareamento === "qr"
                        ? "bg-acento text-white"
                        : "bg-vidro text-apoio hover:text-titulo"
                    }`}
                  >
                    QR Code
                  </button>
                  <button
                    onClick={() => {
                      setErroConexao(null);
                      setQrCodeBase64(null);
                      setModoPareamento("codigo");
                    }}
                    className={`px-3.5 py-2 rounded-xl text-fluid-xs font-semibold cursor-pointer transition-colors ${
                      modoPareamento === "codigo"
                        ? "bg-acento text-white"
                        : "bg-vidro text-apoio hover:text-titulo"
                    }`}
                  >
                    Código no telefone
                  </button>
                </div>

                {/* Nada foi pedido ao provedor ainda: quem escolhe o caminho
                    é o corretor, e cada caminho é montado do jeito certo
                    desde a primeira chamada. */}
                {modoPareamento === null && (
                  <p className="text-fluid-xs text-apoio py-6">
                    Vai conectar por outro aparelho? Use o <strong className="text-corpo">QR Code</strong>.
                    Está no celular que quer conectar? Use o{" "}
                    <strong className="text-corpo">Código no telefone</strong>.
                  </p>
                )}

                {modoPareamento === "qr" ? (
                  <>
                    <h3 className="text-fluid-base font-bold text-titulo">
                      Escaneie o QR Code com seu celular
                    </h3>
                    <p className="text-fluid-xs text-apoio">
                      WhatsApp no celular  <ArrowRight className="inline-block w-5 h-5 align-text-bottom mr-1" />  Aparelhos conectados  <ArrowRight className="inline-block w-5 h-5 align-text-bottom mr-1" />  Conectar um aparelho.
                    </p>
                  </>
                ) : modoPareamento === "codigo" ? (
                  <>
                    <h3 className="text-fluid-base font-bold text-titulo">
                      Conectar pelo número, sem câmera
                    </h3>
                    {!codigoPareamento && (
                      <div className="space-y-2 text-left">
                        <label className="text-fluid-xs text-apoio block" htmlFor="tel-pareamento">
                          Número do WhatsApp que você quer conectar
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="tel-pareamento"
                            type="tel"
                            inputMode="numeric"
                            value={telefoneParaParear}
                            onChange={(e) => setTelefoneParaParear(e.target.value)}
                            placeholder="11 99999-8888"
                            className="text-fluid-sm min-w-0 flex-1 rounded-xl border border-linha-forte bg-campo px-3.5 py-2.5 text-titulo placeholder:text-tenue focus:border-acento focus:outline-none"
                          />
                          <button
                            onClick={() => parear(true)}
                            disabled={conectando}
                            className="shrink-0 px-4 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold cursor-pointer disabled:opacity-60"
                          >
                            Gerar código
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}

                {conectando && (
                  <p className="text-fluid-xs text-apoio py-10">Falando com o provedor…</p>
                )}

                {!conectando && erroConexao && (
                  <div className="rounded-2xl border border-alerta-linha bg-alerta-lavado p-4 text-left">
                    <p className="text-fluid-xs font-semibold text-alerta">
                      Não é possível parear um número agora
                    </p>
                    <p className="text-[11px] text-corpo mt-1 leading-relaxed">{erroConexao}</p>
                  </div>
                )}

                {/* O código só existe se o provedor devolveu — inventar um
                    faria o corretor digitar oito caracteres em vão. */}
                {!conectando && !erroConexao && codigoPareamento && (
                  <div className="space-y-3">
                    <p className="font-mono text-3xl font-bold tracking-[0.25em] text-acento-suave">
                      {codigoPareamento}
                    </p>
                    <ol className="text-fluid-xs text-apoio text-left space-y-1.5 mx-auto max-w-xs">
                      <li>1. Abra o WhatsApp no celular deste número.</li>
                      <li>2. Vá em Aparelhos conectados → Conectar aparelho.</li>
                      <li>3. Toque em <strong className="text-corpo">Conectar com número de telefone</strong>.</li>
                      <li>4. Digite o código acima.</li>
                    </ol>
                    <p className="text-[11px] text-tenue">
                      O código expira em poucos minutos — se falhar, gere outro.
                    </p>
                  </div>
                )}

                {/* Só um QR vindo do provedor conecta de fato — um desenho
                    decorativo faria o corretor apontar o celular para nada. */}
                {!conectando && !erroConexao && qrCodeBase64 && modoPareamento === "qr" && (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI vinda do provedor, sem otimização possível.
                  <img
                    src={qrCodeBase64.startsWith("data:") ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`}
                    alt="QR Code para conectar o WhatsApp"
                    className="mx-auto w-48 h-48 bg-white p-3 rounded-2xl shadow-2xl"
                  />
                )}

                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => {
                      setMostrarQrCode(false);
                      setCodigoPareamento(null);
                      setQrCodeBase64(null);
                      setModoPareamento(null);
                      setErroConexao(null);
                    }}
                    className="px-4 py-2 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo text-fluid-xs font-semibold cursor-pointer"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Configurações da IA */}
          <CatalogoDoCorretor inicial={catalogo ?? null} />

          <div className="rounded-3xl border border-linha bg-superficie p-6 sm:p-8 backdrop-blur shadow-xl space-y-6">
            <div>
              <span className="text-[11px] uppercase font-bold tracking-wider text-acento-suave">
                Regras de Inteligência Artificial
              </span>
              <h2 className="text-fluid-lg font-bold text-titulo">
                Personalização do Agente Conversacional
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
                  Nome da Assistente
                </label>
                <input
                  type="text"
                  value={nomeAssistente}
                  onChange={(e) => setNomeAssistente(e.target.value)}
                  className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
                  Tom de Voz do Atendimento
                </label>
                <select
                  value={tomVoz}
                  onChange={(e) => setTomVoz(e.target.value as TomVozBot)}
                  className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
                >
                  <option value="consultivo_alto_padrao">Consultivo & Alto Padrão</option>
                  <option value="formal_direto">Formal & Direto</option>
                  <option value="descontraido_acolhedor">Descontraído & Acolhedor</option>
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
                Modo de Ativação do Bot
              </label>
              {/*
                Cada opção diz o que FAZ, não só como se chama. Os rótulos
                antes eram só título ("Modo Co-Piloto (3 min)") e nenhum
                descrevia o comportamento — o que era pior porque dois deles
                não tinham comportamento nenhum implementado.
              */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {MODOS.map((opcao) => {
                  const Icone = opcao.icone;
                  const ativo = modoBot === opcao.valor;
                  return (
                    <button
                      key={opcao.valor}
                      type="button"
                      onClick={() => setModoBot(opcao.valor)}
                      aria-pressed={ativo}
                      className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors ${
                        ativo
                          ? "border-acento-linha bg-acento-lavado"
                          : "border-linha bg-campo hover:border-linha-forte"
                      }`}
                    >
                      <Icone
                        aria-hidden
                        className={`mb-1.5 h-5 w-5 ${ativo ? "text-acento-suave" : "text-apoio"}`}
                      />
                      <h4 className="text-fluid-xs text-titulo font-bold">{opcao.titulo}</h4>
                      <p className="text-fluid-xs text-apoio mt-1 leading-snug">{opcao.descricao}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2 border-t border-linha pt-4">
              <label className="text-fluid-xs font-bold text-corpo uppercase tracking-wider block">
                Palavra-chave de Ativação Manual (opcional)
              </label>
              <input
                type="text"
                value={palavraChaveAtivacao}
                onChange={(e) => setPalavraChaveAtivacao(e.target.value)}
                placeholder="ex: pode continuar"
                className="w-full rounded-xl border border-linha-forte bg-campo px-4 py-2.5 text-fluid-sm text-titulo focus:border-acento focus:outline-none"
              />
              <p className="text-fluid-xs text-apoio leading-snug">
                {palavraChaveAtivacao.trim()
                  ? `Com uma palavra-chave cadastrada, a IA fica em silêncio em conversas novas até você digitar "${palavraChaveAtivacao.trim()}" no próprio chat do WhatsApp — aí ela assume, sem o cliente perceber a troca. Deixe em branco para a IA responder normalmente, seguindo só o modo de ativação acima.`
                  : "Deixe em branco para a IA responder normalmente, seguindo só o modo de ativação acima. Se preencher, ela só entra em ação em conversas novas depois que você mesmo digitar esta frase no chat — útil para atender pessoalmente o início e só depois passar a bola."}
              </p>
            </div>

            <div className="border-t border-linha pt-4 flex justify-end">
              <button
                onClick={salvarConfiguracoes}
                disabled={salvando}
                className="px-6 py-2.5 rounded-xl bg-acento hover:bg-acento-hover text-white text-fluid-xs font-bold transition-all cursor-pointer"
              >
                {salvando ? "Salvando..." : "Salvar Configurações"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 2: PLAYGROUND INTERATIVO AO VIVO */}
      {abaAtiva === "playground" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 duration-300">
          {/* Coluna 1 & 2: Chat Interativo Simulado do WhatsApp */}
          <div className="lg:col-span-2 rounded-3xl border border-linha bg-fundo/90 shadow-2xl overflow-hidden flex flex-col h-[600px]">
            {/* Header do WhatsApp */}
            <div className="bg-[#1f2c34] p-4 flex items-center justify-between border-b border-linha">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-acento flex items-center justify-center font-bold text-white text-sm">
                  {nomeAssistente[0]}
                </div>
                <div>
                  <h4 className="text-fluid-sm font-bold text-titulo">{nomeAssistente} (IA)</h4>
                  <p className="text-[11px] text-ok">
                    {iaDigitando ? "digitando..." : "online • assistente oficial"}
                  </p>
                </div>
              </div>

              <button
                onClick={() =>
                  setMensagensChat([
                    {
                      remetente: "bot",
                      texto: `Olá! Sou a ${nomeAssistente}, assistente pessoal do consultor ${corretorNome}. Como posso te ajudar hoje?`,
                      hora: "Agora",
                    },
                  ])
                }
                className="text-[11px] text-apoio hover:text-titulo px-3 py-1.5 rounded-lg bg-vidro cursor-pointer"
              >
                Reiniciar Chat
              </button>
            </div>

            {/* Balões de Conversa */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0b141a]">
              {mensagensChat.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex ${m.remetente === "cliente" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-3.5 space-y-2 text-fluid-xs shadow-md ${
                      m.remetente === "cliente"
                        ? "bg-[#005c4b] text-white rounded-br-none"
                        : "bg-[#202c33] text-titulo rounded-bl-none"
                    }`}
                  >
                    <p className="leading-relaxed whitespace-pre-wrap">{m.texto}</p>

                    {/* Exibição de Anexos / Plantas */}
                    {m.anexos && m.anexos.length > 0 && (
                      <div className="pt-2 space-y-2 border-t border-linha">
                        {m.anexos.map((anexo, i) => (
                          <div
                            key={i}
                            className="p-2.5 rounded-xl bg-black/40 border border-linha flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-base"> <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" /> </span>
                              <div>
                                <span className="font-bold text-titulo block text-[11px]">
                                  {anexo.titulo}
                                </span>
                                <span className="text-[10px] text-apoio">PDF / Planta Oficial</span>
                              </div>
                            </div>
                            <span className="px-2.5 py-1 rounded-lg bg-acento text-white text-[10px] font-bold">
                              Ver Planta
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <span className="text-[9px] text-apoio block text-right">
                      {/* Qual modelo respondeu. Com a cascata, a resposta pode
                          vir do provedor de reserva — e é aqui que se vê. */}
                      {m.modelo ? `${m.modelo} · ${m.hora}` : m.hora}
                    </span>
                  </div>
                </div>
              ))}

              {iaDigitando && (
                <div className="flex justify-start">
                  <div className="bg-[#202c33] text-corpo rounded-2xl px-4 py-2.5 text-fluid-xs animate-pulse">
                    {nomeAssistente} está digitando...
                  </div>
                </div>
              )}
            </div>

            {/* Sugestões Rápidas de Teste */}
            <div className="p-2 bg-[#1f2c34] border-t border-linha flex gap-2 overflow-x-auto scrollbar-none">
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Olá, procuro um apartamento de 3 suítes em Alphaville até 2 milhões",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-vidro hover:bg-vidro-forte text-corpo text-[11px] cursor-pointer"
              >
                 <Lightbulb className="inline-block w-5 h-5 align-text-bottom mr-1" />  &quot;Procuro 3 suítes até 2M&quot;
              </button>
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Pode me enviar a planta do apartamento de 140m² do Canvas Alphaville?",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-vidro hover:bg-vidro-forte text-corpo text-[11px] cursor-pointer"
              >
                 <Ruler className="inline-block w-5 h-5 align-text-bottom mr-1" />  &quot;Me envie a planta do Canvas&quot;
              </button>
              <button
                onClick={() =>
                  enviarMensagemPlayground(
                    "Gostei muito. Gostaria de agendar uma visita para este sábado às 15h.",
                  )
                }
                className="shrink-0 px-3 py-1.5 rounded-lg bg-vidro hover:bg-vidro-forte text-corpo text-[11px] cursor-pointer"
              >
                 <Calendar className="inline-block w-5 h-5 align-text-bottom mr-1" />  &quot;Agendar visita sábado 15h&quot;
              </button>
            </div>

            {/* Input de Mensagem */}
            <div className="p-3 bg-[#1f2c34] flex items-center gap-2">
              <input
                type="text"
                value={inputChat}
                onChange={(e) => setInputChat(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && enviarMensagemPlayground()}
                placeholder="Fingir ser um cliente e digitar mensagem..."
                className="flex-1 rounded-xl bg-[#2a3942] px-4 py-2.5 text-fluid-xs text-white placeholder:text-tenue focus:outline-none"
              />
              <button
                onClick={() => enviarMensagemPlayground()}
                className="p-2.5 rounded-xl bg-acento hover:bg-acento-hover text-white transition-colors cursor-pointer"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Coluna 3: Dossiê de Inteligência Atualizando em Tempo Real */}
          <div className="rounded-3xl border border-linha bg-superficie p-6 backdrop-blur space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-acento-suave">
                  Dossiê ao Vivo (IA)
                </span>
                {dossiePlayground.temperatura !== null && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-ok-lavado text-ok border border-ok-linha">
                    Score {dossiePlayground.temperatura}/100
                  </span>
                )}
              </div>

              <h3 className="text-fluid-base font-bold text-titulo">
                Inteligência Comercial Extraída
              </h3>

              <div className="space-y-3">
                {dossiePlayground.resumo ? (
                  <div className="p-3 rounded-xl bg-campo border border-linha space-y-0.5">
                    <span className="text-[10px] text-tenue uppercase font-bold">
                       <ClipboardList className="inline-block w-5 h-5 align-text-bottom mr-1" />  Resumo do Cliente
                    </span>
                    <p className="text-fluid-xs text-titulo whitespace-pre-line leading-relaxed">
                      {dossiePlayground.resumo}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-tenue leading-relaxed">
                    Mande uma mensagem no chat ao lado para a IA analisar o perfil do cliente e montar o dossiê aqui.
                  </p>
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-acento-lavado border border-acento-linha">
              <span className="text-[10px] text-acento-suave font-bold uppercase block mb-1">
                 <Lightbulb className="inline-block w-5 h-5 align-text-bottom mr-1" />  Por que testar?
              </span>
              <p className="text-[11px] text-corpo leading-relaxed font-light">
                Use este simulador para validar o tom de voz e garantir que a Sofia esteja recomendando exatamente os imóveis corretos antes de colocar o número em produção.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
