"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { alternarParceiro, cadastrarParceiro, trocarLinkDoParceiro } from "./acoes";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";

export type ParceiroNaTela = {
  id: string;
  nome: string;
  imobiliaria: string | null;
  creci: string | null;
  telefone: string | null;
  ativo: boolean;
  link: string;
  indicados: number;
};

const CAMPO = "w-full rounded-xl border border-linha-forte bg-campo px-3 py-2.5 text-fluid-sm text-titulo outline-none";

export function GestaoDeParceiros({ parceiros }: { parceiros: ParceiroNaTela[] }) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const executar = (fn: () => Promise<{ ok?: string; erro?: string }>, limpar = false) =>
    iniciar(async () => {
      setMsg(null);
      try {
        const r = await fn();
        if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
        else {
          setMsg({ tipo: "ok", texto: r.ok ?? "Feito." });
          if (limpar) form.current?.reset();
          router.refresh();
        }
      } catch (e) {
        setMsg({ tipo: "erro", texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo." });
      }
    });

  return (
    <div className="space-y-6">
      <form
        ref={form}
        onSubmit={(e) => {
          e.preventDefault();
          const dados = new FormData(e.currentTarget);
          executar(() => cadastrarParceiro(dados), true);
        }}
        className="cartao grid gap-2 p-4 sm:grid-cols-2"
      >
        <h2 className="text-fluid-sm font-semibold text-titulo sm:col-span-2">Novo parceiro</h2>
        <input name="nome" required minLength={2} placeholder="Nome" aria-label="Nome" className={CAMPO} />
        <input name="imobiliaria" placeholder="Imobiliária" aria-label="Imobiliária" className={CAMPO} />
        <input name="creci" placeholder="CRECI" aria-label="CRECI" className={CAMPO} />
        <input name="telefone" type="tel" placeholder="WhatsApp" aria-label="WhatsApp" className={CAMPO} />
        <input name="email" type="email" placeholder="E-mail" aria-label="E-mail" className={`${CAMPO} sm:col-span-2`} />
        <button
          type="submit"
          disabled={pendente}
          className="min-h-11 rounded-xl bg-acento px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
        >
          Cadastrar parceiro
        </button>
      </form>

      {msg && (
        <p role={msg.tipo === "erro" ? "alert" : "status"} className={`text-fluid-sm ${msg.tipo === "erro" ? "text-perigo" : "text-apoio"}`}>
          {msg.texto}
        </p>
      )}

      {parceiros.length === 0 ? (
        <p className="text-fluid-sm text-apoio">Nenhum parceiro ainda.</p>
      ) : (
        <ul className="space-y-3">
          {parceiros.map((p) => (
            <li key={p.id} className={`cartao space-y-2 p-4 ${p.ativo ? "" : "opacity-60"}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-fluid-sm font-semibold break-words text-titulo">
                  {p.nome}
                  {p.imobiliaria ? <span className="font-normal text-apoio"> · {p.imobiliaria}</span> : null}
                </p>
                <p className="text-fluid-xs text-apoio">
                  {p.indicados} {p.indicados === 1 ? "cliente indicado" : "clientes indicados"}
                  {!p.ativo && " · suspenso"}
                </p>
              </div>
              <p className="text-fluid-xs break-all text-tenue">{p.link}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(p.link);
                      setCopiado(p.id);
                      setTimeout(() => setCopiado(null), 2000);
                    } catch {
                      setMsg({ tipo: "erro", texto: "Não consegui copiar. Segure o dedo no link para copiar." });
                    }
                  }}
                  className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs text-titulo"
                >
                  {copiado === p.id ? "Copiado!" : "Copiar link"}
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => executar(() => alternarParceiro(p.id, !p.ativo))}
                  className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs text-titulo"
                >
                  {p.ativo ? "Suspender acesso" : "Reativar"}
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => executar(() => trocarLinkDoParceiro(p.id))}
                  className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs text-titulo"
                >
                  Trocar link
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
