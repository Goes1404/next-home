import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { FormularioDeLogo } from "@/components/grupos/FormularioDeLogo";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerMarcaDoCrm } from "@/lib/marcaDoCrm/ler";
import { lerMarca } from "@/lib/marca";
import { site } from "@/lib/site";
import { tirarLogoDaCasa, trocarLogoDaCasa } from "./acoes";
import { GeradorDeMarca } from "./GeradorDeMarca";

export const metadata: Metadata = { title: "Marca" };

/**
 * A marca da instalação (26/09/2026). A versão geral é uma instalação por
 * cliente; o que identifica a imobiliária mora em `NEXT_PUBLIC_MARCA`. Esta
 * tela mostra o que está valendo e monta o valor da variável.
 */
export default async function MarcaPage() {
  const gestor = await exigirGestorNaPagina();
  // Outra imobiliária: a marca da instalação (variável, CRECI e contatos da
  // Next Home) não é dela. Aqui ela cuida do nome e da logo do CRM dela.
  if (gestor.grupoId !== GRUPO_NEXT_HOME_ID) {
    const marca = await lerMarcaDoCrm(gestor.grupoId);
    return (
      <div>
        <CabecalhoDeTela
          secao="Administração"
          titulo="Marca"
          descricao="O nome e a logo da sua imobiliária que aparecem no CRM, nos avisos e nas mensagens."
        />
        <div className="mt-6 space-y-4">
          <section className="cartao space-y-2 p-4">
            <p className="text-fluid-sm text-titulo">
              Valendo agora: <strong>{marca.nome}</strong>
            </p>
            <p className="text-fluid-xs text-apoio">
              O nome é o da imobiliária no cadastro, ou o que você definiu em{" "}
              <Link href="/corretor/admin/assistente" className="text-acento-suave underline underline-offset-2">
                Administração → Assistente
              </Link>
              . A logo substitui o nome escrito no cabeçalho e no menu.
            </p>
          </section>
          <section className="cartao p-4">
            <FormularioDeLogo
              nomeDaCasa={marca.nome}
              logoAtual={marca.logoUrl}
              enviar={trocarLogoDaCasa}
              remover={tirarLogoDaCasa}
            />
          </section>
        </div>
      </div>
    );
  }
  const personalizada = Object.keys(lerMarca(process.env.NEXT_PUBLIC_MARCA)).length > 0;

  return (
    <div>
      <CabecalhoDeTela
        secao="Administração"
        titulo="Marca"
        descricao="O nome, o CRECI, o endereço e os contatos que aparecem no site, nos avisos e no que a IA diz."
      />
      <div className="mt-6 space-y-4">
        <section className="cartao space-y-2 p-4">
          <p className="text-fluid-sm text-titulo">
            Valendo agora: <strong>{site.nomeCompleto}</strong> · CRECI {site.creci} · {site.endereco.cidade}/
            {site.endereco.uf}
          </p>
          <p className="text-fluid-xs text-apoio">
            {personalizada
              ? "Esta instalação tem a marca definida na variável NEXT_PUBLIC_MARCA."
              : "Esta instalação usa a marca padrão (Next Home): a variável NEXT_PUBLIC_MARCA não está definida."}{" "}
            Para mudar, preencha abaixo, copie o valor, cole em Vercel → Settings → Environment Variables →
            NEXT_PUBLIC_MARCA e faça o redeploy. Logotipo em imagem, imagem de compartilhamento e cores seguem o
            guia docs/INSTALAR-NOVO-CLIENTE.md.
          </p>
        </section>
        <GeradorDeMarca atual={{ ...lerMarca(process.env.NEXT_PUBLIC_MARCA), ...site }} />
      </div>
    </div>
  );
}
