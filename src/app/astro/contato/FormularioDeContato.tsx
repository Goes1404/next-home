"use client";

import Link from "next/link";
import { MessageCircle, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  ASSUNTOS_DO_SITE,
  CONTATO_VAZIO,
  MENSAGEM_MAXIMA,
  ROTULO_DO_ASSUNTO,
  validarContato,
  type CampoDoContato,
  type DadosDoContato,
  type ErrosDoContato,
} from "@/lib/plataforma/chamadoDeSuporte";
import { mascararWhatsapp } from "@/lib/plataforma/pedidoDeContratacao";
import s from "../astro.module.css";
import c from "../contratar/contratar.module.css";
import { enviarContato, type RespostaDoContato } from "./acoes";
import k from "./contato.module.css";

/**
 * O formulário do "Fale com a Astro" (29/10/2026): nome, e-mail, WhatsApp,
 * assunto, mensagem e o consentimento da LGPD, numa folha só, e a
 * confirmação no lugar dela.
 *
 * - Valida com as MESMAS regras da action (`validarContato`); o erro aparece
 *   no campo e o foco vai para o primeiro campo com erro.
 * - Campo-isca (`site`) e o tempo com o formulário aberto vão junto no envio:
 *   a action descarta robô sem avisar.
 */

type Confirmado = Extract<RespostaDoContato, { ok: true }>;

function focarNoMeio(el: HTMLElement | null) {
  if (!el) return;
  el.focus({ preventScroll: true });
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
}

