"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { simularFinanciamento } from "@/lib/consultor/financiamento";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

/**
 * O simulador público — a MESMA conta que o consultor do corretor usa.
 *
 * `simularFinanciamento` é módulo puro, sem I/O e sem LLM, e já tem teste
 * próprio. Reusá-lo aqui é o ponto: duas contas do mesmo financiamento
 * divergiriam, e o cliente ouviria um número no site e outro do corretor —
 * que é o jeito mais rápido de perder a conversa que o site conquistou.
 *
 * ## Roda no NAVEGADOR, e isso é decisão
 *
 * Nenhuma renda declarada aqui vai para o servidor. A pessoa está dizendo
 * quanto ganha antes de confiar na empresa, e não há por que guardar isso —
 * quem quiser continuar aperta o botão do WhatsApp, que é onde a conversa
 * começa de verdade. Os parâmetros de crédito vêm prontos do servidor.
 *
 * ## O que ele NÃO é
 *
 * Não é aprovação de crédito. O texto diz isso onde a pessoa vai olhar (junto
 * do resultado), não escondido num rodapé — prometer aprovação é o defeito
 * que faz o cliente descobrir a verdade no banco, depois de escolher o imóvel.
 */

const CAMPO =
  "border-linha bg-campo text-titulo placeholder:text-tenue focus:border-acento-linha w-full rounded-xl border px-4 py-3 text-fluid-sm outline-none transition-colors";

/** Só dígitos, para o campo aceitar "R$ 8.000" digitado de qualquer jeito. */
function apenasNumero(texto: string): number {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}

