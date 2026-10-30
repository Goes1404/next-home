import Link from "next/link";
import { getEquipeAtiva } from "@/lib/corretorSessao";
import { getRankingVgv } from "@/lib/financeiro/dados";
import { lerFeitosDoMes, lerMetasDoMes } from "@/lib/financeiro/metasDaEquipeDados";
import { intervaloDo, mesAtual, nomeDoMes } from "@/lib/financeiro/periodo";
import {
  fracaoDoMes,
  MEDIDAS,
  montarPlacar,
  oQueFalta,
  placarDoCorretor,
  porcento,
  ROTULO_DA_MEDIDA,
  type LinhaDoPlacar,
} from "@/lib/financeiro/placarDaEquipe";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { BarraDoPlacar } from "./BarraDoPlacar";

const MEDALHA = ["🥇", "🥈", "🥉"];

/**
 * O placar das metas do mês (0246, 29/10/2026), no topo do Ranking.
 *
 * O gestor vê a equipe inteira com os números e as três barras de cada um.
 * O corretor vê o próprio placar inteiro, a posição dele e o pódio (nome e
 * porcentagem geral, sem os números dos colegas) — ver `placarDaEquipe.ts`.
 * Sem meta definida para ninguém, o gestor vê o convite para definir e o
 * corretor não vê nada. Sem a 0246 no banco, some.
 */
export async function PlacarDeMetas({
  corretor,
}: {
  corretor: { id: string; grupoId: string; papel: string };
}) {
  const hoje = hojeEmSaoPaulo();
  const mes = mesAtual(hoje);
  const { inicio, fim } = intervaloDo("mes", hoje);
  const gestor = corretor.papel === "gestor";

  const placar = await montarOPlacar(corretor.grupoId, mes, inicio, fim);
  if (placar === null) return null;
  if (placar === "sem_metas") {
    return gestor ? (
      <section className="cartao p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Metas do mês</h2>
        <p className="text-fluid-sm text-apoio mt-1">
          Defina as metas de visitas, propostas e vendas de cada corretor e o placar aparece aqui para a equipe.
        </p>
        <Link
          href="/corretor/financeiro/desempenho#metas-da-equipe"
          className="botao-secundario text-fluid-sm mt-3 inline-flex min-h-11 items-center px-4"
        >
          Definir metas
        </Link>
      </section>
    ) : null;
  }

  const ritmo = fracaoDoMes(hoje);
  const titulo = `Metas de ${nomeDoMes(inicio)}`;

  if (gestor) {
    return (
      <section className="space-y-3" aria-labelledby="placar-de-metas">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="placar-de-metas" className="text-fluid-base text-titulo font-medium first-letter:uppercase">
            {titulo}
          </h2>
          <Link href="/corretor/financeiro/desempenho#metas-da-equipe" className="link-acao text-fluid-xs">
            Ajustar metas
          </Link>
        </div>
        <ol className="space-y-2">
          {placar.map((l) => (
            <li key={l.corretorId} className="cartao space-y-2 p-3 sm:p-4">
              <CabecalhoDaLinha linha={l} />
              {l.posicao !== null ? <BarrasDasMedidas linha={l} ritmo={ritmo} /> : <p className="text-fluid-xs text-tenue">Sem meta neste mês.</p>}
            </li>
          ))}
        </ol>
        <Legenda />
      </section>
    );
  }

  const { podio, minha, participantes } = placarDoCorretor(placar, corretor.id);
  return (
    <section className="space-y-3" aria-labelledby="placar-de-metas">
      <h2 id="placar-de-metas" className="text-fluid-base text-titulo font-medium first-letter:uppercase">
        {titulo}
      </h2>
      {minha && minha.posicao !== null ? (
        <div className="cartao border-acento-linha space-y-3 p-4 sm:p-5">
          <p className="text-fluid-sm text-titulo font-medium">
            Você está em {minha.posicao}º de {participantes} · {porcento(minha.geral)} das metas
          </p>
          <BarrasDasMedidas linha={minha} ritmo={ritmo} />
          <p className="text-fluid-xs text-apoio">{oQueFalta(minha.metas, minha.feito) ?? "Metas do mês batidas. 🎉"}</p>
        </div>
      ) : (
        <p className="cartao text-fluid-sm text-corpo p-4">O gestor ainda não definiu a sua meta deste mês.</p>
      )}
      {podio.length > 0 && (
        <ol className="space-y-2" aria-label="Quem lidera">
          {podio.map((l, i) => (
            <li
              key={l.corretorId}
              className={`cartao flex items-center gap-3 p-3 ${l.corretorId === corretor.id ? "border-acento-linha" : ""}`}
            >
              <span className="text-fluid-base w-8 shrink-0 text-center" aria-label={`${i + 1}º lugar`}>
                {MEDALHA[i] ?? `${i + 1}º`}
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="text-fluid-sm text-titulo block truncate font-medium">
                  {l.nome}
                  {l.corretorId === corretor.id ? " (você)" : ""}
                </span>
                <BarraDoPlacar progresso={l.geral ?? 0} rotulo={`${l.nome}: ${porcento(l.geral)} das metas`} fina />
              </span>
              <span className="text-fluid-sm text-titulo shrink-0 font-bold tabular-nums">{porcento(l.geral)}</span>
            </li>
          ))}
        </ol>
      )}
      <Legenda />
    </section>
  );
}

