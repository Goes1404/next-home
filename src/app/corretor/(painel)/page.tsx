import { Suspense, type SVGProps } from "react";
import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { FilaAgora } from "./_componentes/FilaAgora";
import { TermometroFunil } from "./_componentes/TermometroFunil";
import {
  getCliquesWhatsappCorretor,
  getContagemPorEtapa,
  getCorretorLogado,
} from "@/lib/corretorSessao";
import { getFilaDeTrabalho } from "@/lib/crm/filaDeTrabalho";
import { getMinhasTarefas } from "@/lib/crm/dadosLead";
import { site } from "@/lib/site";
import { Esqueleto, EsqueletoCartao, AvisoDeCarregamento } from "./_componentes/Esqueleto";
import { HeroInicio } from "./_componentes/HeroInicio";
import { cn } from "@/lib/utils";
import {
  IconeLink,
  IconeMegafone,
  IconePessoas,
  IconePredio,
  IconeRobo,
  type Modulo,
} from "./_componentes/navegacao";

/**
 * Os atalhos do Início — cartões grandes, coloridos pelo MÓDULO de destino.
 *
 * Pedido do usuário (04/09/2026), com referência visual: grade "bento" de
 * cartões com fundo em gradiente, ícone num chip translúcido, título forte e
 * subtítulo. A cor NÃO é arbitrária: cada cartão recebe `data-modulo` da
 * seção para onde leva, e `[data-modulo]` reaponta `--color-acento` dentro
 * dele — o cartão de Pessoas é magenta porque Pessoas É magenta no resto do
 * painel. É o color coding da casa servindo de legenda antes do clique.
 *
 * `largo` faz o cartão ocupar as duas colunas: o destaque vai para a IA, que
 * é o que diferencia este painel.
 */
const ATALHOS: {
  href: string;
  modulo: Modulo;
  titulo: string;
  texto: string;
  icone: (p: SVGProps<SVGSVGElement>) => React.ReactElement;
  largo?: boolean;
}[] = [
  { href: "/corretor/pessoas", modulo: "leads", titulo: "Pessoas", texto: "quem falou com você, do mais recente ao mais antigo", icone: IconePessoas },
  { href: "/corretor/imoveis", modulo: "imoveis", titulo: "Imóveis", texto: "fotos, textos e preços do catálogo", icone: IconePredio },
  { href: "/corretor/whatsapp", modulo: "whatsapp", titulo: "Minha IA", texto: "atende, qualifica e marca visita enquanto você não está", icone: IconeRobo, largo: true },
  { href: "/corretor/imoveis/criar-imagem", modulo: "marketing", titulo: "Criar arte", texto: "peça pronta para publicar, conversando com a IA", icone: IconeMegafone },
  { href: "/corretor/links", modulo: "marketing", titulo: "Meus links", texto: "link atribuído de cada imóvel e do anúncio", icone: IconeLink },
];

/**
 * A tela inicial do painel — uma FILA, não um relatório (roadmap F3).
 *
 * Antes daqui o corretor abria o painel e via números: 3 pendências, 2
 * visitas, um termômetro. Bonito, e ainda assim ele precisava decidir o que
 * fazer com aquilo. Agora a primeira coisa da tela é a próxima ação, com o
 * botão do WhatsApp ao lado; os números continuam existindo, abaixo, para
 * quem quiser conferir a carteira.
 */
