// Para onde o E2E aponta, conferido antes de qualquer teste rodar.
//
// Até 19/10/2026 o E2E diário rodava contra o site de produção, com a
// credencial de um corretor de verdade. Com dados de vários grupos no mesmo
// banco isso deixou de ser aceitável (spec da plataforma multi-grupo, §14): o
// E2E roda contra o ambiente de testes (docs/AMBIENTE-DE-TESTES.md) ou contra
// o servidor local, nunca contra produção — nem por engano, numa variável de
// ambiente esquecida no terminal.
//
// O que se recusa é o endereço PÚBLICO de produção. Um deployment de preview
// do mesmo projeto da Vercel com as variáveis de produção também bateria no
// banco de produção, e isso nenhuma URL denuncia: quem garante é o ambiente
// `teste` com variáveis próprias (ver o documento).

/** Domínios de produção: o próprio domínio e qualquer subdomínio dele. */
const PRODUCAO = ["next-home-drab.vercel.app", "nexthomeimoveis.com"];

/** Devolve a URL se ela pode servir de base do E2E; senão, lança dizendo por quê. */
export function conferirBaseDoE2E(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new Error(`E2E_BASE_URL não é uma URL: "${url}".`);
  }
  if (PRODUCAO.some((p) => host === p || host.endsWith(`.${p}`))) {
    throw new Error(
      `E2E_BASE_URL aponta para produção (${host}). O E2E roda contra o ambiente de testes ` +
        "ou contra o servidor local — ver docs/AMBIENTE-DE-TESTES.md.",
    );
  }
  return url;
}
