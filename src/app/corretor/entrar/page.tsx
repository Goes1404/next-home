import { MarcaAstro } from "@/components/marca/SeloAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
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
 * Desde 28/10/2026 a entrada é SEMPRE da plataforma, Astro Soluções
 * (`marcaDaPlataforma.ts`), em qualquer endereço: a imobiliária aparece
 * depois do login, na barra do topo do painel (como TOTVS e SAP). O endereço
 * só muda o rodapé: no site de um cliente (ex.: nexthomeimoveis.com/corretor)
 * há "Voltar para o site"; no endereço só do CRM, o aviso do convite.
 *
 * O fundo é escuro nos dois temas e o texto sobre ele é branco FIXO; o
 * cartão é claro e neutro. Movimento só por `transform`/`opacity`, desligado
 * com movimento reduzido (`globals.css`, bloco "Fundo da tela de login").
 */

type Rodape = "convite" | "site";

async function rodapeDoEndereco(): Promise<Rodape> {
  const host = (await headers()).get("host");
  return ehEnderecoSoDoPainel(host) ? "convite" : "site";
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: { absolute: `Entrar · ${MARCA_DA_PLATAFORMA.nome}` },
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
  const rodape = await rodapeDoEndereco();
  const marca = MARCA_DA_PLATAFORMA;
  // Link do convite ou da recuperação que já foi usado, venceu ou chegou
  // adulterado (`/auth/confirmar`). Explica e aponta a saída, em vez de um
  // erro genérico que faria a pessoa achar que a conta não existe.
  const linkExpirado = parametros.link === "expirado";
  // Para onde voltar depois de entrar (o proxy manda quando `/plataforma`
  // abre sem sessão). Só repassado: a action confere com `destinoSeguro`.
  const next = typeof parametros.next === "string" ? parametros.next : undefined;

  const { marinho, acinzentado, claro, base, acento, acentoHover } = marca.cores;
  // O cartão é neutro e claro em todo endereço: a entrada é da Astro, não da
  // paleta de um cliente.
  const estilo = {
    "--login-a": acinzentado,
    "--login-b": marinho,
    "--login-base": base,
    "--color-acento": acento,
    "--color-acento-hover": acentoHover,
    "--color-superficie": "#ffffff",
    "--color-elevado": "#f4f6fb",
    "--color-linha": "#e3e8f1",
    "--color-linha-forte": "#cfd7e6",
    "--color-titulo": "#0f1d36",
    "--color-corpo": "#34405a",
    "--color-apoio": "#56627b",
    "--color-tenue": "#77819a",
  } as CSSProperties;

  return (
    <main style={estilo} className="login-fundo relative isolate min-h-svh overflow-hidden">
      {/* O fundo vivo: malha, três orbes e estrelas. Decorativo. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="login-malha absolute inset-0" />
        <span className="login-orbe -top-24 -left-24 size-[28rem]" style={{ background: acinzentado }} />
        <span className="login-orbe right-[-6rem] bottom-[-8rem] size-[32rem]" style={{ background: marinho }} />
        <span className="login-orbe top-1/3 left-1/2 size-[18rem]" style={{ background: claro }} />
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
          <p className="font-display text-[clamp(2.1rem,6vw,3.75rem)] leading-none font-semibold tracking-tight text-white">
            <MarcaAstro
              selo="size-[0.95em]"
              className="gap-[0.25em]"
              destaque="bg-gradient-to-r from-[#a9c1e0] to-white bg-clip-text text-transparent"
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
            <p className="text-fluid-sm text-apoio mt-1 mb-6">Acesse o CRM da sua imobiliária ou da sua conta de corretor.</p>

            {linkExpirado && (
              <p role="alert" className="border-alerta-linha bg-alerta-lavado text-fluid-sm text-titulo -mt-2 mb-5 rounded-xl border px-4 py-3">
                {"Este link já foi usado ou expirou. Peça outro em 'Esqueci a senha'."}
              </p>
            )}

            <FormularioLogin next={next} />

            {rodape === "site" && (
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
            {rodape === "convite" ? (
              <>
                O acesso é por convite da sua imobiliária ou da Astro. <span className="text-white/80">© {marca.nome}</span>
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
