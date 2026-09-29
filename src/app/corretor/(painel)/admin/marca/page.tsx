import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { lerMarca } from "@/lib/marca";
import { site } from "@/lib/site";
import { GeradorDeMarca } from "./GeradorDeMarca";

export const metadata: Metadata = { title: "Marca" };

/**
 * A marca da instalação (26/09/2026). A versão geral é uma instalação por
 * cliente; o que identifica a imobiliária mora em `NEXT_PUBLIC_MARCA`. Esta
 * tela mostra o que está valendo e monta o valor da variável.
 */
export default async function MarcaPage() {
  await exigirGestorNaPagina();
  const personalizada = Object.keys(lerMarca(process.env.NEXT_PUBLIC_MARCA)).length > 0;

  return (
    <div>
      <CabecalhoDeTela
        secao="Administração"
        titulo="Marca"
        descricao="O nome, o CRECI, o endereço e os contatos que aparecem no site, nos avisos e no que a IA diz."
      />
      <div className="mt-4">
        <AbasAdmin ativa="/corretor/admin/marca" />
      </div>
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
