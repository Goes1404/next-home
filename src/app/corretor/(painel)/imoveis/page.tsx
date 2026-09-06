import Link from "next/link";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { ListaImoveisClient } from "./ListaImoveisClient";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { AbasImoveis } from "../_componentes/AbasImoveis";
import { contarCandidatosPendentes } from "@/lib/imoveis/candidatosDoCatalogo";
import { pendenciasDoCatalogo } from "@/lib/imoveis/pendenciasDoCatalogo";

export const metadata = {
  title: "Gestão & Edição de Imóveis | Painel do Corretor",
  description: "Edite fotos, textos, preços, plantas e características dos imóveis do catálogo.",
};

export const dynamic = "force-dynamic";

export default async function ImoveisPage() {
  const [imoveis, candidatosPendentes] = await Promise.all([
    getEmpreendimentosDoPainel(),
    contarCandidatosPendentes(),
  ]);

  /*
   * O contador da aba soma as duas coisas que a Fila de cadastro reúne:
   * ficha incompleta de imóvel nosso (só publicado — é o que a assistente
   * enxerga) e lançamento do mercado ainda sem decisão. É o gancho que
   * substitui o cartão que ficava atravessado na frente desta lista.
   */
  const aCadastrar =
    pendenciasDoCatalogo(imoveis.filter((i) => i.publicado ?? true)).length + candidatosPendentes;

  return (
    <div className="space-y-6">
      {/*
        A sobrelinha "CATÁLOGO & PORTFÓLIO" saiu: era um rótulo em cima de um
        título, dizendo a mesma coisa duas vezes — e ficava FORA do
        `CabecalhoDeTela`, então o filete de cor do módulo começava embaixo
        dela e a coluna nascia torta.

        "Edição & Gestão de Imóveis" era o nome que o sistema dava a si mesmo.
        O corretor pensa "imóveis" antes de tocar no menu, e é assim que o item
        do menu se chama — o título repete a palavra dele, não a nossa.

        Os dois botões estavam com `min-h-10` (40px) num painel que usa 44 em
        todo o resto: os únicos alvos abaixo do padrão da casa.
      */}
      <CabecalhoDeTela
        titulo="Imóveis"
        descricao="Fotos, textos, preços, tipologias e lazer — do celular ou do computador."
        acao={
          <Link
            href="/corretor/imoveis/novo"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium transition-colors"
          >
            + Novo imóvel
          </Link>
        }
      />

      <AbasImoveis ativa="/corretor/imoveis" aCadastrar={aCadastrar} />

      {/*
        O que falta CADASTRAR não mora mais aqui (04/09/2026, decisão do
        usuário): o cartão de cadastro incompleto e o dos lançamentos
        levantados no mercado foram os dois para "Fila de cadastro", que é o
        subtópico dedicado a isso no menu — e a aba acima carrega o número,
        que era o que o cartão dava. Esta tela é o CATÁLOGO: o que já existe,
        para editar. "Links por imóvel" também saiu do cabeçalho pelo mesmo
        motivo: virou aba.
      */}
      <ListaImoveisClient imoveis={imoveis} />
    </div>
  );
}
