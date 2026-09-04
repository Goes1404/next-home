import { fraseDoHero, resumoDaCarteira, saudacaoDoDia } from "@/lib/crm/heroDoInicio";
import type { EtapaFunil } from "@/lib/types";
import { IconeBalao, IconeCalendarioCheck, IconeMarcaFechado } from "./iconesDoHero";

/**
 * O cartão de abertura do Início.
 *
 * Referência do usuário (04/09/2026): cartão escuro, saudação em versalete,
 * nome grande com o ponto na cor do módulo, uma frase, medidor circular e
 * três pílulas de número. É a primeira coisa que a corretora vê ao abrir o
 * painel no celular — por isso os números são os que MUDAM quando ela
 * trabalha (em conversa, visitas, fechados), não totais que só crescem.
 *
 * Server Component: os dados vêm de quem o renderiza; não faz consulta nova.
 * Só usa tokens do painel (`--color-acento` da seção Início), nenhuma cor
 * crua — o cartão acompanha o tema e o módulo como o resto.
 */
export function HeroInicio({
  nome,
  contagens,
  agora = new Date(),
}: {
  nome: string;
  contagens: Partial<Record<EtapaFunil, number>>;
  agora?: Date;
}) {
  const r = resumoDaCarteira(contagens);
  const saudacao = saudacaoDoDia(agora);

  // Medidor: círculo de raio 44, circunferência ≈ 276. O arco cobre 270°
  // (3/4 da volta), como um velocímetro; o traço aberto embaixo é de propósito.
  const RAIO = 44;
  const CIRC = 2 * Math.PI * RAIO;
  const ARCO = CIRC * 0.75;
  const preenchido = ARCO * (r.emAndamentoPct / 100);

  return (
    <section
      aria-label="Resumo da sua carteira"
      /*
       * Vidro (glassmorphism), com os tokens que o painel já tem: `bg-vidro-forte`
       * é branco a 12% no escuro e verde-escuro a 10% no claro — o mesmo par
       * que o header e os chips já usam, então acompanha o tema. O
       * `backdrop-blur` só faz sentido porque há os dois brilhos de acento
       * ATRÁS dele para desfocar; sem eles, vidro sobre fundo liso é só cinza.
       *
       * Atenção: `backdrop-filter` cria containing block. Nada `position:
       * fixed` pode nascer dentro deste cartão — a gaveta do painel é portalada
       * justamente por isso.
       */
      className="border-white/10 bg-vidro-forte shadow-painel relative overflow-hidden rounded-[1.75rem] border p-5 ring-1 ring-white/5 backdrop-blur-xl ring-inset md:p-7"
    >
      {/* Dois brilhos de acento, um em cada canto: são o que o vidro desfoca. */}
      <div
        aria-hidden
        className="from-acento/40 pointer-events-none absolute -top-28 -right-20 h-72 w-72 rounded-full bg-gradient-to-br to-transparent blur-3xl"
      />
      <div
        aria-hidden
        className="from-acento/20 pointer-events-none absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-gradient-to-tr to-transparent blur-3xl"
      />
      {/* Fio de luz no topo, como reflexo na borda do vidro. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
      />

      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-tenue text-[11px] font-medium tracking-[0.22em] uppercase">
            {saudacao},
          </p>
          <h1 className="font-display text-titulo mt-1 text-[2.75rem] leading-[0.92] font-bold tracking-[-0.03em] italic md:text-6xl">
            {nome}
            <span className="text-acento">.</span>
          </h1>
          <p className="text-apoio mt-3 max-w-md text-base leading-snug md:text-lg">{fraseDoHero(r)}</p>
        </div>

        {/* O medidor. `role="img"` com o texto inteiro: leitor de tela lê o
            número e o que ele significa, não "svg". */}
        <div
          role="img"
          aria-label={`${r.emAndamentoPct}% da carteira em andamento`}
          className="relative mx-auto size-40 shrink-0 md:size-44"
        >
          <svg viewBox="0 0 100 100" className="size-full -rotate-[135deg]">
            <circle
              cx="50"
              cy="50"
              r={RAIO}
              fill="none"
              className="stroke-linha"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${ARCO} ${CIRC}`}
            />
            <circle
              cx="50"
              cy="50"
              r={RAIO}
              fill="none"
              className="stroke-acento"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${preenchido} ${CIRC}`}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="font-display text-titulo text-4xl leading-none font-bold">{r.emAndamentoPct}</p>
              <p className="text-acento-suave mt-1 text-[10px] font-semibold tracking-[0.18em] uppercase">
                % em andamento
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Três pílulas. Quebram linha em vez de rolar (naoRolaDeLado). */}
      <ul className="relative mt-6 grid grid-cols-3 gap-2 md:gap-3">
        <Pilula icone={<IconeBalao className="size-5" />} numero={r.emConversa} rotulo="em conversa" />
        <Pilula icone={<IconeCalendarioCheck className="size-5" />} numero={r.visitas} rotulo="visitas" />
        <Pilula icone={<IconeMarcaFechado className="size-5" />} numero={r.fechados} rotulo="fechados" />
      </ul>
    </section>
  );
}

function Pilula({ icone, numero, rotulo }: { icone: React.ReactNode; numero: number; rotulo: string }) {
  return (
    /* No celular o ícone fica EM CIMA do número: três colunas com ícone ao
       lado cortavam "em conversa" em 320-390px (medido com o CSS de produção).
       Lado a lado só a partir de md, onde sobra largura. */
    <li className="border-white/10 bg-vidro flex min-h-16 flex-col items-start gap-2 rounded-2xl border px-3 py-2.5 backdrop-blur-md md:flex-row md:items-center md:gap-3 md:px-4">
      <span
        aria-hidden
        className="bg-acento text-sobre-cor grid size-9 shrink-0 place-items-center rounded-xl shadow-[0_6px_18px_-6px_var(--color-acento)] md:size-10"
      >
        {icone}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="font-display text-titulo block text-xl font-bold md:text-2xl">{numero}</span>
        <span className="text-tenue block text-[10px] font-medium tracking-[0.12em] uppercase">{rotulo}</span>
      </span>
    </li>
  );
}
