"use client";

import { useMemo, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  nomeParaMeta,
  problemasDoModelo,
  renderizarModelo,
  VARIAVEIS_DO_MODELO,
  variaveisDoCorpo,
  type BotaoDoModelo,
  type VariavelDoModelo,
} from "@/lib/whatsapp/oficial/modelos";
import { enviarModeloParaAMeta, excluirRascunhoDeModelo, salvarModelo } from "./acoes";

export type { ModeloDaTela as ModeloNaTela } from "@/lib/whatsapp/oficial/telaDoGestor";
import type { ModeloDaTela as ModeloNaTela } from "@/lib/whatsapp/oficial/telaDoGestor";

const ROTULO_DO_ESTADO: Record<string, { texto: string; classe: string }> = {
  rascunho: { texto: "Rascunho", classe: "border-linha text-apoio" },
  em_analise: { texto: "Em análise na Meta", classe: "border-alerta-linha bg-alerta-lavado text-alerta" },
  aprovado: { texto: "Aprovado", classe: "border-ok-linha bg-ok-lavado text-ok" },
  rejeitado: { texto: "Reprovado", classe: "border-perigo/40 bg-perigo-lavado text-perigo" },
  pausado: { texto: "Pausado pela Meta", classe: "border-perigo/40 bg-perigo-lavado text-perigo" },
  desativado: { texto: "Desativado", classe: "border-perigo/40 bg-perigo-lavado text-perigo" },
  erro: { texto: "Erro ao enviar", classe: "border-perigo/40 bg-perigo-lavado text-perigo" },
};

/** A qualidade que a Meta dá ao modelo (GREEN/YELLOW/RED), em português. */
const QUALIDADE_DO_MODELO: Record<string, string> = {
  GREEN: "alta",
  YELLOW: "média (atenção)",
  RED: "baixa (risco de a Meta pausar)",
  UNKNOWN: "ainda sem avaliação",
};

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none";

const CORPO_INICIAL =
  "Oi {{nome}}! Aqui é da {{casa}}. Saiu a tabela do {{imovel}} com condição de lançamento. Quer que eu te mande os detalhes?";

