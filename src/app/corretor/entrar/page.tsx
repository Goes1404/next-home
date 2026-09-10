import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = {
  title: "Entrar",
  robots: { index: false, follow: false },
};

/**
 * Login do corretor — tela dividida: marca de um lado, formulário do outro.
 *
 * O pedido foi "parecido com a tela de login do Facebook": marca grande e uma
 * frase de um lado, cartão de entrada do outro, e no celular tudo empilhado.
 * A diferença é o lado da marca — no Facebook é campo liso azul, aqui é a
 * FOTO, porque o produto é imóvel e a foto é o argumento.
 *
 * A versão anterior punha a foto atrás de tudo com `mix-blend-overlay` e
 * `opacity-50` mais um véu de `bg-fundo/70` por cima: três camadas
 * apagando a mesma imagem, e o resultado era um fundo cinza-lavado com uma
 * sombra de prédio. Aqui a foto aparece inteira no painel dela, com UM
 * gradiente escuro que existe só para o texto ter contraste em cima.
 *
 * O escurecimento é `black/…` e não um token de tema, de propósito: a foto
 * não muda com o tema, então o texto sobre ela também não pode mudar — no
 * tema claro um `bg-fundo/70` deixaria letra branca sobre nuvem clara.
 */
export default function EntrarPage() {
  return (
    <main className="bg-fundo grid min-h-svh flex-1 lg:grid-cols-[1.15fr_1fr]">
      {/* Painel da marca. No celular vira uma faixa no topo: a foto continua
          presente sem roubar a dobra de quem só quer digitar a senha. */}
      <section className="relative isolate flex h-[34svh] items-end overflow-hidden lg:h-auto lg:items-center">
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
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/20 lg:bg-gradient-to-r lg:from-black/85 lg:via-black/55 lg:to-black/25"
        />

        <div className="relative z-10 w-full px-6 pb-8 lg:max-w-lg lg:px-14 lg:pb-0">
          <Link
            href="/"
            className="font-display text-fluid-3xl inline-block text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white lg:text-[clamp(3rem,5vw,4.5rem)]"
          >
            {/* Tinta FIXA da marca (`brand-200`), não `acento-suave`: sobre a
                foto o tema não vale, e no claro o acento-suave é escuro —
                "Home" sumia dentro do prédio. Mesma razão do véu em
                `black/…` logo acima. */}
            Next<span className="text-brand-200">Home</span>
          </Link>
          <p className="text-fluid-base mt-3 max-w-md text-balance text-white/85 lg:mt-5 lg:text-fluid-lg">
            Seus leads, suas conversas e sua agenda de visitas num lugar só.
          </p>
        </div>
      </section>

      {/* Coluna do formulário. O cartão sobe 2rem no celular para encostar na
          faixa da foto — é o que costura as duas metades quando elas estão
          empilhadas em vez de lado a lado. */}
      <section className="flex items-start justify-center px-4 pb-16 lg:items-center lg:px-10 lg:pb-0">
        <div className="border-linha bg-superficie shadow-painel-alto -mt-8 w-full max-w-sm rounded-2xl border p-7 lg:mt-0">
          <h1 className="text-fluid-xl text-titulo font-medium">Entrar</h1>
          <p className="text-fluid-sm text-apoio mt-1 mb-6">
            Área do corretor da Next Home.
          </p>

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
