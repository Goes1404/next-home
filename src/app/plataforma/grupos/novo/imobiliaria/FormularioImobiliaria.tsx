"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { mascararCnpj } from "@/lib/plataforma/documentos";
import {
  mensalidadeComoTexto,
  mensalidadeDoPlano,
  PRECO_POR_USUARIO_DA_IMOBILIARIA,
  slugSugerido,
  type FormularioDaImobiliaria,
} from "@/lib/plataforma/tiposDeConta";
import { criarImobiliaria } from "../../../acoes";
import { Campo, CartaoDoConvite, type Criado } from "../componentes";

const VAZIO: FormularioDaImobiliaria = {
  nomeFantasia: "",
  slug: "",
  razaoSocial: "",
  cnpj: "",
  creciJ: "",
  usuarios: "3",
  mensalidade: mensalidadeComoTexto(mensalidadeDoPlano("imobiliaria", 3)),
  diaDoVencimento: "10",
  contatoNome: "",
  contatoEmail: "",
  contatoTelefone: "",
  gestorNome: "",
  gestorEmail: "",
  gestorWhatsapp: "",
};

export function FormularioImobiliaria() {
  const [dados, setDados] = useState<FormularioDaImobiliaria>(VAZIO);
  // Enquanto o operador não mexe no endereço, ele segue o nome; idem a mensalidade (R$ 127 x usuários).
  const [slugEditado, setSlugEditado] = useState(false);
  const [mensalidadeEditada, setMensalidadeEditada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (k: keyof FormularioDaImobiliaria, valor: string) =>
    setDados((d) => {
      const novo = { ...d, [k]: valor };
      if (k === "nomeFantasia" && !slugEditado) novo.slug = slugSugerido(valor);
      if (k === "usuarios" && !mensalidadeEditada) {
        const n = Number(valor);
        novo.mensalidade = Number.isInteger(n) && n >= 1 ? mensalidadeComoTexto(mensalidadeDoPlano("imobiliaria", n)) : "";
      }
      return novo;
    });

  const campo = (
    k: keyof FormularioDaImobiliaria,
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
      value={dados[k]}
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
        const r = await criarImobiliaria(dados);
        if (!r.ok) return setErro(r.erro);
        setCriado({
          grupoId: r.grupoId,
          nome: dados.nomeFantasia.trim(),
          email: r.email,
          whatsapp: dados.gestorWhatsapp,
          enviado: r.enviado,
          url: r.url,
        });
      } catch (e) {
        setErro(
          ehActionDeOutroBuild(e)
            ? avisoDePaginaVelha()
            : "Não foi possível falar com o servidor. Confira se a imobiliária apareceu na lista antes de tentar de novo.",
        );
      }
    });

  if (criado) {
    return (
      <CartaoDoConvite
        criado={criado}
        rotuloDoNovo="Criar outra imobiliária"
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
        <legend className="text-fluid-sm text-titulo px-1 font-bold">A imobiliária</legend>
        {campo("nomeFantasia", "Nome fantasia", { dica: "Imobiliária Silva" })}
        {campo("razaoSocial", "Razão social", { dica: "Silva Negócios Imobiliários Ltda" })}
        {campo("cnpj", "CNPJ", { dica: "00.000.000/0000-00", inputMode: "numeric", transformar: mascararCnpj })}
        {campo("creciJ", "CRECI-J", { dica: "Número do CRECI da empresa" })}
        <div className="sm:col-span-2">
          {campo("slug", "Endereço do site", {
            dica: "imobiliaria-silva",
            ajuda: "De 3 a 63 letras minúsculas, números e hífen. Vira o endereço do site da imobiliária.",
          })}
        </div>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Plano Imobiliária</legend>
        {campo("usuarios", "Usuários (gestor e corretores)", {
          tipo: "number",
          inputMode: "numeric",
          ajuda: `R$ ${PRECO_POR_USUARIO_DA_IMOBILIARIA} por usuário por mês.`,
        })}
        {campo("mensalidade", "Mensalidade (R$)", {
          inputMode: "decimal",
          ajuda: "Calculada pelos usuários; pode ajustar se combinou outro valor.",
        })}
        {campo("diaDoVencimento", "Dia do vencimento", { tipo: "number", inputMode: "numeric", ajuda: "De 1 a 28." })}
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Primeiro gestor</legend>
        <p className="text-fluid-xs text-corpo sm:col-span-2">
          Quem administra a imobiliária: recebe o convite, cria a senha e convida a equipe.
        </p>
        {campo("gestorNome", "Nome", { dica: "Nome e sobrenome" })}
        {campo("gestorWhatsapp", "WhatsApp", { tipo: "tel", inputMode: "tel", dica: "(11) 98765-4321" })}
        <div className="sm:col-span-2">{campo("gestorEmail", "E-mail", { tipo: "email", inputMode: "email", dica: "email@dogestor.com" })}</div>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Contato de cobrança</legend>
        <p className="text-fluid-xs text-corpo sm:col-span-2">Em branco, a cobrança vai para o primeiro gestor.</p>
        {campo("contatoNome", "Nome", { dica: "Quem paga a mensalidade" })}
        {campo("contatoEmail", "E-mail", { tipo: "email", inputMode: "email", dica: "financeiro@imobiliaria.com.br" })}
        {campo("contatoTelefone", "Telefone", { tipo: "tel", inputMode: "tel", dica: "(11) 3333-4444" })}
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
        {pendente ? "Criando a imobiliária…" : "Criar imobiliária e convidar o gestor"}
      </button>
    </form>
  );
}
