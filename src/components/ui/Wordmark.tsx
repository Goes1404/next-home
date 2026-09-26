import { site } from "@/lib/site";

/**
 * O logotipo em texto ("Next" + "Home" destacado), da marca desta
 * instalação. Era escrito à mão em sete lugares — cada um teria de ser
 * lembrado no dia de instalar para outra imobiliária.
 */
export function Wordmark({ destaque }: { destaque: string }) {
  const [a, b] = site.wordmark;
  return (
    <>
      {a}
      <span className={destaque}>{b}</span>
    </>
  );
}