export function EditorDeModelos({
  modelos,
  fotos,
}: {
  modelos: ModeloNaTela[];
  fotos: { url: string; rotulo: string }[];
}) {
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState<"MARKETING" | "UTILITY">("MARKETING");
  const [corpo, setCorpo] = useState(CORPO_INICIAL);
  const [exemplos, setExemplos] = useState<Partial<Record<VariavelDoModelo, string>>>({
    nome: "Carla",
    imovel: "Dom Parque",
    corretor: "Rafael",
    casa: "Next Home",
  });
  const [cabecalho, setCabecalho] = useState<"nenhum" | "imagem" | "texto">("nenhum");
  const [cabecalhoTexto, setCabecalhoTexto] = useState("");
  const [foto, setFoto] = useState(fotos[0]?.url ?? "");
  const [rodape, setRodape] = useState("");
  const [botoes, setBotoes] = useState<BotaoDoModelo[]>([
    { tipo: "interesse", texto: "Quero saber mais" },
    { tipo: "parar", texto: "Parar de receber" },
  ]);
  const [enviando, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const variaveis = useMemo(() => variaveisDoCorpo(corpo), [corpo]);
  const problemas = useMemo(
    () =>
      problemasDoModelo({
        nome: nomeParaMeta(titulo || "modelo"),
        idioma: "pt_BR",
        categoria,
        corpo,
        exemplos,
        cabecalho,
        cabecalhoTexto,
        rodape,
        botoes,
      }),
    [titulo, categoria, corpo, exemplos, cabecalho, cabecalhoTexto, rodape, botoes],
  );

  function rodar(acao: () => Promise<{ ok?: string; erro?: string }>) {
    iniciar(async () => {
      const r = await acao();
      if (r.erro) falhar(r.erro);
      else avisar(r.ok ?? "Pronto.");
    });
  }

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {modelos.length === 0 && <li className="text-fluid-sm text-apoio">Nenhum modelo ainda. Crie o primeiro abaixo.</li>}
        {modelos.map((m) => {
          const estado = ROTULO_DO_ESTADO[m.estado] ?? ROTULO_DO_ESTADO.rascunho;
          return (
            <li key={m.id} className="border-linha rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-fluid-xs text-tenue font-mono">{m.nome}</p>
                <span className={`text-fluid-xs rounded-full border px-2.5 py-0.5 ${estado.classe}`}>{estado.texto}</span>
              </div>
              <p className="text-fluid-sm text-corpo mt-1 whitespace-pre-line break-words">{m.corpo}</p>
              {m.motivo && <p className="text-fluid-xs text-perigo mt-1">Motivo da Meta: {m.motivo}</p>}
              {m.qualidade && m.estado === "aprovado" && <p className="text-fluid-xs text-apoio mt-1">Qualidade: {QUALIDADE_DO_MODELO[m.qualidade] ?? m.qualidade}</p>}
              {["rascunho", "rejeitado", "erro"].includes(m.estado) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={enviando}
                    onClick={() => rodar(() => enviarModeloParaAMeta(m.id))}
                    className="bg-acento hover:bg-acento-hover text-fluid-xs text-sobre-cor min-h-10 rounded-xl px-4 font-medium disabled:opacity-60"
                  >
                    Mandar para aprovação da Meta
                  </button>
                  {m.estado !== "rejeitado" && (
                    <button
                      type="button"
                      disabled={enviando}
                      onClick={() => rodar(() => excluirRascunhoDeModelo(m.id))}
                      className="botao-secundario text-fluid-xs text-apoio hover:text-perigo min-h-10 px-3"
                    >
                      Excluir
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="border-linha space-y-3 rounded-2xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(async () => {
            const r = await salvarModelo({
              titulo,
              categoria,
              corpo,
              exemplos,
              cabecalho,
              cabecalhoTexto,
              cabecalhoImagemUrl: foto,
              rodape,
              botoes,
            });
            return "erro" in r ? { erro: r.erro } : { ok: `${r.ok} Agora mande para a aprovação da Meta.` };
          });
        }}
      >
        <p className="text-fluid-sm text-titulo font-medium">Novo modelo</p>
        <label className="text-fluid-xs text-apoio block">
          Título (vira o nome na Meta: {nomeParaMeta(titulo || "modelo")})
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={`${campo} mt-1`} />
        </label>
        <label className="text-fluid-xs text-apoio block">
          Tipo
          <select value={categoria} onChange={(e) => setCategoria(e.target.value as "MARKETING" | "UTILITY")} className={`${campo} mt-1`}>
            <option value="MARKETING">Marketing (oferta, lançamento, reativação)</option>
            <option value="UTILITY">Utilidade (aviso sobre algo que o cliente pediu)</option>
          </select>
        </label>

        <div className="space-y-1">
          <label className="text-fluid-xs text-apoio block" htmlFor="corpo-modelo">
            Texto. Variáveis: {Object.keys(VARIAVEIS_DO_MODELO).map((v) => `{{${v}}}`).join(", ")}
          </label>
          <textarea id="corpo-modelo" value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={4} maxLength={1024} className={`${campo} py-2`} />
        </div>
        {variaveis.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {variaveis
              .filter((v): v is VariavelDoModelo => v in VARIAVEIS_DO_MODELO)
              .map((v) => (
                <label key={v} className="text-fluid-xs text-apoio">
                  Exemplo de {`{{${v}}}`} ({VARIAVEIS_DO_MODELO[v].rotulo})
                  <input
                    value={exemplos[v] ?? ""}
                    onChange={(e) => setExemplos((x) => ({ ...x, [v]: e.target.value }))}
                    className={`${campo} mt-1`}
                  />
                </label>
              ))}
          </div>
        )}

        <label className="text-fluid-xs text-apoio block">
          Cabeçalho
          <select value={cabecalho} onChange={(e) => setCabecalho(e.target.value as "nenhum" | "imagem" | "texto")} className={`${campo} mt-1`}>
            <option value="nenhum">Sem cabeçalho</option>
            <option value="imagem">Foto do imóvel (no envio, a foto do imóvel da lista)</option>
            <option value="texto">Título em negrito</option>
          </select>
        </label>
        {cabecalho === "texto" && (
          <input value={cabecalhoTexto} onChange={(e) => setCabecalhoTexto(e.target.value)} maxLength={60} placeholder="Título" className={campo} />
        )}
        {cabecalho === "imagem" && (
          <label className="text-fluid-xs text-apoio block">
            Foto de exemplo para a aprovação
            <select value={foto} onChange={(e) => setFoto(e.target.value)} className={`${campo} mt-1`}>
              {fotos.length === 0 && <option value="">Nenhuma foto no catálogo</option>}
              {fotos.map((f) => (
                <option key={f.url} value={f.url}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <input value={rodape} onChange={(e) => setRodape(e.target.value)} maxLength={60} placeholder="Rodapé (opcional)" className={campo} />

        <fieldset className="space-y-2">
          <legend className="text-fluid-xs text-apoio">Botões</legend>
          {botoes.map((b, i) => (
            <div key={i} className="flex gap-2">
              <select
                value={b.tipo}
                onChange={(e) =>
                  setBotoes((x) => x.map((y, j) => (j === i ? { ...y, tipo: e.target.value === "parar" ? "parar" : "interesse" } : y)))
                }
                className={`${campo} max-w-40`}
              >
                <option value="interesse">Resposta</option>
                <option value="parar">Parar de receber</option>
              </select>
              <input
                value={b.texto}
                maxLength={25}
                onChange={(e) => setBotoes((x) => x.map((y, j) => (j === i ? { ...y, texto: e.target.value } : y)))}
                className={campo}
              />
              <button
                type="button"
                onClick={() => setBotoes((x) => x.filter((_, j) => j !== i))}
                className="botao-icone text-fluid-xs text-apoio hover:text-perigo px-2"
                aria-label="Tirar o botão"
              >
                ✕
              </button>
            </div>
          ))}
          {botoes.length < 3 && (
            <button
              type="button"
              onClick={() => setBotoes((x) => [...x, { tipo: "interesse", texto: "" }])}
              className="link-acao text-fluid-xs text-acento-suave min-h-10"
            >
              + botão
            </button>
          )}
        </fieldset>

        <div className="bg-vidro rounded-xl p-3">
          <p className="text-fluid-xs text-tenue">Como a Carla vai ler:</p>
          {cabecalho === "texto" && cabecalhoTexto && <p className="text-fluid-sm text-titulo font-semibold">{cabecalhoTexto}</p>}
          {cabecalho === "imagem" && <p className="text-fluid-xs text-apoio">📷 foto do imóvel</p>}
          <p className="text-fluid-sm text-corpo whitespace-pre-line break-words">{renderizarModelo(corpo, exemplos)}</p>
          {rodape && <p className="text-fluid-xs text-tenue">{rodape}</p>}
        </div>

        {problemas.length > 0 && (
          <ul className="text-fluid-xs text-perigo list-disc space-y-0.5 pl-5">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <button
          type="submit"
          disabled={enviando || problemas.length > 0 || !titulo.trim()}
          className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor min-h-11 rounded-xl px-5 font-medium transition-colors disabled:opacity-60"
        >
          {enviando ? "Salvando…" : "Salvar rascunho"}
        </button>
      </form>
    </div>
  );
}