export function FormularioDeContato() {
  const [dados, setDados] = useState<DadosDoContato>(CONTATO_VAZIO);
  const [erros, setErros] = useState<ErrosDoContato>({});
  const [consentimento, setConsentimento] = useState(false);
  const [erroDoConsentimento, setErroDoConsentimento] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState<Confirmado | null>(null);
  const [enviando, iniciar] = useTransition();
  const abertoEm = useRef<number | null>(null);
  const isca = useRef<HTMLInputElement>(null);
  const tituloConfirmado = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    abertoEm.current = Date.now();
  }, []);

  useEffect(() => {
    if (confirmado) tituloConfirmado.current?.focus();
  }, [confirmado]);

  function mudar<K extends keyof DadosDoContato>(campo: K, valor: DadosDoContato[K]) {
    setDados((d) => ({ ...d, [campo]: valor }));
    if (erros[campo]) setErros((e) => ({ ...e, [campo]: undefined }));
  }

  function focarPrimeiroErro(e: ErrosDoContato) {
    const ordem: CampoDoContato[] = ["nome", "email", "whatsapp", "assunto", "mensagem"];
    const primeiro = ordem.find((campo) => e[campo]);
    if (primeiro) requestAnimationFrame(() => focarNoMeio(document.getElementById(`contato-${primeiro}`)));
  }

  function enviar() {
    const local = validarContato(dados);
    if (!local.ok) {
      setErros(local.erros);
      return focarPrimeiroErro(local.erros);
    }
    if (!consentimento) {
      setErroDoConsentimento(true);
      focarNoMeio(document.getElementById("contato-consentimento"));
      return;
    }
    iniciar(async () => {
      setErroGeral(null);
      try {
        const r = await enviarContato({
          ...dados,
          consentimento,
          site: isca.current?.value ?? "",
          abertoHaMs: abertoEm.current === null ? 0 : Date.now() - abertoEm.current,
        });
        if (r.ok) {
          setConfirmado(r);
          return;
        }
        setErroGeral(r.erro);
        if (r.erros && Object.keys(r.erros).length > 0) {
          setErros(r.erros);
          focarPrimeiroErro(r.erros);
        } else {
          requestAnimationFrame(() => document.getElementById("contato-erro-geral")?.scrollIntoView({ block: "center" }));
        }
      } catch (e) {
        setErroGeral(
          ehActionDeOutroBuild(e)
            ? avisoDePaginaVelha()
            : "Não foi possível falar com o servidor. Confira a internet e tente de novo.",
        );
        requestAnimationFrame(() => document.getElementById("contato-erro-geral")?.scrollIntoView({ block: "center" }));
      }
    });
  }

  if (confirmado) {
    return (
      <section className={`${c.folha} ${c.passoAvanca} px-5 py-8 sm:px-9 sm:py-10`} aria-labelledby="contato-confirmado">
        <div className="flex flex-col items-start">
          <span className={c.selado} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5 10 17.5 19 7" />
            </svg>
          </span>
          <h2
            id="contato-confirmado"
            ref={tituloConfirmado}
            tabIndex={-1}
            className={`${s.titulo} mt-5 text-[1.9rem] leading-tight font-extrabold outline-none`}
          >
            Mensagem recebida{confirmado.primeiroNome ? `, ${confirmado.primeiroNome}` : ""}!
          </h2>
          <p className="mt-2 leading-relaxed text-[var(--tinta-suave)]">
            Assunto: <strong className="text-[var(--tinta)]">{confirmado.assunto}</strong>. A equipe da Astro responde
            pelo WhatsApp ou pelo e-mail que você informou em até 1 dia útil.
          </p>
          <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap [&>*]:whitespace-nowrap">
            {confirmado.whatsappDaAstro && (
              <a href={confirmado.whatsappDaAstro} target="_blank" rel="noopener" className={`${s.botao} ${s.botaoPrincipal}`}>
                <MessageCircle aria-hidden className="size-4" />
                Falar agora no WhatsApp
              </a>
            )}
            <Link href="/astro" className={`${s.botao} ${s.botaoNoClaro}`}>
              Voltar à página da Astro
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`${c.folha} px-5 pt-6 pb-5 sm:px-9 sm:pt-8 sm:pb-9`} aria-labelledby="contato-titulo">
      <h2 id="contato-titulo" className={`${s.titulo} text-2xl font-bold`}>
        Sua mensagem
      </h2>
      <p className="mt-1.5 text-[var(--tinta-suave)]">Todos os campos são obrigatórios.</p>

      <form
        noValidate
        className="mt-5"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        {/* Campo-isca: gente não vê nem alcança pelo teclado; robô preenche. */}
        <div className={c.isca} aria-hidden="true">
          <label htmlFor="contato-site">Site da empresa</label>
          <input ref={isca} id="contato-site" name="site" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Campo campo="nome" rotulo="Seu nome" valor={dados.nome} erro={erros.nome} aoMudar={(v) => mudar("nome", v)} autoComplete="name" />
          </div>
          <Campo
            campo="email"
            rotulo="E-mail"
            tipo="email"
            inputMode="email"
            autoComplete="email"
            valor={dados.email}
            erro={erros.email}
            aoMudar={(v) => mudar("email", v)}
          />
          <Campo
            campo="whatsapp"
            rotulo="WhatsApp com DDD"
            tipo="tel"
            inputMode="tel"
            autoComplete="tel-national"
            valor={dados.whatsapp}
            erro={erros.whatsapp}
            aoMudar={(v) => mudar("whatsapp", mascararWhatsapp(v))}
          />
          <div className="sm:col-span-2">
            <div className={c.campo}>
              <select
                id="contato-assunto"
                name="assunto"
                value={dados.assunto}
                aria-invalid={erros.assunto ? true : undefined}
                aria-describedby={erros.assunto ? "contato-assunto-erro" : undefined}
                onChange={(e) => mudar("assunto", e.target.value)}
                className={c.entrada}
              >
                {ASSUNTOS_DO_SITE.map((a) => (
                  <option key={a} value={a}>
                    {ROTULO_DO_ASSUNTO[a]}
                  </option>
                ))}
              </select>
              <label htmlFor="contato-assunto" className={c.rotulo}>
                Assunto
              </label>
            </div>
            {erros.assunto && (
              <p id="contato-assunto-erro" className={c.erro}>
                {erros.assunto}
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <div className={c.campo}>
              <textarea
                id="contato-mensagem"
                name="mensagem"
                placeholder=" "
                rows={5}
                maxLength={MENSAGEM_MAXIMA}
                value={dados.mensagem}
                required
                aria-invalid={erros.mensagem ? true : undefined}
                aria-describedby={erros.mensagem ? "contato-mensagem-erro" : "contato-mensagem-contagem"}
                onChange={(e) => mudar("mensagem", e.target.value)}
                className={`${c.entrada} ${k.mensagem}`}
              />
              <label htmlFor="contato-mensagem" className={c.rotulo}>
                Como podemos ajudar?
              </label>
            </div>
            {erros.mensagem ? (
              <p id="contato-mensagem-erro" className={c.erro}>
                {erros.mensagem}
              </p>
            ) : (
              <p id="contato-mensagem-contagem" className={k.contagem}>
                {dados.mensagem.length.toLocaleString("pt-BR")}/{MENSAGEM_MAXIMA.toLocaleString("pt-BR")}
              </p>
            )}
          </div>
        </div>

        <label className={`${c.consentimento} mt-5`}>
          <input
            id="contato-consentimento"
            type="checkbox"
            checked={consentimento}
            aria-invalid={erroDoConsentimento ? true : undefined}
            aria-describedby={erroDoConsentimento ? "contato-consentimento-erro" : undefined}
            onChange={(e) => {
              setConsentimento(e.target.checked);
              if (e.target.checked) setErroDoConsentimento(false);
            }}
          />
          <span className="text-sm leading-relaxed">
            Autorizo a Astro Soluções a usar estes dados para responder a esta mensagem, como descrito na{" "}
            <Link href="/astro/privacidade" target="_blank">
              Política de Privacidade
            </Link>
            .
          </span>
        </label>
        {erroDoConsentimento && (
          <p id="contato-consentimento-erro" className={c.erro} role="alert">
            Marque a caixa para enviar a mensagem.
          </p>
        )}

        {erroGeral && (
          <p id="contato-erro-geral" role="alert" className={`${c.avisoDeErro} mt-6`}>
            {erroGeral}
          </p>
        )}

        <div className={`${c.acoes} mt-8`}>
          <p className="min-w-0 text-sm leading-tight text-[var(--tinta-suave)]">Resposta em até 1 dia útil</p>
          <button
            type="submit"
            disabled={enviando}
            aria-busy={enviando}
            className={`${s.botao} ${s.botaoPrincipal} ml-auto min-w-[9.5rem] disabled:opacity-80`}
          >
            {enviando ? (
              <>
                <span aria-hidden className={c.giro} />
                Enviando…
              </>
            ) : (
              <>
                Enviar
                <Send aria-hidden className="size-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
}

function Campo({
  campo,
  rotulo,
  valor,
  erro,
  aoMudar,
  tipo = "text",
  inputMode,
  autoComplete,
}: {
  campo: CampoDoContato;
  rotulo: string;
  valor: string;
  erro?: string;
  aoMudar: (v: string) => void;
  tipo?: "text" | "email" | "tel";
  inputMode?: "text" | "email" | "tel";
  autoComplete?: string;
}) {
  const id = `contato-${campo}`;
  const erroId = `${id}-erro`;
  return (
    <div>
      <div className={c.campo}>
        <input
          id={id}
          name={campo}
          type={tipo}
          inputMode={inputMode}
          autoComplete={autoComplete}
          placeholder=" "
          value={valor}
          required
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          onChange={(e) => aoMudar(e.target.value)}
          className={c.entrada}
        />
        <label htmlFor={id} className={c.rotulo}>
          {rotulo}
        </label>
      </div>
      {erro && (
        <p id={erroId} className={c.erro}>
          {erro}
        </p>
      )}
    </div>
  );
}
