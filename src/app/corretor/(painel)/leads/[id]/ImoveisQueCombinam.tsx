import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { perfilDoLead } from "@/lib/crm/compatibilidade";
import { imoveisQueCombinam, temPressaDeMudar } from "@/lib/crm/matchDeImoveis";
import { recursosDeImoveis } from "@/lib/grupos/ramo";
import { precoAPartirDe } from "@/lib/format";
import { MandarVitrine } from "./MandarVitrine";

const MOSTRAR = 5;

/**
 * "Imóveis que combinam" na ficha do lead (29/10/2026).
 *
 * Os 5 imóveis publicados do catálogo do grupo que mais combinam com o que o
 * lead DISSE (ficha; o dossiê da IA só preenche o vazio; a renda vira teto
 * pela conta do simulador), com os motivos — `matchDeImoveis.ts`. O corretor
 * dono manda os escolhidos numa vitrine (`/v/<codigo>`) pelo PRÓPRIO
 * WhatsApp: a tela monta o link e a mensagem, quem aperta enviar é ele.
 *
 * Sem critério declarado, não inventa: pede a qualificação. Lead que pediu
 * um imóvel específico vê esse imóvel mesmo sem critério.
 */
export async function ImoveisQueCombinam({ leadId, telefone }: { leadId: string; telefone: string | null }) {
  const corretor = await getCorretorLogado();
  if (!corretor || !recursosDeImoveis(corretor.ramo)) return null;

  const supabase = await createClient();
  // RLS recorta: lead de fora da carteira (ou do grupo) não vem.
  const [{ data: lead }, { data: dossie }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, corretor_id, regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id",
      )
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("lead_observacoes_ia")
      .select("orcamento_max, orcamento_min, urgencia_mudanca")
      .eq("lead_id", leadId)
      .maybeSingle(),
  ]);
  if (!lead) return null;

  const [catalogo, credito] = await Promise.all([
    getEmpreendimentos(corretor.grupoId).catch(() => []),
    getParametrosCredito(corretor.grupoId),
  ]);
  const numero = (v: number | string | null | undefined) => (v != null && Number(v) > 0 ? Number(v) : null);
  const pref = {
    ...perfilDoLead(lead, dossie, credito),
    orcamentoMin: numero(lead.orcamento_min) ?? numero(dossie?.orcamento_min),
    temPressa: temPressaDeMudar(dossie?.urgencia_mudanca),
    pediu: [lead.imovel_interesse_id, lead.empreendimento_id].filter((x): x is string => Boolean(x)),
  };

  const combinam = imoveisQueCombinam(
    pref,
    catalogo
      .filter((e) => e.id)
      .map((e) => ({
        id: e.id!,
        nome: e.nome,
        slug: e.slug,
        cidade: e.cidade,
        bairro: e.bairro,
        precoAPartir: e.precoAPartir,
        dormitorios: e.tipologias.map((t) => t.dormitorios),
        status: e.status,
      })),
    MOSTRAR,
  );

  const semCriterio = !pref.regiaoInteresse && !pref.dormitoriosMin && !pref.orcamentoMax && !pref.tetoPelaRenda;
  const dono = lead.corretor_id === corretor.id;

  return (
    <section className="cartao space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-fluid-sm text-titulo font-medium">Imóveis que combinam</h2>
        <span className="text-fluid-xs text-apoio">pelo que ele disse que procura</span>
      </div>

      {combinam.length === 0 ? (
        <p className="text-fluid-xs text-apoio">
          {semCriterio
            ? "Preencha região, dormitórios ou orçamento na qualificação para o CRM sugerir imóveis do catálogo."
            : "Nenhum imóvel publicado atende ao que ele pediu. Vale conversar sobre região ou orçamento."}
        </p>
      ) : (
        <>
          <ol className="divide-y divide-linha">
            {combinam.map((e) => (
              <li key={e.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 min-w-0">
                <Link
                  href={`/corretor/imoveis/${e.slug}`}
                  className="min-h-11 flex items-center font-semibold text-titulo min-w-0 break-words link-acao"
                >
                  {e.nome}
                </Link>
                <span className="text-fluid-xs text-apoio break-words">
                  {[e.bairro, e.precoAPartir ? precoAPartirDe(e.precoAPartir) : null].filter(Boolean).join(" · ")}
                </span>
                <span className="basis-full text-fluid-xs text-corpo break-words">{e.match.motivos.join(" · ")}</span>
              </li>
            ))}
          </ol>
          {dono ? (
            <MandarVitrine
              leadId={leadId}
              telefone={telefone}
              imoveis={combinam.map((e) => ({ id: e.id, nome: e.nome }))}
            />
          ) : (
            <p className="text-fluid-xs text-apoio">Só o corretor responsável manda a vitrine para o cliente.</p>
          )}
        </>
      )}
    </section>
  );
}
