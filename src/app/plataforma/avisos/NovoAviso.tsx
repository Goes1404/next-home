"use client";

import { useActionState, useState } from "react";
import { FaixaDoAviso } from "@/components/avisosDaAstro/FaixaDoAviso";
import {
  PUBLICOS_DO_AVISO,
  ROTULO_DO_PUBLICO,
  ROTULO_DO_TIPO,
  TEXTO_MAXIMO,
  TIPOS_DE_AVISO,
  TITULO_MAXIMO,
  linkDoAvisoValido,
  validarAviso,
  type PublicoDoAviso,
  type TipoDeAviso,
} from "@/lib/plataforma/avisoAosClientes";
import { publicarAviso, type ResultadoDoAviso } from "../avisosAosClientesAcoes";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * Escrever um aviso para todos os clientes (0242, 29/10/2026), com a PRÉVIA
 * ao vivo: o mesmo componente da faixa do painel, com o que está escrito
 * agora. A validação mostrada é a mesma da action (módulo puro); o servidor
 * confere de novo, com a guarda.
 */
export function NovoAviso() {
  const [estado, enviar, pendente] = useActionState<ResultadoDoAviso | undefined, FormData>(publicarAviso, undefined);
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<TipoDeAviso>("novidade");
  const [link, setLink] = useState("");
  const [publico, setPublico] = useState<PublicoDoAviso>("todos");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  // A chave do formulário troca depois de publicar: os campos voltam ao zero.
  const [versao, setVersao] = useState(0);
  const [ultimoEstado, setUltimoEstado] = useState(estado);
  if (estado !== ultimoEstado) {
    setUltimoEstado(estado);
    if (estado?.ok) {
      setTitulo("");
      setTexto("");
      setLink("");
      setInicio("");
      setFim("");
      setVersao((v) => v + 1);
    }
  }

  const tocado = titulo.length > 0 || texto.length > 0;
  const previa = validarAviso({ titulo, texto, tipo, link, publico, inicio, fim });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form key={versao} action={enviar} className="cartao flex flex-col gap-4 p-5">
        <h2 className="text-titulo text-fluid-lg font-medium">Novo aviso</h2>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-fluid-xs text-apoio mb-1">Tipo</legend>
          <div className="flex flex-wrap gap-2">
            {TIPOS_DE_AVISO.map((t) => (
              <label
                key={t}
                className={`text-fluid-sm flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 ${
                  tipo === t ? "border-acento bg-acento-lavado text-titulo font-bold" : "border-linha-forte text-corpo"
                }`}
              >
                <input
                  type="radio"
                  name="tipo"
                  value={t}
                  checked={tipo === t}
                  onChange={() => setTipo(t)}
                  className="sr-only"
                />
                {ROTULO_DO_TIPO[t]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          <span className="flex justify-between">
            Título <span className="tabular-nums">{titulo.trim().length}/{TITULO_MAXIMO}</span>
          </span>
          <input
            name="titulo"
            required
            maxLength={TITULO_MAXIMO}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ex.: Agenda nova no ar"
            className={CAMPO}
          />
        </label>

        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          <span className="flex justify-between">
            Texto <span className="tabular-nums">{texto.trim().length}/{TEXTO_MAXIMO}</span>
          </span>
          <textarea
            name="texto"
            required
            maxLength={TEXTO_MAXIMO}
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Uma ou duas frases. O que mudou e o que a pessoa precisa fazer, se precisar."
            className={`${CAMPO} min-h-[5.5rem]`}
          />
        </label>

        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Link do &quot;Saiba mais&quot; (opcional)
          <input
            name="link"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="/corretor/agenda ou https://…"
            inputMode="url"
            className={CAMPO}
          />
        </label>

        <label className="text-fluid-xs text-apoio flex flex-col gap-1 sm:max-w-xs">
          Para quem
          <select
            name="publico"
            value={publico}
            onChange={(e) => setPublico(e.target.value as PublicoDoAviso)}
            className={CAMPO}
          >
            {PUBLICOS_DO_AVISO.map((p) => (
              <option key={p} value={p}>
                {ROTULO_DO_PUBLICO[p]}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-fluid-xs text-apoio flex flex-col gap-1">
            Começa (vazio = agora)
            <input type="datetime-local" name="inicio" value={inicio} onChange={(e) => setInicio(e.target.value)} className={CAMPO} />
          </label>
          <label className="text-fluid-xs text-apoio flex flex-col gap-1">
            Termina (vazio = até encerrar)
            <input type="datetime-local" name="fim" value={fim} onChange={(e) => setFim(e.target.value)} className={CAMPO} />
          </label>
        </div>
        <p className="text-fluid-xs text-tenue -mt-2">Horário de Brasília.</p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pendente || !previa.ok}
            className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendente ? "Publicando…" : inicio ? "Agendar aviso" : "Publicar para os clientes"}
          </button>
          <p role="status" className="text-fluid-xs">
            {estado?.ok && <span className="text-ok">{estado.mensagem}</span>}
            {estado && !estado.ok && <span className="text-perigo">{estado.erro}</span>}
            {!estado && tocado && !previa.ok && <span className="text-apoio">{previa.erro}</span>}
          </p>
        </div>
      </form>

      <div className="flex min-w-0 flex-col gap-3">
        <h2 className="text-titulo text-fluid-lg font-medium">Prévia</h2>
        <p className="text-fluid-xs text-apoio">
          Como aparece logo abaixo do cabeçalho do painel
          {publico === "gestores" ? ", só para gestores" : ", para todos"}. Cada pessoa pode fechar o aviso no próprio
          aparelho.
        </p>
        <div className="border-linha bg-fundo rounded-2xl border p-3">
          <FaixaDoAviso
            key={tipo}
            aviso={{
              titulo: titulo.trim() || "Título do aviso",
              texto: texto.trim() || "O texto aparece aqui, ao lado do título.",
              tipo,
              link: linkDoAvisoValido(link.trim()) ? link.trim() : null,
            }}
          />
        </div>
      </div>
    </div>
  );
}
