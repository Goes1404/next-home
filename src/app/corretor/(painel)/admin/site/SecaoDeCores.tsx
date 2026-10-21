"use client";

import {
  TEMAS_PRONTOS,
  ajustarPrincipal,
  ajustarTexto,
  avisosDeContraste,
  variaveisDaPrevia,
  type CoresDoSite,
} from "@/lib/sites/coresDoSite";
import { normalizarCor, type SiteDigitado } from "@/lib/sites/siteEditavel";

type CampoDeCor = "cor" | "corSecundaria" | "corFundo" | "corTexto";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** As cores do formulário (texto digitado) como cores do site: o que não é hex vale como vazio. */
export function coresDoDigitado(d: Pick<SiteDigitado, CampoDeCor>): CoresDoSite {
  return {
    principal: normalizarCor(d.cor),
    secundaria: normalizarCor(d.corSecundaria),
    fundo: normalizarCor(d.corFundo),
    texto: normalizarCor(d.corTexto),
  };
}

const CAMPOS: { campo: CampoDeCor; rotulo: string; dica: string; padrao: string; ajuda: string }[] = [
  {
    campo: "cor",
    rotulo: "Cor principal",
    dica: "#1f6f5c",
    padrao: "#1f6f5c",
    ajuda: "Botões, links e destaques.",
  },
  {
    campo: "corSecundaria",
    rotulo: "Cor secundária",
    dica: "#0369a1",
    padrao: "#0369a1",
    ajuda: "Etiquetas, selos de estágio e detalhes.",
  },
  {
    campo: "corFundo",
    rotulo: "Cor de fundo",
    dica: "#f3f7fd",
    padrao: "#f3f7fd",
    ajuda: "O fundo das páginas do site.",
  },
  {
    campo: "corTexto",
    rotulo: "Cor do texto",
    dica: "#0f1f3d",
    padrao: "#0f1f3d",
    ajuda: "O texto principal; os títulos acompanham.",
  },
];

/**
 * As quatro cores do site (0210): seletor e campo hexadecimal para cada uma,
 * temas prontos de um clique, prévia ao vivo e o aviso de contraste (que
 * oferece ajustar sozinho e nunca impede de salvar).
 */
