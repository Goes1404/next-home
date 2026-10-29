import Link from "next/link";
import type { CSSProperties } from "react";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { linkDoWhatsAppDaAstro, MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { LIMITES_POR_MES } from "@/lib/planos/limitesDoPlano";
import { hrefDeContratar, NOME_CURTO_NA_VENDA, planoParaORamo } from "@/lib/plataforma/pedidoDeContratacao";
import { IconeDoRamo } from "@/lib/ramos/IconeDoRamo";
import { CONFIG_DOS_RAMOS, RAMOS } from "@/lib/ramos/ramos";
import { PRECO_ESSENCIAL, PRECO_POR_USUARIO_DA_IMOBILIARIA, PRECO_PROFISSIONAL } from "@/lib/plataforma/tiposDeConta";
import { RodapeLegal } from "./_componentes/PaginaLegal";
import s from "./astro.module.css";

/**
 * A página de vendas da Astro Soluções (28/10/2026).
 *
 * O topo mostra o que o produto faz de mais característico: um lead que
 * chama de noite e é atendido pela IA no WhatsApp, até a visita marcada (as
 * mensagens entram em sequência uma vez; com movimento reduzido já nascem no
 * lugar).
 *
 * Movimento (29/10/2026, "vamos colocar algumas animações, transições"): o
 * topo chega em degraus, as seções sobem conforme entram na tela e o
 * cabeçalho gruda com fundo escuro ao rolar. Tudo em CSS puro (ver
 * `astro.module.css`), sem JavaScript a mais nem biblioteca: a página segue
 * sendo um Server Component. `--ordem` escalona os itens de uma mesma fileira.
 *
 * Os preços e limites saem das MESMAS constantes que a plataforma cobra
 * (`tiposDeConta.ts`, `limitesDoPlano.ts`): mudou lá, muda aqui.
 *
 * Contratar (29/10/2026, "permita a pessoa clicar no plano, e leve ela para
 * as próximas telas"): o cartão inteiro de cada plano leva ao assistente
 * `/astro/contratar?plano=<id>`. O link de verdade é o botão "Contratar
 * <plano>", com o nome curto do plano (Essencial, Profissional,
 * Imobiliária: o nome inteiro quebrava o botão em duas linhas); o `::before`
 * dele cobre o cartão, então clicar em qualquer ponto do cartão contrata.
 *
 * Para todo ramo (29/10/2026, 0244, pedido do dono: "não vamos limitar só
 * para imobiliárias, porque tem seguradoras, advocacia..."): o texto fala de
 * "empresas que vendem e atendem pelo WhatsApp", a imobiliária vira UM dos
 * exemplos, e a seção "Para quem é" mostra os ramos, cada cartão levando ao
 * assistente com o ramo marcado (`?ramo=`). O plano de equipe se chama
 * "Empresa" aqui (o id continua `imobiliaria`).
 *
 * Fale com a Astro (29/10/2026): o fechamento e o rodapé levam a
 * `/astro/contato`, o formulário de quem quer perguntar antes de contratar.
 * O contato vira chamado (0240) e avisa no celular quem administra a
 * plataforma.
 */

const CONVERSA = [
  { de: "cliente", texto: "Oi! Vi o anúncio do apartamento de 2 dormitórios em Barueri. Ainda tem?", hora: "23:41" },
  { de: "ia", texto: "Oi, Carla! Tem sim. É o de 68 m² com varanda, a 5 min do trem. Você procura para morar ou investir?", hora: "23:41" },
  { de: "cliente", texto: "Para morar. Dá para visitar no sábado?", hora: "23:43" },
  { de: "ia", texto: "Dá sim. Sábado às 10h com o Rafael, que cuida desse imóvel. Posso confirmar?", hora: "23:43" },
  { de: "cliente", texto: "Pode confirmar 🙌", hora: "23:44" },
] as const;

const PASSOS = [
  { titulo: "O lead chega", texto: "Do anúncio no Instagram, do portal, do site ou da lista de transmissão. Tudo cai no mesmo lugar." },
  { titulo: "A IA responde na hora", texto: "No WhatsApp de quem vende, a qualquer hora. Ela tira as primeiras dúvidas e descobre o que o cliente procura." },
  { titulo: "A sua equipe assume", texto: "Com o resumo da conversa pronto e o lead já na etapa certa do funil. Nada de começar do zero." },
  { titulo: "O atendimento vira venda", texto: "A visita, a reunião ou a consulta entra na agenda, o lembrete sai sozinho e a venda fica registrada." },
] as const;

const RECURSOS = [
  { nome: "Atendimento com IA no WhatsApp", texto: "Responde quando o cliente escreve, nunca puxa assunto sozinha e passa a conversa para você quando é hora." },
  { nome: "Funil de vendas", texto: "Cada lead na sua etapa, com o histórico da conversa e os próximos passos à vista." },
  { nome: "Roleta de leads dos anúncios", texto: "Distribui os leads entre a equipe na ordem que o gestor definir, e quem pagou o anúncio fica com o lead." },
  { nome: "Listas de transmissão seguras", texto: "Reative a base antiga com limite diário por número, para o WhatsApp não ser bloqueado." },
  { nome: "Agenda de atendimentos", texto: "Visitas, reuniões e consultas marcadas pela IA ou pela equipe, com lembrete para os dois lados." },
  { nome: "Artes com IA", texto: "Posts prontos para o Instagram, com a sua marca, pedidos numa conversa." },
  { nome: "Vendas e comissões", texto: "Metas, vendas fechadas e o que cada vendedor tem a receber, sem planilha paralela." },
  { nome: "Para imobiliárias: catálogo e site", texto: "Catálogo de imóveis, vídeos dos imóveis e vitrine com o seu domínio, ligados ao CRM." },
] as const;

/** Posição do item na fileira, para o CSS escalonar a chegada (`--ordem`). */
function ordem(n: number): CSSProperties {
  return { "--ordem": n } as CSSProperties;
}

function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function inteiro(valor: number | null): string {
  return valor === null ? "Sem limite" : valor.toLocaleString("pt-BR");
}

const PLANOS = [
  {
    id: "essencial",
    nome: "Autônomo Essencial",
    para: planoParaORamo("essencial", "outro").resumo,
    preco: reais(PRECO_ESSENCIAL),
    unidade: "por mês",
    limites: LIMITES_POR_MES.essencial,
    destaque: false,
  },
  {
    id: "profissional",
    nome: "Autônomo Profissional",
    para: "Para quem anuncia toda semana e precisa de mais artes, vídeos e listas.",
    preco: reais(PRECO_PROFISSIONAL),
    unidade: "por mês",
    limites: LIMITES_POR_MES.profissional,
    destaque: false,
  },
  {
    id: "imobiliaria",
    // O id é o de sempre (links salvos `?plano=imobiliaria`); o nome é o de todo ramo.
    nome: planoParaORamo("imobiliaria", "outro").nome,
    para: "Equipe, gestor, roleta de leads e a sua marca no CRM. Imobiliárias ganham o site com os imóveis.",
    preco: reais(PRECO_POR_USUARIO_DA_IMOBILIARIA),
    unidade: "por usuário, por mês",
    limites: LIMITES_POR_MES.imobiliaria,
    destaque: true,
  },
] as const;

export default function PaginaDaAstro() {
  const whatsapp = linkDoWhatsAppDaAstro();
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;

  return (
    <main id="conteudo" className={`${s.pagina} flex-1`}>
      {/* ---------------- Topo ---------------- */}
      {/* Fora da seção do topo de propósito: `sticky` só gruda dentro do pai, e
          o topo tem `overflow: hidden`. A margem negativa (no CSS) devolve o
          cabeçalho para cima do fundo escuro do topo, como antes. */}
      <header className={s.cabecalho}>
        <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/astro" className={`${s.titulo} flex items-center gap-2.5 text-lg font-bold text-white`}>
            <SeloAstro className="size-9" />
            <span>
              {nomeA}
              <span className="font-semibold text-[#a9c1e0]">{nomeB}</span>
            </span>
          </Link>
          <nav aria-label="Página" className="flex items-center gap-1 sm:gap-2">
            <a href="#recursos" className={`${s.linkDoTopo} hidden rounded-full px-3 py-2 text-sm text-white/80 hover:text-white sm:inline`}>
              Recursos
            </a>
            <a href="#planos" className={`${s.linkDoTopo} hidden rounded-full px-3 py-2 text-sm text-white/80 hover:text-white sm:inline`}>
              Planos
            </a>
            <Link href="/corretor/entrar" className={`${s.botao} ${s.botaoContorno} min-h-10 px-4 text-sm`}>
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      <section className={s.topo}>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 pt-14 pb-20 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pt-20 lg:pb-28">
          <div className="max-w-xl">
            <h1 className={`${s.titulo} ${s.chegaTitulo} text-[clamp(2.4rem,5.6vw,4.1rem)] leading-[1.02] font-extrabold text-balance`}>
              O cliente chamou às 23h. Às 23h ele já tinha resposta.
            </h1>
            <p className={`${s.chega} mt-6 max-w-[34rem] text-lg leading-relaxed text-pretty text-white/78`} style={ordem(1)}>
              O CRM da {MARCA_DA_PLATAFORMA.nome} atende seus leads no WhatsApp com inteligência artificial, organiza o
              funil e marca os atendimentos. Você entra na conversa para vender.
            </p>
            <div className={`${s.chega} mt-9 flex flex-wrap gap-3`} style={ordem(2)}>
              {/* "Ver planos" leva aos cartões, que levam ao assistente de
                  contratação (29/10/2026). Com o WhatsApp configurado, a
                  conversa segue como o botão principal. */}
              {whatsapp ? (
                <>
                  <a href={whatsapp} target="_blank" rel="noopener" className={`${s.botao} ${s.botaoPrincipal} ${s.brilhoUmaVez}`}>
                    Conversar com a Astro no WhatsApp
                  </a>
                  <a href="#planos" className={`${s.botao} ${s.botaoContorno}`}>
                    Ver planos
                  </a>
                </>
              ) : (
                <a href="#planos" className={`${s.botao} ${s.botaoPrincipal} ${s.brilhoUmaVez}`}>
                  Ver planos e contratar
                </a>
              )}
              <Link href="/corretor/entrar" className={`${s.botao} ${s.botaoContorno}`}>
                Já sou cliente
              </Link>
            </div>
            <p className={`${s.chega} mt-7 text-sm text-white/60`} style={ordem(3)}>
              Para empresas que vendem e atendem pelo WhatsApp: imobiliárias, corretoras de seguros, escritórios de
              advocacia e mais. Com equipe ou autônomo.
            </p>
          </div>

          <div className={`${s.palco} ${s.chegaPalco} mx-auto w-full max-w-[22rem] lg:max-w-[23rem]`}>
            <span aria-hidden className={s.orbita} />
            <svg aria-hidden viewBox="0 0 24 24" className={s.estrela}>
              <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="#fff" />
            </svg>
            <figure className={s.celular} aria-label="Exemplo de atendimento da IA no WhatsApp">
              <div className={s.celularTopo}>
                <span className="grid size-9 place-items-center rounded-full bg-[#a9c1e0] text-sm font-bold text-[#0f2547]">C</span>
                <div className="leading-tight">
                  <p className="text-sm font-semibold">Carla</p>
                  <p className="text-xs text-white/60">lead do anúncio · Instagram</p>
                </div>
              </div>
              <div className={s.conversa}>
                {CONVERSA.map((m, i) => (
                  <p
                    key={i}
                    className={`${s.msg} ${m.de === "ia" ? s.msgIa : s.msgCliente} ${s.entra}`}
                    style={{ animationDelay: `${300 + i * 650}ms` } as CSSProperties}
                  >
                    {m.texto}
                    <span className={s.hora}>
                      {m.hora}
                      {m.de === "ia" ? " · IA" : ""}
                    </span>
                  </p>
                ))}
                <p className={`${s.etapa} ${s.entra}`} style={{ animationDelay: `${300 + CONVERSA.length * 650}ms` }}>
                  <span aria-hidden className={s.pontoVerde} />
                  Funil: visita marcada para sábado, 10h
                </p>
              </div>
            </figure>
          </div>
        </div>
      </section>

      {/* ---------------- Como funciona ---------------- */}
      <section aria-labelledby="como" className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 lg:py-28">
        <h2 id="como" className={`${s.titulo} ${s.surge} max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-tight font-bold text-balance`}>
          Do anúncio até a venda, sem lead esquecido no meio do caminho
        </h2>
        <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className={`${s.passo} ${s.surge}`} style={ordem(i)}>
              <span aria-hidden className={s.numeroDoPasso}>
                {i + 1}
              </span>
              <h3 className={`${s.titulo} mt-4 text-xl font-bold`}>{p.titulo}</h3>
              <p className="mt-2 leading-relaxed text-[var(--tinta-suave)]">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Para quem é (0244) ---------------- */}
      <section id="para-quem" aria-labelledby="titulo-para-quem" className={`${s.ancora} mx-auto w-full max-w-6xl px-5 pb-20 md:px-8 lg:pb-28`}>
        <h2 id="titulo-para-quem" className={`${s.titulo} ${s.surge} max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-tight font-bold text-balance`}>
          Para quem é
        </h2>
        <p className={`${s.surge} mt-4 max-w-xl leading-relaxed text-[var(--tinta-suave)]`}>
          O mesmo CRM, com o vocabulário e a IA do seu negócio. Escolha o seu ramo e a conta já nasce do seu jeito.
        </p>
        {/* No celular, duas colunas só com o nome (nove cartões com resumo viravam uma parede). */}
        <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {RAMOS.map((ramo, i) => {
            const c = CONFIG_DOS_RAMOS[ramo];
            return (
              <li key={ramo} className={s.surge} style={ordem(i % 3)}>
                <Link href={`/astro/contratar?ramo=${ramo}`} className={s.ramoCartao}>
                  <span aria-hidden className={s.ramoIcone}>
                    <IconeDoRamo ramo={ramo} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className={`${s.titulo} block text-[0.95rem] leading-snug font-bold sm:text-lg`}>
                      {ramo === "outro" ? "Outro ramo" : c.rotulo}
                    </span>
                    <span className="mt-1 hidden text-[0.95rem] leading-snug text-[var(--tinta-suave)] sm:block">{c.resumo}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------- Recursos ---------------- */}
      <section id="recursos" aria-labelledby="titulo-recursos" className={`${s.ancora} bg-white`}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-20 md:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:py-28">
          <div className={s.surge}>
            <h2 id="titulo-recursos" className={`${s.titulo} text-[clamp(1.9rem,3.6vw,2.75rem)] leading-tight font-bold text-balance`}>
              Tudo que a sua equipe de vendas usa no dia, num lugar só
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-[var(--tinta-suave)]">
              Nasceu dentro de uma imobiliária de verdade, com a equipe usando todo dia, e serve a qualquer negócio que
              vende pelo WhatsApp. Cada recurso nasceu de um problema que custava venda.
            </p>
          </div>
          <dl className="grid gap-x-10 sm:grid-cols-2">
            {RECURSOS.map((r, i) => (
              <div key={r.nome} className={`${s.recurso} ${s.surge}`} style={ordem(i % 2)}>
                <dt className={`${s.titulo} text-lg font-bold`}>{r.nome}</dt>
                <dd className="mt-1.5 leading-relaxed text-[var(--tinta-suave)]">{r.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- Planos ---------------- */}
      <section id="planos" aria-labelledby="titulo-planos" className={`${s.ancora} mx-auto w-full max-w-6xl px-5 py-20 md:px-8 lg:py-28`}>
        <h2 id="titulo-planos" className={`${s.titulo} ${s.surge} max-w-2xl text-[clamp(1.9rem,3.6vw,2.75rem)] leading-tight font-bold text-balance`}>
          Um plano para empresas com equipe, dois para quem é autônomo
        </h2>
        <p className={`${s.surge} mt-4 max-w-xl leading-relaxed text-[var(--tinta-suave)]`}>
          Todos com a IA no WhatsApp, o funil, a agenda e as vendas. O que muda é o tamanho da equipe e o volume de artes,
          vídeos e listas por mês.
        </p>
        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {PLANOS.map((p, i) => (
            <article key={p.id} className={`${p.destaque ? s.planoDestaque : s.plano} ${s.surge} flex flex-col p-7`} style={ordem(i)}>
              <h3 className={`${s.titulo} text-2xl font-bold`}>{p.nome}</h3>
              <p className={`mt-2 min-h-[3rem] leading-snug ${p.destaque ? "text-white/75" : "text-[var(--tinta-suave)]"}`}>{p.para}</p>
              <p className="mt-6">
                <span className={`${s.titulo} text-4xl font-extrabold`}>{p.preco}</span>{" "}
                <span className={p.destaque ? "text-white/70" : "text-[var(--tinta-suave)]"}>{p.unidade}</span>
              </p>
              <ul className={`mt-6 mb-7 space-y-2 border-t pt-5 text-[0.95rem] ${p.destaque ? "border-white/20" : "border-[var(--linha)]"}`}>
                <li>
                  {inteiro(p.limites.arte)} artes com IA{p.destaque ? " por usuário" : ""} por mês
                </li>
                <li>
                  {inteiro(p.limites.video)} vídeos{p.destaque ? " por usuário" : ""} por mês
                </li>
                <li>{inteiro(p.limites.lista)} mensagens de lista por mês</li>
              </ul>
              <Link
                href={hrefDeContratar(p.id)}
                className={`${s.ctaDoPlano} ${p.destaque ? s.ctaDoPlanoNoEscuro : ""} mt-auto`}
              >
                Contratar {NOME_CURTO_NA_VENDA[p.id]}
                <span aria-hidden className={s.setaDoPlano}>
                  →
                </span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Fechamento ---------------- */}
      <section className={s.fechamento}>
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-5 py-20 md:px-8 lg:flex-row lg:items-center lg:justify-between lg:py-24">
          <div className={`${s.surge} max-w-xl`}>
            <h2 className={`${s.titulo} text-[clamp(1.9rem,3.6vw,2.75rem)] leading-tight font-bold text-balance`}>
              Veja o CRM funcionando no seu negócio
            </h2>
            <p className="mt-4 leading-relaxed text-white/75">
              A gente configura a sua conta, conecta o WhatsApp e acompanha a primeira semana com você.
            </p>
          </div>
          <div className={`${s.surge} flex flex-wrap gap-3`} style={ordem(1)}>
            <Link href="/astro/contratar" className={`${s.botao} ${s.botaoPrincipal}`}>
              Escolher meu plano
            </Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener" className={`${s.botao} ${s.botaoContorno}`}>
                Conversar no WhatsApp
              </a>
            )}
            <Link href="/astro/contato" className={`${s.botao} ${s.botaoContorno}`}>
              Fale com a Astro
            </Link>
            <Link href="/corretor/entrar" className={`${s.botao} ${s.botaoContorno}`}>
              Entrar no CRM
            </Link>
          </div>
        </div>
      </section>

      <RodapeLegal />
    </main>
  );
}
