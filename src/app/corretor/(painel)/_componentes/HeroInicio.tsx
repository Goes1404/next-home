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
      className="bg-elevado border-linha shadow-painel relative overflow-hidden rounded-3xl border p-5 md:p-7"
    >
      {/* Brilho do acento no canto: dá o clima do cartão sem cor crua. */}
      <div
        aria-hidden
        className="from-acento/25 pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-gradient-to-br to-transparent blur-3xl"
      />

      <div className="relative grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-tenue text-[11px] font-medium tracking-[0.22em] uppercase">
            {saudacao},
          </p>
          <h1 className="font-display text-titulo mt-1 text-[2.6rem] leading-[0.95] font-bold tracking-tight italic md:text-6xl">
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
    <li className="border-linha bg-superficie/60 flex min-h-16 flex-col items-start gap-2 rounded-2xl border px-3 py-2.5 md:flex-row md:items-center md:gap-3 md:px-4">
      <span
        aria-hidden
        className="bg-acento-lavado text-acento-suave border-acento-linha grid size-9 shrink-0 place-items-center rounded-xl border md:size-10"
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
