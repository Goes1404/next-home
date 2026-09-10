import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Login do corretor — tela dividida no desktop: marca de um lado,
 * formulário do outro. No celular, a foto é o FUNDO da tela inteira e o
 * cartão de entrada mora na base.
 *
 * ## Por que o celular mudou (10/09/2026)
 *
 * A versão anterior empilhava: uma faixa de 34svh com a foto, marca e frase,
 * e o cartão subindo 2rem para "costurar" as duas metades. Na prática o
 * cartão cobria a frase, a faixa cortava o prédio numa linha reta e, com o
 * teclado aberto, o conjunto ficava mais alto que a tela. Relatado como "a
 * imagem está dividindo e sobrepondo a tela de login".
 *
 * Agora não há costura porque não há duas metades: a foto cobre a tela
 * atrás de tudo, com UM gradiente que escurece a base para o cartão e o
 * texto terem contraste; a marca fica no alto e o cartão, opaco, no pé —
 * onde o polegar está. Nada se sobrepõe a nada.
 *
 * O escurecimento é `black/…` e não um token de tema, de propósito: a foto
 * não muda com o tema, então o texto sobre ela também não pode mudar — no
 * tema claro um `bg-fundo/70` deixaria letra branca sobre nuvem clara.
 */
export default function EntrarPage() {
  return (
    <main className="bg-fundo relative isolate min-h-svh lg:grid lg:grid-cols-[1.15fr_1fr]">
      {/* A foto. No celular cobre a tela inteira, atrás; no desktop é a
          coluna da esquerda. */}
      <section className="absolute inset-0 -z-10 overflow-hidden lg:relative lg:z-0 lg:flex lg:items-center">
        <Image
          src="/img/burj-login-bg.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          className="object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/35 to-black/85 lg:bg-gradient-to-r lg:from-black/85 lg:via-black/55 lg:to-black/25"
        />

        <div className="relative z-10 hidden w-full lg:block lg:max-w-lg lg:px-14">
          <Marca grande />
          <p className="text-fluid-lg mt-5 max-w-md text-balance text-white/85">
            Seus leads, suas conversas e sua agenda de visitas num lugar só.
          </p>
        </div>
      </section>

      {/* A coluna do formulário. No celular ocupa a tela toda: marca no alto,
          cartão no pé (`mt-auto`), com as áreas seguras do aparelho
          respeitadas. */}
      <section className="flex min-h-svh flex-col px-5 pt-[max(2.5rem,env(safe-area-inset-top,0px))] pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] lg:min-h-0 lg:items-center lg:justify-center lg:px-10 lg:py-10">
        <div className="lg:hidden">
          <Marca />
          <p className="text-fluid-sm mt-2 max-w-xs text-balance text-white/80">
            Seus leads, suas conversas e sua agenda de visitas num lugar só.
          </p>
        </div>

        <div className="border-linha bg-superficie shadow-painel-alto mx-auto mt-auto w-full max-w-sm rounded-2xl border p-6 sm:p-7 lg:mt-0">
          <h1 className="text-fluid-xl text-titulo font-medium">Entrar</h1>
          <p className="text-fluid-sm text-apoio mt-1 mb-6">Área do corretor da Next Home.</p>

          <FormularioLogin />

          <hr className="border-linha my-6" />

          <Link
            href="/"
            className="border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo text-fluid-sm flex min-h-11 items-center justify-center rounded-full border px-6 transition-colors"
          >
            Voltar para o site
          </Link>
        </div>
      </section>
    </main>
  );
}

/**
 * A marca sobre a foto. Tinta FIXA (`brand-200`), não `acento-suave`: sobre a
 * foto o tema não vale, e no claro o acento-suave é escuro — "Home" sumia
 * dentro do prédio.
 */
function Marca({ grande = false }: { grande?: boolean }) {
  return (
    <Link
      href="/"
      className={`font-display inline-block text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white ${
        grande ? "text-[clamp(3rem,5vw,4.5rem)]" : "text-fluid-2xl"
      }`}
    >
      Next<span className="text-brand-200">Home</span>
    </Link>
  );
}
