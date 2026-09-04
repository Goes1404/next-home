import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMinhasImagens, getTetoDeHoje } from "@/lib/imagens/galeria";
import { getSaldo } from "@/lib/video/fila";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";
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

  const [imagens, teto, catalogo, saldoVideo] = await Promise.all([
    getMinhasImagens(),
    getTetoDeHoje(corretor.id),
    getEmpreendimentosDoPainel(),
    getSaldo(corretor.id),
  ]);

  const publicados = catalogo.filter((i) => i.publicado !== false);
  // Só imóvel com foto vira peça. Prometer o contrário é a mesma falha de
  // botão que não funciona: o corretor clica e descobre que não dava.
  const comFoto = publicados.filter((i) => i.capa?.url || i.galeria[0]?.url);

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        titulo="Marketing"
        descricao="Tudo o que vira post, story, anúncio ou disparo — num lugar só."
      />

      <AbasMarketing ativa="/corretor/marketing" />

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
        linkDeIndicacao={linkDeIndicacao(corretor.slug)}
        temSlug={Boolean(corretor.slug)}
        imoveisParaCarrossel={comFoto.slice(0, 6).map((i) => ({
          slug: i.slug,
          nome: i.nome,
          lugar: `${i.bairro}, ${i.cidade}`,
        }))}
        videosDisponiveis={saldoVideo.disponiveis}
        videosNoMes={saldoVideo.cotaMensal}
      />

      <p className="text-fluid-xs text-tenue">
        Nada do que sai daqui entra no catálogo do imóvel nem aparece no site.
        Quem decide publicar é você.{" "}
        <Link href="/corretor/imoveis" className="text-acento-suave underline underline-offset-4">
          Ver imóveis
        </Link>
      </p>
    </div>
  );
}
