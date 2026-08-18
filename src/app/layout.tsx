import type { Metadata, Viewport } from "next";
import { Alex_Brush, Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import { GlassSvgDefs } from "@/components/glass/GlassSvgDefs";
import { Footer } from "@/components/layout/Footer";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { site } from "@/lib/site";
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

export const viewport: Viewport = {
  themeColor: "#040b0a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${fraunces.variable} ${plexMono.variable} ${alexBrush.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <GlassSvgDefs />
        <SmoothScroll />
        {children}
        <Footer />
      </body>
    </html>
  );
}
