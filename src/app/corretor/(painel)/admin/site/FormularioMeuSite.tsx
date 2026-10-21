"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { LIMITES, type SiteDigitado } from "@/lib/sites/siteEditavel";
import { salvarMeuSite, type ResultadoDoSite } from "./acoes";
import { SecaoDeCores } from "./SecaoDeCores";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

/**
 * Cores, texto do topo, "Sobre" e contatos do site (0209). Campo vazio apaga e
 * o site volta ao padrão naquele ponto. O que cada campo aceita é decidido de
 * novo no servidor (`validarSiteDigitado`).
 */
export function FormularioMeuSite({ inicial }: { inicial: SiteDigitado }) {
  const [dados, setDados] = useState<SiteDigitado>(inicial);
  const [erros, setErros] = useState<Partial<Record<keyof SiteDigitado, string>>>({});
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (k: keyof SiteDigitado, valor: string) => setDados((d) => ({ ...d, [k]: valor }));

  const campo = (k: keyof SiteDigitado, rotulo: string, tipo: string, dica: string, max?: number) => (
    <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
      {rotulo}
      <input
        name={k}
        type={tipo}
        value={dados[k]}
        maxLength={max}
        onChange={(e) => mudar(k, e.target.value)}
        placeholder={dica}
        aria-invalid={erros[k] ? true : undefined}
        className={CLASSE_DO_CAMPO}
      />
      {erros[k] && <span className="text-erro">{erros[k]}</span>}
    </label>
  );

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      setErros({});
      try {
        const r: ResultadoDoSite = await salvarMeuSite(dados);
        if (r.ok) {
          setAviso({ texto: "Site salvo. Em instantes ele já mostra as mudanças.", erro: false });
        } else {
          setErros(r.erros ?? {});
          setAviso({ texto: r.erro, erro: true });
        }
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
      <SecaoDeCores dados={dados} erros={erros} mudar={mudar} preencher={(cores) => setDados((d) => ({ ...d, ...cores }))} />

      <fieldset className="cartao grid gap-3 p-5">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Topo da página inicial</legend>
        {campo("titulo", "Título", "text", "Seu próximo endereço começa aqui", LIMITES.titulo)}
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Frase de abertura
          <textarea
            name="frase"
            rows={2}
            maxLength={LIMITES.frase}
            value={dados.frase}
            onChange={(e) => mudar("frase", e.target.value)}
            className={CLASSE_DO_CAMPO}
          />
          <span className="text-tenue">
            {dados.frase.length}/{LIMITES.frase}
          </span>
          {erros.frase && <span className="text-erro">{erros.frase}</span>}
        </label>
        <p className="text-fluid-xs text-apoio">Vazio: o site usa o texto padrão.</p>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Sobre a imobiliária</legend>
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Texto
          <textarea
            name="sobre"
            rows={6}
            maxLength={LIMITES.sobre}
            value={dados.sobre}
            onChange={(e) => mudar("sobre", e.target.value)}
            className={CLASSE_DO_CAMPO}
          />
          <span className="text-tenue">
            {dados.sobre.length}/{LIMITES.sobre}
          </span>
          {erros.sobre && <span className="text-erro">{erros.sobre}</span>}
        </label>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Contatos</legend>
        {campo("whatsapp", "WhatsApp principal", "tel", "(11) 99999-8888")}
        {campo("email", "E-mail", "email", "contato@imobiliaria.com.br", LIMITES.email)}
        {campo("instagram", "Instagram", "text", "@suaimobiliaria", LIMITES.rede)}
        {campo("facebook", "Facebook", "text", "https://www.facebook.com/suaimobiliaria", LIMITES.rede)}
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Endereço do escritório</legend>
        <div className="sm:col-span-2">
          {campo("logradouro", "Logradouro", "text", "Av. Brasil, 100", LIMITES.campoDoEndereco)}
        </div>
        {campo("bairro", "Bairro", "text", "Centro", LIMITES.campoDoEndereco)}
        {campo("cidade", "Cidade", "text", "Barueri", LIMITES.campoDoEndereco)}
        {campo("uf", "UF", "text", "SP", 2)}
        {campo("cep", "CEP", "text", "00000-000", 9)}
        <p className="text-fluid-xs text-apoio sm:col-span-2">
          Preencha tudo ou deixe tudo vazio. O CRECI aparece no rodapé quando a plataforma o cadastrou para a sua
          imobiliária.
        </p>
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
          {pendente ? "Salvando…" : "Salvar o site"}
        </button>
      </div>
    </form>
  );
}
