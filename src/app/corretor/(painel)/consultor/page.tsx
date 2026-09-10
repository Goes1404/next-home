import { getCorretorLogado } from "@/lib/corretorSessao";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { listarConversas } from "./acoes";
import { ChatConsultor } from "./ChatConsultor";

export const dynamic = "force-dynamic";

/**
 * O consultor imobiliário.
 *
 * Responde as duas perguntas que o corretor faz todo dia e que nenhuma outra
 * tela do painel respondia: "qual imóvel serve para esta pessoa?" e "isso
 * fecha?".
 */
export default async function ConsultorPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const [conversas, credito] = await Promise.all([listarConversas(), getParametrosCredito()]);

  return (
    <div className="space-y-4">
      <CabecalhoDeTela
        secao="Consultor"
        titulo="Pergunte o que quiser sobre o portfólio e o negócio"
        descricao="Ele conhece os imóveis publicados, as regras de crédito e o que já funcionou nas conversas desta casa."
      />
      <ChatConsultor conversasIniciais={conversas} conferidoEm={credito.conferidoEm} />
    </div>
  );
}
