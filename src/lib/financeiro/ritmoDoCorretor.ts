import "server-only";

import {
  getLeadsLeves,
  getMeta,
  getTaxasDaEquipe,
  type LeadLeve,
  type LeituraDaMeta,
  type TaxasDaEquipe,
  type VendaNaTela,
} from "./dados";
import { repasseDoPeriodo } from "./extrato";
import { diasNoMes, diasRestantesNoMes, intervaloDo, mesAtual } from "./periodo";
import {
  AMOSTRA_MINIMA,
  calcularRitmo,
  escolherComissaoPorVenda,
  escolherTaxa,
  type Ritmo,
} from "./ritmo";
import { centavos, hojeEmSaoPaulo } from "./venda";

/**
 * Junta o que o ritmo precisa (meta, vendas, conversão dele e da equipe) num
 * lugar só, para o Extrato e o Início mostrarem o MESMO número. Duas contas
 * da mesma meta divergiriam — e esta é a que o corretor mais olha.
 */

/** Janela do histórico de conversão: seis meses. */
const DIAS_DE_HISTORICO = 180;

export type RitmoDoCorretor =
  | { estado: "sem_migracao" }
  | { estado: "sem_meta"; estimativaAnterior: number | null }
  | { estado: "ok"; ritmo: Ritmo; metaComissao: number; comissaoPorVendaDigitada: number | null };

function dataMenosDias(hoje: string, dias: number): string {
  const d = new Date(`${hoje}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * De onde o ritmo lê. O painel lê pela sessão (a RLS recorta); o número
 * central passa as mesmas leituras sem sessão, recortadas à mão pelo grupo
 * e pelo corretor identificados (`lerMeta`, `lerLeadsLeves`,
 * `lerTaxasDaEquipe`). A conta é uma só: `calcularRitmoDoCorretor`.
 */
export type FontesDoRitmo = {
  meta: (corretorId: string, mes: string) => Promise<LeituraDaMeta | null>;
  /** Os leads desde a data; o ritmo fica só com os do corretor. */
  leadsLeves: (desde: string) => Promise<LeadLeve[]>;
  taxasDaEquipe: (desde: string) => Promise<TaxasDaEquipe | null>;
};

const PELA_SESSAO: FontesDoRitmo = { meta: getMeta, leadsLeves: getLeadsLeves, taxasDaEquipe: getTaxasDaEquipe };

/**
 * `vendas` pode vir já lida (Extrato) ou como função: no Início, a tela
 * mais aberta do painel, as vendas só são buscadas se existir meta.
 */
export async function getRitmoDoCorretor(
  corretorId: string,
  vendasOuLeitor: VendaNaTela[] | (() => Promise<VendaNaTela[]>),
): Promise<RitmoDoCorretor> {
  return calcularRitmoDoCorretor(PELA_SESSAO, corretorId, vendasOuLeitor);
}

export async function calcularRitmoDoCorretor(
  fontes: FontesDoRitmo,
  corretorId: string,
  vendasOuLeitor: VendaNaTela[] | (() => Promise<VendaNaTela[]>),
  hoje: string = hojeEmSaoPaulo(),
): Promise<RitmoDoCorretor> {
  const mes = mesAtual(hoje);
  const leitura = await fontes.meta(corretorId, mes);
  if (!leitura) return { estado: "sem_migracao" };
  if (!leitura.meta) return { estado: "sem_meta", estimativaAnterior: leitura.estimativaAnterior };

  const desde = dataMenosDias(hoje, DIAS_DE_HISTORICO);
  const [leads, equipe, vendas] = await Promise.all([
    fontes.leadsLeves(desde),
    fontes.taxasDaEquipe(desde),
    typeof vendasOuLeitor === "function" ? vendasOuLeitor() : Promise.resolve(vendasOuLeitor),
  ]);
  const meus = leads.filter((l) => l.corretorId === corretorId);
  const visitas = meus.filter((l) => l.visitou).length;

  const minhasVendas = vendas.filter(
    (v) => v.status === "ativa" && v.dataVenda >= desde && v.participantes.some((p) => p.corretorId === corretorId),
  );
  const repasses = minhasVendas
    .map((v) => v.participantes.find((p) => p.corretorId === corretorId)!.repasseValor)
    .filter((n) => n > 0);

  const comissaoPorVenda = escolherComissaoPorVenda({
    mediaPropria: repasses.length ? centavos(repasses.reduce((s, n) => s + n, 0) / repasses.length) : null,
    vendasProprias: repasses.length,
    estimativa: leitura.meta.comissaoPorVenda ?? leitura.estimativaAnterior,
    mediaEquipe: equipe?.repasseMedio ?? null,
  });

  const { inicio, fim } = intervaloDo("mes", hoje);
  const ritmo = calcularRitmo({
    meta: leitura.meta.metaComissao,
    ganhoNoMes: repasseDoPeriodo(corretorId, vendas, inicio, fim),
    comissaoPorVenda,
    visitaParaVenda: escolherTaxa(
      { sucessos: minhasVendas.length, tentativas: visitas },
      equipe ? { sucessos: equipe.vendas, tentativas: equipe.visitas } : null,
      AMOSTRA_MINIMA.visitaParaVenda,
    ),
    leadParaVisita: escolherTaxa(
      { sucessos: visitas, tentativas: meus.length },
      equipe ? { sucessos: equipe.visitas, tentativas: equipe.leads } : null,
      AMOSTRA_MINIMA.leadParaVisita,
    ),
    diasRestantes: diasRestantesNoMes(hoje),
    diasNoMes: diasNoMes(hoje),
  });

  return {
    estado: "ok",
    ritmo,
    metaComissao: leitura.meta.metaComissao,
    comissaoPorVendaDigitada: leitura.meta.comissaoPorVenda,
  };
}
