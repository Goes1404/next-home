"use client";

import { useState, useTransition } from "react";
import { apagarTemplate, criarTemplate, editarTemplate } from "@/app/corretor/actions";
import type { TemplateMensagem } from "@/lib/types";

const VARIAVEIS_DISPONIVEIS = "{{nome_lead}}, {{nome_corretor}}, {{telefone_corretor}}";

export function GerenciarTemplates({ templatesIniciais }: { templatesIniciais: TemplateMensagem[] }) {
  const [templates, setTemplates] = useState(templatesIniciais);
  const [editando, setEditando] = useState<TemplateMensagem | null>(null);
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [padrao, setPadrao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciarTransicao] = useTransition();

  function iniciarEdicao(template: TemplateMensagem | null) {
    setEditando(template);
    setTitulo(template?.titulo ?? "");
    setConteudo(template?.conteudo ?? "");
    setPadrao(template?.padrao ?? false);
    setErro(null);
  }

  function salvar() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = editando
        ? await editarTemplate(editando.id, titulo, conteudo, padrao)
        : await criarTemplate(titulo, conteudo, padrao);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      // Sem endpoint de listagem própria neste componente: a Server Action já
      // revalida a rota, então um recarregamento simples da página reflete o
      // estado novo. Aqui só fecha o formulário.
      iniciarEdicao(null);
      window.location.reload();
    });
  }

  function apagar(id: string) {
    if (!confirm("Apagar este template?")) return;
    iniciarTransicao(async () => {
      const resultado = await apagarTemplate(id);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setTemplates((atual) => atual.filter((t) => t.id !== id));
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-ink-900/50 p-5">
        <h2 className="text-fluid-sm font-medium text-mist-100">
          {editando ? "Editar template" : "Novo template"}
        </h2>
        <p className="text-fluid-xs mt-1 text-mist-500">Variáveis disponíveis: {VARIAVEIS_DISPONIVEIS}</p>

        <div className="mt-4 space-y-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ex.: Primeiro contato)"
            className="text-fluid-sm w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
          />
          <textarea
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Olá {{nome_lead}}, aqui é {{nome_corretor}}..."
            rows={4}
            className="text-fluid-sm w-full rounded-lg border border-white/15 bg-ink-950 px-3 py-2 text-mist-100"
          />
          <label className="flex items-center gap-2 text-fluid-sm text-mist-300">
            <input type="checkbox" checked={padrao} onChange={(e) => setPadrao(e.target.checked)} />
            Usar como padrão
          </label>

          {erro && (
            <p role="alert" className="text-fluid-xs text-sand-300">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={salvando || titulo.trim().length < 2 || conteudo.trim().length < 2}
              onClick={salvar}
              className="text-fluid-sm rounded-lg bg-brand-500 px-4 py-2 font-medium text-white disabled:opacity-50"
            >
              {editando ? "Salvar" : "Criar"}
            </button>
            {editando && (
              <button
                type="button"
                onClick={() => iniciarEdicao(null)}
                className="text-fluid-sm rounded-lg border border-white/15 px-4 py-2 text-mist-300"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {templates.length === 0 && (
          <p className="text-fluid-sm text-mist-400">Nenhum template ainda.</p>
        )}
        {templates.map((template) => (
          <div
            key={template.id}
            className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-ink-900/50 px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-fluid-sm text-mist-50">
                {template.titulo} {template.padrao && <span className="text-brand-300">· padrão</span>}
              </p>
              <p className="text-fluid-xs mt-1 truncate text-mist-400">{template.conteudo}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => iniciarEdicao(template)}
                className="text-fluid-xs text-brand-200 underline-offset-4 hover:underline"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => apagar(template.id)}
                className="text-fluid-xs text-sand-300 underline-offset-4 hover:underline"
              >
                Apagar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
