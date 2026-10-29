import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { linkDoWhatsAppDaAstro, MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { RodapeLegal } from "../_componentes/PaginaLegal";
import s from "../astro.module.css";
import c from "../contratar/contratar.module.css";
import { FormularioDeContato } from "./FormularioDeContato";
import k from "./contato.module.css";

export const metadata: Metadata = {
  title: { absolute: `Fale com a ${MARCA_DA_PLATAFORMA.nome}` },
  description: "Tire dúvidas sobre o CRM da Astro Soluções, planos e contratação. A equipe responde em até 1 dia útil.",
};

/**
 * Fale com a Astro (29/10/2026). Pedido do dono: todo atendimento chega no
 * celular de quem administra a plataforma. Esta é a porta de quem ainda NÃO
 * é cliente: um formulário curto que grava um chamado de origem "site"
 * (`acoes.ts`, tabela `chamados_de_suporte`, 0240) e avisa os ADMs.
 *
 * Mesma língua visual do assistente de contratação: faixa escura no alto e a
 * folha clara por cima (as classes vêm de `../contratar/contratar.module.css`).
 */
export default function ContatoPage() {
  const [nomeA, nomeB] = MARCA_DA_PLATAFORMA.wordmark;
  const whatsapp = linkDoWhatsAppDaAstro();

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
            <Link href="/astro" className={c.voltarAosPlanos}>
              <ArrowLeft aria-hidden className="size-4" />
              Início
            </Link>
          </div>
          <h1 className={`${s.titulo} mt-9 text-[clamp(1.9rem,6vw,2.6rem)] leading-[1.05] font-extrabold text-balance`}>
            Fale com a {MARCA_DA_PLATAFORMA.nome}
          </h1>
          <p className="mt-3 max-w-md leading-relaxed text-white/75">
            Dúvida sobre o CRM, os planos ou a contratação? Escreva para a gente. A resposta chega em até 1 dia útil.
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-2xl px-3 pb-16 sm:px-6">
        <FormularioDeContato />
        {whatsapp && (
          <p className={k.atalho}>
            Prefere conversar agora?{" "}
            <a href={whatsapp} target="_blank" rel="noopener">
              Chame no WhatsApp
            </a>
          </p>
        )}
      </div>

      <RodapeLegal />
    </main>
  );
}
