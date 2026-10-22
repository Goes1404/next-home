import { Wordmark } from "@/components/ui/Wordmark";
import type { MarcaDoSite } from "@/lib/sites/marca";

/**
 * A marca no cabeçalho e no rodapé do site público: a LOGO que a imobiliária
 * enviou ("Meu site", 0209) ou, sem ela, o nome escrito de sempre. A Next
 * Home nunca tem `logoUrl` (o site dela é o de `site.ts`).
 */
export function LogoDaMarca({ marca, destaque, altura = "h-11 md:h-12" }: { marca: MarcaDoSite; destaque: string; altura?: string }) {
  if (!marca.logoUrl) return <Wordmark destaque={destaque} nomes={marca.wordmark} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo do grupo (URL pública do Storage)
    <img src={marca.logoUrl} alt={marca.nomeCompleto} className={`${altura} w-auto max-w-[13rem] object-contain object-left`} />
  );
}