export function Simulador({
  parametros,
  whatsapp,
}: {
  parametros: ParametrosCredito;
  /** Link já montado do WhatsApp — o passo seguinte do resultado. */
  whatsapp: string | null;
}) {
  const [renda, setRenda] = useState("");
  const [entrada, setEntrada] = useState("");
  const [fgts, setFgts] = useState("");
  const [valorImovel, setValorImovel] = useState("");

  const numeros = {
    rendaMensal: apenasNumero(renda),
    entrada: apenasNumero(entrada),
    fgts: apenasNumero(fgts),
    valorImovel: apenasNumero(valorImovel),
  };

  // Sem renda e sem valor de imóvel não há conta — e mostrar zeros faria a
  // tela parecer quebrada em vez de vazia.
  const pronto = numeros.rendaMensal > 0 && numeros.valorImovel > 0;

  const resultado = useMemo(
    () => (pronto ? simularFinanciamento(numeros, parametros) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pronto, numeros.rendaMensal, numeros.entrada, numeros.fgts, numeros.valorImovel, parametros],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8">
      <form
        className="cartao space-y-4 p-5 sm:p-6"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Dados para a simulação"
      >
        {[
          {
            id: "renda",
            rotulo: "Renda familiar por mês",
            ajuda: "Some a renda de quem vai financiar junto.",
            valor: renda,
            set: setRenda,
            exemplo: "8.000",
          },
          {
            id: "valor",
            rotulo: "Valor do imóvel",
            ajuda: "O preço do imóvel que você quer.",
            valor: valorImovel,
            set: setValorImovel,
            exemplo: "460.000",
          },
          {
            id: "entrada",
            rotulo: "Entrada em dinheiro",
            ajuda: "O que você tem guardado hoje.",
            valor: entrada,
            set: setEntrada,
            exemplo: "50.000",
          },
          {
            id: "fgts",
            rotulo: "FGTS (opcional)",
            ajuda: "Saldo que você pretende usar na compra.",
            valor: fgts,
            set: setFgts,
            exemplo: "20.000",
          },
        ].map((campo) => (
          <label key={campo.id} className="block space-y-1.5">
            <span className="text-fluid-sm text-titulo block font-medium">{campo.rotulo}</span>
            <span className="relative block">
              <span
                aria-hidden
                className="text-tenue pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm"
              >
                R$
              </span>
              <input
                inputMode="numeric"
                value={campo.valor}
                onChange={(e) => campo.set(e.target.value.replace(/\D/g, ""))}
                placeholder={campo.exemplo}
                className={`${CAMPO} pl-11`}
              />
            </span>
            <span className="text-fluid-xs text-tenue block">{campo.ajuda}</span>
          </label>
        ))}
      </form>

      <div
        // `sticky` no desktop: o resultado fica à vista enquanto a pessoa
        // ajusta a entrada no formulário ao lado — sem isso, no fim do
        // formulário o número já saiu da tela e ela rola para cima a cada
        // tentativa. `self-start`, senão o item da grade estica e não gruda.
        className="cartao flex flex-col p-5 sm:p-6 lg:sticky lg:top-28 lg:self-start"
        // A conta muda enquanto a pessoa digita; `polite` conta o resultado
        // sem atropelar quem está no meio de preencher.
        aria-live="polite"
      >
        {!resultado ? (
          <div className="text-apoio m-auto max-w-xs py-12 text-center">
            <p className="text-fluid-sm text-pretty">
              Preencha a renda e o valor do imóvel. A conta aparece aqui, na hora.
            </p>
          </div>
        ) : (
          <>
            <p className="text-fluid-xs text-apoio">
              {resultado.fecha ? "Com esses números, fecha" : "Com esses números, ainda falta"}
            </p>
            <p
              className={`font-display mt-1 text-3xl leading-none font-bold sm:text-4xl ${
                resultado.fecha ? "text-ok" : "text-alerta"
              }`}
            >
              {resultado.fecha
                ? formatarMoedaBRL(resultado.parcelaEstimada) + "/mês"
                : formatarMoedaBRL(resultado.faltam)}
            </p>
            <p className="text-fluid-xs text-apoio mt-1.5 text-pretty">
              {resultado.fecha
                ? `Parcela estimada em ${Math.round(resultado.prazoMeses / 12)} anos.`
                : "É o que falta somando entrada, FGTS e o que a renda financia."}
            </p>

            <ComposicaoDoValor resultado={resultado} valorImovel={numeros.valorImovel} />

            <dl className="border-linha mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-5">
              {[
                { t: "Parcela que a renda suporta", v: formatarMoedaBRL(resultado.parcelaMaxima) },
                { t: "Financiamento possível", v: formatarMoedaBRL(resultado.valorFinanciavel) },
                { t: "Recursos próprios", v: formatarMoedaBRL(resultado.recursosProprios) },
                { t: "ITBI estimado", v: formatarMoedaBRL(resultado.itbi) },
              ].map((linha) => (
                <div key={linha.t}>
                  <dt className="text-fluid-xs text-tenue text-pretty">{linha.t}</dt>
                  <dd className="text-fluid-sm text-titulo font-semibold tabular-nums">
                    {linha.v}
                  </dd>
                </div>
              ))}
            </dl>

            {resultado.faixa && (
              <p className="text-fluid-xs border-acento-linha bg-acento-lavado text-acento-suave mt-4 rounded-xl border px-3.5 py-2.5 text-pretty">
                Sua renda entra na {resultado.faixa} do Minha Casa Minha Vida — taxa de{" "}
                {(resultado.taxaAnual * 100).toFixed(2).replace(".", ",")}% ao ano
                {resultado.subsidio > 0
                  ? ` e até ${formatarMoedaBRL(resultado.subsidio)} de subsídio.`
                  : "."}
              </p>
            )}

            {/* O que a conta assumiu, aberto e por escrito. Simulação que
                esconde a premissa vira promessa — e quem descobre a diferença
                é o cliente, no banco, depois de escolher o imóvel. */}
            {(resultado.premissas.length > 0 || resultado.avisos.length > 0) && (
              <details className="border-linha mt-4 rounded-xl border px-3.5 py-2.5">
                <summary className="text-fluid-xs text-apoio cursor-pointer">
                  O que esta conta assumiu
                </summary>
                <ul className="text-fluid-xs text-tenue mt-2 space-y-1">
                  {[...resultado.premissas, ...resultado.avisos].map((linha) => (
                    <li key={linha} className="text-pretty">
                      {linha}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <p className="text-fluid-xs text-tenue mt-4 text-pretty">
              Estimativa, não aprovação de crédito. Quem aprova é o banco, olhando também
              cadastro e avaliação do imóvel.
            </p>

            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm mt-5 inline-flex min-h-12 items-center justify-center rounded-xl px-5 font-medium transition-colors"
              >
                Falar com um corretor sobre isso
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * O valor do imóvel dividido em barra: recursos próprios, financiamento e —
 * quando não fecha — o que falta.
 *
 * É a MESMA conta do resultado, só que visível de relance. Responde "por
 * que não fecha?" sem exigir que a pessoa some os quatro números da lista
 * abaixo: a fatia vermelha É a resposta. Quando fecha, o financiamento
 * completa o que os recursos não cobrem, e a barra fecha inteira.
 */
function ComposicaoDoValor({
  resultado,
  valorImovel,
}: {
  resultado: ReturnType<typeof simularFinanciamento>;
  valorImovel: number;
}) {
  if (valorImovel <= 0) return null;

  const proprios = Math.min(resultado.recursosProprios, valorImovel);
  const restante = Math.max(valorImovel - proprios, 0);
  const financiado = resultado.fecha ? restante : Math.min(resultado.valorFinanciavel, restante);
  const faltam = Math.max(restante - financiado, 0);

  const partes = [
    { rotulo: "Recursos próprios", valor: proprios, cor: "bg-acento-suave" },
    { rotulo: "Financiamento", valor: financiado, cor: "bg-acento" },
    { rotulo: "Falta", valor: faltam, cor: "bg-alerta" },
  ].filter((p) => p.valor > 0);

  return (
    <div className="mt-5">
      <div
        role="img"
        aria-label={partes.map((p) => `${p.rotulo}: ${formatarMoedaBRL(p.valor)}`).join("; ")}
        className="bg-linha flex h-2.5 w-full overflow-hidden rounded-full"
      >
        {partes.map((p) => (
          <span
            key={p.rotulo}
            className={`${p.cor} h-full transition-[width] duration-500 ease-out motion-reduce:transition-none`}
            style={{ width: `${(p.valor / valorImovel) * 100}%` }}
          />
        ))}
      </div>
      <ul className="text-fluid-xs text-apoio mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {partes.map((p) => (
          <li key={p.rotulo} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={`${p.cor} size-2 shrink-0 rounded-full`} />
            {p.rotulo}{" "}
            <span className="text-corpo tabular-nums">{formatarMoedaBRL(p.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O atalho para quem já sabe o que quer: a listagem, filtrada por valor. */
export function AtalhosDeFaixa({ faixas }: { faixas: { rotulo: string; href: string }[] }) {
  return (
    <ul className="mt-6 flex flex-wrap gap-3">
      {faixas.map((f) => (
        <li key={f.rotulo}>
          <Link
            href={f.href}
            className="border-linha bg-superficie/60 text-corpo hover:border-acento-linha hover:text-acento-suave inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors"
          >
            {f.rotulo}
          </Link>
        </li>
      ))}
    </ul>
  );
}
