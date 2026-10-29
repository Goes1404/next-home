"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Eye, EyeOff, Sparkles, UserPlus } from "lucide-react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { gerarSenhaProvisoria } from "@/lib/plataforma/senhaProvisoria";
import {
  adicionarAdministrador,
  removerAdministrador,
  type ResultadoNovoAdministrador,
} from "../administradoresAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";
const BOTAO_PRINCIPAL =
  "bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm flex min-h-11 items-center justify-center rounded-xl px-4 font-semibold disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-titulo text-fluid-sm flex min-h-11 items-center gap-2 px-4 font-medium disabled:opacity-50";

/**
 * Pôr um administrador pelo e-mail. Primeiro envio: se o login existe, entra;
 * se não existe, a action volta `semConta` e o formulário pergunta antes de
 * criar, pedindo a senha temporária (a mesma régua de `erroDaSenha`, com o
 * gerador de `senhaProvisoria.ts`). A troca é obrigatória no primeiro login.
 */
export function FormularioNovoAdministrador() {
  const [estado, enviar, pendente] = useActionState<ResultadoNovoAdministrador | undefined, FormData>(
    adicionarAdministrador,
    undefined,
  );
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [visivel, setVisivel] = useState(false);
  const [copiada, setCopiada] = useState(false);
  // A pergunta "criar conta?" vale só para o e-mail que a action conferiu.
  const criando = Boolean(estado && !estado.ok && estado.semConta && estado.email === email.trim().toLowerCase());

  async function copiar() {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
    } catch {
      setVisivel(true);
    }
  }

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-novo-admin">
      <div>
        <h2 id="titulo-novo-admin" className="text-fluid-sm text-titulo flex items-center gap-2 font-bold">
          <UserPlus className="h-4 w-4" aria-hidden /> Adicionar administrador
        </h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Informe o e-mail de um login que já existe. Se não houver login com esse e-mail, dá para criar um aqui, com
          senha temporária.
        </p>
      </div>

      <form action={enviar} className="flex flex-col gap-3">
        <div>
          <label htmlFor="novo-admin-email" className="text-fluid-xs text-corpo mb-1 block">E-mail</label>
          <input
            id="novo-admin-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="nome@empresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CAMPO}
          />
        </div>

        {criando && (
          <div className="border-linha flex flex-col gap-3 rounded-xl border p-4">
            <input type="hidden" name="criarConta" value="1" />
            <p className="text-fluid-xs text-titulo">
              Não há login com {estado && !estado.ok ? estado.email : "este e-mail"}. Para criar, defina a senha
              temporária e passe para a pessoa; no primeiro login a troca é obrigatória.
            </p>
            <div>
              <label htmlFor="novo-admin-senha" className="text-fluid-xs text-corpo mb-1 block">Senha temporária</label>
              <span className="relative block">
                <input
                  id="novo-admin-senha"
                  name="senha"
                  type={visivel ? "text" : "password"}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-describedby="novo-admin-senha-regra"
                  value={senha}
                  onChange={(e) => {
                    setSenha(e.target.value);
                    setCopiada(false);
                  }}
                  className={`${CAMPO} pr-14 font-mono`}
                />
                <button
                  type="button"
                  onClick={() => setVisivel((v) => !v)}
                  aria-pressed={visivel}
                  aria-controls="novo-admin-senha"
                  aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
                  className="text-apoio hover:text-titulo absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl"
                >
                  {visivel ? <EyeOff aria-hidden className="size-5" /> : <Eye aria-hidden className="size-5" />}
                </button>
              </span>
              <span id="novo-admin-senha-regra" className="text-fluid-xs text-apoio mt-1 block">
                8 ou mais caracteres, com maiúscula, minúscula, número e símbolo.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setSenha(gerarSenhaProvisoria());
                  setVisivel(true);
                  setCopiada(false);
                }}
                className={BOTAO_SECUNDARIO}
              >
                <Sparkles aria-hidden className="h-4 w-4" /> Gerar senha forte
              </button>
              <button type="button" onClick={copiar} disabled={!senha} className={BOTAO_SECUNDARIO}>
                {copiada ? <Check aria-hidden className="text-ok h-4 w-4" /> : <Copy aria-hidden className="h-4 w-4" />}
                {copiada ? "Copiada" : "Copiar"}
              </button>
            </div>
          </div>
        )}

        <div>
          <button type="submit" disabled={pendente} className={BOTAO_PRINCIPAL}>
            {pendente ? "Salvando…" : criando ? "Criar login e tornar administrador" : "Adicionar"}
          </button>
        </div>
      </form>

      {estado && !estado.ok && !(criando && estado.semConta && !senha) && (
        <p role="alert" className="text-fluid-xs text-perigo">{estado.erro}</p>
      )}
      {estado?.ok && (
        <p role="status" className="text-fluid-xs text-titulo flex items-center gap-2">
          <Check className="text-ok h-4 w-4 shrink-0" aria-hidden />
          {estado.contaCriada
            ? `Login criado para ${estado.email}, já como administrador. Passe a senha temporária; a troca é obrigatória no primeiro login.`
            : `${estado.email} agora administra a plataforma.`}
        </p>
      )}
    </section>
  );
}

/** Tirar um administrador, com confirmação. O login continua existindo. */
export function RemoverAdministrador({ userId, email }: { userId: string; email: string | null }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          if (!window.confirm(`Tirar ${email ?? "este login"} da administração da plataforma?\n\nO login continua existindo, mas deixa de entrar nesta área.`)) return;
          iniciar(async () => {
            setErro(null);
            try {
              const r = await removerAdministrador(userId);
              if (!r.ok) setErro(r.erro);
            } catch (e) {
              setErro(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.");
            }
          });
        }}
        className={`${BOTAO_SECUNDARIO} text-perigo`}
      >
        {pendente ? "Tirando…" : "Tirar"}
      </button>
      {erro && <span role="alert" className="text-fluid-xs text-perigo">{erro}</span>}
    </span>
  );
}
