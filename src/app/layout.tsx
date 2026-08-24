import type { Metadata, Viewport } from "next";
import { Alex_Brush, Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { GlassSvgDefs } from "@/components/glass/GlassSvgDefs";
import { Footer } from "@/components/layout/Footer";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { site } from "@/lib/site";
import { COR_DA_BARRA, getTemaEscolhido } from "@/lib/tema";
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
  axes: ["SOFT", "opsz"],
});

/** Mono para dado gravado — registro CRECI, credencial, o que precisa ler como número de série. */
const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["500"],
});

/** Script — a assinatura pessoal do corretor na própria página. Uso raro, de propósito. */
const alexBrush = Alex_Brush({
  variable: "--font-script",
  subsets: ["latin"],
  display: "swap",
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.nomeCompleto} — Imobiliária de Alto Padrão em Alphaville`,
    template: `%s · ${site.nome}`,
  },
  description: site.descricao,
  keywords: [...site.keywords],
  applicationName: site.nome,
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
    title: `${site.nomeCompleto} — Imobiliária de Alto Padrão em Alphaville`,
    description: site.descricao,
    images: [
      {
        url: "https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg",
        width: 1200,
        height: 630,
        alt: `${site.nomeCompleto} — Imóveis em Alphaville e Barueri`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.nomeCompleto} — Imobiliária em Alphaville`,
    description: site.descricao,
    images: ["https://prhhrqyubjcafvucirri.supabase.co/storage/v1/object/public/empreendimentos/marca/og-image.jpg"],
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
    "geo.placename": "Alphaville, Barueri, Santana de Parnaíba",
    "geo.position": `${site.endereco.lat};${site.endereco.lng}`,
    "ICBM": `${site.endereco.lat}, ${site.endereco.lng}`,
  },
};

/**
 * `generateViewport` (e não a constante `viewport`) porque a cor da barra
 * depende do cookie: quem escolheu um tema recebe a cor dele; quem está em
 * "seguir o sistema" recebe as duas, uma por media query, para o navegador
 * escolher sozinho.
 */
export async function generateViewport(): Promise<Viewport> {
  const tema = await getTemaEscolhido();

  return {
    themeColor:
      tema === null
        ? [
            { media: "(prefers-color-scheme: light)", color: COR_DA_BARRA.claro },
            { media: "(prefers-color-scheme: dark)", color: COR_DA_BARRA.escuro },
          ]
        : COR_DA_BARRA[tema],
    colorScheme: tema === null ? "dark light" : tema === "claro" ? "light" : "dark",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

/**
 * O `data-tema` sai daqui, do servidor, e não de um script no cliente: como
 * toda rota deste site já é dinâmica, o cookie é lido antes de a resposta
 * sair, e o HTML chega ao navegador já no tema certo. É o que dispensa o
 * script de anti-flash e a piscada de tema errado no primeiro paint — e vale
 * para o site inteiro, não só o painel.
 *
 * Sem cookie, nenhum atributo é carimbado — e aí quem manda é a preferência
 * do sistema operacional, tratada em CSS puro (ver globals.css).
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tema = await getTemaEscolhido();

  return (
    <html
      lang="pt-BR"
      data-tema={tema ?? undefined}
      // Dois scripts inline mexem em atributos do <html> antes da hidratação
      // de propósito (o `no-js` abaixo e o `data-intro-ativa` do Preloader);
      // sem isto, o dev console acusa mismatch a cada carga.
      suppressHydrationWarning
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} ${alexBrush.variable} no-js h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* A regra `.no-js .gsap-pending` do globals.css existia sem ninguém
            aplicar a classe: sem JS, todo conteúdo animado ficava invisível
            para sempre (opacity 0). O contrato correto é o clássico: o HTML
            nasce `no-js` e o primeiro script remove — roda antes da pintura,
            então com JS ligado a classe nunca chega a valer. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.classList.remove("no-js")`,
          }}
        />
        <GlassSvgDefs />
        <SmoothScroll />
        {children}
        <Footer />
      </body>
    </html>
  );
}
