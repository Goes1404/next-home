"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { copiarTexto } from "@/lib/ui/copiarTexto";
import { CONFIG_DOS_RAMOS, RAMO_DESCRICAO_MAXIMO, RAMO_DESCRICAO_MINIMO, RAMOS } from "@/lib/ramos/ramos";

/** O que os dois formulários (imobiliária e independente) compartilham. */

export const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

export function Campo({
  rotulo,
  name,
  value,
  onChange,
  tipo = "text",
  dica,
  ajuda,
  inputMode,
  autoComplete,
}: {
  rotulo: string;
  name: string;
  value: string;
  onChange: (valor: string) => void;
  tipo?: string;
  dica?: string;
  ajuda?: string;
  inputMode?: "numeric" | "decimal" | "tel" | "email" | "text";
  autoComplete?: string;
}) {
  return (
    <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
      {rotulo}
      <input
        name={name}
        type={tipo}
        value={value}
        inputMode={inputMode}
        autoComplete={autoComplete ?? "off"}
        onChange={(e) => onChange(e.target.value)}
        placeholder={dica}
        className={CLASSE_DO_CAMPO}
      />
      {ajuda && <span className="text-tenue">{ajuda}</span>}
    </label>
  );
}

/**
 * O ramo do negócio da conta (29/10/2026, 0244): a lista de `RAMOS` e, no
 * "Outro", o texto livre. É o ramo que personaliza o CRM do cliente
 * (vocabulário, módulos do menu, a IA do WhatsApp).
 */
export function SeletorDeRamo({
  ramo,
  descricao,
  aoMudarRamo,
  aoMudarDescricao,
}: {
  ramo: string;
  descricao: string;
  aoMudarRamo: (ramo: string) => void;
  aoMudarDescricao: (texto: string) => void;
}) {
  return (
    <>
      <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
        Ramo do negócio
        <select name="ramo" value={ramo} onChange={(e) => aoMudarRamo(e.target.value)} className={CLASSE_DO_CAMPO}>
          {RAMOS.map((r) => (
            <option key={r} value={r}>
              {CONFIG_DOS_RAMOS[r].rotulo}
            </option>
          ))}
        </select>
        <span className="text-tenue">Personaliza o vocabulário, o menu e a IA do cliente.</span>
      </label>
      {ramo === "outro" && (
        <Campo
          rotulo="Qual ramo?"
          name="ramoDescricao"
          value={descricao}
          onChange={aoMudarDescricao}
          dica="Clínica veterinária"
          ajuda={`De ${RAMO_DESCRICAO_MINIMO} a ${RAMO_DESCRICAO_MAXIMO} caracteres.`}
        />
      )}
    </>
  );
}

export type Criado = {
  grupoId: string;
  nome: string;
  email: string;
  whatsapp: string;
  enviado: boolean;
  url?: string;
};

/** A mensagem pronta para o WhatsApp do convidado (o e-mail pode não estar configurado). */
export function mensagemDoConvite(nome: string, url: string): string {
  return `Olá! Seu acesso ao CRM da Astro Soluções (${nome}) está pronto. Crie sua senha por este link (vale por 24 horas): ${url}`;
}

/** O link do WhatsApp com a mensagem pronta; sem número válido, abre a escolha de contato. */
export function linkDoWhatsapp(whatsapp: string, texto: string): string {
  const digitos = whatsapp.replace(/\D/g, "");
  const numero = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** O convite que acabou de sair: e-mail enviado, ou o link para copiar e mandar pelo WhatsApp. */
export function CartaoDoConvite({
  criado,
  rotuloDoNovo,
  aoNovo,
}: {
  criado: Criado;
  rotuloDoNovo: string;
  aoNovo: () => void;
}) {
  // "Copiado!" só quando o navegador aceitou; recusado, o link fica selecionado
  // na tela para copiar à mão (Ctrl+C, ou segurar o dedo no celular).
  const [copia, setCopia] = useState<"nada" | "copiado" | "falhou">("nada");
  const linkRef = useRef<HTMLParagraphElement>(null);

  const copiar = async () => {
    if (await copiarTexto(criado.url!)) {
      setCopia("copiado");
      setTimeout(() => setCopia("nada"), 2500);
      return;
    }
    setCopia("falhou");
    const no = linkRef.current;
    const selecao = typeof window !== "undefined" ? window.getSelection() : null;
    if (no && selecao) {
      const faixa = document.createRange();
      faixa.selectNodeContents(no);
      selecao.removeAllRanges();
      selecao.addRange(faixa);
    }
  };

  return (
    <div role="status" className="border-ok-linha bg-ok-lavado rounded-2xl border p-5">
      <h2 className="text-fluid-sm text-titulo font-bold">{criado.nome} criado</h2>
      {criado.enviado || !criado.url ? (
        <p className="text-fluid-sm text-corpo mt-1">Convite enviado para {criado.email}.</p>
      ) : (
        <>
          <p className="text-fluid-sm text-corpo mt-1">
            Para {criado.email}: o e-mail não está configurado; mande este link pelo WhatsApp. Ele vale por 24 horas.
          </p>
          <p
            ref={linkRef}
            className="text-fluid-xs bg-superficie border-linha text-corpo mt-3 rounded-xl border p-3 break-all select-all"
          >
            {criado.url}
          </p>
          {copia === "falhou" && (
            <p role="alert" className="text-fluid-xs text-corpo mt-2">
              Não deu para copiar sozinho: o link acima está selecionado. Copie com Ctrl+C, ou segure o dedo sobre ele
              no celular.
            </p>
          )}
        </>
      )}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {!criado.enviado && criado.url && (
          <>
            <button
              type="button"
              onClick={copiar}
              className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-4 font-medium"
            >
              {copia === "copiado" ? "Copiado!" : "Copiar link"}
            </button>
            <a
              href={linkDoWhatsapp(criado.whatsapp, mensagemDoConvite(criado.nome, criado.url))}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center px-4 font-medium"
            >
              Mandar pelo WhatsApp
            </a>
          </>
        )}
        <Link
          href={`/plataforma/grupos/${criado.grupoId}`}
          className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center px-4"
        >
          Abrir a conta
        </Link>
        <button
          type="button"
          onClick={aoNovo}
          className="text-fluid-sm botao-secundario text-titulo flex min-h-11 cursor-pointer items-center justify-center px-4"
        >
          {rotuloDoNovo}
        </button>
      </div>
    </div>
  );
}
