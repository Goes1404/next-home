import { getCorretorLogado } from "@/lib/corretorSessao";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { abrirConversaDoConsultor, listarConversas } from "./acoes";
import { ChatConsultor } from "./ChatConsultor";

export const dynamic = "force-dynamic";

/**
 * O consultor imobiliário.
 *
 * Responde as duas perguntas que o corretor faz todo dia e que nenhuma outra
 * tela do painel respondia: "qual imóvel serve para esta pessoa?" e "isso
 * fecha?".
 */
export default async function ConsultorPage({
  searchParams,
}: {
  searchParams: Promise<{ pergunta?: string; conversa?: string }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const [conversas, credito, params] = await Promise.all([
    listarConversas(),
    getParametrosCredito(),
    searchParams,
  ]);

  /*
   * A pergunta chega pela URL de quem estava no Live Chat ou na ficha do
   * lead. Teto de 400 caracteres: o que passa disso não é pergunta, é
   * conversa inteira colada — e URL longa quebra em app de mensagem.
   */
  const perguntaInicial = params.pergunta?.trim().slice(0, 400) || undefined;

  /*
   * `?conversa=` é como o balão flutuante entrega a conversa a esta tela.
   * Carregada NO SERVIDOR e passada como estado inicial: buscar num efeito
   * faria a tela piscar vazia antes de preencher, e a regra de lint desta
   * base reprova `setState` dentro de efeito — que é como esse defeito
   * costuma aparecer. Id que não é do corretor devolve erro, e a tela abre
   * como sempre abriu: vazia, com o histórico ao lado.
   */
  const aberta = params.conversa ? await abrirConversaDoConsultor(params.conversa) : null;
  const estadoInicial = aberta && !("erro" in aberta) ? aberta : undefined;

  return (
    <div className="space-y-4">
      <CabecalhoDeTela
        secao="Consultor"
        titulo="Pergunte o que quiser sobre o portfólio e o negócio"
        descricao="Ele conhece os imóveis publicados, as regras de crédito e o que já funcionou nas conversas desta casa."
      />
      <ChatConsultor
        conversasIniciais={conversas}
        conferidoEm={credito.conferidoEm}
        perguntaInicial={perguntaInicial}
        estadoInicial={estadoInicial}
      />
    </div>
  );
}
