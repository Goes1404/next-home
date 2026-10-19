import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { GlassSvgDefs } from "@/components/glass/GlassSvgDefs";
import { AvisoDeVersaoNovaSobDemanda } from "@/components/layout/SobDemanda";
import { Footer } from "@/components/layout/Footer";
import { OndaDeTransicao } from "@/components/motion/OndaDeTransicao";
import { MovimentoDoSite } from "@/components/motion/MovimentoDoSite";
import { site } from "@/lib/site";
import { OG_IMAGEM } from "@/lib/dadosEstruturados";
import { COR_DA_BARRA, SCRIPT_TEMA_ANTES_DA_PINTURA, TEMA_PADRAO } from "@/lib/tema";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

/** Serifa variável: peso e tamanho óptico controlados, sem o "wonk" padrão. */
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: "variable",
  // Só `opsz` (tamanho óptico, que o navegador aplica sozinho pelo
  // `font-optical-sizing: auto`). O eixo `SOFT` saiu em 13/09/2026: nenhuma
  // regra do CSS o usava (`grep SOFT src/app/globals.css` = zero) e ele
  // engordava a fonte pré-carregada em toda página — 118 KB, o maior
  // arquivo do primeiro carregamento depois do próprio JS.
  axes: ["opsz"],
});

/**
 * Mono para dado gravado — credencial, senha temporária, o que precisa ler
 * como número de série. `preload: false` porque ela só aparece em TRÊS telas
 * do painel: pré-carregá-la fazia todo visitante da vitrine baixar uma fonte
 * que ele nunca vê. Sem preload ela continua chegando, só que quando alguém
 * de fato abre aquelas telas.
 */
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["500"],
  preload: false,
});

/*
 * A Alex Brush (script) SAIU em 10/09/2026. Ela existia para "a assinatura
 * pessoal do corretor na própria página" e nenhum componente jamais a usou —
 * `grep font-script` só encontrava a própria declaração. O `next/font`
 * pré-carrega por padrão, então era um arquivo de fonte baixado em toda
 * página do site para não desenhar uma única letra. Se a assinatura voltar a
 * ser desenhada, ela volta junto.
 */

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.nomeCompleto} — Imobiliária em Alphaville e Barueri`,
    template: `%s · ${site.nome}`,
  },
  description: site.descricao,
  keywords: [...site.keywords],
  applicationName: site.nome,
  // Nome que o iPhone sugere ao pôr o site na tela inicial. Sem ele, sugere
  // o título da página inteiro. `capable: false` porque o Next liga sozinho o
  // `mobile-web-app-capable`, que abriria o atalho sem a barra do navegador.
  appleWebApp: { title: site.nome, capable: false },
  authors: [{ name: site.nomeCompleto, url: site.url }],
  creator: site.nomeCompleto,
  publisher: site.nomeCompleto,
  formatDetection: {
    telephone: true,
    address: true,
    email: true,
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: site.url,
    siteName: site.nomeCompleto,
    title: `${site.nomeCompleto} — Imobiliária em Alphaville e Barueri`,
    description: site.descricao,
    images: [OG_IMAGEM],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.nomeCompleto} — Imobiliária em Alphaville`,
    description: site.descricao,
    images: [OG_IMAGEM.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "geo.region": "BR-SP",
    "geo.placename": `${site.endereco.bairro}, ${site.endereco.cidade}`,
    "geo.position": `${site.endereco.lat};${site.endereco.lng}`,
    "ICBM": `${site.endereco.lat}, ${site.endereco.lng}`,
  },
};

/**
 * `viewport` ESTÁTICO (era `generateViewport` lendo o cookie, até 12/10/2026).
 * A cor da barra sai com a do padrão da casa; para quem escolheu o escuro, o
 * script inline do `<body>` reescreve o `<meta name="theme-color">` antes da
 * primeira pintura — ler o cookie aqui faria toda rota do site ser dinâmica
 * (ver lib/tema.ts).
 */
