import Link from "next/link";
import { redirect } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getCandidato } from "@/lib/imoveis/candidatosDoCatalogo";
import { bairrosDoCandidato, statusDoCandidato } from "@/lib/imoveis/filaDeCandidatos";
import { FormNovoImovel, type PreenchimentoInicial } from "./FormNovoImovel";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata = {
  title: "Novo imóvel | Painel do Corretor",
  description: "Cria o cadastro de um empreendimento e abre o editor.",
};

export const dynamic = "force-dynamic";

/**
 * Aceita `?candidato=<id>` para vir pré-preenchido da fila de cadastro.
 *
 * Pré-preencher NÃO é criar de um clique, e a diferença é o bairro: o
 * levantamento devolve "Aldeia, Nova Aldeinha, Vila Militar" numa string
 * só, e o cadastro tem um bairro — é ele que a busca e o mapa usam. Criar
 * direto colocaria os três no campo e o imóvel não seria achado por nenhum
 * deles. O formulário mostra as opções e o corretor escolhe.
 */
export default async function NovoImovelPage({
  searchParams,
}: {
  searchParams: Promise<{ candidato?: string }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");

  const { candidato: candidatoId } = await searchParams;
  const candidato = candidatoId ? await getCandidato(candidatoId) : null;

  const inicial: PreenchimentoInicial = candidato
    ? {
        nome: candidato.nome,
        // Um bairro só: o primeiro da fonte, com os outros oferecidos ao lado.
        bairro: bairrosDoCandidato(candidato)[0] ?? "",
        cidade: "Barueri",
        status: statusDoCandidato(candidato.statusObra),
        candidatoId: candidato.id,
        bairrosDaFonte: bairrosDoCandidato(candidato),
      }
    : { nome: "", bairro: "", cidade: "Barueri", status: "lancamento" };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Link
          href={candidato ? "/corretor/imoveis/candidatos" : "/corretor/imoveis"}
          className="text-fluid-xs text-apoio hover:text-titulo inline-flex min-h-9 items-center transition-colors"
        >
          ← {candidato ? "Fila de cadastro" : "Imóveis"}
        </Link>
        <CabecalhoDeTela secao="Imóveis" titulo="Novo imóvel" descricao="Só o essencial aqui. Foto, planta, tipologia, descrição e lazer entram no editor, que abre logo depois — inclusive pela importação de PDF da construtora e do Google Drive." />
      </div>

      {candidato && (
        <p className="cartao text-fluid-xs text-corpo px-5 py-4">
          Vindo da fila de cadastro:{" "}
          <strong className="text-titulo">{candidato.nome}</strong>
          {candidato.dormitorios || candidato.area ? (
            <> · {[candidato.dormitorios, candidato.area].filter(Boolean).join(" · ")}</>
          ) : null}
          . Confira os campos antes de criar — o levantamento é referência, não cadastro.
        </p>
      )}

      <div className="cartao px-5 py-6 sm:px-6">
        <FormNovoImovel inicial={inicial} />
      </div>
    </div>
  );
}
