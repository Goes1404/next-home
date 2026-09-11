"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { simularFinanciamento } from "@/lib/consultor/financiamento";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";

/**
 * "Cabe no meu bolso?" respondido na home, em dois campos.
 *
 * ## Por que aqui e não só em `/financiamento`
 *
 * A home não tinha NENHUMA entrada por preço — e preço é o filtro que de
 * fato decide. Ela oferecia lugar (regiões) e prazo (as duas portas de
 * estágio); o dinheiro, que é a primeira pergunta que a pessoa faz a si
 * mesma, só existia dentro de um select de "até R$ X" que ninguém sabe
 * responder sem fazer a conta antes.
 *
 * O simulador completo continua em `/financiamento`, com entrada, FGTS e
 * valor do imóvel. Este é a versão de UM passo: renda (e entrada, se houver)
 * → **quantos imóveis do catálogo fecham**. A resposta não é um número
 * abstrato de parcela, é uma lista que existe.
 *
 * ## A conta é a MESMA, e isso é o ponto
 *
 * `simularFinanciamento` é o módulo puro que o consultor do corretor usa e
 * que a página de financiamento já usa. Duas contas do mesmo financiamento
 * divergiriam, e o cliente ouviria um número no site e outro do corretor.
 * Aqui ela roda uma vez por imóvel — são dezenas de itens e função pura, o
 * custo é irrelevante — em vez de uma regra de três sobre a parcela, que
 * ignoraria subsídio, ITBI e teto de FGTS.
 *
 * ## Roda no NAVEGADOR
 *
 * Nenhuma renda declarada sai daqui. A pessoa está dizendo quanto ganha
 * antes de confiar na empresa; guardar isso não serve a ninguém, e o texto
 * ao lado do resultado diz que não guardamos.
 *
 * ## O que ele NÃO afirma
 *
 * Não é aprovação de crédito, e o aviso fica junto do resultado — não num
 * rodapé. E o denominador é honesto: a conta só considera os imóveis com
 * **preço publicado**, porque "sob consulta" não é nem caro nem barato.
 */

const CAMPO =
  "border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento-forte w-full rounded-xl border px-4 py-3 text-fluid-base font-medium tabular-nums outline-none transition-colors";

/** Só dígitos: o campo aceita "R$ 8.000" digitado ou colado de qualquer jeito. */
function apenasNumero(texto: string): number {
  const digitos = texto.replace(/\D/g, "");
  return digitos ? Number(digitos) : 0;
}

/**
 * O que aparece no campo enquanto se digita: 8000 vira "8.000".
 *
 * Sem isto, "450000" no campo de entrada é ilegível justamente onde um zero
 * a mais muda a resposta inteira.
 */
function comSeparador(valor: number): string {
  return valor > 0 ? valor.toLocaleString("pt-BR") : "";
}

