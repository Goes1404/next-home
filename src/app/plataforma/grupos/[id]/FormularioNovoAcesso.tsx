"use client";

import { useActionState } from "react";
import { Check, UserPlus } from "lucide-react";
import { criarAcessoPendenteDoGrupo, type ResultadoNovoAcesso } from "../../acoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** O operador só cria a porta; o titular termina a ficha profissional no primeiro acesso. */
export function FormularioNovoAcesso({ grupoId }: { grupoId: string }) {
  const action = criarAcessoPendenteDoGrupo.bind(null, grupoId);
  const [estado, enviar, pendente] = useActionState<ResultadoNovoAcesso | undefined, FormData>(action, undefined);

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-novo-acesso">
      <div>
        <h2 id="titulo-novo-acesso" className="text-fluid-sm text-titulo flex items-center gap-2 font-bold">
          <UserPlus className="h-4 w-4" /> Criar acesso
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Informe a senha temporária; no primeiro login, a pessoa precisa trocá-la e completar os dados profissionais.
        </p>
      </div>

      <form action={enviar} className="flex flex-col gap-3">
        <div>
          <label htmlFor="novo-acesso-email" className="text-fluid-xs text-corpo mb-1 block">E-mail</label>
          <input id="novo-acesso-email" name="email" type="email" required autoComplete="email" placeholder="nome@empresa.com" className={CAMPO} />
        </div>
        <div>
          <label htmlFor="novo-acesso-senha" className="text-fluid-xs text-corpo mb-1 block">Senha temporária</label>
          <input id="novo-acesso-senha" name="senha" type="password" required minLength={8} autoComplete="new-password" className={CAMPO} />
        </div>
        <div>
          <label htmlFor="novo-acesso-papel" className="text-fluid-xs text-corpo mb-1 block">Tipo de acesso</label>
          <select id="novo-acesso-papel" name="papel" defaultValue="corretor" className={CAMPO}>
            <option value="corretor">Corretor</option>
            <option value="gestor">Administrador da imobiliária</option>
          </select>
        </div>
        <button type="submit" disabled={pendente} className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm flex min-h-11 w-fit items-center rounded-xl px-4 font-semibold disabled:opacity-60">
          {pendente ? "Criando…" : "Criar acesso"}
        </button>
      </form>

      {estado && !estado.ok && <p role="alert" className="text-fluid-xs text-perigo">{estado.erro}</p>}
      {estado?.ok && (
        <div role="status" className="border-ok-linha bg-ok-lavado rounded-xl border p-4">
          <p className="text-fluid-xs text-titulo flex items-center gap-2 font-semibold"><Check className="text-ok h-4 w-4" /> Acesso criado para {estado.email}.</p>
          <p className="text-fluid-xs text-corpo mt-1">No primeiro login, a troca dessa senha será obrigatória.</p>
        </div>
      )}
    </section>
  );
}
