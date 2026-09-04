"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { QUALIDADES, TAMANHOS, type EstadoDoTeto, type ImagemGerada } from "@/lib/imagens/imagensTipos";
import type {
  ConversaDoEstudio,
  MensagemDoEstudio,
  PerguntaDoEstudio,
  PropostaDeArte,
} from "@/lib/estudio/contrato";
import {
  abrirConversa,
  enviarMensagemDoEstudio,
  excluirConversaDoEstudio,
  registrarArteGerada,
  type EstadoDoChat,
} from "@/app/corretor/(painel)/estudio/acoes";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";

/**
 * Criar arte, em forma de chat.
 *
 * O corretor escreve o que quer; a IA da casa pergunta o que falta (um chip
 * por vez), propõe o pedido melhorado com a explicação em português, e SÓ gera
 * quando ele toca em "Gerar assim". Ver e corrigir antes de gastar — a regra
 * que a tela antiga já seguia, agora como conversa.
 *
 * ## Quem gasta
 *
 * `POST /api/imagens/gerar`, chamada daqui com a sessão do corretor — a mesma
 * rota da tela antiga. É ela que confere o teto diário, aplica a cláusula
 * anti-invenção e compõe a peça. O chat só grava o vínculo depois
 * (`registrarArteGerada`). Nenhuma outra chamada paga sai desta tela.
 */

