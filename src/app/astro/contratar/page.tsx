import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { lerPlanoDaUrl } from "@/lib/plataforma/pedidoDeContratacao";
import { ehRamo } from "@/lib/ramos/ramos";
import { RodapeLegal } from "../_componentes/PaginaLegal";
import s from "../astro.module.css";
import { AssistenteDeContratacao } from "./AssistenteDeContratacao";
import c from "./contratar.module.css";

export const metadata: Metadata = {
  title: { absolute: `Contratar · ${MARCA_DA_PLATAFORMA.nome}` },
  description: "Escolha o plano do CRM da Astro Soluções e envie seu pedido. A Astro chama você no WhatsApp e configura a conta.",
};

type Busca = Promise<{ plano?: string | string[]; ramo?: string | string[] }>;

/**
 * Contratar a Astro (29/10/2026). Pedido do dono, sobre a página de vendas:
 * "permita a pessoa clicar no plano, e leve ela para as próximas telas".
 *
 * Os cartões de plano de `/astro` trazem `?plano=essencial|profissional|
 * imobiliaria`, que já chega marcado no 1º passo. Não há pagamento aqui: o
 * assistente envia um PEDIDO (`acoes.ts`, tabela `pedidos_de_contratacao`,
 * 0238) e a equipe da Astro cria a conta e chama a pessoa no WhatsApp.
 *
 * O plano vem da URL pelo servidor (e não pelo `useSearchParams` no
 * navegador) para o HTML já nascer com ele marcado, sem piscar.
 */
export default async function ContratarPage({ searchParams }: { searchParams: Busca }) {
  const busca = await searchParams;
  const plano = lerPlanoDaUrl(busca.plano);
  // `?ramo=` dos cartões "Para quem é" de /astro (0244): já chega marcado.
  const ramoDaUrl = Array.isArray(busca.ramo) ? busca.ramo[0] : busca.ramo;
  const ramo = ehRamo(ramoDaUrl) ? ramoDaUrl : null;
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;

  return (
    <main id="conteudo" className={`${s.pagina} flex-1`}>
      <section className={c.faixa}>
        <div className="relative mx-auto w-full max-w-2xl px-4 pt-4 pb-20 sm:px-6 sm:pt-6 sm:pb-24">
          <div className="flex items-center justify-between gap-3">
            <Link href="/astro" className={`${s.titulo} flex items-center gap-2.5 text-lg font-bold text-white`}>
              <SeloAstro className="size-9" />
              <span>
                {nomeA}
                <span className="font-semibold text-[#a9c1e0]">{nomeB}</span>
              </span>
            </Link>
            <Link href="/astro#planos" className={c.voltarAosPlanos}>
              <ArrowLeft aria-hidden className="size-4" />
              Planos
            </Link>
          </div>
          <h1 className={`${s.titulo} mt-9 text-[clamp(1.9rem,6vw,2.6rem)] leading-[1.05] font-extrabold text-balance`}>
            Vamos montar a sua conta
          </h1>
          <p className="mt-3 max-w-md leading-relaxed text-white/75">
            Três passos rápidos e sem cartão, para qualquer negócio que vende pelo WhatsApp. Depois a {MARCA_DA_PLATAFORMA.nome} chama você no WhatsApp e deixa tudo
            pronto.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-2xl px-3 pb-16 sm:px-6">
        <AssistenteDeContratacao planoInicial={plano} ramoInicial={ramo} />
      </div>

      <RodapeLegal />
    </main>
  );
}
