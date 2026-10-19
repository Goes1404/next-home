import type { Pergunta } from "@/lib/seoDoImovel";

/**
 * Perguntas e respostas do imóvel (07/10/2026), montadas do cadastro por
 * `perguntasDoImovel`. É a seção que responde, na própria página, o que as
 * pessoas digitam no Google sobre o empreendimento ("quantos dormitórios",
 * "quando entrega", "onde fica") — conteúdo que o site antigo da casa não
 * tem. O mesmo texto vai no FAQPage da página; por isso ele mora aqui, à
 * vista, e não só na marcação.
 *
 * `<details>` nativo: abre sem JavaScript, e o leitor de tela anuncia como
 * botão que expande.
 */
export function PerguntasFrequentes({ nome, perguntas }: { nome: string; perguntas: Pergunta[] }) {
  if (perguntas.length === 0) return null;
  return (
    <section id="perguntas" className="mx-auto max-w-6xl scroll-mt-24 px-4 pt-16 sm:px-8 sm:pt-24">
      <p className="text-fluid-xs mb-4 tracking-[0.22em] text-acento-suave uppercase">Perguntas frequentes</p>
      <h2 className="font-display text-fluid-2xl leading-snug text-titulo">O que mais perguntam sobre o {nome}</h2>
      <div className="divide-linha border-linha mt-8 divide-y border-y">
        {perguntas.map((p) => (
          <details key={p.pergunta} className="group py-1">
            <summary className="text-fluid-base flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium text-titulo [&::-webkit-details-marker]:hidden">
              {p.pergunta}
              <span aria-hidden className="text-acento-suave shrink-0 transition-transform group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="text-fluid-sm text-corpo max-w-prose pb-4 leading-relaxed">{p.resposta}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
