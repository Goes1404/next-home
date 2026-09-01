"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { STATUS_LABEL, TIPO_LABEL, type StatusObra, type TipoImovel } from "@/lib/types";
import { criarImovel } from "./acoes";

export interface PreenchimentoInicial {
  nome: string;
  bairro: string;
  cidade: string;
  status: StatusObra;
  candidatoId?: string;
  /** Quando veio da fila: o bairro cru da fonte, para o corretor escolher um. */
  bairrosDaFonte?: string[];
}

const CAMPO =
  "border-linha bg-elevado text-titulo placeholder:text-tenue focus:border-acento-linha w-full rounded-xl border px-4 py-3 text-fluid-sm outline-none transition-colors";

export function FormNovoImovel({ inicial }: { inicial: PreenchimentoInicial }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [nome, setNome] = useState(inicial.nome);
  const [bairro, setBairro] = useState(inicial.bairro);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [construtora, setConstrutora] = useState("");
  const [status, setStatus] = useState<StatusObra>(inicial.status);
  const [tipo, setTipo] = useState<TipoImovel>("apartamento");

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await criarImovel({
        nome,
        bairro,
        cidade,
        construtora,
        status,
        tipo,
        candidatoId: inicial.candidatoId,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.push(`/corretor/imoveis/${r.slug}`);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      {erro && (
        <p
          className="text-fluid-xs rounded-xl border border-red-500/40 bg-red-500/5 px-4 py-3 text-red-400"
          role="status"
        >
          {erro}
        </p>
      )}

      <label className="block space-y-1.5">
        <span className="text-fluid-xs text-apoio block">Nome do empreendimento</span>
        <input
          className={CAMPO}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex.: Vista AlphaGran"
          required
          autoFocus
        />
        <span className="text-fluid-xs text-tenue block">
          É por este nome que a assistente reconhece o imóvel na conversa. Apelidos de anúncio
          entram depois, no campo &ldquo;Também conhecido como&rdquo; do editor.
        </span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Bairro</span>
          <input
            className={CAMPO}
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            placeholder="Ex.: Alphaville"
            required
          />
          {(inicial.bairrosDaFonte?.length ?? 0) > 1 && (
            <span className="text-fluid-xs text-tenue block">
              O levantamento trouxe mais de um:{" "}
              {inicial.bairrosDaFonte!.map((b, i) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBairro(b)}
                  className="text-apoio hover:text-titulo underline underline-offset-2"
                >
                  {b}
                  {i < inicial.bairrosDaFonte!.length - 1 ? ", " : ""}
                </button>
              ))}
              . Escolha um — a busca e o mapa usam um bairro só.
            </span>
          )}
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Cidade</span>
          <input
            className={CAMPO}
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Construtora (opcional)</span>
          <input
            className={CAMPO}
            value={construtora}
            onChange={(e) => setConstrutora(e.target.value)}
            placeholder="Ex.: P4 Engenharia"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Estágio da obra</span>
          <select
            className={CAMPO}
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusObra)}
          >
            {Object.entries(STATUS_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-fluid-xs text-apoio block">Tipo</span>
          <select
            className={CAMPO}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoImovel)}
          >
            {Object.entries(TIPO_LABEL).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border-linha flex flex-wrap items-center gap-3 border-t pt-5">
        <button
          type="submit"
          disabled={pendente}
          className="border-acento-linha text-titulo hover:bg-elevado text-fluid-sm min-h-12 rounded-xl border px-6 font-medium transition-colors disabled:opacity-60"
        >
          {pendente ? "Criando…" : "Criar e abrir o editor"}
        </button>
        <p className="text-fluid-xs text-apoio">
          O imóvel nasce <strong className="text-corpo">despublicado</strong>. Ele só aparece no site
          quando você publicar, no editor.
        </p>
      </div>
    </form>
  );
}
