import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { montarFunilDoLink, proporcao, JANELA_DEPOIS_DO_CLIQUE_MIN, type LinhaDoFunil } from "@/lib/crm/funilDoLink";

const DIAS = 7;

/**
 * Do clique à conversa (0159): onde o clique no link do anúncio se perde.
 *
 * O link registra o clique; o porteiro conta quem escreveu sem a mensagem
 * pronta (só a contagem, nunca o texto). Lado a lado, os degraus mostram se
 * a perda está em não escrever ou em escrever outra coisa.
 *
 * A RLS recorta: o corretor vê os cliques e as contagens dele; o ADM, os da
 * equipe. Não há texto de mensagem em nenhuma das duas tabelas.
 */
export async function DoCliqueAConversa() {
  const supabase = await createClient();
  const { corte, corteDia } = janelaDeDias(DIAS);
  const [{ data: cliques, error }, { data: barrados }, catalogo] = await Promise.all([
    supabase
      .from("cliques_whatsapp")
      .select("id, origem, created_at, user_agent, visitante, lead_id")
      .eq("pelo_porteiro", true)
      .gte("created_at", corte.toISOString())
      .limit(10000),
    supabase
      .from("porteiro_barrados")
      .select("dia, minutos_desde_clique, clique_id, citou_imovel")
      .gte("dia", corteDia)
      .limit(10000),
    getEmpreendimentosDoPainel(),
  ]);
  if (error) return null;

  const nomes = Object.fromEntries(catalogo.map((i) => [i.slug, i.nome]));
  const funil = montarFunilDoLink({ cliques: cliques ?? [], barrados: barrados ?? [], nomes, dias: DIAS });
  if (funil.total.cliques === 0) return null;

  return (
    <section className="cartao space-y-4 p-4" aria-labelledby="do-clique-a-conversa">
      <div className="space-y-1">
        <h2 id="do-clique-a-conversa" className="text-fluid-base font-semibold text-titulo">
          Do clique à conversa
        </h2>
        <p className="text-fluid-xs text-corpo">
          Últimos {DIAS} dias, só cliques de pessoas (o robô da Meta fica de fora). Mostra se quem clica chega a
          escrever, e se escreve a mensagem pronta ou outra coisa.
        </p>
      </div>

      <Degraus linha={funil.total} />

      {funil.linhas.length > 1 && (
        <ul className="space-y-2">
          {funil.linhas.map((l) => (
            <li key={l.chave} className="space-y-2 rounded-xl border border-linha p-3">
              <p className="text-fluid-sm min-w-0 font-semibold break-words text-titulo">{l.rotulo}</p>
              <Degraus linha={l} compacto />
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-1.5 text-fluid-xs text-corpo">
        <p>
          <b className="text-titulo">Escreveram outra coisa</b> conta números sem cadastro que mandaram mensagem ao
          corretor até {JANELA_DEPOIS_DO_CLIQUE_MIN} minutos depois de um clique, sem a mensagem pronta. A IA não
          responde a eles. O número é o WhatsApp pessoal do corretor, então um conhecido que escreve nesse intervalo
          também entra: para comparar, num dia comum {funil.semCliquePorDia.toString().replace(".", ",")}{" "}
          {funil.semCliquePorDia === 1 ? "número desconhecido escreve" : "números desconhecidos escrevem"} sem clique
          nenhum por perto.
        </p>
        <p>O texto dessas mensagens não é guardado. Fica só a contagem, e se citaram o nome do imóvel.</p>
      </div>
    </section>
  );
}

function Degraus({
  linha,
  compacto = false,
}: {
  linha: Pick<LinhaDoFunil, "cliques" | "pessoas" | "leads" | "escreveramSemAMensagem" | "citaramOImovel">;
  compacto?: boolean;
}) {
  const base = linha.pessoas ?? linha.cliques;
  const itens: Array<{ rotulo: string; valor: string; detalhe?: string | null }> = [
    { rotulo: "Cliques", valor: String(linha.cliques) },
    {
      rotulo: "Pessoas",
      valor: linha.pessoas === null ? "—" : String(linha.pessoas),
      detalhe: linha.pessoas === null ? "contadas desde 05/10" : null,
    },
    {
      rotulo: "Mensagem pronta",
      valor: String(linha.leads),
      detalhe: proporcao(linha.leads, base) ? `${proporcao(linha.leads, base)} viraram lead` : "viraram lead",
    },
    {
      rotulo: "Escreveram outra coisa",
      valor: String(linha.escreveramSemAMensagem),
      detalhe: linha.citaramOImovel > 0 ? `${linha.citaramOImovel} citaram o imóvel` : "ignorados pelo porteiro",
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="min-w-0 space-y-0.5 rounded-xl bg-vidro px-3 py-2">
          <dt className="text-fluid-xs text-corpo">{i.rotulo}</dt>
          <dd
            className={`${compacto ? "text-fluid-base" : "text-fluid-2xl"} font-semibold text-titulo tabular-nums`}
          >
            {i.valor}
          </dd>
          {i.detalhe && <dd className="text-fluid-xs break-words text-corpo">{i.detalhe}</dd>}
        </div>
      ))}
    </dl>
  );
}
