import Link from "next/link";
import { Suspense } from "react";
import { ProcuraPorImovel } from "../_componentes/graficos/ProcuraPorImovel";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { ListaImoveisClient } from "./ListaImoveisClient";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { getArtePorImovel } from "@/lib/imagens/galeria";

export const metadata = {
  title: "Gestão & Edição de Imóveis | Painel do Corretor",
  description: "Edite fotos, textos, preços, plantas e características dos imóveis do catálogo.",
};

export const dynamic = "force-dynamic";

export default async function ImoveisPage() {
  const imoveis = await getEmpreendimentosDoPainel();


  /*
   * Capa emprestada da arte de IA (0101), SÓ para quem não tem foto.
   *
   * Imóvel recém-cadastrado nasce sem mídia, e "Sem Foto de Capa" numa grade
   * de doze cartões apaga justamente os que precisam de atenção. Uma consulta
   * para a página inteira, e só com os ids que de fato precisam — pedir arte
   * de imóvel que já tem foto seria trabalho para jogar fora.
   *
   * Isto NÃO publica nada: a arte segue fora de `midias`, então a vitrine
   * continua mostrando "sem foto" e a assistente continua sem poder enviá-la.
   * O empréstimo vale para esta grade, que é tela de trabalho interna.
   */
  const artePorImovel = await getArtePorImovel(
    imoveis
      .filter((i) => (i.galeria?.length ?? 0) === 0)
      .map((i) => i.id)
      .filter((id): id is string => Boolean(id)),
  );

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
        descricao="Fotos, textos, preços, plantas e lazer — do celular ou do computador."
        acao={
          <Link
            href="/corretor/imoveis/novo"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium transition-colors"
          >
            + Novo imóvel
          </Link>
        }
        // "Fila de cadastro" e "Ordem no site" saíram do menu em 30/09/2026
        // e moram aqui, junto do catálogo que elas organizam.
        abaixo={
          <div className="flex flex-wrap gap-x-5">
            {[
              { href: "/corretor/imoveis/ordem", rotulo: "Ordem no site" },
              { href: "/corretor/imoveis/candidatos", rotulo: "Fila de cadastro" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-acento-suave text-fluid-sm inline-flex min-h-11 items-center gap-1 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
              >
                {l.rotulo} →
              </Link>
            ))}
            {/* Rota de download, não navegação: `<a>` comum, sem prefetch. */}
            <a
              href="/api/painel/catalogo-excel"
              download
              className="text-acento-suave text-fluid-sm inline-flex min-h-11 items-center gap-1 font-medium underline decoration-transparent underline-offset-4 hover:decoration-current"
            >
              Exportar Excel ↓
            </a>
          </div>
        }
      />

      {/*
        O que falta CADASTRAR não mora mais aqui (04/09/2026, decisão do
        usuário): o cartão de cadastro incompleto e o dos lançamentos
        levantados no mercado foram os dois para "Fila de cadastro", que é o
        subtópico dedicado a isso no menu. Esta tela é o CATÁLOGO: o que já existe,
        para editar. "Links por imóvel" também saiu do cabeçalho pelo mesmo
        motivo: virou subtópico do menu.
      */}
      <ListaImoveisClient imoveis={imoveis} artePorImovel={Object.fromEntries(artePorImovel)} />

      <Suspense fallback={null}>
        <ProcuraPorImovel
          imoveis={imoveis
            .filter((i) => i.id)
            .map((i) => ({ id: i.id as string, nome: i.nome, slug: i.slug, publicado: i.publicado !== false, foto: i.galeria?.[0]?.url ?? null }))}
        />
      </Suspense>
    </div>
  );
}
