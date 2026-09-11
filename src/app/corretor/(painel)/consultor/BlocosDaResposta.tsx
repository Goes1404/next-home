"use client";

import Link from "next/link";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import type {
  CartaoDeImovel,
  DadosDoConsultor,
  SimulacaoNaMensagem,
} from "@/lib/consultor/contrato";

/**
 * O que aparece EMBAIXO do balão do consultor.
 *
 * Cartão de imóvel, quadro de simulação e texto pronto para o cliente. Mora
 * em módulo próprio porque o consultor passou a ter DUAS portas — a tela
 * cheia (`ChatConsultor`) e o balão flutuante (`BalaoConsultor`) — e duas
 * cópias destes blocos divergiriam no primeiro campo novo da simulação.
 *
 * `ChatBase` não conhece nada disto de propósito: ela sabe desenhar balão,
 * composer e chips; o vocabulário do domínio entra por `renderAbaixo`.
 */
export function BlocosDaResposta({ dados }: { dados: DadosDoConsultor | null }) {
  const { avisar, falhar } = useAvisos();

  if (!dados) return null;
  if (dados.tipo === "cartoes") return <Cartoes itens={dados.itens} />;
  if (dados.tipo === "simulacao") return <QuadroDeSimulacao dados={dados} />;
  if (dados.tipo === "texto_cliente") {
    const texto = dados.texto;
    return (
      <TextoParaCliente
        texto={texto}
        onCopiar={async () => {
          try {
            await navigator.clipboard.writeText(texto);
            avisar("Copiado. É só colar na conversa do cliente.");
          } catch {
            falhar("O navegador não deixou copiar. Selecione o texto e copie à mão.");
          }
        }}
      />
    );
  }
  return null;
}

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Os imóveis indicados.
 *
 * Uma coluna no celular e duas a partir de `sm`: o cartão carrega nome,
 * bairro e ficha, e em 320px dois lado a lado truncariam os três. No balão
 * flutuante ele fica sempre em uma coluna — o painel tem 380px, e `sm` é
 * medida da JANELA, não da caixa; por isso o `@container` abaixo, que
 * pergunta à caixa e não à tela.
 */
function Cartoes({ itens }: { itens: CartaoDeImovel[] }) {
  return (
    /*
     * O `@container` fica no PAI: consulta de contêiner não vale para o
     * próprio elemento que a declara, e com as duas classes no mesmo nó a
     * grade de duas colunas simplesmente nunca acenderia — calada, como toda
     * classe que o Tailwind não gera.
     */
    <div className="@container mt-2 min-w-0">
      <ul className="grid gap-2 @sm:grid-cols-2">
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
    </div>
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
    <div className="border-linha bg-elevado @container mt-2 min-w-0 space-y-2 rounded-xl border p-3">
      <p
        className={
          s.fecha
            ? "text-etapa-fechado text-fluid-sm font-semibold"
            : "text-perigo text-fluid-sm font-semibold"
        }
      >
        {s.fecha ? "Fecha" : `Não fecha — faltam ${reais(s.faltam)}`}
      </p>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 @sm:grid-cols-2">
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
