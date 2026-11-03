import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { linkDoWhatsAppDaAstro, MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { LIMITES_POR_MES } from "@/lib/planos/limitesDoPlano";
import { hrefDeContratar, NOME_CURTO_NA_VENDA, planoParaORamo } from "@/lib/plataforma/pedidoDeContratacao";
import { IconeDoRamo } from "@/lib/ramos/IconeDoRamo";
import { CONFIG_DOS_RAMOS, RAMOS } from "@/lib/ramos/ramos";
import { PRECO_ESSENCIAL, PRECO_POR_USUARIO_DA_IMOBILIARIA, PRECO_PROFISSIONAL } from "@/lib/plataforma/tiposDeConta";
import { CenaDoEspaco } from "./_componentes/CenaDoEspaco";
import { RodapeLegal } from "./_componentes/PaginaLegal";
import { FONTES_DA_VITRINE } from "./fontesDaVitrine";
import v from "./vendas.module.css";

/**
 * A página de vendas da Astro Soluções.
 *
 * Visual (03/11/2026, "estou achando ela muito feia, vamos usar o
 * astrosolucoes.netlify.app como referência, é o site da nossa empresa"): a
 * mesma linguagem do site institucional. Fundo azul-noite com estrelas,
 * títulos em Anton caixa alta, texto em Inter Tight, selos em mono, botões em
 * pílula cobalto, faixa de recursos correndo e "janelas" que simulam o
 * produto ao lado de cada bloco. O planeta do topo é CSS (o site institucional
 * usa uma cena 3D; aqui a página segue Server Component, sem JavaScript).
 * Estilos só desta página em `vendas.module.css`: contratar, contato, ajuda e
 * as páginas legais seguem com `astro.module.css`.
 *
 * Regras que vieram das versões anteriores e continuam valendo:
 * - Preços e limites saem das MESMAS constantes que a plataforma cobra
 *   (`tiposDeConta.ts`, `limitesDoPlano.ts`): mudou lá, muda aqui.
 * - O cartão inteiro de cada plano leva a `/astro/contratar?plano=<id>`; o
 *   link de verdade é o "Contratar <nome curto>", cujo `::before` cobre o
 *   cartão (29/10/2026).
 * - Para todo ramo (0244): a imobiliária é UM dos exemplos; "Para quem é"
 *   leva ao assistente com o ramo marcado (`?ramo=`). O plano de equipe se
 *   chama "Empresa" aqui (o id continua `imobiliaria`).
 * - O fechamento e o rodapé levam a `/astro/contato` (Fale com a Astro).
 * - Movimento só em CSS, só `translate`/`scale`/`opacity`, e nada anda com
 *   "menos movimento" ligado.
 */

const CONVERSA = [
  { de: "cliente", texto: "Oi! Vi o anúncio do apartamento de 2 dormitórios em Barueri. Ainda tem?", hora: "23:41" },
  { de: "ia", texto: "Oi, Carla! Tem sim. É o de 68 m² com varanda, a 5 min do trem. Você procura para morar ou investir?", hora: "23:41" },
  { de: "cliente", texto: "Para morar. Dá para visitar no sábado?", hora: "23:43" },
  { de: "ia", texto: "Dá sim. Sábado às 10h com o Rafael, que cuida desse imóvel. Posso confirmar?", hora: "23:43" },
  { de: "cliente", texto: "Pode confirmar 🙌", hora: "23:44" },
] as const;

const FAIXA = [
  "Atendimento com IA",
  "Funil de vendas",
  "Roleta de leads",
  "Listas de transmissão",
  "Agenda de atendimentos",
  "Artes com IA",
  "Vendas e comissões",
  "Site com catálogo",
] as const;

const PASSOS = [
  { titulo: "O lead chega", texto: "Do anúncio no Instagram, do portal, do site ou da lista de transmissão. Tudo cai no mesmo lugar." },
  { titulo: "A IA responde na hora", texto: "No WhatsApp de quem vende, a qualquer hora. Ela tira as primeiras dúvidas e descobre o que o cliente procura." },
  { titulo: "A equipe assume", texto: "Com o resumo da conversa pronto e o lead já na etapa certa do funil. Nada de começar do zero." },
  { titulo: "Vira venda", texto: "A visita, a reunião ou a consulta entra na agenda, o lembrete sai sozinho e a venda fica registrada." },
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

/** Exemplo do funil na janela do bloco "funil" (nomes ilustrativos). */
const FUNIL = [
  { etapa: "Novo", leads: [{ nome: "Marcos T.", nota: "Instagram · agora" }, { nome: "Júlia R.", nota: "Portal · 5 min" }] },
  { etapa: "Em conversa", leads: [{ nome: "Carla M.", nota: "IA atendendo" }, { nome: "Paulo S.", nota: "aguarda proposta" }] },
  { etapa: "Visita", leads: [{ nome: "Ana L.", nota: "sáb · 10h" }] },
] as const;

/** Exemplo da roleta na janela do bloco "roleta" (nomes ilustrativos). */
const ROLETA = [
  { nome: "Rafael", leads: 7, proximo: true },
  { nome: "Bianca", leads: 7, proximo: false },
  { nome: "Diego", leads: 6, proximo: false },
] as const;

/** Exemplo da agenda na janela do bloco "agenda" (nomes ilustrativos). */
const AGENDA = [
  { hora: "09:30", quem: "Reunião · Paulo S.", origem: "marcada pela equipe" },
  { hora: "10:00", quem: "Visita · Carla M.", origem: "marcada pela IA" },
  { hora: "14:00", quem: "Visita · Ana L.", origem: "lembrete enviado" },
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
    selo: "Autônomo",
    para: planoParaORamo("essencial", "outro").resumo,
    preco: reais(PRECO_ESSENCIAL),
    unidade: "por mês",
    limites: LIMITES_POR_MES.essencial,
    destaque: false,
  },
  {
    id: "profissional",
    nome: "Autônomo Profissional",
    selo: "Autônomo",
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
    selo: "Com equipe",
    para: "Equipe, gestor, roleta de leads e a sua marca no CRM. Imobiliárias ganham o site com os imóveis.",
    preco: reais(PRECO_POR_USUARIO_DA_IMOBILIARIA),
    unidade: "por usuário, por mês",
    limites: LIMITES_POR_MES.imobiliaria,
    destaque: true,
  },
] as const;

function Estrela({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      <path d="M12 0 L14.6 9.4 L24 12 L14.6 14.6 L12 24 L9.4 14.6 L0 12 L9.4 9.4 Z" fill="currentColor" />
    </svg>
  );
}

/** A moldura das janelas que simulam o produto (três pontinhos em cima). */
function Janela({ titulo, children, className = "" }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <figure aria-label={titulo} className={`${v.janela} ${className}`}>
      <div aria-hidden className={v.janelaBarra}>
        <span />
        <span />
        <span />
      </div>
      {children}
    </figure>
  );
}

