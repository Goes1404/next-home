"use client";

import {
  TEMAS_ESCUROS_PRONTOS,
  ajustarPrincipal,
  ajustarTexto,
  avisosDeContraste,
  limparCores,
  variaveisDaPreviaEscura,
  type CoresDoSite,
} from "@/lib/sites/coresDoSite";
import { normalizarCor, type SiteDigitado } from "@/lib/sites/siteEditavel";
import { coresDoDigitado } from "./SecaoDeCores";

type CampoEscuro = "corEscuro" | "corSecundariaEscuro" | "corFundoEscuro" | "corTextoEscuro";

const CLASSE_DO_CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 min-w-0 rounded-xl border px-3.5 py-2.5 focus:outline-none";

/** As cores do modo escuro do formulário (texto digitado) como cores do site. */
export function coresEscurasDoDigitado(d: Pick<SiteDigitado, CampoEscuro>): CoresDoSite {
  return limparCores({
    principal: normalizarCor(d.corEscuro),
    secundaria: normalizarCor(d.corSecundariaEscuro),
    fundo: normalizarCor(d.corFundoEscuro),
    texto: normalizarCor(d.corTextoEscuro),
  });
}

const CAMPOS: { campo: CampoEscuro; rotulo: string; dica: string; padrao: string; ajuda: string }[] = [
  { campo: "corEscuro", rotulo: "Principal no escuro", dica: "#d4a64b", padrao: "#d4a64b", ajuda: "Botões, links e destaques." },
  { campo: "corSecundariaEscuro", rotulo: "Secundária no escuro", dica: "#e8c77e", padrao: "#e8c77e", ajuda: "Etiquetas, selos e detalhes." },
  { campo: "corFundoEscuro", rotulo: "Fundo no escuro", dica: "#0e1a10", padrao: "#0e1a10", ajuda: "O fundo das páginas no tema escuro." },
  { campo: "corTextoEscuro", rotulo: "Texto no escuro", dica: "#f3ebd6", padrao: "#f3ebd6", ajuda: "O texto principal no tema escuro." },
];

/**
 * O modo escuro do site (0212): quatro cores só dele, opcionais. Vazio = o
 * escuro de sempre (e, na principal e na secundária, as cores do modo claro).
 * Preenchendo só estas, o modo claro fica como está e o seletor claro/escuro
 * continua aparecendo no site.
 */
export function SecaoModoEscuro({
  dados,
  erros,
  mudar,
  preencher,
}: {
  dados: SiteDigitado;
  erros: Partial<Record<keyof SiteDigitado, string>>;
  mudar: (k: keyof SiteDigitado, valor: string) => void;
  preencher: (cores: Pick<SiteDigitado, CampoEscuro>) => void;
}) {
  const claro = coresDoDigitado(dados);
  const escuro = coresEscurasDoDigitado(dados);
  const algumaCor = Boolean(escuro.principal || escuro.secundaria || escuro.fundo || escuro.texto);
  const avisos = avisosDeContraste(escuro);

  const ajustar = (campo: "texto" | "principal") => {
    if (campo === "principal" && escuro.principal) {
      mudar("corEscuro", ajustarPrincipal(escuro.principal));
    } else if (campo === "texto" && escuro.texto && escuro.fundo) {
      mudar("corTextoEscuro", ajustarTexto(escuro.texto, escuro.fundo));
    }
  };

  return (
    <fieldset className="cartao grid gap-4 p-5">
      <legend className="text-fluid-sm text-titulo px-1 font-bold">Modo escuro</legend>
      <p className="text-fluid-xs text-apoio">
        Cores só do tema escuro do site. Deixe vazio para o escuro padrão. O modo claro não muda, e o botão de claro e
        escuro continua no site.
      </p>

      <div className="flex flex-wrap gap-2">
        {TEMAS_ESCUROS_PRONTOS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() =>
              preencher({
                corEscuro: t.cores.principal,
                corSecundariaEscuro: t.cores.secundaria,
                corFundoEscuro: t.cores.fundo,
                corTextoEscuro: t.cores.texto,
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
          onClick={() => preencher({ corEscuro: "", corSecundariaEscuro: "", corFundoEscuro: "", corTextoEscuro: "" })}
          className="text-apoio text-fluid-xs min-h-11 cursor-pointer rounded-xl px-3 underline underline-offset-2 disabled:no-underline disabled:opacity-50"
        >
          Limpar cores do escuro
        </button>
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
                  aria-label={`Escolher: ${rotulo.toLowerCase()}`}
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
        <ul className="grid gap-2" aria-label="Avisos de leitura no escuro">
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

      <PreviaEscura claro={claro} escuro={escuro} />
      <p className="text-fluid-xs text-apoio">
        A prévia usa o mesmo cálculo do site no tema escuro. Principal e secundária que ficarem vazias aqui usam as do
        modo claro.
      </p>
    </fieldset>
  );
}

/** O mesmo mini site da prévia do claro, pintado com o escuro. */
function PreviaEscura({ claro, escuro }: { claro: CoresDoSite; escuro: CoresDoSite }) {
  const variaveis = variaveisDaPreviaEscura(claro, escuro);
  return (
    <div
      aria-label="Prévia do site no modo escuro"
      role="img"
      style={{ ...(variaveis as React.CSSProperties), colorScheme: "dark" }}
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
