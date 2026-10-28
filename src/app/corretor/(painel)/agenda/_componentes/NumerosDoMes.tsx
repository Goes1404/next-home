import { rotuloDoMes, type Mes } from "@/lib/agenda/calendario";
import { variacao, type MesDaSerie } from "@/lib/agenda/numeros";

const MES_CURTO = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "short" });
const curto = (mes: Mes) => MES_CURTO.format(new Date(`${mes}-01T12:00:00Z`)).replace(".", "");

type Chave = "marcadas" | "realizadas" | "faltas" | "semConfirmacao" | "negocios";

const NUMEROS: { chave: Chave; rotulo: string }[] = [
  { chave: "marcadas", rotulo: "Visitas" },
  { chave: "realizadas", rotulo: "Aconteceram" },
  { chave: "faltas", rotulo: "Cliente faltou" },
  { chave: "semConfirmacao", rotulo: "Sem confirmação" },
  { chave: "negocios", rotulo: "Viraram negócio" },
];

/**
 * Os números do mês no topo da Agenda da equipe (fase 2): cada um com a
 * diferença para o mês anterior e, embaixo, os seis meses lado a lado. Mês
 * antes de a Agenda começar a contar diz "não medido" — zero ali mentiria.
 */
export function NumerosDoMes({ serie, medidaDesde }: { serie: MesDaSerie[]; medidaDesde: Mes | null }) {
  const atual = serie[serie.length - 1];
  const anterior = serie.length > 1 ? serie[serie.length - 2] : null;
  // Mês antes de a Agenda contar não ganha linha de "não medido" uma a uma: some da tabela e é dito embaixo.
  const medidos = serie.filter((m): m is Extract<MesDaSerie, { medido: true }> => m.medido);
  const naoMedidos = serie.filter((m) => !m.medido);

  return (
    <section className="cartao p-5" aria-labelledby="numeros-do-mes">
      <h2 id="numeros-do-mes" className="font-display text-lg text-titulo first-letter:uppercase">
        {rotuloDoMes(atual.mes)}
      </h2>
      {!atual.medido ? (
        <p className="text-fluid-sm mt-2 text-corpo">Este mês ainda não foi medido.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {NUMEROS.map(({ chave, rotulo }) => {
            const d = variacao(atual[chave], anterior?.medido ? anterior[chave] : null);
            return (
              <div key={chave} className="rounded-xl bg-elevado px-3 py-2">
                <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
                <dd className="font-display text-2xl text-titulo">{atual[chave]}</dd>
                {d && anterior && (
                  <dd className="text-fluid-xs text-apoio">
                    {d === "igual" ? `igual a ${curto(anterior.mes)}` : `${d} que ${curto(anterior.mes)}`}
                  </dd>
                )}
              </div>
            );
          })}
        </dl>
      )}

      {medidos.length > 1 && (
        <table className="text-fluid-xs mt-4 w-full text-left">
          <caption className="sr-only">Meses medidos</caption>
          <thead className="text-apoio">
            <tr>
              <th className="py-1 font-medium">Mês</th>
              <th className="py-1 text-right font-medium">Visitas</th>
              <th className="py-1 text-right font-medium">Aconteceram</th>
              <th className="py-1 text-right font-medium">Negócios</th>
            </tr>
          </thead>
          <tbody className="text-corpo">
            {medidos.map((m) => (
              <tr key={m.mes} className="border-t border-linha">
                <td className="py-1 capitalize">{curto(m.mes)}</td>
                <td className="py-1 text-right">{m.marcadas}</td>
                <td className="py-1 text-right">{m.realizadas}</td>
                <td className="py-1 text-right">{m.negocios}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-fluid-xs mt-3 text-apoio">
        {medidaDesde
          ? `A Agenda começou a contar em ${rotuloDoMes(medidaDesde)}.${naoMedidos.length ? ` ${curto(naoMedidos[0].mes)}–${curto(naoMedidos[naoMedidos.length - 1].mes)}: não medido.` : ""}`
          : "A Agenda ainda não tem visitas para contar."}
      </p>
    </section>
  );
}
