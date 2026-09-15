/**
 * "O navegador carrega a versão antiga" — o que foi medido, e o que não era.
 *
 * Relatado em 15/09/2026 assim: os navegadores abrem a versão antiga, e só
 * colando o link de novo aparece a nova. Antes de escrever uma linha, as
 * causas candidatas foram medidas em produção:
 *
 *   - CACHE DE HTML: não é. Toda rota deste site é dinâmica (o `cookies()`
 *     do layout raiz), e a resposta sai `private, no-cache, no-store` com
 *     `X-Vercel-Cache: MISS`. Navegação de verdade NUNCA pega HTML velho.
 *   - SERVICE WORKER: não existe no repositório (`grep serviceWorker` = 0),
 *     que é a boa notícia — service worker velho é o mais caro de reverter.
 *   - CHUNK IMUTÁVEL: os `/_next/static/**` são `max-age=31536000,immutable`,
 *     mas o nome carrega hash por build, então build nova pede arquivo novo.
 *
 * O que sobra, e é o que acontece: **a ABA que já estava aberta**. Ela tem em
 * memória o HTML e o JavaScript do build anterior e não pede nada de novo ao
 * voltar do segundo plano — no celular a aba fica suspensa por horas. Colar o
 * link é uma NAVEGAÇÃO, e navegação sempre traz a versão nova; é por isso que
 * o contorno que a equipe descobriu funciona.
 *
 * E a aba velha não fica só desatualizada: ela QUEBRA. Chunk do build
 * anterior responde 404 (medido), e a Server Action que ela chama também —
 * é o caso que `ehActionDeOutroBuild` já trata, do outro lado, depois que a
 * pessoa tenta agir e falha.
 *
 * Faltava o aviso ANTES do erro: nada nesta aplicação dizia à aba aberta que
 * existe build nova. É esse buraco que este módulo fecha.
 *
 * Módulo PURO de propósito: a parte que erra é a comparação (dev, valor
 * ausente, resposta estranha do servidor), e é ela que precisa de teste sem
 * navegador — mesma razão de `ehActionDeOutroBuild` e `classificarFalhaDeStorage`
 * viverem fora do `fetch`.
 */

/**
 * O carimbo desta build, inlinado em tempo de build pelo `env` do
 * `next.config.ts` — tanto no pacote do CLIENTE quanto no do SERVIDOR (é o
 * que a documentação do `env` garante: o Next SUBSTITUI a expressão pelo
 * literal). Por isso o cliente e a rota `/api/versao` não podem divergir
 * dentro da mesma build, nem que o `next.config` seja reavaliado em runtime.
 *
 * Fora da Vercel (desenvolvimento, vitest) ele vale `dev` ou vazio, e aí o
 * aviso NUNCA aparece — ver `houveDeploy`.
 */
export const VERSAO_DA_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? "";

/** O valor que o `next.config.ts` usa quando não há commit para carimbar. */
export const VERSAO_DE_DESENVOLVIMENTO = "dev";

/**
 * Houve deploy desde que esta aba abriu?
 *
 * O lado errado de errar aqui é o FALSO POSITIVO: um aviso de "atualize"
 * que aparece sem ter havido deploy nenhum ensina a ignorar o aviso — a
 * mesma régua que este projeto aplicou ao alerta de evolução da conversa e à
 * faixa de queda do número. Por isso toda dúvida responde `false`:
 *
 *   - qualquer um dos dois lados vazio (build sem carimbo, resposta torta);
 *   - qualquer um dos dois em `dev` (máquina de quem desenvolve, onde o
 *     `npm run build` roda o tempo todo e o aviso seria constante).
 *
 * O custo de um falso NEGATIVO é o que já acontece hoje: a aba continua
 * velha até alguém recarregar. Não piora nada.
 */
export function houveDeploy(minha: string, doServidor: unknown): boolean {
  if (typeof doServidor !== "string") return false;

  const aqui = minha.trim();
  const la = doServidor.trim();

  if (!aqui || !la) return false;
  if (aqui === VERSAO_DE_DESENVOLVIMENTO || la === VERSAO_DE_DESENVOLVIMENTO) return false;

  return aqui !== la;
}

/**
 * O erro que a aba velha dá ANTES de qualquer aviso: ela navega, pede um
 * `/_next/static/chunks/*.js` do build anterior e recebe 404. O navegador
 * relata isso como `ChunkLoadError` / "Loading chunk failed".
 *
 * Serve de GATILHO para conferir a versão na hora, não de diagnóstico: quem
 * decide se houve deploy continua sendo `houveDeploy`, contra o servidor.
 * Falha de rede também produz erro de carregamento, e tratar as duas como a
 * mesma coisa faria a aba anunciar deploy no meio de um túnel.
 */
export function pareceChunkQueSumiu(erro: unknown): boolean {
  const texto =
    erro instanceof Error ? `${erro.name} ${erro.message}` : typeof erro === "string" ? erro : "";
  const alvo = texto.toLowerCase();
  return (
    alvo.includes("chunkloaderror") ||
    alvo.includes("loading chunk") ||
    alvo.includes("failed to fetch dynamically imported module") ||
    alvo.includes("error loading dynamically imported module")
  );
}
