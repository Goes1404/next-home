import type { Metadata } from "next";
import { ARTIGOS_DE_AJUDA } from "@/lib/ajuda/artigos";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import s from "@/app/astro/astro.module.css";
import { AindaPrecisaDeAjuda, CascaDaAjuda } from "./_componentes/CascaDaAjuda";
import { BuscaDaAjuda } from "./BuscaDaAjuda";

export const metadata: Metadata = { title: { absolute: `Central de ajuda · ${MARCA_DA_PLATAFORMA.nome}` } };

/**
 * A central de ajuda (29/10/2026): a lista dos artigos com a busca no
 * navegador. Estática: os artigos são do código (`src/lib/ajuda/artigos.ts`).
 * Linkada no menu da conta do painel ("Ajuda") e no Suporte da Astro.
 */
export default function AjudaPage() {
  return (
    <CascaDaAjuda>
      <h1 className={`${s.titulo} text-[clamp(2rem,4.5vw,2.8rem)] leading-tight font-bold`}>Como podemos ajudar?</h1>
      <p className="mt-3 text-lg leading-relaxed text-[var(--tinta-suave)]">
        Artigos curtos, passo a passo, para usar o CRM da {MARCA_DA_PLATAFORMA.nome} no dia a dia, seja qual for o seu
        ramo.
      </p>
      <div className="mt-8">
        <BuscaDaAjuda artigos={ARTIGOS_DE_AJUDA} />
      </div>
      <AindaPrecisaDeAjuda />
    </CascaDaAjuda>
  );
}
