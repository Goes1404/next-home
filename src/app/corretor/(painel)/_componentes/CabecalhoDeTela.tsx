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
 * Três partes, nesta ordem, porque é a ordem em que o olho passa:
 *
 *   1. o filete na cor do MÓDULO — responde "onde estou" antes da leitura;
 *   2. o título, curto, no vocabulário de quem usa;
 *   3. uma linha do que dá para fazer aqui, e a ação primária ao lado.
 *
 * A ação fica à direita no computador e ABAIXO no celular, largura cheia: no
 * polegar, alvo pequeno encostado na margem direita é o mais difícil de
 * acertar da tela.
 */
export function CabecalhoDeTela({
  titulo,
  descricao,
  acao,
  abaixo,
}: {
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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 gap-3">
        {/*
          O filete na cor do módulo. É a mesma ideia da régua de etapa nos
          cartões, um andar acima: cor à esquerda, sempre no mesmo lugar,
          lida antes do texto. Aqui ela diz a SEÇÃO; lá, o registro.
        */}
        <span aria-hidden className="bg-acento mt-1 w-1 shrink-0 self-stretch rounded-full" />
        <div className="min-w-0">
          <h1 className="font-display text-titulo text-fluid-2xl">{titulo}</h1>
          {descricao && (
            <p className="text-fluid-sm text-apoio mt-1 max-w-2xl text-pretty">{descricao}</p>
          )}
          {abaixo}
        </div>
      </div>

      {acao && <div className="shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{acao}</div>}
    </div>
  );
}