export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const primeiroNome = corretor.nome.split(" ")[0];

  return (
    <div className="space-y-8">
      {/*
        A frase de apoio não conta mais quantos itens esperam. Isso obrigava a
        página inteira a AGUARDAR a fila (cinco consultas) antes de pintar a
        primeira letra — e o número já aparece no cabeçalho da própria fila,
        um dedo abaixo. Dizer duas vezes custava a tela inteira parada.
      */}
      {/*
        O cartão de abertura substitui o cabeçalho simples (pedido de
        04/09/2026, com referência visual). Ele precisa das contagens do
        funil, então mora atrás do próprio Suspense: o esqueleto aparece de
        imediato e o cartão chega quando a contagem responde — sem segurar o
        resto da tela.
      */}
      <Suspense fallback={<EsqueletoCartao linhas={3} />}>
        <BlocoDoHero nome={primeiroNome} />
      </Suspense>

      {/*
        Cada bloco busca o próprio dado atrás do seu `<Suspense>`, em vez de a
        página esperar tudo antes de pintar qualquer coisa. Antes eram três
        leituras em paralelo E DEPOIS, em série, a fila com mais cinco: a tela
        só existia quando a última respondesse. Agora o cabeçalho e a cor do
        módulo aparecem de imediato e cada seção chega quando fica pronta.
      */}
      <Suspense fallback={<EsqueletoCartao linhas={1} />}>
        <BlocoDoFunil />
      </Suspense>

      {/*
        O link e os cliques ficam lado a lado porque são a mesma história: o
        link é o que o corretor distribui, e o contador é a resposta de quem
        usou. Separados em cartões distantes, o número perdia a causa.
      */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
          <p className="text-fluid-sm text-titulo font-medium">Seu link pessoal</p>
          <p className="text-fluid-sm text-apoio mt-1">
            Enquanto um cliente navegar por ele, todo botão de WhatsApp do site — em qualquer
            imóvel — fala com você.
          </p>
          <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
        </div>

        <Suspense fallback={<CartaoDeCliques carregando />}>
          <BlocoDeCliques />
        </Suspense>
      </section>

      <section aria-label="Atalhos" className="grid grid-cols-2 gap-3 md:gap-4">
        {ATALHOS.map((a) => {
          const Icone = a.icone;
          return (
            <Link
              key={a.href}
              href={a.href}
              // O `data-modulo` no próprio cartão é o que o pinta com a cor da
              // seção de destino: `bg-acento` aqui já é a cor DAQUELE módulo.
              data-modulo={a.modulo}
              className={cn(
                "from-acento to-acento-hover text-sobre-cor shadow-painel group relative flex min-h-36 flex-col justify-between overflow-hidden rounded-3xl bg-gradient-to-br p-4 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none md:min-h-40 md:p-5",
                a.largo && "col-span-2 flex-row items-center gap-4",
              )}
            >
              <span
                aria-hidden
                className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/20 md:size-14"
              >
                <Icone className="size-6 md:size-7" />
              </span>
              <span className={cn("min-w-0", a.largo && "flex-1")}>
                <span className="font-display block text-lg leading-tight italic md:text-xl">{a.titulo}</span>
                <span className="mt-1 block text-[13px] leading-snug opacity-80 md:text-sm">{a.texto}</span>
              </span>
              {a.largo && (
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/20 transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              )}
            </Link>
          );
        })}
      </section>

      {/*
        A fila vem POR ÚLTIMO — decisão de produto do usuário (04/09/2026), que
        inverteu a da F3. A ordem da tela é: funil → link pessoal → atalhos →
        fila. O que NÃO mudou: a ordem DENTRO da fila (visita de hoje, tarefa
        vencida, lead novo…) continua sendo a do custo de perder, e
        `filaDeTrabalho.test.ts` segue travando isso.
      */}
      <Suspense fallback={<EsqueletoCartao linhas={4} />}>
        <BlocoDaFila />
      </Suspense>
    </div>
  );
}

/**
 * A fila. É o bloco mais caro do Início (cinco consultas, mais as tarefas
 * antes delas) e o mais importante — por isso ele espera atrás do próprio
 * limite em vez de segurar a página.
 */
async function BlocoDaFila() {
  const tarefas = await getMinhasTarefas();
  const fila = await getFilaDeTrabalho(tarefas);
  return <FilaAgora itens={fila} />;
}

async function BlocoDoHero({ nome }: { nome: string }) {
  const contagens = await getContagemPorEtapa();
  return <HeroInicio nome={nome} contagens={contagens} />;
}

async function BlocoDoFunil() {
  const contagens = await getContagemPorEtapa();
  return <TermometroFunil contagens={contagens} />;
}

async function BlocoDeCliques() {
  const cliques = await getCliquesWhatsappCorretor();
  return <CartaoDeCliques cliques={cliques} />;
}

function CartaoDeCliques({
  cliques,
  carregando,
}: {
  cliques?: { hoje: number; total: number } | null;
  carregando?: boolean;
}) {
  return (
    <div className="border-linha bg-superficie shadow-painel flex flex-col justify-center rounded-2xl border p-5 sm:p-6">
      <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">
        Cliques hoje
      </span>
      {carregando ? (
        <>
          <AvisoDeCarregamento>Contando os cliques do seu link…</AvisoDeCarregamento>
          <Esqueleto className="mt-2 h-9 w-16" />
          <Esqueleto className="mt-2 h-3 w-40" />
        </>
      ) : (
        <>
          {/* `null` = a contagem falhou. Mostrar "0" aqui faria o corretor
              achar que o link parou de converter. */}
          <p className="font-display text-titulo mt-1 text-4xl tabular-nums">
            {cliques ? cliques.hoje : "—"}
          </p>
          <p className="text-fluid-xs text-apoio mt-1">
            {cliques == null
              ? "Contagem indisponível — tente recarregar em instantes"
              : `${cliques.total} no total acumulado`}
          </p>
        </>
      )}
    </div>
  );
}
