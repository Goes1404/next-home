import type { SaudeDaPlataforma } from "@/lib/plataforma/saude";
import type { NivelDeSaude } from "@/lib/plataforma/saudeDoGrupo";

/**
 * O semáforo de saúde de um grupo, com os motivos em português. Só número e
 * rótulo: a plataforma nunca vê conversa (§4, §11). O nível vai em TEXTO além
 * da cor (daltônico e sol na tela do celular).
 *
 * Classes por extenso: montada em tempo de execução, a classe não existiria.
 */
const SEMAFORO: Record<NivelDeSaude, { rotulo: string; classe: string; bolinha: string }> = {
  verde: { rotulo: "Saudável", classe: "bg-ok-lavado text-ok border-ok-linha", bolinha: "bg-ok" },
  amarelo: { rotulo: "Atenção", classe: "bg-alerta-lavado text-alerta border-alerta-linha", bolinha: "bg-alerta" },
  vermelho: { rotulo: "Precisa de ajuda", classe: "bg-perigo-lavado text-perigo border-perigo-linha", bolinha: "bg-perigo" },
};

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** "há 3 h", "há 2 dias": o dono lê no celular, sem calcular data. */
function haQuanto(iso: string, agora: Date): string {
  const horas = Math.floor((agora.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "há menos de 1 h";
  if (horas < 48) return `há ${horas} h`;
  return `há ${Math.floor(horas / 24)} dias`;
}

export function SelosDeSaude({ nivel }: { nivel: NivelDeSaude }) {
  const s = SEMAFORO[nivel];
  return (
    <span className={`text-fluid-xs inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${s.classe}`}>
      <span aria-hidden className={`size-2 rounded-full ${s.bolinha}`} />
      {s.rotulo}
    </span>
  );
}

/** Os motivos do semáforo; verde diz que está tudo certo. */
export function MotivosDeSaude({ saude }: { saude: SaudeDaPlataforma }) {
  if (saude.motivos.length === 0) return <p className="text-fluid-sm text-apoio">Nada a corrigir agora.</p>;
  return (
    <ul className="flex flex-col gap-1.5">
      {saude.motivos.map((m) => (
        <li key={m.texto} className="text-fluid-sm text-titulo flex items-start gap-2">
          <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${SEMAFORO[m.nivel].bolinha}`} />
          <span className="min-w-0 break-words">{m.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/** O bloco da lista: semáforo e motivos. */
export function SaudeNoCartao({ saude }: { saude: SaudeDaPlataforma }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-apoio text-fluid-xs">Saúde</p>
        <SelosDeSaude nivel={saude.nivel} />
      </div>
      <MotivosDeSaude saude={saude} />
    </div>
  );
}

/** O bloco do detalhe: semáforo, motivos e os números que o explicam. */
export function SaudeNoDetalhe({ saude, agora }: { saude: SaudeDaPlataforma; agora: Date }) {
  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-saude">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="titulo-saude" className="text-fluid-sm text-titulo font-bold">
          Saúde da operação
        </h2>
        <SelosDeSaude nivel={saude.nivel} />
      </div>
      <MotivosDeSaude saude={saude} />
      <dl className="border-linha text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">
        <div>
          <dt className="text-apoio text-fluid-xs">WhatsApps conectados</dt>
          <dd className="text-titulo">
            {saude.whatsapp.conectados} de {saude.whatsapp.cadastrados}
          </dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Última resposta da IA</dt>
          <dd className="text-titulo" title={saude.ultimaRespostaEm ? DATA_E_HORA.format(new Date(saude.ultimaRespostaEm)) : undefined}>
            {saude.ultimaRespostaEm ? haQuanto(saude.ultimaRespostaEm, agora) : "nunca respondeu"}
          </dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">Erros de envio (24 h)</dt>
          <dd className="text-titulo">{saude.errosDeEnvioNas24h}</dd>
        </div>
        <div>
          <dt className="text-apoio text-fluid-xs">IA no plano B (24 h)</dt>
          <dd className="text-titulo">{saude.fallbacksNas24h}</dd>
        </div>
      </dl>
    </section>
  );
}
