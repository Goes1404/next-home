import { exigirGestorNaAcao } from "@/lib/guardas";
import { getFiscalDoMes } from "@/lib/financeiro/fiscalDoMes";
import { lerMes } from "@/lib/financeiro/resultado";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { planilhaDaDimob, planilhaDeImpostos, planilhaDeNotas, planilhaDeRpa } from "@/lib/financeiro/fiscalPlanilhas";
import { gerarXlsx, type Planilha } from "@/lib/imoveis/xlsxEscrita";

/**
 * As planilhas do contador (0167): impostos do mês, RPAs do mês, notas
 * fiscais e DIMOB do ano. Só o gestor. Os números saem de `getFiscalDoMes`,
 * o mesmo que a tela Fiscal mostra.
 */
export const dynamic = "force-dynamic";

const TIPOS = ["impostos", "rpa", "notas", "dimob"] as const;
type Tipo = (typeof TIPOS)[number];

export async function GET(req: Request) {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return new Response(null, { status: 403, headers: { "cache-control": "no-store" } });

  const url = new URL(req.url);
  const tipo = url.searchParams.get("tipo") as Tipo | null;
  if (!tipo || !TIPOS.includes(tipo)) return new Response("Tipo de planilha inválido.", { status: 400 });
  const mes = lerMes(url.searchParams.get("mes") ?? undefined, hojeEmSaoPaulo());

  const leitura = await getFiscalDoMes(mes);
  if (!leitura.ok) return new Response("Não consegui ler os dados fiscais agora. Tente de novo.", { status: 500 });
  const f = leitura.fiscal;

  let planilha: Planilha;
  let nome: string;
  if (tipo === "impostos") {
    planilha = planilhaDeImpostos(mes, f.receita, f.impostos, f.config, f.impostosPagos);
    nome = `impostos-${mes}`;
  } else if (tipo === "rpa") {
    planilha = planilhaDeRpa(mes, f.rpas);
    nome = `rpa-${mes}`;
  } else if (tipo === "notas") {
    const comissoesDoAno = [...f.doAno, ...f.semNota.filter((v) => !f.doAno.some((d) => d.id === v.id))];
    planilha = planilhaDeNotas(comissoesDoAno, f.dados);
    nome = `notas-fiscais-${f.ano}`;
  } else {
    planilha = planilhaDaDimob(f.ano, f.doAno, f.dados, f.config);
    nome = `dimob-${f.ano}`;
  }

  return new Response(new Uint8Array(gerarXlsx(planilha)), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${nome}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
