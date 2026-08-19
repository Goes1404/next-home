"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Status = "ideal" | "enviando" | "sucesso" | "erro";

export type OpcaoEmpreendimento = { slug: string; nome: string };

type FormularioContatoProps = {
  empreendimentos: OpcaoEmpreendimento[];
  empreendimentoPreselecionado?: string;
  origem?: string;
};

const CAMPO_BASE =
  "w-full rounded-xl border border-linha/15 bg-fundo/60 px-4 py-3 text-titulo placeholder:text-tenue outline-none transition-colors focus:border-brand-300";

export function FormularioContato({
  empreendimentos,
  empreendimentoPreselecionado,
  origem = "site/contato",
}: FormularioContatoProps) {
  const [status, setStatus] = useState<Status>("ideal");
  const [erro, setErro] = useState<string | null>(null);
  // Ref (não state): existe só para medir quanto tempo o visitante levou até
  // enviar — um bot que dispara o POST direto passa longe do mínimo humano.
  // `Date.now()` é impuro, então só pode rodar num efeito (montagem real no
  // cliente), nunca durante a própria renderização.
  const montadoEm = useRef<number | null>(null);
  useEffect(() => {
    montadoEm.current = Date.now();
  }, []);

  async function aoEnviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setStatus("enviando");
    setErro(null);

    const dados = new FormData(ev.currentTarget);
    const payload = {
      nome: String(dados.get("nome") ?? ""),
      email: String(dados.get("email") ?? ""),
      telefone: String(dados.get("telefone") ?? ""),
      mensagem: String(dados.get("mensagem") ?? ""),
      empreendimentoSlug: String(dados.get("empreendimento") ?? "") || undefined,
      origem,
      consentimentoLgpd: dados.get("lgpd") === "on",
      empresa: String(dados.get("empresa") ?? ""),
      elapsedMs: montadoEm.current == null ? null : Date.now() - montadoEm.current,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const corpo = await res.json();
      if (!res.ok) {
        setStatus("erro");
        setErro(corpo.erro ?? "Não foi possível enviar. Tente novamente.");
        return;
      }
      setStatus("sucesso");
      ev.currentTarget.reset();
    } catch {
      setStatus("erro");
      setErro("Sem conexão no momento. Tente novamente ou fale pelo WhatsApp.");
    }
  }

  if (status === "sucesso") {
    return (
      <div className="rounded-2xl border border-brand-400/30 bg-marca-fundo/30 px-6 py-8 text-center">
        <p className="font-display text-lg text-titulo">Mensagem enviada!</p>
        <p className="text-fluid-sm mt-2 text-apoio">
          Recebemos seu contato e um corretor vai retornar em breve.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      {/* Honeypot — invisível e fora da ordem de tabulação, só um bot preenche. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="empresa">Deixe este campo em branco</label>
        <input type="text" id="empresa" name="empresa" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="nome" className="text-fluid-sm mb-1.5 block text-apoio">
          Nome
        </label>
        <input id="nome" name="nome" type="text" required minLength={2} maxLength={120} className={CAMPO_BASE} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-apoio">
            E-mail
          </label>
          <input id="email" name="email" type="email" className={CAMPO_BASE} />
        </div>
        <div>
          <label htmlFor="telefone" className="text-fluid-sm mb-1.5 block text-apoio">
            Telefone / WhatsApp
          </label>
          <input id="telefone" name="telefone" type="tel" className={CAMPO_BASE} />
        </div>
      </div>
      <p className="text-fluid-xs -mt-2 text-tenue">Informe pelo menos um dos dois.</p>

      {empreendimentos.length > 0 && (
        <div>
          <label htmlFor="empreendimento" className="text-fluid-sm mb-1.5 block text-apoio">
            Empreendimento de interesse
          </label>
          <select
            id="empreendimento"
            name="empreendimento"
            defaultValue={empreendimentoPreselecionado ?? ""}
            className={CAMPO_BASE}
          >
            <option value="">Assunto geral</option>
            {empreendimentos.map((e) => (
              <option key={e.slug} value={e.slug}>
                {e.nome}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="mensagem" className="text-fluid-sm mb-1.5 block text-apoio">
          Mensagem
        </label>
        <textarea id="mensagem" name="mensagem" rows={4} maxLength={2000} className={CAMPO_BASE} />
      </div>

      <label className="flex items-start gap-2.5 text-legenda">
        <input
          type="checkbox"
          name="lgpd"
          required
          className="mt-1 h-4 w-4 shrink-0 rounded border-linha/30 bg-fundo accent-brand-500"
        />
        <span className="text-fluid-xs">
          Concordo com o uso dos meus dados para contato sobre este assunto, conforme a{" "}
          <Link href="/privacidade" className="text-acento underline-offset-4 hover:underline">
            Política de Privacidade
          </Link>
          .
        </span>
      </label>

      {status === "erro" && erro && <p className="text-fluid-sm text-red-300">{erro}</p>}

      <button
        type="submit"
        disabled={status === "enviando"}
        className="w-full rounded-full bg-brand-500 px-7 py-3.5 text-sm font-medium text-white transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {status === "enviando" ? "Enviando…" : "Enviar mensagem"}
      </button>
    </form>
  );
}
