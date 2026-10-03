import { linhasDoResumo, type ResumoDoLead } from "@/lib/crm/resumoDoLead";

const COR_TEMPERATURA: Record<"quente" | "morno" | "frio", string> = {
  quente: "text-perigo",
  morno: "text-alerta",
  frio: "text-apoio",
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * O resumo do lead (plano de ativação, 3.1), o mesmo no topo da ficha e no
 * perfil aberto de dentro da conversa. Um componente só, para as duas telas
 * nunca contarem histórias diferentes sobre a mesma pessoa.
 */
export function ResumoDoLeadCartao({ resumo }: { resumo: ResumoDoLead }) {
  const linhas = linhasDoResumo(resumo);
  return (
    <section className="cartao overflow-hidden text-left">
      <div className="border-linha flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="text-titulo text-sm font-semibold">Resumo do lead</h2>
        <span className="text-tenue text-xs">
          {resumo.temperatura && (
            <span className={`font-medium capitalize ${COR_TEMPERATURA[resumo.temperatura.label]}`}>
              {resumo.temperatura.label} · {resumo.temperatura.score}
            </span>
          )}
          {resumo.atualizadoEm && (
            <span>
              {resumo.temperatura ? " · " : ""}atualizado {quando.format(new Date(resumo.atualizadoEm))}
            </span>
          )}
        </span>
      </div>
      {resumo.leitura && <p className="text-apoio px-4 pt-3 text-sm leading-relaxed">{resumo.leitura}</p>}
      <dl className="divide-linha mt-1 divide-y">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex min-h-11 items-start justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-tenue shrink-0">{l.rotulo}</dt>
            <dd className="text-corpo min-w-0 text-right font-medium break-words">{l.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
