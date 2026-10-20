import { site } from "@/lib/site";

/**
 * O logotipo em texto ("Next" + "Home" destacado), da marca desta
 * instalação. Era escrito à mão em sete lugares — cada um teria de ser
 * lembrado no dia de instalar para outra imobiliária.
 */
export function Wordmark({
  destaque,
  nomes = site.wordmark,
}: {
  destaque: string;
  /**
   * As duas partes do nome. No site público vem da marca do SITE servido
   * (`MarcaDoSite.wordmark`, fase 3); sem ela, a da instalação (o painel).
   */
  nomes?: readonly [string, string];
}) {
  const [a, b] = nomes;
  return (
    <>
      {a}
      <span className={destaque}>{b}</span>
    </>
  );
}
