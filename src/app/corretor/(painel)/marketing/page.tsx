import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { OrigemDosLeads } from "@/app/corretor/(painel)/_componentes/graficos/OrigemDosLeads";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMinhasImagens, getTetoDeHoje } from "@/lib/imagens/galeria";
import { getSaldo } from "@/lib/video/fila";
import { getCatalogoResumidoDoPainel, type ImovelResumido } from "@/lib/imoveis/catalogoDoPainel";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";
import { temModulo } from "@/lib/ramos/ramos";
import { OficinaDeMarketing } from "./OficinaDeMarketing";

export const metadata: Metadata = { title: "Marketing" };
export const dynamic = "force-dynamic";

/**
 * A oficina de marketing — onde se PRODUZ e de onde se DISPARA peça.
 *
 * ## Por que ela existe
 *
 * As ferramentas de marketing estavam espalhadas por três lugares: arte e
 * links dentro de Imóveis, carrossel escondido na página de cada
 * empreendimento, campanha num destino próprio. Nenhuma delas é sobre um
 * imóvel — são sobre o que sai para a rua. Espalhadas, o corretor precisava
 * lembrar ONDE cada coisa mora antes de conseguir usá-la.
 *
 * ## Por que ela não somou ao menu
 *
 * O teto é sete destinos, e o painel já estava nos sete. Marketing entra
 * absorvendo Campanhas, que é marketing por definição — disparo é peça de
 * saída. Sete continua sete, e as rotas antigas continuam respondendo.
 *
 * ## O que a tela mostra sem ser pedida
 *
 * Quantas artes já existem, quanto sobrou do limite de hoje e quantos imóveis
 * estão prontos para virar peça. Painel que abre vazio ensina que não tem
 * nada ali — e este tem.
 */
export default async function PaginaMarketing() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  // Sem catálogo de imóveis no ramo (30/10/2026, revisão), nem lê o catálogo.
  const comCatalogo = temModulo(corretor.ramo, "catalogoDeImoveis");
  const [imagens, teto, catalogo, saldoVideo, enderecoDoCliente] = await Promise.all([
    getMinhasImagens(),
    getTetoDeHoje(corretor.id),
    // O catálogo RESUMIDO (30/10/2026): esta tela só conta e lista nomes, e
    // o completo trazia tipologias, mídias e unidades de todos os imóveis.
    comCatalogo ? getCatalogoResumidoDoPainel() : Promise.resolve([] as ImovelResumido[]),
    getSaldo(corretor.id),
    // Em paralelo com o resto: antes era um `await` no meio do JSX, depois
    // de todas as leituras acima.
    lerEnderecoDoCliente(corretor.grupoId),
  ]);

  const publicados = catalogo.filter((i) => i.publicado !== false);
  // "Só imóvel com foto vira peça": o filtro de antes era
  // `i.capa?.url || i.galeria[0]?.url`, e `capa` NUNCA vem vazia —
  // `mapEmpreendimento` põe a logo (`CAPA_PADRAO`) no lugar da foto que
  // falta. Na prática ele deixava passar todo publicado, e é isso que se
  // mantém aqui, sem a consulta pesada que só servia a esse filtro. Contar
  // de verdade quem tem foto é decisão de produto (muda os números da tela).
  const comFoto = publicados;

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        titulo="Marketing"
        descricao="Tudo o que vira post, story, anúncio ou disparo — num lugar só."
      />


      <OficinaDeMarketing
        artesFeitas={imagens.length}
        artesHoje={{ usadas: teto.usadasHoje, teto: teto.teto }}
        ultimasArtes={imagens.slice(0, 4).map((i) => ({
          id: i.id,
          url: i.arteUrl ?? i.url,
          titulo: i.briefing?.titulo ?? i.prompt,
        }))}
        imoveisProntos={comFoto.length}
        imoveisTotal={publicados.length}
        linkDeIndicacao={linkDeIndicacao(corretor.slug, enderecoDoCliente)}
        temSlug={Boolean(corretor.slug)}
        imoveisParaCarrossel={comFoto.slice(0, 6).map((i) => ({
          slug: i.slug,
          nome: i.nome,
          lugar: `${i.bairro}, ${i.cidade}`,
        }))}
        videosDisponiveis={saldoVideo.disponiveis}
        videosNoMes={saldoVideo.cotaMensal}
        ramo={corretor.ramo}
      />

      <Suspense fallback={null}>
        <OrigemDosLeads />
      </Suspense>

      {comCatalogo && (
        <p className="text-fluid-xs text-tenue">
          Nada do que sai daqui entra no catálogo do imóvel nem aparece no site.
          Quem decide publicar é você.{" "}
          <Link href="/corretor/imoveis" className="text-acento-suave underline underline-offset-4">
            Ver imóveis
          </Link>
        </p>
      )}
    </div>
  );
}
