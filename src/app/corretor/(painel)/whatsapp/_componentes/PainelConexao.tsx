"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, QrCode, Smartphone } from "lucide-react";
import type { StatusConexaoWhatsapp } from "@/lib/whatsapp/types";
import {
  conectarWhatsapp,
  desconectarWhatsapp,
  diagnosticarProvedorWhatsapp,
  verificarConexaoWhatsapp,
} from "../acoes";

/**
 * Conectar o número — um assistente de três passos (roadmap F4).
 *
 * Antes isto era um bloco dentro de uma tela de 957 linhas, dividindo espaço
 * com nome da assistente, tom de voz e palavras-chave. Conectar o WhatsApp é
 * a PRIMEIRA coisa que um corretor faz no painel, e uma vez só: merece uma
 * tela própria, com um passo por vez.
 *
 * Os passos: escolher como conectar → receber código/QR → confirmar. O
 * terceiro acontece fora daqui (quem sabe do pareamento é a Evolution), por
 * isso a tela pergunta a cada 5s — sem isso, um pareamento que deu certo
 * continuava mostrando "Aguardando".
 */

type Metodo = "codigo" | "qr";

export function PainelConexao({
  corretorNome,
  whatsappCadastro,
  statusInicial,
  telefoneInicial,
  aoConectar,
}: {
  corretorNome: string;
  whatsappCadastro?: string;
  statusInicial: StatusConexaoWhatsapp;
  telefoneInicial: string | null;
  /** Avisa a casca para liberar as outras abas assim que o número entra no ar. */
  aoConectar?: (conectado: boolean) => void;
}) {
  const [status, setStatus] = useState<StatusConexaoWhatsapp>(statusInicial);
  const [telefone, setTelefone] = useState<string | null>(telefoneInicial);
  const [metodo, setMetodo] = useState<Metodo | null>(null);
  const [telefoneParaParear, setTelefoneParaParear] = useState(whatsappCadastro ?? "");
  const [codigoPareamento, setCodigoPareamento] = useState<string | null>(null);
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  /**
   * Pareamento. Sem telefone, vem o QR de sempre; com telefone, vem o código
   * de 8 caracteres para digitar no próprio celular — o caminho de quem abre
   * o painel PELO celular e não tem uma segunda tela para apontar a câmera.
   */
  async function parear(porCodigo: boolean) {
    if (porCodigo && !telefoneParaParear.trim()) {
      setErro("Digite o número do WhatsApp que você quer conectar.");
      return;
    }

    setConectando(true);
    setErro(null);
    setCodigoPareamento(null);
    setQrCodeBase64(null);

    const resultado = await conectarWhatsapp(porCodigo ? telefoneParaParear : undefined);
    setConectando(false);

    if (resultado.erro) {
      setErro(resultado.erro);
      setStatus("desconectado");
      return;
    }

    setQrCodeBase64(resultado.qrcodeBase64 ?? null);
    setCodigoPareamento(resultado.codigoPareamento ?? null);
    setStatus(resultado.jaConectado ? "conectado" : "conectando");

    /*
     * Um pedido que volta sem nada para mostrar PRECISA dizer isso. Esta é a
     * falha que o corretor relatou: o campo do telefone simplesmente
     * reaparecia vazio — sem código, sem QR e sem erro.
     */
    if (resultado.desfecho === "ja_conectado") {
      setErro(
        "Este número já está conectado. Para parear outro aparelho, use Desconectar primeiro — a IA para de responder até o novo pareamento terminar.",
      );
      return;
    }
    if (resultado.desfecho === "sem_codigo") {
      setErro(
        porCodigo
          ? "O provedor não devolveu o código desta vez. Tente de novo em alguns segundos ou conecte pelo QR Code."
          : "O provedor não devolveu o QR Code desta vez. Tente de novo em alguns segundos.",
      );
    }
  }

  const confirmarConexao = useCallback(async () => {
    const estado = await verificarConexaoWhatsapp();
    if (!estado.conectado) return false;

    setStatus("conectado");
    setTelefone(estado.telefone ?? null);
    setCodigoPareamento(null);
    setQrCodeBase64(null);
    setMetodo(null);
    setFeedback("Número conectado! Sua IA já pode atender.");
    aoConectar?.(true);
    return true;
  }, [aoConectar]);

  const aguardando = Boolean(codigoPareamento || qrCodeBase64);
  const tentativasRef = useRef(0);

  useEffect(() => {
    if (!aguardando) {
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
  }, [aguardando, confirmarConexao]);

  /**
   * Desconecta DE VERDADE. A versão anterior só mexia no estado local e
   * dizia "Instância desconectada": o número seguia pareado no provedor.
   */
  async function desconectar() {
    if (!confirm("Desconectar este número? A IA para de responder até você conectar de novo.")) {
      return;
    }

    setDesconectando(true);
    setErro(null);
    const resultado = await desconectarWhatsapp();
    setDesconectando(false);

    if (resultado.erro) {
      setErro(resultado.erro);
      return;
    }

    setStatus("desconectado");
    setTelefone(null);
    setCodigoPareamento(null);
    setQrCodeBase64(null);
    setMetodo(null);
    setFeedback(resultado.ok ?? "Número desconectado.");
    aoConectar?.(false);
  }

  // ---------------------------------------------------------------- conectado
  if (status === "conectado") {
    return (
      <div className="space-y-4">
        <div className="border-ok-linha bg-ok-lavado rounded-2xl border p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="bg-ok/15 text-ok flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
                <Check className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-fluid-sm text-titulo font-medium">Seu WhatsApp está no ar</p>
                <p className="text-fluid-xs text-apoio">
                  {telefone ? `Número ${telefone}` : "Número conectado"} · atendendo como{" "}
                  {corretorNome}
                </p>
              </div>
            </div>
            <button
              onClick={desconectar}
              disabled={desconectando}
              className="text-fluid-sm border-linha-forte text-corpo hover:border-perigo-linha hover:text-perigo flex min-h-11 cursor-pointer items-center rounded-xl border px-4 transition-colors disabled:opacity-60"
            >
              {desconectando ? "Desconectando…" : "Desconectar"}
            </button>
          </div>
        </div>

        {/* TEMPORÁRIO — diagnóstico de 27/08/2026: o provedor confirmava
            envio sem entregar. O botão manda uma mensagem de teste PARA O
            PRÓPRIO número e grava a resposta crua do provedor. Remover
            junto com `diagnosticarProvedorWhatsapp` e `lib/whatsapp/sonda.ts`
            quando a causa aparecer. */}
        <button
          onClick={async () => {
            setErro(null);
            setFeedback("Perguntando ao provedor…");
            const r = await diagnosticarProvedorWhatsapp();
            if (r.erro) {
              setFeedback(null);
              setErro(r.erro);
              return;
            }
            setFeedback(r.ok ?? null);
          }}
          className="text-fluid-xs border-linha-forte text-apoio hover:text-titulo min-h-11 cursor-pointer rounded-xl border px-4 transition-colors"
        >
          Testar envio para o meu número
        </button>

        {feedback && (
          <p className="text-fluid-xs text-ok border-ok-linha bg-ok-lavado rounded-xl border px-4 py-3">
            {feedback}
          </p>
        )}
        {erro && (
          <p role="alert" className="text-fluid-xs text-alerta border-alerta-linha bg-alerta-lavado rounded-xl border px-4 py-3">
            {erro}
          </p>
        )}
      </div>
    );
  }

  // ------------------------------------------------- passo 2: código ou QR
  if (codigoPareamento || qrCodeBase64) {
    return (
      <div className="space-y-4">
        <PassoAtual numero={2} total={3} titulo="Agora é no seu celular" />

        <div className="border-acento-linha bg-superficie rounded-2xl border p-5 text-center sm:p-6">
          {codigoPareamento && (
            <>
              <p className="font-mono text-acento-suave text-3xl font-bold tracking-[0.25em]">
                {codigoPareamento}
              </p>
              <ol className="text-fluid-xs text-apoio mx-auto mt-4 max-w-xs space-y-1.5 text-left">
                <li>1. Abra o WhatsApp no celular deste número.</li>
                <li>2. Vá em Aparelhos conectados → Conectar aparelho.</li>
                <li>
                  3. Toque em <strong className="text-corpo">Conectar com número de telefone</strong>.
                </li>
                <li>4. Digite o código acima.</li>
              </ol>
              <p className="text-tenue mt-3 text-[11px]">
                O código expira em poucos minutos — se falhar, gere outro.
              </p>
            </>
          )}

          {qrCodeBase64 && !codigoPareamento && (
            <>
              <p className="text-fluid-xs text-apoio mb-3">
                WhatsApp no celular → Aparelhos conectados → Conectar um aparelho.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- data URI vinda do provedor, sem otimização possível. */}
              <img
                src={
                  qrCodeBase64.startsWith("data:")
                    ? qrCodeBase64
                    : `data:image/png;base64,${qrCodeBase64}`
                }
                alt="QR Code para conectar o WhatsApp"
                className="mx-auto h-48 w-48 rounded-2xl bg-white p-3 shadow-2xl"
              />
            </>
          )}

          <p className="text-fluid-xs text-apoio mt-5 animate-pulse">
            Esperando você confirmar no celular…
          </p>
        </div>

        <button
          onClick={() => {
            setCodigoPareamento(null);
            setQrCodeBase64(null);
            setMetodo(null);
            setErro(null);
          }}
          className="text-fluid-sm text-apoio hover:text-titulo min-h-11 cursor-pointer transition-colors"
        >
          ← Começar de novo
        </button>
      </div>
    );
  }

  // ------------------------------------------- passo 1: escolher o caminho
  return (
    <div className="space-y-4">
      <PassoAtual numero={1} total={3} titulo="Como você quer conectar?" />

      <div className="grid gap-3 sm:grid-cols-2">
        <BotaoMetodo
          ativo={metodo === "codigo"}
          onClick={() => {
            setMetodo("codigo");
            setErro(null);
          }}
          icone={<Smartphone className="h-5 w-5" />}
          titulo="Pelo próprio celular"
          descricao="Você está no telefone que vai conectar. Recebe um código de 8 letras para digitar."
        />
        <BotaoMetodo
          ativo={metodo === "qr"}
          onClick={() => {
            setMetodo("qr");
            setErro(null);
            parear(false);
          }}
          icone={<QrCode className="h-5 w-5" />}
          titulo="Por outro aparelho"
          descricao="Você está no computador e vai apontar a câmera do celular para um QR Code."
        />
      </div>

      {metodo === "codigo" && (
        <div className="border-linha bg-superficie space-y-2 rounded-2xl border p-4">
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
              className="text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-12 min-w-0 flex-1 rounded-xl border px-3.5 focus:outline-none"
            />
            <button
              onClick={() => parear(true)}
              disabled={conectando}
              className="bg-acento hover:bg-acento-hover text-fluid-sm flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-4 font-medium text-sobre-cor transition-colors disabled:opacity-60"
            >
              {conectando ? "Gerando…" : "Gerar código"}
              {!conectando && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {conectando && metodo === "qr" && (
        <p className="text-fluid-xs text-apoio py-6 text-center">Falando com o provedor…</p>
      )}

      {erro && (
        <div
          role="alert"
          className="border-alerta-linha bg-alerta-lavado rounded-2xl border p-4 text-left"
        >
          <p className="text-fluid-xs text-alerta font-semibold">Não deu para conectar agora</p>
          <p className="text-corpo mt-1 text-[11px] leading-relaxed">{erro}</p>
        </div>
      )}

      {feedback && (
        <p className="text-fluid-xs text-ok border-ok-linha bg-ok-lavado rounded-xl border px-4 py-3">
          {feedback}
        </p>
      )}
    </div>
  );
}

function PassoAtual({ numero, total, titulo }: { numero: number; total: number; titulo: string }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase tabular-nums">
        Passo {numero} de {total}
      </span>
      <h2 className="font-display text-titulo text-lg">{titulo}</h2>
    </div>
  );
}

function BotaoMetodo({
  ativo,
  onClick,
  icone,
  titulo,
  descricao,
}: {
  ativo: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`cursor-pointer rounded-2xl border p-4 text-left transition-colors ${
        ativo ? "border-acento-linha bg-acento-lavado" : "border-linha bg-superficie hover:border-linha-forte"
      }`}
    >
      <span className={ativo ? "text-acento-suave" : "text-apoio"}>{icone}</span>
      <p className="text-fluid-sm text-titulo mt-2 font-medium">{titulo}</p>
      <p className="text-fluid-xs text-apoio mt-1 leading-snug">{descricao}</p>
    </button>
  );
}