export function ChatDeArte({
  conversasIniciais,
  tetoInicial,
  galeriaInicial,
}: {
  conversasIniciais: ConversaDoEstudio[];
  tetoInicial: EstadoDoTeto;
  galeriaInicial: ImagemGerada[];
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChat | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [teto, setTeto] = useState(tetoInicial);
  const [galeria, setGaleria] = useState(galeriaInicial);
  const [, iniciar] = useTransition();

  const restam = Math.max(0, teto.teto - teto.usadasHoje);

  const aplicar = (r: EstadoDoChat | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => {
      const semEla = lista.filter((c) => c.id !== r.conversa.id);
      return [r.conversa, ...semEla];
    });
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await enviarMensagemDoEstudio({
        tipo: "arte",
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if (!aplicar(r)) throw new Error(r && "erro" in r ? r.erro : "falhou");
    } catch (e) {
      if (!(e instanceof Error && e.message)) falhar("Sem conexão. Tente de novo.");
      throw e;
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  const escolher = (pergunta: PerguntaDoEstudio, escolha: string) =>
    enviar(escolha, { perguntaId: pergunta.id, pergunta: pergunta.texto });

  /**
   * "Gerar assim": a única chamada paga. A rota responde 429 com o teto quando
   * o dia acabou — o contador da tela se atualiza com o que ela devolver.
   */
  const gerar = async (m: MensagemDoEstudio) => {
    const p = m.dados as PropostaDeArte;
    if (!estado || gerando) return;
    if (restam <= 0) {
      falhar("Limite de hoje atingido. Volta amanhã — ou apaga uma imagem antiga.");
      return;
    }
    setGerando(m.id);
    try {
      const resp = await fetch("/api/imagens/gerar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modo: "livre",
          prompt: p.promptEn,
          receita: p.receita,
          tamanho: p.tamanho,
          qualidade: p.qualidade,
        }),
      });
      const corpo = (await resp.json().catch(() => null)) as
        | { ok: true; imagem: ImagemGerada; teto: EstadoDoTeto }
        | { erro?: string; teto?: EstadoDoTeto }
        | null;

      if (!resp.ok || !corpo || !("ok" in corpo)) {
        if (corpo?.teto) setTeto(corpo.teto);
        falhar((corpo && "erro" in corpo && corpo.erro) || "Não deu para gerar agora. Tente de novo.");
        return;
      }

      setTeto(corpo.teto);
      setGaleria((g) => [corpo.imagem, ...g]);
      const r = await registrarArteGerada({
        conversaId: estado.conversa.id,
        imagemId: corpo.imagem.id,
        url: corpo.imagem.arteUrl ?? corpo.imagem.url,
      });
      aplicar(r);
      avisar("Imagem pronta.");
    } catch {
      falhar("Sem conexão. A imagem pode ter sido gerada — confira a galeria.");
    } finally {
      setGerando(null);
    }
  };

  const abrir = (id: string) => iniciar(async () => void aplicar(await abrirConversa(id)));
  const nova = () => setEstado(null);
  const excluir = async (id: string) => {
    const r = await excluirConversaDoEstudio(id);
    if (r.erro) return falhar(r.erro);
    setConversas((l) => l.filter((c) => c.id !== id));
    if (estado?.conversa.id === id) setEstado(null);
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <ListaDeConversas
          conversas={conversas}
          ativa={estado?.conversa.id ?? null}
          onAbrir={abrir}
          onNova={nova}
          onExcluir={excluir}
        />

        <div className="space-y-2">
          <ChatBase
            mensagens={estado?.mensagens ?? []}
            pendente={pendente}
            pensando={pensando}
            placeholder='Ex.: "fachada do Eternity ao pôr do sol, para o feed"'
            vazio={
              <>
                <p className="text-titulo font-medium">O que você quer criar?</p>
                <p className="mt-1">
                  Descreve com suas palavras. Eu pergunto o que faltar, mostro como vai ficar, e só gero
                  quando você aprovar.
                </p>
              </>
            }
            onEnviar={enviar}
            onEscolher={escolher}
            renderProposta={(m) => (
              <CartaoDeProposta
                proposta={m.dados as PropostaDeArte}
                gerando={gerando === m.id}
                bloqueada={restam <= 0 || Boolean(gerando)}
                onGerar={() => void gerar(m)}
              />
            )}
            renderResultado={(m) => {
              const url = m.dados?.tipo === "resultado" ? m.dados.url : null;
              return url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt="Arte gerada"
                  className="border-linha mt-2 max-h-80 w-auto max-w-full rounded-xl border"
                />
              ) : null;
            }}
          />
          <p className="text-tenue px-1 text-right text-[11px]">
            {restam > 0 ? `${teto.usadasHoje} de ${teto.teto} imagens hoje` : "Limite de hoje atingido"}
            {" · "}conversar não gasta imagem
          </p>
        </div>
      </div>

      {galeria.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-fluid-sm text-apoio font-medium">Suas últimas imagens</h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {galeria.slice(0, 8).map((img) => (
              <li key={img.id} className="border-linha overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.arteUrl ?? img.url} alt="" className="aspect-square w-full object-cover" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CartaoDeProposta({
  proposta,
  gerando,
  bloqueada,
  onGerar,
}: {
  proposta: PropostaDeArte;
  gerando: boolean;
  bloqueada: boolean;
  onGerar: () => void;
}) {
  const tamanho = TAMANHOS.find((t) => t.chave === proposta.tamanho)?.rotulo ?? proposta.tamanho;
  const qualidade = QUALIDADES.find((q) => q.chave === proposta.qualidade)?.rotulo ?? proposta.qualidade;
  return (
    <div className="border-linha bg-superficie mt-2 space-y-2 rounded-xl border p-3">
      <p className="text-tenue text-[10px] font-medium tracking-[0.14em] uppercase">Como vai ficar</p>
      {/* O prompt em inglês fica visível mas discreto: é o que vai para o
          provedor, e esconder do corretor seria tirar dele a chance de
          corrigir. A explicação em português já veio no balão. */}
      <p className="text-apoio text-xs leading-relaxed">{proposta.promptEn}</p>
      <p className="text-tenue text-[11px]">
        {tamanho} · {qualidade}
        {!proposta.daIa && " · sem melhoria da IA"}
      </p>
      <button
        type="button"
        onClick={onGerar}
        disabled={bloqueada}
        aria-busy={gerando}
        className={cn(
          "bg-acento text-sobre-cor hover:bg-acento-hover min-h-11 w-full cursor-pointer rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {gerando ? "Gerando…" : "Gerar assim"}
      </button>
    </div>
  );
}
