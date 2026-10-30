"use client";

import { useState, useTransition } from "react";
import { lerRamo, vocabularioDoRamo } from "@/lib/ramos/ramos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { mascararCpf } from "@/lib/plataforma/documentos";
import { ROTULO_DO_PLANO } from "@/lib/plataforma/rotulosDoGrupo";
import {
  ehPlanoDoIndependente,
  mensalidadeComoTexto,
  mensalidadeDoPlano,
  PLANOS_DO_INDEPENDENTE,
  slugSugerido,
  type FormularioDoIndependente,
} from "@/lib/plataforma/tiposDeConta";
import { criarCorretorIndependente } from "../../../acoes";
import { Campo, CartaoDoConvite, SeletorDeRamo, CLASSE_DO_CAMPO, type Criado } from "../componentes";

const VAZIO: FormularioDoIndependente = {
  ramo: "imobiliaria",
  ramoDescricao: "",
  nome: "",
  slug: "",
  cpf: "",
  creciF: "",
  email: "",
  whatsapp: "",
  plano: "essencial",
  mensalidade: mensalidadeComoTexto(mensalidadeDoPlano("essencial")),
  diaDoVencimento: "10",
};

/**
 * Uma pessoa só: o corretor é o gestor do próprio grupo e o contato de
 * cobrança, então nome, e-mail e WhatsApp são perguntados uma vez.
 */
export function FormularioIndependente({ inicial }: { inicial?: Partial<FormularioDoIndependente> } = {}) {
  // `inicial`: o pedido de contratação que a plataforma abriu (29/10/2026,
  // `?pedido=` na página); "criar outro" volta ao formulário vazio.
  const [dados, setDados] = useState<FormularioDoIndependente>(() => ({ ...VAZIO, ...inicial }));
  const [slugEditado, setSlugEditado] = useState(false);
  const [mensalidadeEditada, setMensalidadeEditada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [pendente, iniciar] = useTransition();
  // O documento profissional do ramo escolhido (0244).
  const documento = vocabularioDoRamo(lerRamo(dados.ramo)).documento;

  const mudar = (k: keyof FormularioDoIndependente, valor: string) =>
    setDados((d) => {
      const novo = { ...d, [k]: valor };
      if (k === "nome" && !slugEditado) novo.slug = slugSugerido(valor);
      if (k === "plano" && !mensalidadeEditada && ehPlanoDoIndependente(valor)) {
        novo.mensalidade = mensalidadeComoTexto(mensalidadeDoPlano(valor));
      }
      return novo;
    });

  const campo = (
    k: keyof FormularioDoIndependente,
    rotulo: string,
    opcoes: { tipo?: string; dica?: string; ajuda?: string; inputMode?: "numeric" | "decimal" | "tel" | "email" | "text"; transformar?: (v: string) => string } = {},
  ) => (
    <Campo
      rotulo={rotulo}
      name={k}
      tipo={opcoes.tipo}
      dica={opcoes.dica}
      ajuda={opcoes.ajuda}
      inputMode={opcoes.inputMode}
      value={dados[k] ?? ""}
      onChange={(v) => {
        if (k === "slug") setSlugEditado(true);
        if (k === "mensalidade") setMensalidadeEditada(true);
        mudar(k, opcoes.transformar ? opcoes.transformar(v) : v);
      }}
    />
  );

  const criar = () =>
    iniciar(async () => {
      setErro(null);
      try {
        const r = await criarCorretorIndependente(dados);
        if (!r.ok) return setErro(r.erro);
        setCriado({
          grupoId: r.grupoId,
          nome: dados.nome.trim(),
          email: r.email,
          whatsapp: dados.whatsapp,
          enviado: r.enviado,
          url: r.url,
        });
      } catch (e) {
        setErro(
          ehActionDeOutroBuild(e)
            ? avisoDePaginaVelha()
            : "Não foi possível falar com o servidor. Confira se o corretor apareceu na lista antes de tentar de novo.",
        );
      }
    });

  if (criado) {
    return (
      <CartaoDoConvite
        criado={criado}
        rotuloDoNovo="Criar outro corretor"
        aoNovo={() => {
          setCriado(null);
          setDados(VAZIO);
          setSlugEditado(false);
          setMensalidadeEditada(false);
        }}
      />
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        criar();
      }}
    >
      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">O corretor</legend>
        <SeletorDeRamo
          ramo={dados.ramo ?? "imobiliaria"}
          descricao={dados.ramoDescricao ?? ""}
          aoMudarRamo={(v) => mudar("ramo", v)}
          aoMudarDescricao={(v) => mudar("ramoDescricao", v)}
        />
        <div className="sm:col-span-2">{campo("nome", "Nome completo", { dica: "Nome e sobrenome" })}</div>
        {campo("cpf", "CPF", { dica: "000.000.000-00", inputMode: "numeric", transformar: mascararCpf })}
        {/* O registro do ramo (0244): CRECI na imobiliária; nos outros, opcional. */}
        {campo(
          "creciF",
          documento.obrigatorio ? "CRECI-F" : `${documento.rotulo} (opcional)`,
          documento.obrigatorio ? { dica: "Número do CRECI" } : { dica: "Em branco, a ficha fica como \"Não informado\"" },
        )}
        {campo("whatsapp", "WhatsApp", { tipo: "tel", inputMode: "tel", dica: "(11) 98765-4321" })}
        {campo("email", "E-mail", { tipo: "email", inputMode: "email", dica: "email@docorretor.com" })}
        <div className="sm:col-span-2">
          {campo("slug", "Endereço do site", {
            dica: "nome-do-corretor",
            ajuda: "De 3 a 63 letras minúsculas, números e hífen. Sugerido pelo nome.",
          })}
        </div>
        <p className="text-fluid-xs text-corpo sm:col-span-2">
          O corretor é o gestor do próprio grupo e também recebe a cobrança: não precisa repetir os dados.
        </p>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Plano e cobrança</legend>
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Plano
          <select
            name="plano"
            value={dados.plano}
            onChange={(e) => mudar("plano", e.target.value)}
            className={CLASSE_DO_CAMPO}
          >
            {PLANOS_DO_INDEPENDENTE.map((p) => (
              <option key={p} value={p}>
                {ROTULO_DO_PLANO[p]} (R$ {mensalidadeDoPlano(p)})
              </option>
            ))}
          </select>
        </label>
        {campo("mensalidade", "Mensalidade (R$)", {
          inputMode: "decimal",
          ajuda: "Vem do plano; pode ajustar se combinou outro valor.",
        })}
        {campo("diaDoVencimento", "Dia do vencimento", { tipo: "number", inputMode: "numeric", ajuda: "De 1 a 28." })}
      </fieldset>

      {erro && (
        <p role="alert" className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo rounded-xl border px-4 py-3">
          {erro}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl px-5 font-bold disabled:opacity-60 sm:w-auto sm:self-start"
      >
        {pendente ? "Criando o corretor…" : "Criar corretor e convidar"}
      </button>
    </form>
  );
}
