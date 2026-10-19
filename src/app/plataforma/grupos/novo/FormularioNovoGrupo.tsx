"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { PLANOS, ROTULO_DO_PLANO, ROTULO_DO_TIPO, TIPOS_DE_GRUPO } from "@/lib/plataforma/rotulosDoGrupo";
import { copiarTexto } from "@/lib/ui/copiarTexto";
import { criarGrupoComPrimeiroAcesso } from "../../acoes";

const VAZIO = {
  nome: "",
  slug: "",
  tipo: "imobiliaria",
  plano: "imobiliaria",
  contatoNome: "",
  contatoEmail: "",
  contatoTelefone: "",
  primeiroNome: "",
  primeiroCreci: "",
  primeiroWhatsapp: "",
  primeiroEmail: "",
};

type Dados = typeof VAZIO;
type Criado = { grupoId: string; nome: string; email: string; enviado: boolean; url?: string };

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** O convite que acabou de sair: e-mail enviado, ou o link para mandar à mão. */
function CartaoDoConvite({ criado, aoNovo }: { criado: Criado; aoNovo: () => void }) {
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
      <h2 className="text-fluid-sm text-titulo font-bold">Grupo {criado.nome} criado</h2>
      {criado.enviado || !criado.url ? (
        <p className="text-fluid-sm text-corpo mt-1">Convite enviado para {criado.email}.</p>
      ) : (
        <>
          <p className="text-fluid-sm text-corpo mt-1">
            Para {criado.email}: o e-mail não está configurado; mande este link pelo WhatsApp. Ele vale por 24
            horas.
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
      <div className="mt-3 flex flex-wrap gap-2">
        {!criado.enviado && criado.url && (
          <button
            type="button"
            onClick={copiar}
            className="text-fluid-xs bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-lg px-4 font-medium"
          >
            {copia === "copiado" ? "Copiado!" : "Copiar link"}
          </button>
        )}
        <Link
          href={`/plataforma/grupos/${criado.grupoId}`}
          className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 items-center rounded-lg border px-4"
        >
          Abrir o grupo
        </Link>
        <button
          type="button"
          onClick={aoNovo}
          className="text-fluid-xs border-linha-forte text-corpo flex min-h-11 cursor-pointer items-center rounded-lg border px-4"
        >
          Criar outro grupo
        </button>
      </div>
    </div>
  );
}

export function FormularioNovoGrupo() {
  const [dados, setDados] = useState<Dados>(VAZIO);
  // Enquanto o operador não mexe no endereço, ele segue o nome.
  const [slugEditado, setSlugEditado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<Criado | null>(null);
  const [pendente, iniciar] = useTransition();

  const mudar = (k: keyof Dados, valor: string) =>
    setDados((d) => {
      const novo = { ...d, [k]: valor };
      if (k === "nome" && !slugEditado) novo.slug = normalizarParaEmail(valor).slice(0, 63).replace(/-+$/, "");
      return novo;
    });

  const campo = (k: keyof Dados, rotulo: string, tipo: string, dica: string, ajuda?: string) => (
    <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
      {rotulo}
      <input
        name={k}
        type={tipo}
        value={dados[k]}
        onChange={(e) => {
          if (k === "slug") setSlugEditado(true);
          mudar(k, e.target.value);
        }}
        placeholder={dica}
        className={CLASSE_DO_CAMPO}
      />
      {ajuda && <span className="text-tenue">{ajuda}</span>}
    </label>
  );

  const criar = () =>
    iniciar(async () => {
      setErro(null);
      try {
        const r = await criarGrupoComPrimeiroAcesso(dados);
        if (!r.ok) return setErro(r.erro);
        setCriado({ grupoId: r.grupoId, nome: dados.nome.trim(), email: r.email, enviado: r.enviado, url: r.url });
      } catch (e) {
        setErro(
          ehActionDeOutroBuild(e)
            ? avisoDePaginaVelha()
            : "Não foi possível falar com o servidor. Confira se o grupo apareceu na lista antes de tentar de novo.",
        );
      }
    });

  if (criado) {
    return (
      <CartaoDoConvite
        criado={criado}
        aoNovo={() => {
          setCriado(null);
          setDados(VAZIO);
          setSlugEditado(false);
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
        <legend className="text-fluid-sm text-titulo px-1 font-bold">O grupo</legend>
        {campo("nome", "Nome", "text", "Imobiliária Silva")}
        {campo("slug", "Endereço", "text", "imobiliaria-silva", "Vira o endereço do site do grupo. De 3 a 63 letras minúsculas, números e hífen.")}
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Tipo
          <select name="tipo" value={dados.tipo} onChange={(e) => mudar("tipo", e.target.value)} className={CLASSE_DO_CAMPO}>
            {TIPOS_DE_GRUPO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DO_TIPO[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
          Plano
          <select name="plano" value={dados.plano} onChange={(e) => mudar("plano", e.target.value)} className={CLASSE_DO_CAMPO}>
            {PLANOS.map((p) => (
              <option key={p} value={p}>
                {ROTULO_DO_PLANO[p]}
              </option>
            ))}
          </select>
          <span className="text-tenue">Depois de criado, o plano só muda no ciclo seguinte.</span>
        </label>
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Primeiro acesso</legend>
        <p className="text-fluid-xs text-corpo sm:col-span-2">
          {dados.tipo === "independente"
            ? "O próprio corretor: ele é o gestor do grupo dele."
            : "Quem administra a imobiliária: entra como gestor e convida a equipe."}
        </p>
        {campo("primeiroNome", "Nome", "text", "Nome e sobrenome")}
        {campo("primeiroCreci", "CRECI", "text", "Número do CRECI")}
        {campo("primeiroWhatsapp", "WhatsApp", "tel", "(11) 98765-4321")}
        {campo("primeiroEmail", "E-mail", "email", "email@dogestor.com")}
      </fieldset>

      <fieldset className="cartao grid gap-3 p-5 sm:grid-cols-2">
        <legend className="text-fluid-sm text-titulo px-1 font-bold">Contato de cobrança</legend>
        <p className="text-fluid-xs text-corpo sm:col-span-2">Em branco, a cobrança vai para o primeiro acesso.</p>
        {campo("contatoNome", "Nome", "text", "Quem paga a mensalidade")}
        {campo("contatoEmail", "E-mail", "email", "financeiro@imobiliaria.com.br")}
        {campo("contatoTelefone", "Telefone", "tel", "(11) 3333-4444")}
      </fieldset>

      {erro && (
        <p role="alert" className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo rounded-xl border px-4 py-3">
          {erro}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={pendente}
          className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60"
        >
          {pendente ? "Criando o grupo…" : "Criar grupo e convidar"}
        </button>
      </div>
    </form>
  );
}
