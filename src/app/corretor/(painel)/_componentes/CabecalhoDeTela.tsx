/**
 * A abertura de toda tela do painel, com a mesma anatomia sempre.
 *
 * Antes cada tela abria do seu jeito: umas com `font-display`, outras não;
 * `text-fluid-2xl` aqui, `text-fluid-xl` ali; a linha de apoio ora em
 * `text-fluid-sm`, ora em `text-fluid-xs`; `mt-1` contra `mt-2`. Nada disso
 * se nota isoladamente e tudo junto custa a mesma coisa: o olho não aprende
 * onde procurar, porque o lugar muda a cada tela.
 *
 * Pior que a forma era o CONTEÚDO. Duas telas diferentes se chamavam
 * "WhatsApp" — conversas e campanhas —, então o título não dizia em qual
 * delas o corretor estava; e "Edição & Gestão de Imóveis" é o nome que um
 * sistema dá para si mesmo, não o que alguém pensa antes de tocar.
 *
 * Em 04/09/2026 virou o CARTÃO-HERÓI, a pedido ("tendo o estilo da home como
 * base, atualize todas as telas"): o mesmo vidro do `HeroInicio` — brilhos
 * na cor do módulo atrás, fio de luz na borda, título editorial em itálico
 * com o ponto na cor da seção. É a assinatura do Início repetida em toda
 * tela, e como todas passam por aqui, foi UMA mudança.
 *
 * Três partes, nesta ordem, porque é a ordem em que o olho passa:
 *
 *   1. a seção em versalete (e a cor do módulo nos brilhos) — "onde estou";
 *   2. o título, curto, no vocabulário de quem usa;
 *   3. uma linha do que dá para fazer aqui, e a ação primária ao lado.
 *
 * A ação fica à direita no computador e ABAIXO no celular, largura cheia: no
 * polegar, alvo pequeno encostado na margem direita é o mais difícil de
 * acertar da tela.
 *
 * `backdrop-filter` cria containing block: nada `position: fixed` pode nascer
 * dentro deste cartão. Ele só recebe texto e a ação primária — que é um link
 * ou botão, nunca um modal.
 */
export function CabecalhoDeTela({
  secao,
  titulo,
  descricao,
  acao,
  abaixo,
}: {
  /** A seção, em versalete acima do título ("Administração"). Opcional. */
  secao?: string;
  titulo: string;
  /** Uma linha. Se precisar de duas, a tela está fazendo coisa demais. */
  descricao?: React.ReactNode;
  /** A ação primária desta tela — no máximo uma. */
  acao?: React.ReactNode;
  /**
   * Ação secundária, alinhada com o TÍTULO e não com a margem da tela.
   * Existe porque um link solto depois do cabeçalho encosta no filete de cor
   * e nasce um degrau de 13px que faz a coluna parecer torta.
   */
  abaixo?: React.ReactNode;
}) {
  return (
    <section className="border-white/10 bg-vidro-forte shadow-painel relative overflow-hidden rounded-[1.75rem] border p-5 ring-1 ring-white/5 backdrop-blur-xl ring-inset md:p-6">
      {/* Os dois brilhos de acento que o vidro desfoca, e o fio de luz no topo. */}
      <div
        aria-hidden
        className="from-acento/35 pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-gradient-to-br to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="from-acento/15 pointer-events-none absolute -bottom-28 -left-12 h-48 w-48 rounded-full bg-gradient-to-tr to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {secao && (
            <p className="text-tenue text-[11px] font-medium tracking-[0.22em] uppercase">{secao}</p>
          )}
          <h1 className="font-display text-titulo text-[2rem] leading-[0.95] font-bold tracking-[-0.03em] italic md:text-[2.75rem]">
            {titulo}
            <span className="text-acento">.</span>
          </h1>
          {descricao && (
            <p className="text-fluid-sm text-apoio mt-2 max-w-2xl text-pretty">{descricao}</p>
          )}
          {abaixo}
        </div>

        {acao && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{acao}</div>}
      </div>
    </section>
  );
}
