import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { getMeusVideos, getSaldo } from "@/lib/video/fila";
import { STATUS_LABEL } from "@/lib/types";
import { EstudioDeVideo, type ImovelDoEstudio } from "./EstudioDeVideo";

export const metadata: Metadata = { title: "Criar vídeo" };
export const dynamic = "force-dynamic";

/**
 * O estúdio de vídeo.
 *
 * Sub-rota de Marketing, que é onde as ferramentas de peça moram desde a
 * reorganização — `moduloAtivo` resolve a cor por prefixo e o menu continua
 * nos sete destinos.
 *
 * ## O render não acontece aqui
 *
 * Medido: 174 s para um vídeo de 17 s em 4 CPUs, contra o teto de 60 s por
 * função do plano Hobby. Esta tela ENFILEIRA; quem renderiza é o worker do
 * GitHub Actions. Por isso a lista embaixo tem estado e a tela se atualiza
 * sozinha enquanto houver vídeo em andamento.
 *
 * ## Ver o roteiro é de graça
 *
 * O corretor escolhe imóvel, objetivo e canal, e VÊ quais planos vão entrar,
 * com que movimento e em que ordem, antes de gastar. O passo que evita o
 * desperdício não pode custar — mesma razão pela qual melhorar a descrição da
 * arte ficou fora do teto diário.
 */
export default async function PaginaVideo() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const [catalogo, videos, saldo] = await Promise.all([
    getEmpreendimentosDoPainel(),
    getMeusVideos(),
    getSaldo(corretor.id),
  ]);

  // Só imóvel com foto vira vídeo. Oferecer os outros seria botão que falha.
  const imoveis: ImovelDoEstudio[] = catalogo
    .filter((i) => i.publicado !== false && (i.capa?.url || i.galeria[0]?.url))
    .map((i) => ({
      slug: i.slug,
      nome: i.nome,
      lugar: `${i.bairro}, ${i.cidade}`,
      estagio: STATUS_LABEL[i.status],
      fotos: i.galeria.length,
    }));

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Criar vídeo"
        descricao="Um Reel montado das fotos do imóvel, com movimento de câmera e legenda queimada."
        abaixo={
          <Link
            href="/corretor/marketing"
            className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo mt-3 inline-flex min-h-11 items-center rounded-full border px-3.5 transition-colors"
          >
            ← Marketing
          </Link>
        }
      />

      {/*
        Catálogo vazio NÃO bloqueia mais: o corretor pode subir as próprias
        fotos. O aviso vira informação, não porta fechada.
      */}
      <EstudioDeVideo
        corretorId={corretor.id}
        imoveis={imoveis}
        iniciais={videos}
        saldoInicial={{ disponiveis: saldo.disponiveis, cotaMensal: saldo.cotaMensal }}
      />
    </div>
  );
}
