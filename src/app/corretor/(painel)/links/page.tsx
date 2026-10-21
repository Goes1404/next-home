import type { Metadata } from "next";
import { EditarDestaques } from "./EditarDestaques";
import { ListaLinks } from "./ListaLinks";
import { CopiarLink } from "../CopiarLink";
import { getCorretorLogado, getMeusDestaques } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { caminhoDaFichaPublica } from "@/lib/imovelPublico/link";
import { lerBaseDoLinkDoImovel } from "@/lib/imovelPublico/ler";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const enderecoDoCliente = await lerEnderecoDoCliente(corretor.grupoId);
  // Grupo sem site próprio: o link pessoal (`/?corretor=`) cairia no login do
  // painel. Os links de imóvel vão para a ficha pública (`/imovel/<grupo>/…`).
  const base = corretor.grupoId === GRUPO_NEXT_HOME_ID ? null : await lerBaseDoLinkDoImovel(corretor.grupoId);
  const semSite = base !== null && !base.hostPrincipal && base.grupoSlug !== null;

  const [empreendimentos, destaques] = await Promise.all([
    getEmpreendimentos(corretor.grupoId),
    getMeusDestaques(),
  ]);

  return (
    <div>
      <CabecalhoDeTela secao="Imóveis" titulo="Links por imóvel" descricao={<>Qualquer um destes links atribui o atendimento a você — inclusive em imóveis de outro
        corretor responsável. A exceção é o <span className="text-titulo">link de anúncio (Meta)</span>:
        ele é o destino da campanha paga e distribui cada clique em rodízio entre os corretores com
        WhatsApp conectado — quem clica cai direto no WhatsApp do corretor da vez, com a mensagem
        pronta.</>} />

      {/*
        Marketing, e não Imóveis: o breadcrumb daqui dizia "← Imóveis" enquanto
        o menu acendia Marketing — dois pais para a mesma tela. Pior: até
        04/09/2026 esta era a ÚNICA tela do painel sem item de menu e sem aba,
        alcançável só por um cartão em Imóveis.
      */}

      {semSite ? (
        <section className="cartao mt-8 p-6">
          <p className="font-display text-titulo">Link pessoal e portfólio</p>
          <p className="text-fluid-sm mt-1 text-apoio">
            O link pessoal precisa de um site próprio da imobiliária. Enquanto ele não existe, mande os links de cada
            imóvel abaixo: abrem a ficha do imóvel com o seu WhatsApp.
          </p>
        </section>
      ) : (
        <>
          <section className="cartao mt-8 p-6">
            <p className="font-display text-titulo">Portfólio completo</p>
            <p className="text-fluid-sm mt-1 text-apoio">
              Para quando o cliente ainda não sabe o que procura.
            </p>
            <CopiarLink link={`${enderecoDoCliente}/?corretor=${corretor.slug}`} />
          </section>

          <section className="mt-10">
            <EditarDestaques
              itens={empreendimentos.map((e) => ({ slug: e.slug, nome: e.nome }))}
              destaquesIniciais={destaques}
            />
          </section>
        </>
      )}

      <section className="mt-10">
        <p className="font-display text-titulo">Um imóvel específico</p>
        <p className="text-fluid-sm mt-1 mb-5 text-apoio">
          {empreendimentos.length} empreendimentos disponíveis.
        </p>
        <ListaLinks
          itens={empreendimentos.map((e) => ({
            slug: e.slug,
            nome: e.nome,
            bairro: e.bairro,
            cidade: e.cidade,
            ...(semSite
              ? { link: `${enderecoDoCliente}${caminhoDaFichaPublica(base.grupoSlug!, e.slug, corretor.slug)}` }
              : {}),
          }))}
          slugCorretor={corretor.slug}
          baseUrl={enderecoDoCliente}
          semAnuncio={semSite}
        />
      </section>
    </div>
  );
}
