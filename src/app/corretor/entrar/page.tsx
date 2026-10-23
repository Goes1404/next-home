import { Wordmark } from "@/components/ui/Wordmark";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { FormularioLogin } from "./FormularioLogin";

/**
 * Login do painel — redesenhado em 21/10/2026 (pedido do dono, com o login do
 * Facebook como referência): marca e frase à esquerda, cartão de entrada à
 * direita, num fundo vivo (orbes de luz que derivam, malha fina e estrelas).
 * No celular, marca em cima e cartão logo abaixo.
 *
 * A marca depende do ENDEREÇO: em `astroimob.vercel.app` (o endereço só do
 * CRM, `enderecosDoPainel.ts`) a tela usa a paleta especial da AstroImob. A
 * marca exibida é AstroImob em qualquer endereço de entrada.
 *
 * O fundo é escuro nos dois temas e o texto sobre ele é branco FIXO; o
 * cartão segue o tema. Movimento só por `transform`/`opacity`, desligado com
 * movimento reduzido (`globals.css`, bloco "Fundo da tela de login").
 */

type Marca = {
  nome: string;
  wordmark: readonly [string, string];
  frase: string;
  apoio: string;
  rodape: "convite" | "site";
  cores: { a: string; b: string; c: string; base: string; acento?: string; acentoHover?: string };
};

const ASTROIMOB: Marca = {
  nome: "AstroImob",
  wordmark: ["astro", "imob"],
  frase: "O CRM que atende seus clientes no WhatsApp enquanto você vende.",
  apoio: "Leads, conversas, visitas e vendas da sua imobiliária num lugar só.",
  rodape: "convite",
  cores: { a: "#7c5cff", b: "#22d3ee", c: "#f472b6", base: "#090a1f", acento: "#6d5dfc", acentoHover: "#5a49ec" },
};

const PAINEL_ASTROIMOB: Marca = {
  nome: "ASTROimob",
  wordmark: ["ASTRO", "imob"],
  frase: "Seus leads, suas conversas e sua agenda de visitas num lugar só.",
  apoio: "Área do corretor da ASTROimob.",
  rodape: "site",
  cores: { a: "#14b8a6", b: "#0ea5e9", c: "#34d399", base: "#03161a" },
};

async function marcaDoEndereco(): Promise<Marca> {
  const host = (await headers()).get("host");
  // A entrada é da plataforma, mesmo quando chegou pelo domínio público da
  // Next Home. O host só preserva a paleta especial do endereço do CRM.
  return ehEnderecoSoDoPainel(host) ? ASTROIMOB : PAINEL_ASTROIMOB;
}

export async function generateMetadata(): Promise<Metadata> {
  const marca = await marcaDoEndereco();
  return {
    title: { absolute: `Entrar · ${marca.nome}` },
    robots: { index: false, follow: false },
  };
}

/** Estrelas em posições fixas (nada de sorteio: daria divergência de hidratação). */
const ESTRELAS = Array.from({ length: 34 }, (_, i) => ({
  top: `${(i * 37) % 100}%`,
  left: `${(i * 61 + 13) % 100}%`,
  delay: `${(i % 7) * 0.6}s`,
  escala: i % 5 === 0 ? 1.6 : 1,
}));

const BENEFICIOS = ["IA que responde no WhatsApp", "Funil e agenda de visitas", "Vendas e comissões"];