export function CabeNoBolso({
  parametros,
  precos,
  totalCatalogo,
}: {
  parametros: ParametrosCredito;
  /** O preço "a partir de" de cada imóvel publicado que tem preço. */
  precos: number[];
  /** O catálogo inteiro, para a frase dizer quantos ficaram de fora. */
  totalCatalogo: number;
}) {
  // O estado guarda o NÚMERO, não o texto: assim o campo sempre mostra o
  // valor formatado e não há um segundo lugar de onde a conta pode divergir.
  const [rendaMensal, setRendaMensal] = useState(0);
  const [valorEntrada, setValorEntrada] = useState(0);

  const resultado = useMemo(() => {
    if (rendaMensal <= 0) return null;

    const cabem = precos
      .map((valorImovel) => ({
        valorImovel,
        sim: simularFinanciamento({ rendaMensal, entrada: valorEntrada, valorImovel }, parametros),
      }))
      .filter((r) => r.sim.fecha);

    // A parcela máxima não depende do imóvel: é a renda vezes o teto de
    // comprometimento. Vem de uma simulação qualquer, ou de uma de
    // referência quando NENHUM imóvel fecha — é ela que dá a régua para a
    // pessoa entender o "não" em vez de só receber um zero.
    const referencia =
      cabem[0]?.sim ??
      simularFinanciamento(
        { rendaMensal, entrada: valorEntrada, valorImovel: precos[0] ?? 0 },
        parametros,
      );

    return {
      quantos: cabem.length,
      tetoQueFecha: cabem.reduce((maior, r) => Math.max(maior, r.valorImovel), 0),
      parcelaMaxima: referencia.parcelaMaxima,
      faixa: referencia.faixa,
    };
  }, [rendaMensal, valorEntrada, precos, parametros]);

  const semPreco = totalCatalogo - precos.length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-8">
      <form
        className="cartao space-y-4 p-5 sm:p-6"
        onSubmit={(e) => e.preventDefault()}
        aria-label="Quanto cabe no seu bolso"
      >
        <Campo
          id="bolso-renda"
          rotulo="Renda familiar por mês"
          ajuda="Some a renda de quem vai financiar junto. Ex.: 8.000."
          valor={rendaMensal}
          aoMudar={setRendaMensal}
        />
        <Campo
          id="bolso-entrada"
          rotulo="Entrada guardada"
          ajuda="O que você tem hoje. Deixe em branco se ainda não tem."
          valor={valorEntrada}
          aoMudar={setValorEntrada}
        />
        <p className="text-fluid-xs text-tenue">
          A conta roda no seu navegador. Nada do que você escrever aqui é enviado.
        </p>
      </form>

      {/* `aria-live`: o resultado muda enquanto a pessoa digita, e quem usa
          leitor de tela precisa ouvir a mudança sem procurar por ela. */}
      <div
        aria-live="polite"
        className="border-linha bg-superficie/60 rounded-glass flex min-h-[16rem] flex-col justify-center border p-5 sm:p-8"
      >
        {!resultado ? (
          <Convite />
        ) : (
          <div key={resultado.quantos} className="surgir">
            <p className="text-fluid-sm text-apoio">
              Com essa renda, a parcela cabe até{" "}
              <strong className="text-titulo font-semibold">
                {formatarMoedaBRL(resultado.parcelaMaxima)}
              </strong>
              {resultado.faixa ? ` — e você entra na ${resultado.faixa} do Minha Casa Minha Vida.` : "."}
            </p>

            <p className="font-display text-titulo mt-4 text-4xl leading-tight sm:text-5xl">
              <span className="text-acento-suave tabular-nums">{resultado.quantos}</span>{" "}
              {resultado.quantos === 1 ? "imóvel cabe" : "imóveis cabem"}
            </p>
            <p className="text-fluid-sm text-apoio mt-1">
              de {precos.length} com preço publicado
              {semPreco > 0 && ` (${semPreco} ${semPreco === 1 ? "está" : "estão"} sob consulta)`}.
            </p>

            <Barra parte={resultado.quantos} total={precos.length} />

            {resultado.quantos > 0 ? (
              <Link
                href={`/empreendimentos?precoMax=${resultado.tetoQueFecha}`}
                className="bg-acento text-sobre-cor hover:bg-acento-hover mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors"
              >
                Ver {resultado.quantos === 1 ? "o imóvel" : `os ${resultado.quantos}`}
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                  className="size-4"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            ) : (
              /* Zero não é o fim da conversa: entrada maior, prazo e renda
                 somada mudam a conta, e quem sabe fazer isso é o corretor. */
              <p className="text-fluid-sm text-apoio mt-6 text-pretty">
                Ainda não fecha com esses números — mas entrada, FGTS e uma segunda renda mudam a
                conta.{" "}
                <Link
                  href="/financiamento"
                  className="text-acento-suave font-medium underline-offset-4 hover:underline"
                >
                  Simule com todos os campos
                </Link>
                .
              </p>
            )}

            <p className="text-fluid-xs text-tenue mt-5">
              Estimativa, não aprovação de crédito. Taxas e faixas conferidas em{" "}
              {new Date(parametros.conferidoEm + "T12:00:00Z").toLocaleDateString("pt-BR")}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Convite() {
  return (
    <div className="text-center">
      <p className="font-display text-titulo text-2xl text-balance sm:text-3xl">
        Quanto do catálogo cabe na sua renda?
      </p>
      <p className="text-fluid-sm text-apoio mx-auto mt-2 max-w-sm text-pretty">
        Escreva a renda ao lado e a resposta aparece aqui — sem formulário, sem cadastro e sem
        esperar ninguém retornar.
      </p>
    </div>
  );
}

/**
 * A fração do catálogo que cabe, desenhada.
 *
 * O número sozinho ("7 imóveis") não diz se é muito ou pouco; a barra diz, e
 * cresce a cada tecla — é o movimento que responde ao gesto, a régua de
 * movimento da casa. `transition` e não `@keyframes`: o valor muda enquanto
 * se digita, e animação recomeçada a cada tecla vira tremor.
 */
function Barra({ parte, total }: { parte: number; total: number }) {
  const fracao = total > 0 ? Math.min(1, parte / total) : 0;
  return (
    <div
      className="bg-vidro-forte mt-4 h-2 w-full overflow-hidden rounded-full"
      role="presentation"
    >
      <div
        className="bg-acento h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.round(fracao * 100)}%` }}
      />
    </div>
  );
}

/**
 * O exemplo mora na AJUDA, nunca no campo.
 *
 * A primeira versão trazia "50.000" como placeholder e, com o "R$" desenhado
 * à esquerda, ele era indistinguível de um valor já preenchido — a pessoa
 * leria "tenho R$ 50 mil de entrada" numa conta que ela não fez. Placeholder
 * que parece valor é pior que campo vazio.
 */
function Campo({
  id,
  rotulo,
  ajuda,
  valor,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  ajuda: string;
  valor: number;
  aoMudar: (v: number) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-fluid-sm text-titulo mb-1 block font-medium">
        {rotulo}
      </label>
      <div className="relative">
        <span className="text-tenue pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-sm">
          R$
        </span>
        <input
          id={id}
          // `inputMode` e não `type="number"`: o teclado numérico aparece no
          // celular sem trazer as setinhas e a rolagem acidental do number.
          inputMode="numeric"
          autoComplete="off"
          value={comSeparador(valor)}
          onChange={(e) => aoMudar(apenasNumero(e.target.value))}
          placeholder="0"
          className={`${CAMPO} pl-10`}
          aria-describedby={`${id}-ajuda`}
        />
      </div>
      <p id={`${id}-ajuda`} className="text-fluid-xs text-tenue mt-1">
        {ajuda}
      </p>
    </div>
  );
}
