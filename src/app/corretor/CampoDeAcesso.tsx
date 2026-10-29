"use client";

import { ArrowRight, Check, Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useEffect, useId, useState, type Ref } from "react";
import { REGRAS_DA_SENHA } from "@/lib/auth/politicaDeSenha";
import { useFormStatus } from "react-dom";
import s from "./campoDeAcesso.module.css";

/**
 * Os campos das telas de ACESSO da Astro (29/10/2026). Relato: "o campo de
 * entrar para colocar senha e login está muito grande".
 *
 * Rótulo FLUTUANTE: ele mora dentro do campo e sobe, encolhendo, quando o
 * campo ganha foco ou valor. Cada campo deixa de ocupar duas linhas (rótulo
 * em cima + caixa) e passa a ocupar uma, sem perder o rótulo visível — o
 * placeholder sozinho sumiria ao digitar, e aí ninguém sabe mais que campo
 * é aquele. O rótulo continua um `<label for>` de verdade.
 *
 * Funciona sem JavaScript: a subida é CSS (`:focus`, `:not(:placeholder-shown)`
 * e `:autofill`, para o e-mail que o gerenciador de senhas preenche). Por
 * isso o `placeholder=" "`: é o espaço que deixa o CSS saber se há valor.
 */
export function CampoDeAcesso({
  id,
  name,
  rotulo,
  tipo,
  autoComplete,
  required = true,
  minLength,
  dica,
  ref,
}: {
  id: string;
  name: string;
  rotulo: string;
  /** `login` aceita e-mail ou nome de usuário (texto livre, teclado de e-mail). */
  tipo: "email" | "login" | "senha";
  autoComplete: "email" | "username" | "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  /** Linha pequena embaixo do campo ("Pelo menos 8 caracteres"). */
  dica?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const [visivel, setVisivel] = useState(false);
  const dicaId = useId();
  const avisoId = useId();
  const senha = tipo === "senha";
  const Icone = senha ? LockKeyhole : tipo === "login" ? UserRound : Mail;
  const descritores = [dica ? dicaId : null, senha && visivel ? avisoId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <div className={s.campo}>
        <input
          ref={ref}
          id={id}
          name={name}
          type={senha ? (visivel ? "text" : "password") : tipo === "login" ? "text" : "email"}
          inputMode={senha ? undefined : "email"}
          autoCapitalize="none"
          spellCheck={false}
          required={required}
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder=" "
          aria-describedby={descritores}
          className={`${s.entrada} ${senha ? s.comOlho : ""}`}
        />
        <label htmlFor={id} className={s.rotulo}>
          {rotulo}
        </label>
        <Icone aria-hidden className={s.icone} />
        {senha && (
          <button
            type="button"
            onClick={() => setVisivel((v) => !v)}
            aria-pressed={visivel}
            aria-controls={id}
            aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
            title={visivel ? "Ocultar senha" : "Mostrar senha"}
            className={s.olho}
          >
            {visivel ? <EyeOff aria-hidden className="size-[1.1rem]" /> : <Eye aria-hidden className="size-[1.1rem]" />}
          </button>
        )}
      </div>
      {dica && (
        <p id={dicaId} className={s.dica}>
          {dica}
        </p>
      )}
      {senha && (
        <span id={avisoId} className="sr-only" role="status">
          {visivel ? "A senha está visível na tela." : ""}
        </span>
      )}
    </div>
  );
}

/**
 * O botão principal das telas de acesso: gira enquanto envia (pelo
 * `useFormStatus`, então serve tanto ao formulário com estado quanto ao HTML
 * simples do "Esqueci a senha") e a seta avança ao tocar.
 */
export function BotaoDeAcesso({ children, enviando }: { children: React.ReactNode; enviando: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={s.botao}>
      {pending ? (
        <>
          <span aria-hidden className={s.giro} />
          {enviando}
        </>
      ) : (
        <>
          {children}
          <ArrowRight aria-hidden className={s.seta} />
        </>
      )}
    </button>
  );
}

/** A mensagem de erro chega deslizando e dá um balanço curto ("não foi"). */
export function ErroDeAcesso({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className={s.erro}>
      {children}
    </p>
  );
}

/** Para o `<form>`: o espaçamento compacto entre os campos. */
export const CLASSE_DO_FORMULARIO = s.formulario;

/**
 * A régua da senha AO VIVO (29/10/2026): cada critério acende com um check
 * conforme a pessoa digita no campo `campoId`. As mesmas regras que o
 * servidor confere (`politicaDeSenha.ts`) — a lista só adianta o aviso, quem
 * decide é a action.
 *
 * Escuta o `input` do próprio campo pelo id em vez de virar campo controlado:
 * os formulários são não-controlados (o FormData vai direto à action).
 */
export function ChecklistDaSenha({ campoId }: { campoId: string }) {
  const [senha, setSenha] = useState("");
  useEffect(() => {
    const campo = document.getElementById(campoId) as HTMLInputElement | null;
    if (!campo) return;
    const ler = () => setSenha(campo.value);
    campo.addEventListener("input", ler);
    return () => campo.removeEventListener("input", ler);
  }, [campoId]);

  return (
    <ul className={s.checklist} aria-label="Critérios da senha">
      {REGRAS_DA_SENHA.map((r) => {
        const ok = r.cumpre(senha);
        return (
          <li key={r.id} data-ok={ok || undefined} className={s.criterio}>
            <span aria-hidden className={s.marca}>
              <Check className="size-3" strokeWidth={3} />
            </span>
            {r.rotulo}
            <span className="sr-only">{ok ? " (cumprido)" : " (falta)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