export function SecaoDeCores({
  dados,
  erros,
  mudar,
  preencher,
}: {
  dados: SiteDigitado;
  erros: Partial<Record<keyof SiteDigitado, string>>;
  mudar: (k: keyof SiteDigitado, valor: string) => void;
  preencher: (cores: Pick<SiteDigitado, CampoDeCor>) => void;
}) {
  const cores = coresDoDigitado(dados);
  const avisos = avisosDeContraste(cores);
  const algumaCor = Boolean(cores.principal || cores.secundaria || cores.fundo || cores.texto);

  const ajustar = (campo: "texto" | "principal") => {
    if (campo === "principal" && cores.principal) {
      mudar("cor", ajustarPrincipal(cores.principal));
    } else if (campo === "texto" && cores.texto && cores.fundo) {
      mudar("corTexto", ajustarTexto(cores.texto, cores.fundo));
    }
  };

  return (
    <fieldset className="cartao grid gap-4 p-5">
      <legend className="text-fluid-sm text-titulo px-1 font-bold">Cores do site</legend>

      <div className="grid gap-2">
        <p className="text-fluid-xs text-apoio">Comece por um tema pronto e ajuste o que quiser:</p>
        <div className="flex flex-wrap gap-2">
          {TEMAS_PRONTOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() =>
                preencher({
                  cor: t.cores.principal,
                  corSecundaria: t.cores.secundaria,
                  corFundo: t.cores.fundo,
                  corTexto: t.cores.texto,
                })
              }
              className="border-linha-forte text-corpo text-fluid-xs hover:border-acento inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3"
            >
              <span aria-hidden className="inline-flex overflow-hidden rounded-full border border-black/10">
                {[t.cores.fundo, t.cores.principal, t.cores.secundaria, t.cores.texto].map((c) => (
                  <span key={c} className="block h-4 w-4" style={{ background: c }} />
                ))}
              </span>
              {t.nome}
            </button>
          ))}
          <button
            type="button"
            disabled={!algumaCor}
            onClick={() => preencher({ cor: "", corSecundaria: "", corFundo: "", corTexto: "" })}
            className="text-apoio text-fluid-xs min-h-11 cursor-pointer rounded-xl px-3 underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          >
            Voltar ao padrão
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS.map(({ campo, rotulo, dica, padrao, ajuda }) => {
          const valida = normalizarCor(dados[campo]);
          return (
            <div key={campo} className="grid gap-1">
              <span className="text-fluid-xs text-apoio">{rotulo}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label={`Escolher a ${rotulo.toLowerCase()}`}
                  value={valida ?? padrao}
                  onChange={(e) => mudar(campo, e.target.value)}
                  className="border-linha-forte bg-campo h-11 w-14 shrink-0 cursor-pointer rounded-xl border p-1"
                />
                <input
                  name={campo}
                  type="text"
                  aria-label={`${rotulo} em hexadecimal`}
                  value={dados[campo]}
                  maxLength={7}
                  onChange={(e) => mudar(campo, e.target.value)}
                  placeholder={dica}
                  aria-invalid={erros[campo] ? true : undefined}
                  className={`${CLASSE_DO_CAMPO} w-full`}
                />
              </div>
              <span className="text-fluid-xs text-tenue">{ajuda} Vazio usa o padrão.</span>
              {erros[campo] && <span className="text-fluid-xs text-erro">{erros[campo]}</span>}
            </div>
          );
        })}
      </div>

      {avisos.length > 0 && (
        <ul className="grid gap-2" aria-label="Avisos de leitura">
          {avisos.map((a) => (
            <li
              key={a.campo}
              role="alert"
              className="border-alerta-linha bg-alerta-lavado text-alerta text-fluid-xs flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2"
            >
              <span>{a.mensagem}</span>
              <button
                type="button"
                onClick={() => ajustar(a.campo)}
                className="border-alerta-linha min-h-9 cursor-pointer rounded-lg border px-3 font-bold"
              >
                Ajustar automaticamente
              </button>
            </li>
          ))}
        </ul>
      )}

      <PreviaDoSite cores={cores} />
      <p className="text-fluid-xs text-apoio">
        A prévia usa o mesmo cálculo do site. O texto sobre a cor principal (branco ou escuro) é escolhido sozinho, pelo
        contraste. Com fundo ou texto escolhidos, o site passa a usar essas cores nos dois temas e esconde o seletor claro
        e escuro.
      </p>
    </fieldset>
  );
}

/** Um mini cabeçalho, um cartão de imóvel e um botão com as cores escolhidas. */
function PreviaDoSite({ cores }: { cores: CoresDoSite }) {
  const variaveis = variaveisDaPrevia(cores);
  return (
    <div
      aria-label="Prévia do site com as cores escolhidas"
      role="img"
      style={variaveis as React.CSSProperties}
      className="border-linha-forte bg-fundo text-corpo grid gap-3 overflow-hidden rounded-2xl border p-3"
    >
      <div className="border-linha flex items-center justify-between gap-2 border-b pb-2">
        <span className="text-titulo text-fluid-sm font-bold">Sua imobiliária</span>
        <span className="text-fluid-xs text-corpo flex gap-3">
          <span>Imóveis</span>
          <span>Sobre</span>
          <span className="text-acento-suave underline underline-offset-4">Contato</span>
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-1">
          <span className="text-titulo text-fluid-lg font-bold">Seu próximo endereço começa aqui</span>
          <span className="text-fluid-xs text-apoio">Imóveis selecionados para você.</span>
        </div>
        <span className="bg-acento text-sobre-cor text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium">
          Buscar imóveis
        </span>
      </div>
      <div className="border-linha bg-superficie grid gap-1 rounded-xl border p-3">
        <span className="bg-realce-lavado text-realce text-fluid-xs w-fit rounded-full px-2.5 py-0.5 font-bold">
          Na planta
        </span>
        <span className="text-titulo text-fluid-sm font-bold">Residencial Jardim das Flores</span>
        <span className="text-fluid-xs text-apoio">Barueri, SP · 2 e 3 dormitórios</span>
        <span className="text-acento-suave text-fluid-sm font-bold">A partir de R$ 480.000</span>
      </div>
    </div>
  );
}
