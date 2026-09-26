"use client";

import { useState, useTransition } from "react";
import { indicarCliente } from "./acoes";

const CAMPO = "w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo outline-none focus:border-brand-400";

export function IndicarCliente({ token, imoveis }: { token: string; imoveis: { id: string; nome: string }[] }) {
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <form
      className="space-y-3 rounded-2xl border border-linha-forte bg-superficie p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const d = new FormData(f);
        iniciar(async () => {
          setMsg(null);
          try {
            const r = await indicarCliente(token, {
              nome: String(d.get("nome") ?? ""),
              telefone: String(d.get("telefone") ?? ""),
              empreendimentoId: String(d.get("imovel") ?? "") || null,
              observacao: String(d.get("observacao") ?? ""),
              consentiu: d.get("consentiu") === "on",
            });
            if (r.erro) setMsg({ tipo: "erro", texto: r.erro });
            else {
              setMsg({ tipo: "ok", texto: r.ok ?? "Indicado." });
              f.reset();
            }
          } catch {
            setMsg({ tipo: "erro", texto: "Sem conexão agora. Recarregue a página e tente de novo." });
          }
        });
      }}
    >
      <h2 className="text-fluid-xl font-display text-titulo">Indicar um cliente</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ind-nome" className="text-fluid-sm mb-1.5 block text-apoio">Nome do cliente</label>
          <input id="ind-nome" name="nome" required minLength={2} className={CAMPO} />
        </div>
        <div>
          <label htmlFor="ind-tel" className="text-fluid-sm mb-1.5 block text-apoio">WhatsApp do cliente</label>
          <input id="ind-tel" name="telefone" type="tel" required inputMode="tel" className={CAMPO} />
        </div>
      </div>
      <div>
        <label htmlFor="ind-imovel" className="text-fluid-sm mb-1.5 block text-apoio">Imóvel de interesse</label>
        <select id="ind-imovel" name="imovel" className={`select-seta ${CAMPO}`} defaultValue="">
          <option value="">Ainda não sabe</option>
          {imoveis.map((i) => (
            <option key={i.id} value={i.id}>{i.nome}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="ind-obs" className="text-fluid-sm mb-1.5 block text-apoio">Observação (unidade, renda, horário)</label>
        <textarea id="ind-obs" name="observacao" rows={3} maxLength={1000} className={CAMPO} />
      </div>
      <label className="flex items-start gap-2.5 text-legenda">
        <input type="checkbox" name="consentiu" required className="mt-1 h-4 w-4 shrink-0 accent-brand-500" />
        <span className="text-fluid-xs">O cliente sabe que será procurado por um corretor da imobiliária pelo WhatsApp.</span>
      </label>
      {msg && (
        <p role={msg.tipo === "erro" ? "alert" : "status"} className={`text-fluid-sm ${msg.tipo === "erro" ? "text-perigo" : "text-apoio"}`}>
          {msg.texto}
        </p>
      )}
      <button type="submit" disabled={pendente} className="botao-vivo min-h-12 w-full rounded-full bg-brand-500 px-6 font-semibold text-white disabled:opacity-60 sm:w-auto">
        {pendente ? "Enviando…" : "Indicar cliente"}
      </button>
    </form>
  );
}
