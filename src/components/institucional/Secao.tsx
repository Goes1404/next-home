import { FundoEmCamadas } from "@/components/motion/FundoEmCamadas";

type Espaco = "abertura" | "normal" | "final";

const ESPACO: Record<Espaco, string> = {
  /** A primeira seção da página: o topo vem da `Pagina`, só o rodapé é dela. */
  abertura: "pb-12 sm:pb-16",
  normal: "py-16 sm:py-24",
  /** A última antes do CTA final, que já traz o próprio respiro embaixo. */
  final: "pb-16 sm:pb-24",
};

/**
 * Uma seção do site institucional: a MESMA caixa e o MESMO ritmo em toda
 * página.
 *
 * A largura é uma só (`max-w-6xl`) de propósito. Até 09/09/2026 as seções
 * irmãs da home tinham quatro larguras diferentes e a margem esquerda do
 * conteúdo pulava a cada rolagem; nas outras páginas eram `2xl`, `4xl`,
 * `5xl` e `7xl`. Leitura estreita, quando precisa, é `max-w-2xl` no
 * PARÁGRAFO — nunca na caixa da seção, senão o título anda junto.
 *
 * `banda` pinta o fundo de superfície para alternar com o fundo da página;
 * `fundo` acrescenta as manchas de luz em parallax (exige `overflow-hidden`,
 * senão elas vazam e criam rolagem lateral).
 */
export function Secao({
  id,
  espaco = "normal",
  banda = false,
  fundo = false,
  className,
  children,
}: {
  id?: string;
  espaco?: Espaco;
  banda?: boolean;
  fundo?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={[
        "px-4 sm:px-8",
        ESPACO[espaco],
        banda && "bg-superficie/40",
        fundo && "relative overflow-hidden",
        id && "scroll-mt-24",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {fundo && <FundoEmCamadas intensidade={0.6} />}
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}