export const viewport: Viewport = {
  themeColor: COR_DA_BARRA[TEMA_PADRAO],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * O `data-tema` NÃO sai mais do servidor (F2b, 12/10/2026). Este layout não
 * lê cookie nenhum: é o que deixa o site público ser prerenderizado e servido
 * do cache da Vercel (`X-Vercel-Cache: HIT`) em vez de por função a cada
 * visita. O HTML chega sempre no padrão da casa (claro) e o PRIMEIRO script
 * do `<body>` corrige o atributo pelo cookie antes da primeira pintura — o
 * mesmo contrato do `Preloader`. A explicação inteira está em lib/tema.ts.
 *
 * `suppressHydrationWarning` cobre a mutação: o script muda `data-tema` e
 * `data-tema-escolhido` antes de o React hidratar.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      /*
       * Sem cookie, o padrão é CLARO — e isso mudou em 10/09/2026.
       *
       * Antes nada era carimbado e quem decidia era o sistema operacional
       * do visitante (`prefers-color-scheme`). O relato foi "o site está
       * muito escuro", com uma referência de site claro: com o celular no
       * escuro, que é a metade do mundo, a vitrine abria escura para quem
       * nunca pediu isso — e escolher o tema de uma IMOBILIÁRIA pela
       * preferência de leitura noturna do aparelho nunca foi uma decisão de
       * marca, era o padrão do CSS decidindo por nós.
       *
       * O seletor no rodapé continua inteiro, e quem escolher "escuro"
       * grava o cookie; o script inline abaixo o aplica a cada carga. Para
       * voltar ao comportamento antigo (o sistema decide), o script teria de
       * REMOVER o atributo quando não há cookie, e `viewport.colorScheme`
       * deixar de ser fixo.
       */
      data-tema={TEMA_PADRAO}
      // O script inline do Preloader carimba `data-intro-ativa` no <html>
      // antes da hidratação, de propósito; sem isto, o dev console acusa
      // mismatch a cada carga.
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* O tema, antes da primeira pintura (ver lib/tema.ts). Primeiro
            filho do body de propósito: o <head> já foi todo lido (o
            `<meta name="theme-color">` existe) e nenhum conteúdo foi
            pintado ainda. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_ANTES_DA_PINTURA }} />
        {/* Primeiro parável do documento: quem navega por teclado pula o
            header fixo e o botão flutuante de WhatsApp direto para o
            conteúdo. Invisível até receber foco. */}
        <a
          href="#conteudo"
          className="sr-only z-[100] rounded-full bg-brand-500 px-5 py-2.5 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
        >
          Pular para o conteúdo
        </a>
        {/* O contrato `.no-js` (HTML nasce com a classe, o primeiro script
            remove) saiu em 13/09/2026 junto com o `.gsap-pending` que ele
            servia: nenhum conteúdo nasce mais invisível esperando
            JavaScript, então não há o que devolver quando ele falta. */}
        <GlassSvgDefs />
        {/* Lenis + ScrollTrigger só fora do painel, e por import assíncrono:
            o painel não usa nenhum dos dois e pagava ~120 KB por tela (ver
            MovimentoDoSite.tsx, 12/10/2026). */}
        <MovimentoDoSite />
        {/* A onda entre páginas mora AQUI, e não nos layouts de grupo: ir da
            home para o catálogo troca de grupo de rota, o layout inteiro é
            desmontado e um componente que compara "caminho anterior" nasce
            sem passado — foi exatamente assim que a primeira versão não
            disparou nenhuma vez. O layout raiz é o único que sobrevive a
            toda navegação. Ele mesmo decide onde não aparecer. */}
        <OndaDeTransicao />
        {/* Aba aberta durante um deploy continua com o HTML e o JavaScript do
            build anterior — é isso, e não cache de HTML, que faz "o navegador
            carregar a versão antiga" (a medição está em
            lib/versao/versaoDaBuild.ts). Mora aqui pelo mesmo motivo da onda:
            o layout raiz é o único que sobrevive a toda navegação, e o aviso
            vale para a vitrine e para o painel, servidos pelo mesmo deploy. */}
        <AvisoDeVersaoNovaSobDemanda />
        {children}
        <Footer />
        {/* Dado de CAMPO (F0 do roadmap de performance, 13/09/2026). Até
            aqui todo número de velocidade deste site era de laboratório: sem
            Speed Insights não há LCP/INP p75 de gente de verdade, e sem Web
            Analytics não se sabe nem a divisão celular × desktop. Os dois
            precisam estar LIGADOS no painel da Vercel (Analytics e Speed
            Insights, um clique cada) — o componente sozinho não grava nada,
            e "construído e nunca ligado" é o padrão que esta base mais
            repete. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
