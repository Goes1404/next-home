"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  ResumoImpulsionamento,
  totaisDosImpulsionamentos,
} from "@/lib/crm/impulsionamentosCalculo";
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { salvarGastoDoImpulsionamento } from "./acoes";

type Totais = ReturnType<typeof totaisDosImpulsionamentos>;

const CAMPO =
  "w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none";

const reais = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const dataCurta = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const valorNoCampo = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ListaDeImpulsionamentos({
  resumos,
  totais,
  meuId,
  verEquipe,
  nomes,
  imoveis,
  indisponivel,
}: {
  resumos: ResumoImpulsionamento[];
  totais: Totais;
  meuId: string;
  verEquipe: boolean;
  nomes: Record<string, string>;
  imoveis: { id: string; nome: string }[];
  indisponivel: boolean;
}) {
  if (indisponivel) {
    return (
      <p className="cartao p-4 text-fluid-sm text-corpo">
        O registro de impulsionamentos ainda não está ativo nesta instalação.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <ComoFunciona aberto={resumos.length === 0} />

      {resumos.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero rotulo="Clientes que chegaram" valor={String(totais.leads)} />
          <Numero rotulo="Visitas marcadas" valor={String(totais.visitas)} />
          <Numero rotulo="Gasto informado" valor={reais(totais.gasto)} />
          <Numero rotulo="Custo por cliente" valor={reais(totais.custoPorLead)} />
        </dl>
      )}

      {totais.semGasto > 0 && (
        <p className="rounded-xl bg-alerta-lavado px-4 py-3 text-fluid-sm text-titulo">
          {totais.semGasto === 1
            ? "1 impulsionamento está sem o valor gasto."
            : `${totais.semGasto} impulsionamentos estão sem o valor gasto.`}{" "}
          Sem ele, o custo por cliente não entra na conta.
        </p>
      )}

      <ul className="space-y-3">
        {resumos.map((r) => (
          <li key={r.id}>
            <Cartao
              resumo={r}
              editavel={r.corretorId === meuId}
              dono={verEquipe ? nomes[r.corretorId] ?? null : null}
              imoveis={imoveis}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="cartao flex flex-col-reverse gap-1 p-4">
      <dt className="text-fluid-xs text-corpo">{rotulo}</dt>
      <dd className="text-fluid-xl font-semibold text-titulo">{valor}</dd>
    </div>
  );
}

function ComoFunciona({ aberto }: { aberto: boolean }) {
  return (
    <details className="cartao p-4" open={aberto}>
      <summary className="min-h-11 cursor-pointer text-fluid-sm font-semibold text-titulo">
        Como funciona
      </summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-fluid-sm text-corpo">
        <li>
          Impulsione o post pelo Instagram ou Facebook, como você já faz, escolhendo{" "}
          <strong className="text-titulo">WhatsApp</strong> como destino.
        </li>
        <li>
          Use o mesmo WhatsApp que está conectado em Assistente → Minha IA. Cada cliente que
          chamar pelo anúncio vira lead e a IA atende na hora.
        </li>
        <li>
          O anúncio aparece nesta lista sozinho, com o primeiro cliente que chegar por ele. Você
          só digita <strong className="text-titulo">quanto gastou</strong> (o valor está no app do
          Instagram, em Impulsionamentos).
        </li>
        <li>O custo por cliente e por visita é calculado na hora.</li>
      </ol>
      {aberto && (
        <p className="mt-3 text-fluid-sm text-corpo">
          Ainda não chegou nenhum cliente por impulsionamento.
        </p>
      )}
    </details>
  );
}

function Cartao({
  resumo,
  editavel,
  dono,
  imoveis,
}: {
  resumo: ResumoImpulsionamento;
  editavel: boolean;
  dono: string | null;
  imoveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [valor, setValor] = useState(valorNoCampo(resumo.valorGasto));
  const [imovel, setImovel] = useState(resumo.empreendimentoId ?? "");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const titulo =
    resumo.chave === "sem-etiqueta"
      ? `${TITULO_SEM_ETIQUETA}, sem identificação do post`
      : resumo.titulo ?? "Post impulsionado";

  const salvar = () =>
    iniciar(async () => {
      setMsg(null);
      try {
        const r = await salvarGastoDoImpulsionamento({
          id: resumo.id,
          valor,
          empreendimentoId: imovel || null,
        });
        if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
        else {
          setMsg({ tipo: "ok", texto: r.ok ?? "Salvo." });
          router.refresh();
        }
      } catch (e) {
        setMsg({
          tipo: "erro",
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.",
        });
      }
    });

  return (
    <article className="cartao space-y-4 p-4">
      <header className="space-y-1">
        <h2 className="text-fluid-base font-semibold break-words text-titulo">{titulo}</h2>
        <p className="text-fluid-xs text-corpo">
          {dono ? `${dono} · ` : ""}primeiro cliente em {dataCurta(resumo.primeiroLeadEm)}, último
          em {dataCurta(resumo.ultimoLeadEm)}
          {resumo.url && (
            <>
              {" · "}
              <a
                href={resumo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-transparent hover:decoration-current"
              >
                ver o post
              </a>
            </>
          )}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-2 text-fluid-sm sm:grid-cols-4">
        <Mini rotulo="Clientes" valor={String(resumo.leads)} />
        <Mini rotulo="Visitas" valor={String(resumo.visitas)} />
        <Mini rotulo="Por cliente" valor={reais(resumo.custoPorLead)} />
        <Mini rotulo="Por visita" valor={reais(resumo.custoPorVisita)} />
      </dl>

      {editavel ? (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <label className="space-y-1">
            <span className="text-fluid-xs text-corpo">Quanto você gastou (R$)</span>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Ex.: 50"
              className={CAMPO}
            />
          </label>
          <label className="space-y-1">
            <span className="text-fluid-xs text-corpo">Imóvel do post (opcional)</span>
            <select
              value={imovel}
              onChange={(e) => setImovel(e.target.value)}
              className={`${CAMPO} select-seta`}
            >
              <option value="">Não informado</option>
              {imoveis.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pendente}
            className="min-h-11 self-end rounded-xl bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
          >
            {pendente ? "Salvando…" : "Salvar"}
          </button>
        </form>
      ) : (
        <p className="text-fluid-sm text-corpo">
          Gasto informado: <span className="text-titulo">{reais(resumo.valorGasto)}</span>
        </p>
      )}

      {msg && (
        <p
          role={msg.tipo === "erro" ? "alert" : "status"}
          className={msg.tipo === "erro" ? "text-fluid-sm text-perigo" : "text-fluid-sm text-ok"}
        >
          {msg.texto}
        </p>
      )}
    </article>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-vidro px-3 py-2">
      <dt className="text-fluid-xs text-corpo">{rotulo}</dt>
      <dd className="font-semibold text-titulo">{valor}</dd>
    </div>
  );
}
