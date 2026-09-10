"use client";

import { useState } from "react";
import Link from "next/link";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type { PerguntaDeChat } from "@/app/corretor/(painel)/_componentes/chatTipos";
import type {
  CartaoDeImovel,
  ConversaDoConsultor,
  SimulacaoNaMensagem,
} from "@/lib/consultor/contrato";
import {
  abrirConversaDoConsultor,
  enviarMensagemDoConsultor,
  excluirConversa,
  type EstadoDoChatConsultor,
} from "./acoes";

/**
 * O consultor imobiliário, em forma de chat.
 *
 * A casca é a mesma do Estúdio (`ChatBase`); o que muda é o que aparece
 * embaixo do balão — cartão de imóvel, quadro de simulação, texto pronto para
 * o cliente. Nenhuma chamada paga sai desta tela: só texto.
 */
export function ChatConsultor({
  conversasIniciais,
  conferidoEm,
  perguntaInicial,
}: {
  conversasIniciais: ConversaDoConsultor[];
  conferidoEm: string;
  /** Veio de outra tela (`?pergunta=`), já no composer e editável. */
  perguntaInicial?: string;
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChatConsultor | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);

  const aplicar = (r: EstadoDoChatConsultor | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => [r.conversa, ...lista.filter((c) => c.id !== r.conversa.id)]);
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await enviarMensagemDoConsultor({
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if (!aplicar(r)) throw new Error("falhou");
    } catch {
      /*
       * Erro de rede não devolve `{erro}`, devolve exceção — sem este ramo a
       * tela destrava MUDA, que é o pior desfecho: parece que deu certo.
       */
      falhar("Não consegui enviar. Confira a conexão e tente de novo.");
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Copiado. É só colar na conversa do cliente.");
    } catch {
      falhar("O navegador não deixou copiar. Selecione o texto e copie à mão.");
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <ListaDeConversas
        conversas={conversas}
        ativa={estado?.conversa.id ?? null}
        onAbrir={(id) => void abrirConversaDoConsultor(id).then(aplicar)}
        onNova={() => setEstado(null)}
        onExcluir={async (id) => {
          const r = await excluirConversa(id);
          if ("erro" in r) {
            falhar(r.erro);
            return;
          }
          setConversas((l) => l.filter((c) => c.id !== id));
          if (estado?.conversa.id === id) setEstado(null);
        }}
      />

      <div className="min-w-0 space-y-2">
        <ChatBase
          mensagens={estado?.mensagens ?? []}
          pendente={pendente}
          pensando={pensando}
          placeholder="Ex.: renda de 8 mil, quer 2 dorm em Barueri — o que serve?"
          vazio={
            <>
              <p className="text-titulo font-medium">Pergunte como perguntaria a um gerente experiente.</p>
              <p className="mt-1">
                Ele conhece os imóveis publicados, as regras de crédito (conferidas em {conferidoEm})
                e o que já funcionou nas conversas desta casa.
              </p>
            </>
          }
          textoInicial={perguntaInicial}
          onEnviar={(t) => enviar(t)}
          onEscolher={(p: PerguntaDeChat, escolha) =>
            enviar(escolha, { perguntaId: p.id, pergunta: p.texto })
          }
          renderAbaixo={(m) => {
            const d = m.dados;
            if (!d) return null;
            if (d.tipo === "cartoes") return <Cartoes itens={d.itens} />;
            if (d.tipo === "simulacao") return <QuadroDeSimulacao dados={d} />;
            if (d.tipo === "texto_cliente") {
              return <TextoParaCliente texto={d.texto} onCopiar={() => void copiar(d.texto)} />;
            }
            return null;
          }}
        />
        <p className="text-tenue px-1 text-right text-[11px]">
          Estimativas, não proposta oficial · conversar não gasta geração
        </p>
      </div>
    </div>
  );
}

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Os imóveis indicados.
 *
 * Uma coluna no celular e duas a partir de `sm`: o cartão carrega nome,
 * bairro e ficha, e em 320px dois lado a lado truncariam os três.
 */
function Cartoes({ itens }: { itens: CartaoDeImovel[] }) {
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {itens.map((c) => (
        <li key={c.slug} className="border-linha bg-elevado min-w-0 overflow-hidden rounded-xl border">
          <Link
            href={`/corretor/imoveis/${c.slug}`}
            className="hover:bg-fundo/60 flex min-h-11 flex-col gap-1 p-2.5 transition-colors"
          >
            {c.capaUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.capaUrl}
                alt={`Foto do ${c.nome}`}
                className="border-linha mb-1 h-24 w-full rounded-lg border object-cover"
              />
            )}
            <span className="text-corpo text-fluid-sm font-medium">{c.nome}</span>
            <span className="text-apoio text-xs">
              {c.bairro}, {c.cidade} · {c.situacao}
            </span>
            <span className="text-tenue text-xs">{c.resumoFicha}</span>
            <span className="text-acento-suave mt-0.5 text-xs font-medium">
              {c.precoAPartir ? `A partir de ${reais(c.precoAPartir)}` : "Sem piso cadastrado"}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * O quadro da simulação.
 *
 * As premissas NUNCA ficam atrás de um clique: estimativa sem premissa
 * visível é número que ninguém pode conferir — e este número vai para o
 * cliente.
 */
function QuadroDeSimulacao({ dados }: { dados: SimulacaoNaMensagem }) {
  const s = dados.resultado;
  const linhas: [string, string][] = [
    ["Faixa", s.faixa ?? "Fora do MCMV (SBPE)"],
    ["Taxa", `${(s.taxaAnual * 100).toFixed(2)}% a.a.`],
    ["Prazo", `${s.prazoMeses} meses`],
    ["Subsídio", s.subsidio > 0 ? reais(s.subsidio) : "Sem subsídio"],
    ["Recursos próprios", reais(s.recursosProprios)],
    ["Parcela máxima pela renda", reais(s.parcelaMaxima)],
    ["Parcela estimada", s.fecha ? reais(s.parcelaEstimada) : "—"],
    ["ITBI estimado", reais(s.itbi)],
  ];

  return (
    <div className="border-linha bg-elevado mt-2 min-w-0 space-y-2 rounded-xl border p-3">
      <p
        className={
          s.fecha
            ? "text-etapa-fechado text-fluid-sm font-semibold"
            : "text-perigo text-fluid-sm font-semibold"
        }
      >
        {s.fecha ? "Fecha" : `Não fecha — faltam ${reais(s.faltam)}`}
      </p>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="flex min-w-0 justify-between gap-2 text-xs">
            <dt className="text-apoio min-w-0 truncate">{rotulo}</dt>
            <dd className="text-corpo shrink-0 font-medium">{valor}</dd>
          </div>
        ))}
      </dl>

      {s.avisos.length > 0 && (
        <ul className="text-alerta space-y-1 text-xs">
          {s.avisos.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      )}

      <div className="border-linha border-t pt-2">
        <p className="text-tenue text-[11px] font-medium tracking-wide uppercase">O que a conta assume</p>
        <ul className="text-tenue mt-1 space-y-0.5 text-[11px]">
          {s.premissas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A resposta no tom de WhatsApp, pronta para colar. */
function TextoParaCliente({ texto, onCopiar }: { texto: string; onCopiar: () => void }) {
  return (
    <div className="border-linha bg-fundo mt-2 min-w-0 space-y-2 rounded-xl border p-3">
      <p className="text-corpo text-fluid-sm break-words whitespace-pre-line">{texto}</p>
      <button
        type="button"
        onClick={onCopiar}
        className="border-acento-linha bg-acento-lavado text-acento-suave hover:bg-acento hover:text-sobre-cor min-h-11 w-full cursor-pointer rounded-full border px-4 text-sm font-medium transition-colors sm:w-auto"
      >
        Copiar pro cliente
      </button>
    </div>
  );
}
