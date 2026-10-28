"use client";

import { useActionState } from "react";
import { Check, KeyRound } from "lucide-react";
import type { AcessoDoGrupo } from "@/lib/plataforma/grupos";
import { redefinirSenhaDoAcesso, type ResultadoSenhaRedefinida } from "../../acoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** Os logins do grupo, cada um com "Redefinir senha" (senha temporária + troca obrigatória). */
export function AcessosDoGrupo({ grupoId, acessos }: { grupoId: string; acessos: AcessoDoGrupo[] }) {
  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-acessos">
      <div>
        <h2 id="titulo-acessos" className="text-fluid-sm text-titulo flex items-center gap-2 font-bold">
          <KeyRound className="h-4 w-4" /> Acessos
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Para quem ficou sem entrar: defina uma senha temporária e passe para a pessoa. No próximo login a troca é obrigatória.
        </p>
      </div>

      {acessos.length === 0 ? (
        <p className="text-fluid-xs text-apoio">Nenhum login neste grupo ainda.</p>
      ) : (
        <ul className="divide-linha flex flex-col divide-y">
          {acessos.map((a) => (
            <LinhaDoAcesso key={a.corretorId} grupoId={grupoId} acesso={a} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LinhaDoAcesso({ grupoId, acesso }: { grupoId: string; acesso: AcessoDoGrupo }) {
  const action = redefinirSenhaDoAcesso.bind(null, grupoId, acesso.corretorId);
  const [estado, enviar, pendente] = useActionState<ResultadoSenhaRedefinida | undefined, FormData>(action, undefined);
  const campo = `senha-${acesso.corretorId}`;

  return (
    <li className="py-3">
      <details>
        <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <span className="text-fluid-sm text-titulo block break-words">
              {acesso.nome}
              {!acesso.ativo && <span className="text-tenue"> · desativado</span>}
            </span>
            <span className="text-fluid-xs text-apoio block break-all">
              {acesso.email ?? "sem e-mail na ficha"} · {acesso.papel === "gestor" ? "administrador" : "corretor"}
              {acesso.deveTrocarSenha && " · troca de senha pendente"}
            </span>
          </span>
          <span className="text-fluid-xs text-acento font-semibold">Redefinir senha</span>
        </summary>

        <form action={enviar} className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor={campo} className="text-fluid-xs text-corpo mb-1 block">Senha temporária</label>
            <input id={campo} name="senha" type="text" required minLength={8} autoComplete="off" spellCheck={false} className={CAMPO} />
          </div>
          <button type="submit" disabled={pendente} className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm flex min-h-11 w-fit items-center rounded-xl px-4 font-semibold disabled:opacity-60">
            {pendente ? "Redefinindo…" : "Redefinir senha"}
          </button>
        </form>

        {estado && !estado.ok && <p role="alert" className="text-fluid-xs text-perigo mt-2">{estado.erro}</p>}
        {estado?.ok && (
          <p role="status" className="text-fluid-xs text-titulo mt-2 flex items-center gap-2">
            <Check className="text-ok h-4 w-4" /> Senha de {estado.nome} redefinida. No próximo login a troca será obrigatória.
          </p>
        )}
      </details>
    </li>
  );
}
