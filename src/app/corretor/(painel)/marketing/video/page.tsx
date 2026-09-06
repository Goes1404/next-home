import type { Metadata } from "next";
import Link from "next/link";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getMeusVideos, getSaldo } from "@/lib/video/fila";
import { ChatDeVideo } from "./ChatDeVideo";
import { listarConversasDoEstudio } from "@/app/corretor/(painel)/estudio/acoes";

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

  const [videos, saldo, conversas] = await Promise.all([
    getMeusVideos(),
    getSaldo(corretor.id),
    listarConversasDoEstudio("video"),
  ]);

  return (
    <div className="space-y-5">
      <CabecalhoDeTela
        titulo="Criar vídeo"
        descricao="Diz o imóvel e a ideia. A IA monta o roteiro das fotos, mostra os planos e só gera quando você aprovar."
        abaixo={
          <Link
            href="/corretor/marketing"
            className="text-fluid-xs border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo mt-3 inline-flex min-h-11 items-center rounded-full border px-3.5 transition-colors"
          >
            ← Marketing
          </Link>
        }
      />

      <AbasMarketing ativa="/corretor/marketing/video" />

      <ChatDeVideo
        conversasIniciais={conversas}
        videosIniciais={videos}
        saldoInicial={{ disponiveis: saldo.disponiveis, cotaMensal: saldo.cotaMensal }}
      />
    </div>
  );
}
