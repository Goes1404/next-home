import { lerVisitasParaConfirmar } from "@/lib/agenda/lerAgenda";
import { formatarQuando } from "@/lib/agenda/comandos/textos";
import { RespostaDaVisita } from "./RespostaDaVisita";

/**
 * "A visita aconteceu?" no Início (27/10/2026, fase 4): as visitas que já
 * passaram e esperam resposta. A mesma pergunta vai ao WhatsApp; responder
 * aqui ou lá dá no mesmo. Some quando não há nada; falha também some.
 */
export async function VisitasParaConfirmar({ corretorId, grupoId }: { corretorId: string; grupoId: string }) {
  let visitas: Awaited<ReturnType<typeof lerVisitasParaConfirmar>>;
  try {
    visitas = await lerVisitasParaConfirmar({ corretorId, grupoId });
  } catch (err) {
    console.error("[início] visitas para confirmar não lidas:", err);
    return null;
  }
  if (visitas.length === 0) return null;

  return (
    <section className="cartao border-alerta/40 p-5" aria-labelledby="visitas-para-confirmar">
      <h2 id="visitas-para-confirmar" className="font-display text-lg text-titulo">
        A visita aconteceu?
      </h2>
      <ul className="mt-3 space-y-4">
        {visitas.map((v) => (
          <li key={v.id}>
            <p className="text-fluid-sm break-words text-corpo">
              <span className="font-medium text-titulo">{v.nome}</span> · {formatarQuando(v.inicio)}
              {v.status === "sem_confirmacao" && <span className="text-apoio"> · sem resposta há mais de um dia</span>}
            </p>
            <RespostaDaVisita visitaId={v.id} />
          </li>
        ))}
      </ul>
    </section>
  );
}
