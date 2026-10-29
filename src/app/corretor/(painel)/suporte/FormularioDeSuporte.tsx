"use client";

import { useActionState, useState } from "react";
import { ASSUNTOS_DO_PAINEL, MENSAGEM_MAXIMA, ROTULO_DO_ASSUNTO } from "@/lib/plataforma/chamadoDeSuporte";
import { abrirChamado, type ResultadoDoChamado } from "./acoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * O chamado do painel (29/10/2026): assunto e mensagem. A action confere a
 * sessão de novo e decide nome, e-mail e conta; depois de enviado, o
 * formulário volta vazio e a lista embaixo já traz o chamado novo.
 *
 * Campos controlados: o React 19 limpa o formulário depois de toda action, e
 * um erro (limite, rede) não pode apagar o que a pessoa escreveu.
 */
export function FormularioDeSuporte() {
  const [assunto, setAssunto] = useState<string>(ASSUNTOS_DO_PAINEL[0]);
  const [mensagem, setMensagem] = useState("");
  const [estado, enviar, pendente] = useActionState<ResultadoDoChamado | undefined, FormData>(
    async (anterior, dados) => {
      const r = await abrirChamado(anterior, dados);
      if (r.ok) {
        setMensagem("");
        setAssunto(ASSUNTOS_DO_PAINEL[0]);
      }
      return r;
    },
    undefined,
  );

  const erros = estado && !estado.ok ? estado.erros : undefined;

  return (
    <form action={enviar} className="flex flex-col gap-4">
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Assunto
        <select
          name="assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          aria-invalid={erros?.assunto ? true : undefined}
          className={CAMPO}
        >
          {ASSUNTOS_DO_PAINEL.map((a) => (
            <option key={a} value={a}>
              {ROTULO_DO_ASSUNTO[a]}
            </option>
          ))}
        </select>
        {erros?.assunto && <span className="text-perigo">{erros.assunto}</span>}
      </label>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Mensagem
        <textarea
          name="mensagem"
          required
          minLength={5}
          maxLength={MENSAGEM_MAXIMA}
          rows={5}
          placeholder="Conte o que aconteceu ou o que você precisa. Se for um erro, diga em que tela e o que fazia."
          aria-invalid={erros?.mensagem ? true : undefined}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
          className={`${CAMPO} min-h-[8rem]`}
        />
        <span className="flex justify-between gap-3">
          <span className="text-perigo">{erros?.mensagem}</span>
          <span className="tabular-nums">
            {mensagem.length.toLocaleString("pt-BR")}/{MENSAGEM_MAXIMA.toLocaleString("pt-BR")}
          </span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-medium disabled:opacity-50"
        >
          {pendente ? "Enviando…" : "Enviar para a Astro"}
        </button>
        <p role="status" className="text-fluid-xs">
          {estado?.ok && <span className="text-ok">Recebido. A equipe da Astro já foi avisada.</span>}
          {estado && !estado.ok && !estado.erros && <span className="text-perigo">{estado.erro}</span>}
        </p>
      </div>
    </form>
  );
}
