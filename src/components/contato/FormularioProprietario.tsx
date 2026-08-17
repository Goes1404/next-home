"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Status = "ideal" | "enviando" | "sucesso" | "erro";

const CAMPO_BASE =
  "w-full rounded-xl border border-white/15 bg-ink-950/60 px-4 py-3 text-mist-50 placeholder:text-mist-500 outline-none transition-colors focus:border-brand-300";

const TIPOS_IMOVEL = ["Apartamento", "Casa", "Terreno", "Comercial", "Outro"];
const INTENCOES = ["Vender", "Alugar", "Ainda estou avaliando"];

/**
 * Captação de proprietário — o outro lado do funil do site, que até então só
 * falava com quem quer comprar.
 *
 * Mesmas defesas do formulário de contato (honeypot + tempo mínimo de
 * preenchimento) e o mesmo consentimento LGPD explícito; muda o conjunto de
 * campos e o `tipo` enviado à API, que separa os dois funis no banco.
 */
export function FormularioProprietario({ regioes }: { regioes: string[] }) {
  const [status, setStatus] = useState<Status>("ideal");
  const [erro, setErro] = useState<string | null>(null);
  // `Date.now()` é impuro: só pode rodar num efeito, nunca na renderização.
  const montadoEm = useRef<number | null>(null);
  useEffect(() => {
    montadoEm.current = Date.now();
  }, []);

  async function aoEnviar(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setStatus("enviando");
    setErro(null);

    const form = ev.currentTarget;
    const dados = new FormData(form);
    const payload = {
      nome: String(dados.get("nome") ?? ""),
      email: String(dados.get("email") ?? ""),
      telefone: String(dados.get("telefone") ?? ""),
      mensagem: String(dados.get("mensagem") ?? ""),
      tipo: "proprietario",
      detalhes: {
        imovelTipo: String(dados.get("imovelTipo") ?? ""),
        imovelCidade: String(dados.get("imovelCidade") ?? ""),
        imovelBairro: String(dados.get("imovelBairro") ?? ""),
        intencao: String(dados.get("intencao") ?? ""),
      },
      origem: "site/anunciar-imovel",
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
      form.reset();
    } catch {
      setStatus("erro");
      setErro("Sem conexão no momento. Tente novamente ou fale pelo WhatsApp.");
    }
  }

  if (status === "sucesso") {
    return (
      <div className="rounded-2xl border border-brand-400/30 bg-brand-900/30 px-6 py-8 text-center">
        <p className="font-display text-lg text-mist-50">Recebemos seu imóvel!</p>
        <p className="text-fluid-sm mt-2 text-mist-300">
          Um corretor da Next Home vai entrar em contato para entender o imóvel e conversar
          sobre avaliação e condições.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} className="space-y-4">
      {/* Honeypot — invisível e fora da ordem de tabulação, só um bot preenche. */}
      <div className="absolute -left-[9999px]" aria-hidden="true">
        <label htmlFor="empresa-prop">Deixe este campo em branco</label>
        <input type="text" id="empresa-prop" name="empresa" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="nome" className="text-fluid-sm mb-1.5 block text-mist-300">
          Seu nome
        </label>
        <input id="nome" name="nome" type="text" required minLength={2} maxLength={120} className={CAMPO_BASE} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="text-fluid-sm mb-1.5 block text-mist-300">
            E-mail
          </label>
          <input id="email" name="email" type="email" className={CAMPO_BASE} />
        </div>
        <div>
          <label htmlFor="telefone" className="text-fluid-sm mb-1.5 block text-mist-300">
            Telefone / WhatsApp
          </label>
          <input id="telefone" name="telefone" type="tel" className={CAMPO_BASE} />
        </div>
      </div>
      <p className="text-fluid-xs -mt-2 text-mist-500">Informe pelo menos um dos dois.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="imovelTipo" className="text-fluid-sm mb-1.5 block text-mist-300">
            Tipo do imóvel
          </label>
          <select id="imovelTipo" name="imovelTipo" defaultValue="" className={CAMPO_BASE}>
            <option value="">Selecione</option>
            {TIPOS_IMOVEL.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="intencao" className="text-fluid-sm mb-1.5 block text-mist-300">
            Quero
          </label>
          <select id="intencao" name="intencao" defaultValue="" className={CAMPO_BASE}>
            <option value="">Selecione</option>
            {INTENCOES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="imovelCidade" className="text-fluid-sm mb-1.5 block text-mist-300">
            Cidade
          </label>
          <select id="imovelCidade" name="imovelCidade" defaultValue="" className={CAMPO_BASE}>
            <option value="">Selecione</option>
            {regioes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="Outra">Outra</option>
          </select>
        </div>
        <div>
          <label htmlFor="imovelBairro" className="text-fluid-sm mb-1.5 block text-mist-300">
            Bairro
          </label>
          <input id="imovelBairro" name="imovelBairro" type="text" maxLength={120} className={CAMPO_BASE} />
        </div>
      </div>

      <div>
        <label htmlFor="mensagem" className="text-fluid-sm mb-1.5 block text-mist-300">
          Conte um pouco sobre o imóvel
        </label>
        <textarea
          id="mensagem"
          name="mensagem"
          rows={4}
          maxLength={2000}
          placeholder="Metragem, dormitórios, vagas, estado de conservação…"
          className={CAMPO_BASE}
        />
      </div>

      <label className="flex items-start gap-2.5 text-mist-400">
        <input
          type="checkbox"
          name="lgpd"
          required
          className="mt-1 h-4 w-4 shrink-0 rounded border-white/30 bg-ink-950 accent-brand-500"
        />
        <span className="text-fluid-xs">
          Concordo com o uso dos meus dados para contato sobre a oferta deste imóvel, conforme a{" "}
          <Link href="/privacidade" className="text-brand-200 underline-offset-4 hover:underline">
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
        {status === "enviando" ? "Enviando…" : "Quero anunciar meu imóvel"}
      </button>
    </form>
  );
}
