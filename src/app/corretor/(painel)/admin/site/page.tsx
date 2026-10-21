import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { FormularioDeLogo } from "@/components/grupos/FormularioDeLogo";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerHostDoGrupo, lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { lerSiteDoGrupo } from "@/lib/sites/siteDoGrupo";
import { SITE_EM_BRANCO, type SiteDigitado } from "@/lib/sites/siteEditavel";
import { tirarLogoDaCasa, trocarLogoDaCasa } from "../marca/acoes";
import { tirarCapaDoSite, trocarCapaDoSite } from "./acoes";
import { FormularioDeCapa } from "./FormularioDeCapa";
import { FormularioMeuSite } from "./FormularioMeuSite";

export const metadata: Metadata = { title: "Meu site" };
export const dynamic = "force-dynamic";

/**
 * "Meu site" (0209): o que a imobiliária edita no site público dela. O site
 * da Next Home (grupo 1) vem da instalação (`site.ts`), então para ela a tela
 * só explica. A ordem dos imóveis em destaque é a tela que já existe
 * ("Ordem no site"), por grupo: aqui só o atalho.
 */
export default async function MeuSitePage() {
  const gestor = await exigirGestorNaPagina();

  if (gestor.grupoId === GRUPO_NEXT_HOME_ID) {
    return (
      <div>
        <CabecalhoDeTela secao="Administração" titulo="Meu site" descricao="O que aparece no site público da sua imobiliária." />
        <section className="cartao mt-6 space-y-2 p-4">
          <p className="text-fluid-sm text-titulo">O site da Next Home vem da instalação.</p>
          <p className="text-fluid-xs text-apoio">
            Nome, contatos, CRECI e visual do site da Next Home ficam no código e em NEXT_PUBLIC_MARCA (veja{" "}
            <Link href="/corretor/admin/marca" className="text-acento-suave underline underline-offset-2">
              Administração → Marca
            </Link>
            ). Esta tela é das outras imobiliárias.
          </p>
        </section>
      </div>
    );
  }

  const [marca, site, host] = await Promise.all([
    lerMarcaDoCrm(gestor.grupoId),
    lerSiteDoGrupo(gestor.grupoId),
    lerHostDoGrupo(gestor.grupoId),
  ]);
  const s = site ?? SITE_EM_BRANCO;
  const inicial: SiteDigitado = {
    cor: s.cor ?? "",
    corSecundaria: s.corSecundaria ?? "",
    corFundo: s.corFundo ?? "",
    corTexto: s.corTexto ?? "",
    titulo: s.titulo ?? "",
    frase: s.frase ?? "",
    sobre: s.sobre ?? "",
    whatsapp: s.whatsapp ?? "",
    email: s.email ?? "",
    logradouro: s.endereco?.logradouro ?? "",
    bairro: s.endereco?.bairro ?? "",
    cidade: s.endereco?.cidade ?? "",
    uf: s.endereco?.uf ?? "",
    cep: s.endereco?.cep ?? "",
    instagram: s.instagram ?? "",
    facebook: s.facebook ?? "",
  };

  return (
    <div>
      <CabecalhoDeTela
        secao="Administração"
        titulo="Meu site"
        descricao="As cores, a logo, a capa, os textos e os contatos que aparecem no site público da sua imobiliária. O que ficar vazio usa o padrão."
      />
      <div className="mt-6 space-y-4">
        <section className="cartao flex flex-wrap items-center justify-between gap-3 p-4" aria-labelledby="titulo-previa">
          <div className="min-w-0">
            <h2 id="titulo-previa" className="text-fluid-sm text-titulo font-bold">
              Seu site
            </h2>
            <p className="text-fluid-xs text-apoio break-words">
              {host
                ? `Endereço: ${host}`
                : "Seu site ainda não tem um endereço. Peça à plataforma para ligar o endereço do site; depois disso o botão abaixo abre a sua página."}
            </p>
          </div>
          {host ? (
            <a
              href={`https://${host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-acento text-sobre-cor text-fluid-sm inline-flex min-h-11 items-center rounded-xl px-4 font-medium"
            >
              Ver meu site
            </a>
          ) : null}
        </section>

        <section className="cartao space-y-3 p-4" aria-labelledby="titulo-logo-site">
          <h2 id="titulo-logo-site" className="text-fluid-sm text-titulo font-bold">
            Logo
          </h2>
          <p className="text-fluid-xs text-apoio">A mesma logo do CRM: trocar aqui troca nos dois lugares.</p>
          <FormularioDeLogo
            nomeDaCasa={marca.nome}
            logoAtual={marca.logoUrl}
            enviar={trocarLogoDaCasa}
            remover={tirarLogoDaCasa}
          />
        </section>

        <section className="cartao space-y-3 p-4" aria-labelledby="titulo-capa">
          <h2 id="titulo-capa" className="text-fluid-sm text-titulo font-bold">
            Foto de capa
          </h2>
          <FormularioDeCapa capaAtual={s.capaUrl} enviar={trocarCapaDoSite} remover={tirarCapaDoSite} />
        </section>

        <FormularioMeuSite inicial={inicial} />

        <section className="cartao space-y-2 p-4">
          <h2 className="text-fluid-sm text-titulo font-bold">Imóveis em destaque</h2>
          <p className="text-fluid-xs text-apoio">
            Quais imóveis aparecem em destaque, e em que ordem, se escolhe em{" "}
            <Link href="/corretor/imoveis/ordem" className="text-acento-suave underline underline-offset-2">
              Imóveis → Ordem no site
            </Link>
            . Vale só para o catálogo da sua imobiliária.
          </p>
        </section>
      </div>
    </div>
  );
}
