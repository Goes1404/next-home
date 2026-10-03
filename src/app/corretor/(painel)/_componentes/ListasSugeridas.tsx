import Link from "next/link";
import { Megaphone } from "lucide-react";
import { DIAS_DE_PARADO, type DiasDeParado, type ItemSugerido, type ListasSugeridas } from "@/lib/crm/listasSugeridas";

/** Quantos ids viajam na URL do assistente. Lista maior que isso vira várias. */
const IDS_POR_LISTA = 200;

function linkDaLista(
  itens: ItemSugerido[],
  grupo: "novos" | "parados" | "imovel",
  dias: DiasDeParado,
  imovelSlug?: string,
): string {
  const p = new URLSearchParams({
    leads: itens.slice(0, IDS_POR_LISTA).map((i) => i.id).join(","),
    grupo,
    dias: String(dias),
  });
  if (imovelSlug) p.set("imovel", imovelSlug);
  return `/corretor/campanhas?${p.toString()}`;
}

function nomes(itens: ItemSugerido[]): string {
  const primeiros = itens.slice(0, 3).map((i) => i.nome.split(" ")[0]);
  const resto = itens.length - primeiros.length;
  return resto > 0 ? `${primeiros.join(", ")} e mais ${resto}` : primeiros.join(", ");
}

function Cartao({
  titulo,
  descricao,
  itens,
  href,
}: {
  titulo: string;
  descricao: string;
  itens: ItemSugerido[];
  href: string;
}) {
  return (
    <li className="cartao flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-titulo text-sm font-semibold">{titulo}</h3>
        <span className="text-titulo text-lg font-semibold tabular-nums">{itens.length}</span>
      </div>
      <p className="text-apoio text-fluid-xs leading-snug">{descricao}</p>
      <p className="text-corpo text-fluid-xs break-words">{nomes(itens)}</p>
      <Link
        href={href}
        className="border-acento-linha bg-acento-lavado text-acento-suave mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-medium transition-opacity hover:opacity-85"
      >
        <Megaphone aria-hidden className="h-4 w-4" /> Montar a lista
      </Link>
    </li>
  );
}

/**
 * "Listas sugeridas" (plano de ativação, Fase 4): quem precisa de uma
 * mensagem nossa, agrupado. Substitui o reengajamento e a abertura
 * automáticos — a IA só responde, e quem manda primeiro é o corretor.
 *
 * Montar a lista leva ao assistente de listas de transmissão com os leads
 * marcados; lá a IA sugere o texto e o corretor edita e aprova. A cota
 * diária e o espaçamento anti-ban são os do disparador de sempre.
 */
export function ListasSugeridasBloco({
  listas,
  diasParado,
  caminho,
}: {
  listas: ListasSugeridas;
  diasParado: DiasDeParado;
  /** A tela onde o bloco está, para os botões de dias voltarem a ela. */
  caminho: string;
}) {
  const vazio = listas.novos.length === 0 && listas.parados.length === 0;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-titulo text-lg">Listas sugeridas</h2>
        <nav aria-label="Parados há quantos dias" className="flex flex-wrap gap-1.5">
          {DIAS_DE_PARADO.map((d) => (
            <Link
              key={d}
              href={`${caminho}?parados=${d}`}
              aria-current={d === diasParado ? "true" : undefined}
              className={`text-fluid-xs inline-flex min-h-11 items-center rounded-full border px-3 ${
                d === diasParado
                  ? "border-acento bg-acento text-sobre-cor"
                  : "border-linha-forte text-apoio hover:bg-elevado"
              }`}
            >
              {d} dias
            </Link>
          ))}
        </nav>
      </div>
      {vazio ? (
        <p className="text-apoio text-fluid-sm">
          Ninguém esperando uma mensagem sua agora: todo lead novo já foi abordado e ninguém está sem
          conversa há {diasParado} dias.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {listas.novos.length > 0 && (
            <Cartao
              titulo="Novos sem primeiro contato"
              descricao="Chegaram por portal, anúncio, importação ou site e ainda não receberam nenhuma mensagem."
              itens={listas.novos}
              href={linkDaLista(listas.novos, "novos", diasParado)}
            />
          )}
          {listas.parados.length > 0 && (
            <Cartao
              titulo={`Parados há ${diasParado} dias`}
              descricao="Sem mensagem de nenhum dos lados nesse tempo. Os mais perto de comprar vêm primeiro."
              itens={listas.parados}
              href={linkDaLista(listas.parados, "parados", diasParado)}
            />
          )}
          {listas.porImovel.slice(0, 3).map((g) => (
            <Cartao
              key={g.imovel.slug}
              titulo={`Parados · ${g.imovel.nome}`}
              descricao={`Tinham interesse no ${g.imovel.nome}. A IA sugere a mensagem citando o imóvel.`}
              itens={g.leads}
              href={linkDaLista(g.leads, "imovel", diasParado, g.imovel.slug)}
            />
          ))}
        </ul>
      )}
      <p className="text-tenue text-fluid-xs">
        Quem recebeu uma lista e não respondeu fica fora daqui por 30 dias.
      </p>
    </section>
  );
}
