/**
 * Retentativa curta para leitura pública que falhou por motivo PASSAGEIRO.
 *
 * ## O caso que gerou este arquivo (10/09/2026)
 *
 * O Supabase devolveu `Gateway Timeout` por alguns segundos e a HOME voltou
 * 500 para quem estava chegando — junto com o `/sitemap.xml` e uma gravação do
 * webhook. Medido no runtime da Vercel: três rotas falharam em 18:00:09,
 * 18:00:19 e 18:00:22 UTC, e as requisições dos segundos seguintes passaram
 * normalmente. Ou seja, a falha era INTERMITENTE — exatamente o caso em que
 * repetir resolve. Na varredura seguinte, `/regioes/alphaville` respondeu 200
 * no mesmo minuto em que `/` respondeu 500.
 *
 * ## Por que repetir, e NÃO degradar para lista vazia
 *
 * Degradar parece mais gentil e aqui seria pior, por dois motivos medidos:
 *
 * 1. A home tem uma faixa de prova com os números REAIS do catálogo. Com lista
 *    vazia ela anunciaria "0 imóveis no catálogo" — uma afirmação falsa sobre
 *    o negócio, na primeira dobra, para todo visitante. Página de erro é ruim;
 *    página que mente é pior.
 * 2. O `sitemap.xml` encolheria de ~39 URLs para meia dúzia, e o Google
 *    ACREDITA num sitemap que encolheu: ele passa a tratar o que sumiu como
 *    removido. Um 500 no sitemap, ao contrário, faz o robô voltar depois.
 *
 * Erro que se conserta sozinho em segundos não merece uma decisão de produto:
 * merece uma segunda tentativa.
 *
 * ## O que NUNCA é repetido
 *
 * Erro de CONSULTA — coluna que não existe, permissão negada, ambiguidade de
 * relacionamento (o `PGRST201` que já derrubou o site inteiro aqui). Esses
 * vêm com `code` do PostgREST e não melhoram na segunda vez: repetir só dobra
 * a espera do visitante antes do mesmo erro. Falha sem `code` — gateway, rede,
 * socket — é a que ganha nova chance.
 */

/** O formato de erro que o `postgrest-js` devolve. */
export type ErroDoSupabase = { message: string; code?: string | null } | null;

/**
 * As esperas entre tentativas, em milissegundos.
 *
 * Duas retentativas, curtas: quem espera é um visitante com a página em
 * branco. O blip medido durou segundos, e a primeira volta já pegaria a
 * janela boa.
 */
const ESPERAS_MS = [200, 600] as const;

/**
 * Teto de tempo gasto REPETINDO, contado desde a primeira tentativa.
 *
 * Sem isto, uma indisponibilidade longa faria cada tentativa esperar o timeout
 * inteiro do gateway e a requisição estouraria o limite da função — trocando
 * um 500 rápido por um 504 lento, que é pior para quem espera e para o robô
 * de busca. Passado o teto, o erro sobe como veio.
 */
const ORCAMENTO_MS = 4_000;

/** Erro de consulta: schema, permissão, relacionamento. Não melhora repetindo. */
function ehDaConsulta(erro: ErroDoSupabase): boolean {
  return typeof erro?.code === "string" && erro.code.length > 0;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Roda a consulta e, se ela falhar por motivo passageiro, tenta de novo.
 *
 * Recebe uma FÁBRICA, não a consulta pronta: o construtor do `postgrest-js` é
 * um thenable de uso único — reaproveitá-lo devolve o resultado já resolvido e
 * a "retentativa" repetiria o mesmo erro sem tocar na rede.
 *
 * O genérico é a RESPOSTA inteira, não o `data`. O Supabase tipa o retorno
 * como união discriminada (`{data: T, error: null} | {data: null, error: E}`),
 * e é ela que faz `if (error) throw` estreitar `data` para não-nulo depois.
 * Reconstruir a resposta como `{ data: T; error: E | null }` achata a união e
 * o chamador passa a ver `data` possivelmente nulo — dois erros de compilação
 * que apareceram exatamente assim ao ligar isto. Devolvendo `R`, envolver a
 * consulta não muda nada do que o chamador via.
 */
export async function comRetentativa<R extends { error: ErroDoSupabase }>(
  rotulo: string,
  consulta: () => PromiseLike<R>,
): Promise<R> {
  const comecou = Date.now();
  let ultima = await consulta();

  for (const [i, esperar] of ESPERAS_MS.entries()) {
    if (!ultima.error) return ultima;
    if (ehDaConsulta(ultima.error)) return ultima;
    if (Date.now() - comecou > ORCAMENTO_MS) break;

    await espera(esperar);
    // Sem isto a degradação do banco é invisível: as páginas voltam a abrir e
    // ninguém fica sabendo que elas quase não abriram.
    console.warn(
      `[supabase] ${rotulo} falhou (${ultima.error.message}) — tentativa ${i + 2}`,
    );
    ultima = await consulta();
  }

  return ultima;
}
