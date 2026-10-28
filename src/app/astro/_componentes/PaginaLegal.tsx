import Link from "next/link";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { dadosDaEmpresa, linkDoWhatsAppDaAstro, MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import s from "../astro.module.css";

/**
 * A casca das páginas legais da Astro (privacidade, termos, exclusão de
 * conta), 28/10/2026. Texto em coluna de leitura, sem o topo escuro da
 * página de vendas. São as URLs que a Play Store pede no cadastro do app.
 */
export function PaginaLegal({
  titulo,
  atualizadaEm,
  introducao,
  children,
}: {
  titulo: string;
  atualizadaEm: string;
  introducao: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main id="conteudo" className={`${s.pagina} flex-1`}>
      <header className="border-b border-[var(--linha)] bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/astro" className={`${s.titulo} flex items-center gap-2.5 text-lg font-bold`}>
            <SeloAstro className="size-8" />
            {MARCA_DA_PLATAFORMA.nome}
          </Link>
          <Link href="/corretor/entrar" className={`${s.botao} ${s.botaoNoClaro} min-h-10 px-4 text-sm`}>
            Entrar
          </Link>
        </div>
      </header>
      <article className="mx-auto w-full max-w-3xl px-5 py-12 md:py-16">
        <h1 className={`${s.titulo} text-[clamp(2rem,4.5vw,2.8rem)] leading-tight font-bold`}>{titulo}</h1>
        <p className="mt-2 text-sm text-[var(--tinta-suave)]">Última atualização: {atualizadaEm}</p>
        <div className="mt-6 text-lg leading-relaxed text-[var(--tinta-suave)]">{introducao}</div>
        <div className="legal mt-10 space-y-9 leading-relaxed">{children}</div>
      </article>
      <RodapeLegal />
    </main>
  );
}

export function SecaoLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className={`${s.titulo} text-xl font-bold`}>{titulo}</h2>
      <div className="mt-3 space-y-3 text-[var(--tinta)] [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}

/** Como falar com a Astro: e-mail e WhatsApp, os que estiverem configurados. */
export function ContatoDaAstro() {
  const { email } = dadosDaEmpresa();
  const whatsapp = linkDoWhatsAppDaAstro(undefined, "Olá! Tenho um pedido sobre os meus dados no CRM da Astro Soluções.");
  if (!email && !whatsapp) {
    return <>pelo gestor da sua imobiliária, que encaminha o pedido à {MARCA_DA_PLATAFORMA.nome}</>;
  }
  return (
    <>
      {email && (
        <>
          pelo e-mail{" "}
          <a href={`mailto:${email}`} className="font-medium text-[var(--azul)] underline underline-offset-4">
            {email}
          </a>
        </>
      )}
      {email && whatsapp && " ou "}
      {whatsapp && (
        <>
          pelo{" "}
          <a href={whatsapp} target="_blank" rel="noopener" className="font-medium text-[var(--azul)] underline underline-offset-4">
            WhatsApp da {MARCA_DA_PLATAFORMA.nome}
          </a>
        </>
      )}
    </>
  );
}

export function RodapeLegal() {
  const { razaoSocial, cnpj } = dadosDaEmpresa();
  return (
    <footer className="border-t border-[var(--linha)]">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-[var(--tinta-suave)] md:px-8">
        <span className="flex items-center gap-2">
          <SeloAstro className="size-6" />
          {razaoSocial}
          {cnpj ? `, CNPJ ${cnpj}` : ""}
        </span>
        <nav aria-label="Documentos" className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/astro/privacidade" className="underline underline-offset-4 hover:text-[var(--azul)]">
            Privacidade
          </Link>
          <Link href="/astro/termos" className="underline underline-offset-4 hover:text-[var(--azul)]">
            Termos de uso
          </Link>
          <Link href="/astro/excluir-conta" className="underline underline-offset-4 hover:text-[var(--azul)]">
            Excluir conta
          </Link>
          <Link href="/corretor/entrar" className="underline underline-offset-4 hover:text-[var(--azul)]">
            Entrar no CRM
          </Link>
        </nav>
      </div>
    </footer>
  );
}
