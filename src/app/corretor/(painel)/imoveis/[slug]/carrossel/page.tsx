import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { montarCarrossel } from "@/lib/social/carrossel";
import { legendaDoPost } from "@/lib/social/legenda";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";
import { CopiarLegenda } from "./CopiarLegenda";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata = {
  title: "Carrossel para Instagram | Painel do Corretor",
  description: "Gera os slides e a legenda de um post de carrossel a partir do imóvel.",
};

export const dynamic = "force-dynamic";

/**
 * O carrossel pronto para postar.
 *
 * As imagens vêm de uma rota por slide, não de um .zip: no celular — onde o
 * corretor posta — salvar imagem pela galeria é o gesto natural, e um .zip
 * é o que Android e iOS tratam pior.
 *
 * O link da chamada leva o slug do corretor (`/?corretor=<slug>&origem=ig`),
 * então o clique fica registrado com a máquina de atribuição que já existe.
 * É o que permite responder, daqui a um mês, se o post virou lead.
 */
export default async function CarrosselPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");

  const { slug } = await params;
  const imovel = await getEmpreendimentoDoPainel(slug);
  if (!imovel) notFound();

  const link = linkDeIndicacao(corretor.slug);
  const slides = montarCarrossel({ imovel, linkDaChamada: link });
  const legenda = legendaDoPost({ imovel, linkDaChamada: link, nomeCorretor: corretor.nome });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={`/corretor/imoveis/${slug}`}
          className="text-fluid-xs text-apoio hover:text-titulo inline-flex min-h-9 items-center transition-colors"
        >
          ← {imovel.nome}
        </Link>
        <CabecalhoDeTela secao="Marketing" titulo="Carrossel para Instagram" descricao={<>{slides.length} slides montados com as fotos e a ficha deste imóvel. No celular, segure
          cada imagem para salvar na galeria — elas já vêm na ordem de postagem.</>} />
      </div>

      {!corretor.slug && (
        <p className="text-fluid-xs text-corpo border-alerta-linha rounded-2xl border px-5 py-4">
          Sua conta ainda não tem link pessoal, então a chamada final leva ao site sem vincular o
          lead a você. Peça a quem administra para gerar seu link.
        </p>
      )}

      <section className="cartao px-5 py-5 sm:px-6">
        <h2 className="font-display text-titulo text-lg">Legenda do post</h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Sem valores e sem prazo não cadastrado — post fica no ar e a imagem não se edita depois.
        </p>
        <CopiarLegenda legenda={legenda} />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-titulo text-lg">Os slides</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {slides.map((slide, i) => (
            <li key={i} className="space-y-1.5">
              {/*
                `img` cru, não `next/image`: o arquivo é gerado sob demanda
                e precisa chegar ao celular no tamanho REAL de postagem —
                otimizar aqui entregaria uma versão menor que a do post.
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/corretor/imoveis/${slug}/carrossel/slide/${i}`}
                alt={`Slide ${i + 1}: ${slide.titulo}`}
                width={1080}
                height={1350}
                className="border-linha bg-elevado w-full rounded-xl border"
                loading={i < 4 ? "eager" : "lazy"}
              />
              <p className="text-fluid-xs text-tenue text-center tabular-nums">
                {i + 1}/{slides.length}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