/** Um bloco "título + texto + destaque + selos", com a janela do lado. */
function Bloco({
  id,
  titulo,
  texto,
  destaque,
  selos,
  invertido = false,
  children,
}: {
  id: string;
  titulo: ReactNode;
  texto: string;
  destaque: string;
  selos: readonly string[];
  invertido?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={`${v.bloco} ${invertido ? v.blocoInvertido : ""}`}>
      <div className={`${v.blocoTexto} ${v.surge}`}>
        <h2 id={id} className={`${v.impacto} ${v.tituloSecao}`}>
          {titulo}
        </h2>
        <p className={v.paragrafo}>{texto}</p>
        <p className={v.marcador}>{destaque}</p>
        <ul className={v.selos} aria-label="Recursos do bloco">
          {selos.map((selo) => (
            <li key={selo} className={v.selo}>
              {selo}
            </li>
          ))}
        </ul>
      </div>
      <div className={`${v.blocoJanela} ${v.surge}`} style={ordem(1)}>
        {children}
      </div>
    </section>
  );
}

export default function PaginaDaAstro() {
  const whatsapp = linkDoWhatsAppDaAstro();
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;

  return (
    <main id="conteudo" className={`${FONTES_DA_VITRINE} ${v.pagina} flex-1`}>
      {/* ---------------- Cabeçalho ---------------- */}
      {/* Fora do topo de propósito: `sticky` só gruda dentro do pai, e o topo
          tem `overflow: hidden`. A margem negativa (no CSS) o devolve para
          cima do céu do topo. */}
      <header className={v.cabecalho}>
        <div className={v.cabecalhoDentro}>
          <Link href="/astro" className="flex items-center gap-2.5 text-[1.05rem] font-medium text-white">
            <SeloAstro className="size-9" />
            <span className={v.marca}>
              {nomeA}
              <span className="text-[var(--ash)]">{nomeB}</span>
            </span>
          </Link>
          <nav aria-label="Página" className={v.navegacao}>
            <a href="#como-funciona" className={v.linkDoTopo}>
              Como funciona
            </a>
            <a href="#recursos" className={v.linkDoTopo}>
              Recursos
            </a>
            <a href="#planos" className={v.linkDoTopo}>
              Planos
            </a>
            <Link href="/astro/contato" className={v.linkDoTopo}>
              Contato
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/corretor/entrar" className={`${v.botao} ${v.botaoContorno} ${v.botaoPequeno}`}>
              Entrar
            </Link>
            <Link href="/astro/contratar" className={`${v.botao} ${v.botaoPrincipal} ${v.botaoPequeno} ${v.soNoTablet}`}>
              Contratar
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- Topo ---------------- */}
      <section className={v.topo}>
        <span aria-hidden className={v.estrelas} />
        <span aria-hidden className={v.estrelasPerto} />
        <span aria-hidden className={v.clarao} />
        <span aria-hidden className={v.planeta} />
        {/* O foguete e os planetas do site da empresa, em 3D. Carrega depois da
            página aberta; até lá (ou sem WebGL) fica o céu de CSS acima. */}
        <CenaDoEspaco className={v.cena} aoFicarPronta={v.cenaPronta} />

        <div className={v.topoDentro}>
          <h1 className={`${v.impacto} ${v.tituloDoTopo} ${v.chegaTitulo}`}>
            O cliente chamou às 23h. <span className={v.tituloDoTopoLinha}>A IA já respondeu.</span>
          </h1>

          <p className={`${v.etiqueta} ${v.chega}`} style={ordem(1)}>
            <Estrela className="size-3 text-[var(--cobalt)]" />
            CRM com IA no WhatsApp
          </p>

          <p className={`${v.chega} ${v.lide}`} style={ordem(2)}>
            O CRM da {MARCA_DA_PLATAFORMA.nome} atende seus leads no WhatsApp com{" "}
            <span className="text-[var(--cobalt-claro)]">inteligência artificial</span>, organiza o funil e marca os
            atendimentos. Você entra na conversa para vender.
          </p>

          <div className={`${v.chega} ${v.acoes}`} style={ordem(3)}>
            {/* "Ver planos" leva aos cartões, que levam ao assistente de
                contratação. Com o WhatsApp configurado, a conversa é o botão
                principal. "Já sou cliente" saiu: o "Entrar" do cabeçalho faz isso. */}
            {whatsapp ? (
              <>
                <a href={whatsapp} target="_blank" rel="noopener" className={`${v.botao} ${v.botaoPrincipal} ${v.brilhoUmaVez}`}>
                  Conversar no WhatsApp
                  <span aria-hidden className={v.seta}>
                    ↗
                  </span>
                </a>
                <a href="#planos" className={`${v.botao} ${v.botaoContorno}`}>
                  Ver planos
                </a>
              </>
            ) : (
              <a href="#planos" className={`${v.botao} ${v.botaoPrincipal} ${v.brilhoUmaVez}`}>
                Ver planos e contratar
                <span aria-hidden className={v.seta}>
                  ↓
                </span>
              </a>
            )}
          </div>

          {/* Um aviso como o que chega no celular de quem vende: o produto
              aparece já na abertura, antes da conversa inteira (mais abaixo). */}
          <div className={`${v.aviso} ${v.chegaAviso}`} aria-label="Exemplo de aviso do CRM">
            <span className={v.avisoSelo}>
              <SeloAstro className="size-8" />
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-[0.8rem] text-[var(--slate)]">
                <span aria-hidden className={v.pontoVerde} />
                IA respondeu em 4 s · 23:41
              </span>
              <span className="mt-0.5 block truncate text-[0.95rem] text-white">Carla · lead do anúncio no Instagram</span>
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- Faixa que corre ---------------- */}
      <div className={v.faixa}>
        <p className="sr-only">Recursos do CRM da {MARCA_DA_PLATAFORMA.nome}: {FAIXA.join(", ")}.</p>
        <div aria-hidden className={v.faixaTrilho}>
          {[0, 1].map((copia) => (
            <ul key={copia} className={v.faixaLista}>
              {FAIXA.map((item) => (
                <li key={item}>
                  <Estrela className="size-2.5 text-[var(--cobalt)]" />
                  {item}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>

      {/* ---------------- Blocos com a janela do produto ---------------- */}
      <div className={v.blocos}>
        <Bloco
          id="bloco-ia"
          titulo={
            <>
              A IA atende
              <br /> no seu WhatsApp
            </>
          }
          texto="O cliente escreve às 23h e recebe resposta na hora, no número de quem vende. A IA tira as primeiras dúvidas, descobre o que ele procura e marca o atendimento."
          destaque="Ela responde quando o cliente escreve e nunca puxa assunto sozinha"
          selos={["WhatsApp", "IA", "Atendimento", "Agenda"]}
        >
          <Janela titulo="Exemplo de atendimento da IA no WhatsApp">
            <div className={v.conversaTopo}>
              <span className="grid size-9 place-items-center rounded-full bg-[var(--obsidian)] text-sm font-semibold text-white">C</span>
              <span className="leading-tight">
                <span className="block text-sm text-white">Carla</span>
                <span className="flex items-center gap-1.5 text-xs text-[var(--slate)]">
                  <span aria-hidden className={v.pontoVerde} />
                  lead do anúncio · Instagram
                </span>
              </span>
            </div>
            <div className={v.conversa}>
              {CONVERSA.map((m, i) => (
                <p key={i} className={`${v.msg} ${m.de === "ia" ? v.msgIa : v.msgCliente} ${v.surgeMsg}`} style={ordem(i)}>
                  {m.texto}
                  <span className={v.hora}>
                    {m.hora}
                    {m.de === "ia" ? " · IA" : ""}
                  </span>
                </p>
              ))}
              <p className={`${v.rodapeDaJanela} ${v.surgeMsg}`} style={ordem(CONVERSA.length)}>
                visita marcada para sábado, 10h · sem ninguém da equipe acordado
              </p>
            </div>
          </Janela>
        </Bloco>

        <Bloco
          id="bloco-funil"
          invertido
          titulo={
            <>
              O funil em ordem,
              <br /> sem planilha
            </>
          }
          texto="Cada lead entra na etapa certa com o histórico da conversa e o próximo passo à vista. A equipe abre o CRM e sabe com quem falar primeiro."
          destaque="Nenhum lead esquecido no meio do caminho"
          selos={["Funil", "Histórico", "Lembretes", "Equipe"]}
        >
          <Janela titulo="Exemplo do funil de vendas">
            <div className={v.funil}>
              {FUNIL.map((coluna) => (
                <div key={coluna.etapa} className={v.funilColuna}>
                  <p className={v.rotuloMono}>
                    {coluna.etapa} <span className="text-[var(--cobalt-claro)]">{coluna.leads.length}</span>
                  </p>
                  {coluna.leads.map((lead) => (
                    <div key={lead.nome} className={v.funilCartao}>
                      <span className="block text-[0.82rem] text-white">{lead.nome}</span>
                      <span className="block text-[0.72rem] text-[var(--slate)]">{lead.nota}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Janela>
        </Bloco>

        <Bloco
          id="bloco-roleta"
          titulo={
            <>
              Lead do anúncio
              <br /> na mão certa
            </>
          }
          texto="A roleta distribui os leads entre a equipe na ordem que o gestor definir. Quem pagou o anúncio fica com o lead, e ninguém precisa repassar contato no grupo."
          destaque="Distribuição justa, sem briga por lead"
          selos={["Roleta", "Anúncios", "Gestor", "Equipe"]}
        >
          <Janela titulo="Exemplo da roleta de leads">
            <div className={v.roleta}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">Roleta · Anúncio Barueri</p>
                <p className="flex items-center gap-1.5 text-xs text-[var(--slate)]">
                  <span aria-hidden className={v.pontoVerde} />
                  ligada
                </p>
              </div>
              <ul className="mt-4 space-y-2">
                {ROLETA.map((r) => (
                  <li key={r.nome} className={`${v.roletaLinha} ${r.proximo ? v.roletaProximo : ""}`}>
                    <span className="grid size-8 place-items-center rounded-full bg-[var(--obsidian)] text-xs text-white">
                      {r.nome[0]}
                    </span>
                    <span className="flex-1 text-sm text-white">{r.nome}</span>
                    <span className="text-xs text-[var(--slate)]">{r.leads} leads no mês</span>
                    {r.proximo && <span className={v.roletaVez}>próximo</span>}
                  </li>
                ))}
              </ul>
            </div>
          </Janela>
        </Bloco>

        <Bloco
          id="bloco-agenda"
          invertido
          titulo={
            <>
              A agenda que
              <br /> se marca sozinha
            </>
          }
          texto="Visitas, reuniões e consultas marcadas pela IA ou pela equipe, com lembrete para os dois lados. O cliente confirma pelo WhatsApp e o horário aparece para quem vai atender."
          destaque="Menos cliente que esquece, menos horário perdido"
          selos={["Agenda", "Lembretes", "WhatsApp", "Equipe"]}
        >
          <Janela titulo="Exemplo da agenda de atendimentos">
            <div className={v.agenda}>
              <div className="flex items-center justify-between">
                <p className="text-sm text-white">Sábado</p>
                <p className={v.rotuloMono}>3 atendimentos</p>
              </div>
              <ul className="mt-4 space-y-2">
                {AGENDA.map((a) => (
                  <li key={a.hora} className={v.agendaLinha}>
                    <span className={`${v.agendaHora}`}>{a.hora}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-white">{a.quem}</span>
                      <span className="block text-xs text-[var(--slate)]">{a.origem}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Janela>
        </Bloco>
      </div>

      {/* ---------------- Manifesto ---------------- */}
      <section aria-label="Por que a Astro" className={v.manifesto}>
        <span aria-hidden className={`${v.impacto} ${v.manifestoFundo}`}>
          23h
        </span>
        <p className={`${v.manifestoTexto} ${v.surge}`}>
          Hoje o lead da noite espera até alguém ver a mensagem de manhã. Com a Astro, ele é atendido na hora.
        </p>
      </section>

      {/* ---------------- Como funciona ---------------- */}
      <section id="como-funciona" aria-labelledby="titulo-como" className={`${v.ancora} ${v.secao}`}>
        <p className={`${v.etiqueta} ${v.surge}`}>
          <Estrela className="size-3 text-[var(--cobalt)]" />
          Como funciona
        </p>
        <h2 id="titulo-como" className={`${v.impacto} ${v.tituloSecao} ${v.surge} mt-6 max-w-3xl`}>
          Do anúncio até a venda
        </h2>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className={`${v.cartao} ${v.surge}`} style={ordem(i)}>
              <span aria-hidden className={v.numeroDoPasso}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className={`${v.impacto} mt-5 text-[1.6rem] leading-none`}>{p.titulo}</h3>
              <p className="mt-3 leading-relaxed text-[var(--ash)]">{p.texto}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Para quem é (0244) ---------------- */}
      <section id="para-quem" aria-labelledby="titulo-para-quem" className={`${v.ancora} ${v.secao}`}>
        <h2 id="titulo-para-quem" className={`${v.impacto} ${v.tituloSecao} ${v.surge} max-w-3xl`}>
          Para quem vende pelo WhatsApp
        </h2>
        <p className={`${v.paragrafo} ${v.surge} max-w-xl`}>
          O mesmo CRM, com o vocabulário e a IA do seu negócio. Escolha o seu ramo e a conta já nasce do seu jeito. Com
          equipe ou autônomo: imobiliárias, corretoras de seguros, escritórios de advocacia e mais.
        </p>
        {/* No celular, duas colunas só com o nome (nove cartões com resumo viravam uma parede). */}
        <ul className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-3">
          {RAMOS.map((ramo, i) => {
            const c = CONFIG_DOS_RAMOS[ramo];
            return (
              <li key={ramo} className={v.surge} style={ordem(i % 3)}>
                <Link href={`/astro/contratar?ramo=${ramo}`} className={v.ramoCartao}>
                  <span aria-hidden className={v.ramoIcone}>
                    <IconeDoRamo ramo={ramo} className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.98rem] leading-snug font-medium text-white sm:text-[1.05rem]">
                      {ramo === "outro" ? "Outro ramo" : c.rotulo}
                    </span>
                    <span className="mt-1 hidden text-[0.92rem] leading-snug text-[var(--slate)] sm:block">{c.resumo}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------- Recursos ---------------- */}
      <section id="recursos" aria-labelledby="titulo-recursos" className={`${v.ancora} ${v.secao}`}>
        <p className={`${v.etiqueta} ${v.surge}`}>
          <Estrela className="size-3 text-[var(--cobalt)]" />
          Recursos
        </p>
        <h2 id="titulo-recursos" className={`${v.impacto} ${v.tituloSecao} ${v.surge} mt-6 max-w-3xl`}>
          Tudo num lugar só
        </h2>
        <p className={`${v.paragrafo} ${v.surge} max-w-xl`}>
          Nasceu dentro de uma imobiliária de verdade, com a equipe usando todo dia, e serve a qualquer negócio que vende
          pelo WhatsApp. Cada recurso nasceu de um problema que custava venda.
        </p>
        <dl className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS.map((r, i) => (
            <div key={r.nome} className={`${v.cartao} ${v.surge}`} style={ordem(i % 4)}>
              <dt className="text-[1.05rem] font-medium text-white">{r.nome}</dt>
              <dd className="mt-2 text-[0.95rem] leading-relaxed text-[var(--slate)]">{r.texto}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Planos ---------------- */}
      <section id="planos" aria-labelledby="titulo-planos" className={`${v.ancora} ${v.secao}`}>
        <p className={`${v.etiqueta} ${v.surge}`}>
          <Estrela className="size-3 text-[var(--cobalt)]" />
          Planos
        </p>
        <h2 id="titulo-planos" className={`${v.impacto} ${v.tituloSecao} ${v.surge} mt-6 max-w-3xl`}>
          Um plano para equipes, dois para autônomos
        </h2>
        <p className={`${v.paragrafo} ${v.surge} max-w-xl`}>
          Todos com a IA no WhatsApp, o funil, a agenda e as vendas. O que muda é o tamanho da equipe e o volume de artes,
          vídeos e listas por mês.
        </p>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {PLANOS.map((p, i) => (
            <article key={p.id} className={`${v.plano} ${p.destaque ? v.planoDestaque : ""} ${v.surge}`} style={ordem(i)}>
              <p className={v.rotuloMono}>{p.selo}</p>
              <h3 className="mt-3 text-[1.45rem] leading-tight font-medium text-white">{p.nome}</h3>
              <p className="mt-2 min-h-[3rem] leading-snug text-[var(--slate)]">{p.para}</p>
              <p className="mt-7 flex flex-wrap items-baseline gap-x-2">
                <span className={`${v.impacto} ${v.preco}`}>{p.preco}</span>
                <span className="text-[var(--slate)]">{p.unidade}</span>
              </p>
              <ul className={v.limites}>
                <li>
                  {inteiro(p.limites.arte)} artes com IA{p.destaque ? " por usuário" : ""} por mês
                </li>
                <li>
                  {inteiro(p.limites.video)} vídeos{p.destaque ? " por usuário" : ""} por mês
                </li>
                <li>{inteiro(p.limites.lista)} mensagens de lista por mês</li>
              </ul>
              <Link href={hrefDeContratar(p.id)} className={`${v.ctaDoPlano} ${p.destaque ? v.ctaDoPlanoDestaque : ""} mt-auto`}>
                Contratar {NOME_CURTO_NA_VENDA[p.id]}
                <span aria-hidden className={v.setaDoPlano}>
                  →
                </span>
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- Fechamento ---------------- */}
      <section className={v.fechamento}>
        <span aria-hidden className={v.estrelas} />
        <span aria-hidden className={v.fechamentoBrilho} />
        <div className={v.fechamentoDentro}>
          <div className={v.surge}>
            <h2 className={`${v.impacto} ${v.tituloSecao}`}>
              Suas vendas
              <br /> em novas órbitas
            </h2>
            <p className={`${v.paragrafo} max-w-lg`}>
              A gente configura a sua conta, conecta o WhatsApp e acompanha a primeira semana com você.
            </p>
          </div>
          <div className={`${v.surge} ${v.acoes}`} style={ordem(1)}>
            <Link href="/astro/contratar" className={`${v.botao} ${v.botaoPrincipal}`}>
              Escolher meu plano
              <span aria-hidden className={v.seta}>
                ↗
              </span>
            </Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener" className={`${v.botao} ${v.botaoContorno}`}>
                Conversar no WhatsApp
              </a>
            )}
            <Link href="/astro/contato" className={`${v.botao} ${v.botaoContorno}`}>
              Fale com a Astro
            </Link>
          </div>
        </div>
      </section>

      {/* O modelo é CC BY 4.0: a licença exige o crédito ao autor. */}
      <p className={v.creditos}>
        Modelo 3D do foguete:{" "}
        <a href="https://sketchfab.com/3d-models/spacex-starship-block-3-6f6c6f88a3eb4b4d822fdca66733fbb2" target="_blank" rel="noopener">
          “SpaceX Starship Block 3”
        </a>
        , de{" "}
        <a href="https://sketchfab.com/clarence365" target="_blank" rel="noopener">
          Clarence365
        </a>
        , sob{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">
          CC BY 4.0
        </a>
        .
      </p>

      <RodapeLegal />
    </main>
  );
}
