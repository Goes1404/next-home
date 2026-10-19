"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import type { DadosDoGrupo } from "@/lib/plataforma/dadosDoGrupo";
import { editarDadosDoGrupo } from "../../acoes";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** Contato de cobrança e dados institucionais. Plano, tipo e endereço não se editam aqui. */
export function FormularioDadosDoGrupo({ grupoId, inicial }: { grupoId: string; inicial: DadosDoGrupo }) {
  const [dados, setDados] = useState<DadosDoGrupo>(inicial);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const campo = (k: keyof DadosDoGrupo, rotulo: string, tipo: string, dica: string) => (
    <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
      {rotulo}
      <input
        name={k}
        type={tipo}
        value={dados[k]}
        onChange={(e) => setDados((d) => ({ ...d, [k]: e.target.value }))}
        placeholder={dica}
        className={CLASSE_DO_CAMPO}
      />
    </label>
  );

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await editarDadosDoGrupo(grupoId, dados);
        setAviso(r.ok ? { texto: "Dados salvos.", erro: false } : { texto: r.erro, erro: true });
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        salvar();
      }}
    >
      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Contato de cobrança</legend>
        {campo("contatoNome", "Nome", "text", "Quem paga a mensalidade")}
        {campo("contatoEmail", "E-mail", "email", "financeiro@imobiliaria.com.br")}
        {campo("contatoTelefone", "Telefone", "tel", "(11) 3333-4444")}
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Dados institucionais</legend>
        {campo("razaoSocial", "Razão social ou nome", "text", "Imobiliária Silva Ltda")}
        {campo("documento", "CNPJ ou CPF", "text", "Só os números")}
        {campo("creci", "CRECI", "text", "Número do CRECI")}
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Tipo do CRECI
          <select
            name="creciTipo"
            value={dados.creciTipo}
            onChange={(e) => setDados((d) => ({ ...d, creciTipo: e.target.value }))}
            className={CLASSE_DO_CAMPO}
          >
            <option value="">Não informado</option>
            <option value="J">J (empresa)</option>
            <option value="F">F (pessoa)</option>
          </select>
        </label>
        {campo("encarregadoNome", "Encarregado de dados (LGPD)", "text", "Nome")}
        {campo("encarregadoEmail", "E-mail do encarregado", "email", "privacidade@imobiliaria.com.br")}
      </fieldset>

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pendente}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {pendente ? "Salvando…" : "Salvar dados"}
        </button>
      </div>
    </form>
  );
}
