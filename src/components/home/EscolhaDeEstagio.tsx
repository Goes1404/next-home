import Link from "next/link";
import { CartaoTilt } from "@/components/motion/CartaoTilt";
import { NumeroQueConta } from "@/components/motion/NumeroQueConta";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";
import { contarPorEstagio, type EstagioDeCompra } from "@/lib/estagioDeCompra";
import type { Empreendimento } from "@/lib/types";

/**
 * As duas portas da home: chave na mão agora, ou obra por vir.
 *
 * ## Por que esta seção existe
 *
 * A home oferecia UM eixo de navegação — o lugar (as regiões). Só que a
 * primeira pergunta de quem compra não é "onde", é **"quando eu moro?"**, e
 * as duas respostas são pessoas diferentes com dinheiro diferente na mão:
 * quem compra pronto precisa do valor inteiro agora; quem compra na planta
 * paga durante a obra e entra com bem menos.
 *
 * Quem chegava sabendo o prazo — e não o bairro — não tinha por onde entrar.
 *
 * ## As decisões
 *
 * - **Dois cartões, não uma lista de seis estágios.** A régua do grupo está
 *   em `estagioDeCompra.ts`; aqui só se desenha. Seis rótulos exigiriam que
 *   o visitante soubesse a diferença entre "pré" e "breve lançamento", que é
 *   vocabulário de quem vende.
 * - **O número é a promessa, e ele SAI DO BANCO.** "10 imóveis" é
 *   verificável e encolhe quando o catálogo encolhe — a mesma régua da faixa
 *   de prova. Por isso a contagem vem por prop, do catálogo já carregado
 *   pela home: zero consulta nova.
 * - **Lado vazio não vira porta.** Sem imóvel pronto, o cartão de pronto não
 *   aparece — porta para sala vazia é o defeito que os chips de região já
 *   tinham, e que custou uma correção inteira.
 * - **A cor é a do estágio**, a mesma escala do selo que aparece em todo
 *   cartão do catálogo (`statusCor.ts`): azul para o que ainda vai sair do
 *   papel, verde para o que já está de pé. A seção não inventa paleta.
 * - **Superfície do TEMA, não tinta escura fixa (12/09/2026).** A primeira
 *   versão era `bg-ink-950` com texto branco — desenhada quando o padrão do
 *   site era escuro. Com o tema claro como padrão, dois blocos pretos no
 *   meio de uma página sage liam como banner de outro site. Hoje o cartão
 *   é `cartao` (superfície translúcida do tema) e só o NÚMERO e a seta
 *   levam a cor do estágio: `acento` (teal) para pronto, `realce` (azul)
 *   para obra — os dois tokens já têm contraste AA medido nos dois temas.
 */

type Porta = {
  estagio: EstagioDeCompra;
  titulo: string;
  texto: string;
  /** Tokens do tema (mudam com claro/escuro): a cor do estágio, só no número e na seta. */
  tinta: string;
  brilho: string;
  borda: string;
};

const PORTAS: Porta[] = [
  {
    estagio: "pronto",
    titulo: "Pronto para morar",
    texto: "Chave na mão: dá para visitar a unidade de verdade e mudar sem esperar obra.",
    tinta: "text-acento-suave",
    brilho: "from-acento/20",
    borda: "hover:border-acento-linha",
  },
  {
    estagio: "obra",
    titulo: "Na planta ou em obra",
    texto: "Preço de lançamento e pagamento diluído durante a construção, direto com a construtora.",
    tinta: "text-realce",
    brilho: "from-realce/20",
    borda: "hover:border-realce-linha",
  },
];

export function EscolhaDeEstagio({ catalogo }: { catalogo: Empreendimento[] }) {
  const conta = contarPorEstagio(catalogo);
  const portas = PORTAS.filter((p) => conta[p.estagio] > 0);
  if (portas.length === 0) return null;

  return (
    <section id="quando-morar" className="scroll-mt-24 px-4 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto w-full max-w-6xl">
        <p className="text-fluid-xs text-apoio mb-3">
          <span className="text-acento-suave font-semibold tabular-nums">{catalogo.length}</span>{" "}
          imóveis, dois jeitos de comprar
        </p>
        <TituloEditorial className="text-fluid-2xl text-titulo">
          Quando você quer morar?
        </TituloEditorial>
        <Reveal from="nenhuma" delay={0.15}>
          <p className="text-fluid-base text-apoio mt-3 max-w-xl text-pretty">
            É a primeira escolha, e ela muda tudo o que vem depois — o preço, a entrada e a data da
            mudança.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {portas.map((porta, i) => (
            <CartaoTilt key={porta.estagio} indice={i} className="rounded-glass">
              <Link
                href={`/empreendimentos?estagio=${porta.estagio}`}
                className={`cartao group relative block h-full overflow-hidden p-6 transition-[border-color,transform] duration-300 hover:-translate-y-0.5 sm:p-8 ${porta.borda}`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none absolute -top-24 -right-16 size-56 rounded-full bg-gradient-to-br to-transparent blur-2xl transition-opacity duration-500 group-hover:opacity-100 ${porta.brilho} opacity-70`}
                />

                <span className="relative flex h-full flex-col">
                  <span className={`font-display block text-5xl leading-none sm:text-6xl ${porta.tinta}`}>
                    <NumeroQueConta valor={conta[porta.estagio]} className="tabular-nums" />
                  </span>
                  <span className="text-apoio mt-1 block text-xs tracking-[0.14em] uppercase">
                    {conta[porta.estagio] === 1 ? "imóvel" : "imóveis"}
                  </span>

                  <span className="font-display mt-5 block text-2xl text-titulo">{porta.titulo}</span>
                  <span className="text-apoio mt-2 block text-sm text-pretty">
                    {porta.texto}
                  </span>

                  <span className={`mt-6 inline-flex items-center gap-2 text-sm font-medium ${porta.tinta}`}>
                    Ver os {conta[porta.estagio]}
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden
                      className="size-4 transition-transform duration-300 group-hover:translate-x-1"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </span>
              </Link>
            </CartaoTilt>
          ))}
        </div>
      </div>
    </section>
  );
}