/**
 * Os números do placar; `"sem_metas"` quando ninguém tem meta no mês e
 * `null` sem a 0246 no banco ou numa falha de leitura (a seção some).
 */
async function montarOPlacar(
  grupoId: string,
  mes: string,
  inicio: string,
  fim: string,
): Promise<LinhaDoPlacar[] | "sem_metas" | null> {
  try {
    const [metas, equipe, ranking] = await Promise.all([lerMetasDoMes(grupoId, mes), getEquipeAtiva(), getRankingVgv(inicio, fim)]);
    if (!metas) return null;
    if (metas.size === 0) return "sem_metas";
    const vendas = new Map((ranking ?? []).map((r) => [r.corretorId, r.vendas]));
    const fotos = new Map((ranking ?? []).map((r) => [r.corretorId, r.fotoUrl]));
    const feitos = await lerFeitosDoMes(grupoId, mes, vendas);
    return montarPlacar(
      equipe.map((c) => ({ id: c.id, nome: c.nome, fotoUrl: fotos.get(c.id) ?? null })),
      metas,
      feitos,
    );
  } catch (err) {
    console.error("[placar] não montado:", err);
    return null;
  }
}

function CabecalhoDaLinha({ linha }: { linha: LinhaDoPlacar }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-fluid-sm text-titulo min-w-0 font-medium break-words">
        {linha.posicao !== null ? `${linha.posicao}º · ` : ""}
        {linha.nome}
      </span>
      <span className="text-fluid-xs text-apoio tabular-nums">
        {linha.posicao !== null ? `${porcento(linha.geral)} das metas` : ""}
        {linha.bateu ? " · batida" : ""}
      </span>
    </div>
  );
}

function BarrasDasMedidas({ linha, ritmo }: { linha: LinhaDoPlacar; ritmo: number }) {
  return (
    <dl className="grid gap-2 sm:grid-cols-3">
      {MEDIDAS.filter((m) => linha.metas[m] !== null).map((m) => (
        <div key={m} className="min-w-0 space-y-1">
          <dt className="text-fluid-xs text-apoio flex justify-between gap-2">
            <span>{ROTULO_DA_MEDIDA[m].plural}</span>
            <span className="text-titulo tabular-nums">
              {linha.feito[m]} de {linha.metas[m]}
            </span>
          </dt>
          <dd>
            <BarraDoPlacar
              progresso={linha.porMedida[m] ?? 0}
              ritmo={ritmo}
              rotulo={`${ROTULO_DA_MEDIDA[m].plural}: ${linha.feito[m]} de ${linha.metas[m]}`}
            />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Legenda() {
  return (
    <p className="text-fluid-xs text-tenue">
      O traço na barra é onde o mês está: quem está antes dele está atrasado. {MEDIDAS.map((m) => ROTULO_DA_MEDIDA[m].explicacao).join(" ")}
    </p>
  );
}
