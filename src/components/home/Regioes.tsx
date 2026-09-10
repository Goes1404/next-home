import Image from "next/image";
import Link from "next/link";
import { FundoEmCamadas } from "@/components/motion/FundoEmCamadas";
import { Reveal } from "@/components/motion/Reveal";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { regioesComEstoque } from "@/lib/regioes";
import type { Empreendimento } from "@/lib/types";

/**
 * As regiões em que a casa atua — em CARTÕES, não em chips de texto.
 *
 * Até 09/09/2026 eram cinco pílulas com o nome da região e mais nada. Duas
 * delas apontavam para a listagem inteira porque não havia cadastro ali:
 * quem clicava não descobria que a região estava vazia, achava que o filtro
 * tinha quebrado. E as outras três não diziam quantos imóveis havia, a partir
 * de quanto, nem como o lugar se parece — a seção ocupava meia tela para
 * entregar cinco palavras.
 *
 * Agora cada cartão traz o que o catálogo já sabe: uma foto de imóvel DAQUELA
 * região, quantos há, e o piso de preço. Região sem imóvel não aparece, então
 * nenhum link leva a lugar vazio por construção (ver `lib/regioes.ts`).
 */
export function Regioes({ catalogo }: { catalogo: Empreendimento[] }) {
  const regioes = regioesComEstoque(catalogo);
  if (regioes.length === 0) return null;

  return (
    // `overflow-hidden` é obrigatório: sem ele as manchas do fundo vazam e
    // criam barra de rolagem horizontal.
    <section className="relative overflow-hidden px-4 pb-16 sm:px-8 sm:pb-24">
      <FundoEmCamadas />
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <p className="text-fluid-xs text-apoio mb-3">
            <span className="text-acento-suave font-semibold tabular-nums">{regioes.length}</span>{" "}
            regiões com imóvel disponível agora
          </p>
          <h2 className="text-fluid-2xl text-titulo">
            As melhores regiões para morar ou investir
          </h2>
          <p className="text-fluid-base text-apoio mt-3 max-w-xl text-pretty">
            Infraestrutura completa, mobilidade e valorização. Abra a região para ver o que
            está disponível nela hoje.
          </p>
        </Reveal>

        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {regioes.map((regiao, i) => (
            <Reveal key={regiao.slug} as="li" delay={(i % 3) * 0.08} from="baixo" className="h-full">
                <Link
                  href={`/regioes/${regiao.slug}`}
                  className="border-linha bg-superficie/60 hover:border-acento-linha group flex h-full flex-col overflow-hidden rounded-2xl border transition-all hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none"
                >
                  <div className="bg-campo relative aspect-[16/10] overflow-hidden">
                    {regiao.capaUrl ? (
                      <Image
                        src={regiao.capaUrl}
                        alt={`Imóvel em ${regiao.nome}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.05] motion-reduce:transition-none"
                      />
                    ) : (
                      <div className="text-tenue flex h-full w-full items-center justify-center text-xs">
                        Sem foto ainda
                      </div>
                    )}
                    {/* O véu existe para o nome ter contraste sobre qualquer
                        foto — as do catálogo variam de céu claro a fachada
                        noturna. `text-white` e não token de tema: o fundo aqui
                        é a FOTO, que não muda com o tema. */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                    <div className="absolute inset-x-4 bottom-3 flex items-end justify-between gap-3">
                      <h3 className="font-display min-w-0 text-lg leading-tight font-bold break-words text-white">
                        {regiao.nome}
                      </h3>
                      <span className="shrink-0 rounded-full border border-white/25 bg-black/55 px-2.5 py-0.5 text-[11px] font-semibold text-white tabular-nums backdrop-blur-md">
                        {regiao.imoveis.length}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between gap-3 p-4">
                    <p className="text-fluid-xs text-apoio text-pretty">{regiao.chamada}</p>
                    <p className="text-fluid-xs text-acento-suave font-semibold">
                      {regiao.precoMinimo
                        ? `A partir de ${formatarMoedaBRL(regiao.precoMinimo)}`
                        : "Valores sob consulta"}
                    </p>
                  </div>
                </Link>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
