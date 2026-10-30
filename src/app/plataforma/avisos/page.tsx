import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import {
  ROTULO_DA_SITUACAO,
  ROTULO_DO_PUBLICO,
  ROTULO_DO_TIPO,
  situacaoDoAviso,
  type SituacaoDoAviso,
} from "@/lib/plataforma/avisoAosClientes";
import { listarAvisosAosClientes, type LinhaDoAviso } from "@/lib/plataforma/avisosAosClientes";
import { EncerrarAviso } from "./EncerrarAviso";
import { NovoAviso } from "./NovoAviso";

export const metadata: Metadata = { title: "Avisos aos clientes" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DA_SITUACAO: Record<SituacaoDoAviso, string> = {
  no_ar: "bg-ok-lavado text-ok border-ok-linha",
  agendado: "bg-info-lavado text-info border-info-linha",
  encerrado: "bg-vidro text-apoio border-linha-forte",
};

const ORDEM: SituacaoDoAviso[] = ["no_ar", "agendado", "encerrado"];

const TITULO_DO_GRUPO: Record<SituacaoDoAviso, string> = {
  no_ar: "No ar agora",
  agendado: "Agendados",
  encerrado: "Encerrados",
};

/**
 * Avisos aos clientes (0242, 29/10/2026): um recado da Astro na faixa logo
 * abaixo do cabeçalho do painel de TODOS os clientes (ou só dos gestores).
 * Escrever com a prévia ao vivo; a lista separa o que está no ar, o que está
 * agendado e o que já saiu.
 *
 * Só na tela: aviso no celular de todo mundo é outra decisão.
 *
 * A guarda aqui, e não só no layout (layout não re-executa entre rotas
 * irmãs); é dela que sai a prova que a leitura pede.
 */
export default async function AvisosAosClientesPage() {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const avisos = await listarAvisosAosClientes(prova);
  const agora = new Date();
  const porSituacao = new Map<SituacaoDoAviso, LinhaDoAviso[]>(ORDEM.map((s) => [s, []]));
  for (const a of avisos) porSituacao.get(situacaoDoAviso(a, agora))!.push(a);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Avisos aos clientes</h1>
        <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
          Um recado da Astro no painel de todos os clientes: novidade, manutenção programada ou algo importante. Aparece
          numa faixa logo abaixo do cabeçalho, em toda tela, até terminar ou ser encerrado.
        </p>
      </div>

      <NovoAviso />

      {ORDEM.map((situacao) => {
        const lista = porSituacao.get(situacao)!;
        if (situacao !== "no_ar" && lista.length === 0) return null;
        return (
          <div key={situacao} className="flex flex-col gap-3">
            <h2 className="text-titulo text-fluid-lg font-medium">
              {TITULO_DO_GRUPO[situacao]} <span className="text-apoio tabular-nums">({lista.length})</span>
            </h2>
            {lista.length === 0 ? (
              <p className="cartao text-fluid-sm text-apoio p-5">Nenhum aviso no ar.</p>
            ) : (
              <ul className="grid gap-3 lg:grid-cols-2">
                {lista.map((a) => (
                  <li key={a.id} className="cartao flex min-w-0 flex-col gap-3 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-titulo text-fluid-base min-w-0 font-semibold break-words">{a.titulo}</h3>
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-fluid-xs border-linha-forte text-corpo rounded-full border px-2.5 py-1">
                          {ROTULO_DO_TIPO[a.tipo]}
                        </span>
                        <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DA_SITUACAO[situacao]}`}>
                          {ROTULO_DA_SITUACAO[situacao]}
                        </span>
                      </div>
                    </div>
                    <p className="text-fluid-sm text-corpo break-words whitespace-pre-line">{a.texto}</p>
                    <dl className="text-fluid-xs text-apoio grid grid-cols-2 gap-x-4 gap-y-1">
                      <dt>Para</dt>
                      <dd className="text-corpo">{ROTULO_DO_PUBLICO[a.publico]}</dd>
                      <dt>Começa</dt>
                      <dd className="text-corpo">{DATA_E_HORA.format(new Date(a.inicio_em))}</dd>
                      <dt>{a.encerrado_em ? "Encerrado" : "Termina"}</dt>
                      <dd className="text-corpo">
                        {a.encerrado_em
                          ? DATA_E_HORA.format(new Date(a.encerrado_em))
                          : a.fim_em
                            ? DATA_E_HORA.format(new Date(a.fim_em))
                            : "até encerrar"}
                      </dd>
                      {a.link && (
                        <>
                          <dt>Link</dt>
                          <dd className="text-corpo break-all">{a.link}</dd>
                        </>
                      )}
                    </dl>
                    {situacao !== "encerrado" && (
                      <div className="border-linha border-t pt-3">
                        <EncerrarAviso id={a.id} agendado={situacao === "agendado"} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