export default async function EntrarPage({
  searchParams,
}: {
  searchParams: Promise<{ link?: string; next?: string | string[] }>;
}) {
  const parametros = await searchParams;
  const marca = await marcaDoEndereco();
  // Link do convite ou da recuperação que já foi usado, venceu ou chegou
  // adulterado (`/auth/confirmar`). Explica e aponta a saída, em vez de um
  // erro genérico que faria a pessoa achar que a conta não existe.
  const linkExpirado = parametros.link === "expirado";
  // Para onde voltar depois de entrar (o proxy manda quando `/plataforma`
  // abre sem sessão). Só repassado: a action confere com `destinoSeguro`.
  const next = typeof parametros.next === "string" ? parametros.next : undefined;

  const { a, b, c, base, acento, acentoHover } = marca.cores;
  const estilo = {
    "--login-a": a,
    "--login-b": b,
    "--login-base": base,
    ...(acento ? { "--color-acento": acento, "--color-acento-hover": acentoHover } : {}),
    // A AstroImob não usa a paleta sálvia da Next Home no cartão: neutro e
    // claro, para combinar com o violeta. A Next Home segue o tema do site.
    ...(marca.rodape === "convite"
      ? {
          "--color-superficie": "#ffffff",
          "--color-elevado": "#f5f6fb",
          "--color-linha": "#e6e8f2",
          "--color-linha-forte": "#d5d8e8",
          "--color-titulo": "#141631",
          "--color-corpo": "#3a3e57",
          "--color-apoio": "#5c6079",
          "--color-tenue": "#7b7f98",
        }
      : {}),
  } as CSSProperties;

  return (
    <main style={estilo} className="login-fundo relative isolate min-h-svh overflow-hidden">
      {/* O fundo vivo: malha, três orbes e estrelas. Decorativo. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="login-malha absolute inset-0" />
        <span className="login-orbe -top-24 -left-24 size-[28rem]" style={{ background: a }} />
        <span className="login-orbe right-[-6rem] bottom-[-8rem] size-[32rem]" style={{ background: b }} />
        <span className="login-orbe top-1/3 left-1/2 size-[18rem]" style={{ background: c }} />
        {ESTRELAS.map((e, i) => (
          <span
            key={i}
            className="login-estrela"
            style={{ top: e.top, left: e.left, animationDelay: e.delay, transform: `scale(${e.escala})` }}
          />
        ))}
      </div>

      <div className="mx-auto flex min-h-svh w-full max-w-6xl flex-col items-center justify-center gap-10 px-5 pt-[max(2.5rem,env(safe-area-inset-top,0px))] pb-[max(2rem,env(safe-area-inset-bottom,0px))] lg:flex-row lg:justify-between lg:gap-16 lg:px-10">
        <section className="max-w-xl text-center lg:text-left">
          <p className="font-display text-[clamp(2.75rem,7vw,5rem)] leading-none font-semibold tracking-tight text-white">
            <Wordmark
              nomes={marca.wordmark}
              destaque="bg-gradient-to-r from-[var(--login-a)] via-[var(--login-b)] to-white bg-clip-text text-transparent"
            />
          </p>
          <h2 className="text-fluid-xl mt-5 font-medium text-balance text-white/90 lg:text-[1.75rem] lg:leading-snug">
            {marca.frase}
          </h2>
          <p className="text-fluid-base mt-3 text-balance text-white/65">{marca.apoio}</p>
          <ul className="mt-7 hidden flex-wrap gap-2.5 lg:flex">
            {BENEFICIOS.map((item) => (
              <li
                key={item}
                className="text-fluid-sm rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white/80 backdrop-blur-sm"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="w-full max-w-md">
          <div className="login-cartao bg-superficie rounded-3xl p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.6)] ring-1 ring-white/10 sm:p-8">
            <h1 className="text-fluid-xl text-titulo font-semibold">Entrar</h1>
            <p className="text-fluid-sm text-apoio mt-1 mb-6">Acesse o painel da sua imobiliária.</p>

            {linkExpirado && (
              <p role="alert" className="border-alerta-linha bg-alerta-lavado text-fluid-sm text-titulo -mt-2 mb-5 rounded-xl border px-4 py-3">
                {"Este link já foi usado ou expirou. Peça outro em 'Esqueci a senha'."}
              </p>
            )}

            <FormularioLogin next={next} />

            {marca.rodape === "site" && (
              <>
                <hr className="border-linha my-6" />
                <Link
                  href="/"
                  className="border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo text-fluid-sm flex min-h-11 items-center justify-center rounded-full border px-6 transition-colors"
                >
                  Voltar para o site
                </Link>
              </>
            )}
          </div>
          <p className="text-fluid-sm mt-6 text-center text-white/60">
            {marca.rodape === "convite" ? (
              <>
                O acesso é por convite da sua imobiliária. <span className="text-white/80">© {marca.nome}</span>
              </>
            ) : (
              <>© {marca.nome}</>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}
