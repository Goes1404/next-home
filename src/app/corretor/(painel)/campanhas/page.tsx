import type { Metadata } from "next";
import { CampanhasManager } from "./CampanhasManager";
import { AbasMarketing } from "@/app/corretor/(painel)/_componentes/AbasMarketing";
import { listarCampanhas, statusDisparo } from "./acoes";
import { getEmpreendimentos } from "@/lib/queries";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";

export const metadata: Metadata = {
  title: "Listas de Transmissão de WhatsApp | Next Home",
};

/**
 * As server actions desta página (`processarFilaAgora`) chegam a mandar
 * WhatsApp de verdade antes de responder. O teto padrão de 10s de uma
 * função Hobby cortaria o envio no meio.
 */
export const maxDuration = 60;

/** Até isso de ids pela URL: acima disso a URL fica maior que o navegador aceita. */
const TETO_DE_IDS = 300;
const UUID = /^[0-9a-f-]{36}$/i;

export default async function CampanhasPainelPage({
  searchParams,
}: {
  searchParams: Promise<{ imovel?: string; leads?: string }>;
}) {
  // Vindo de "leads que combinam" (tela do imóvel): imóvel e leads já
  // marcados. É só pré-preenchimento: a criação refaz a interseção com a
  // carteira no servidor, então id inventado na URL não vira mensagem.
  const { imovel, leads } = await searchParams;
  const inicial = {
    imovelSlug: imovel || undefined,
    leadIds: (leads ?? "").split(",").filter((id) => UUID.test(id)).slice(0, TETO_DE_IDS),
  };

  const [empreendimentos, campanhas, status] = await Promise.all([
    getEmpreendimentos(),
    listarCampanhas(),
    statusDisparo(),
  ]);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <CabecalhoDeTela
          titulo="Listas de transmissão"
          descricao="Monte a lista e pronto: as mensagens saem sozinhas, uma a uma, com pausa entre elas. Nada aqui depende de você ficar clicando."
        />
      </div>

      {/*
        Marketing, não WhatsApp: disparo é peça de saída. Até 04/09/2026 esta
        tela desenhava abas de WhatsApp enquanto o menu a acendia em Marketing
        — o sidebar dizia magenta e a barra dizia outra seção.
      */}
      <AbasMarketing ativa="/corretor/campanhas" naFila={status?.pendentes} />

      <CampanhasManager
        empreendimentos={empreendimentos}
        campanhasIniciais={campanhas}
        statusInicial={status}
        inicial={inicial}
      />
    </div>
  );
}
