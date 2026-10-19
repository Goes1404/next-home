"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  CHAMADA_PADRAO,
  LIMITE_CHAMADA_DO_LINK,
  normalizarChamadaDoLink,
  tituloDaPrevia,
} from "@/lib/previaDoLink";
import { salvarChamadaDoLink } from "./previaAcoes";

/**
 * O texto que aparece embaixo do título quando o corretor manda o link do
 * portfólio no WhatsApp (0188). Vazio = "Portfólio de produtos".
 *
 * `disponivel = false` quando a coluna ainda não existe no banco (código no ar
 * antes da migration): o campo aparece travado, com o motivo, em vez de
 * aceitar um texto que não seria gravado.
 */
export function TextoDaPrevia({
  nome,
  inicial,
  disponivel,
}: {
  nome: string;
  inicial: string | null;
  disponivel: boolean;
}) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(inicial ?? "");
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const tamanho = normalizarChamadaDoLink(texto)?.length ?? 0;
  const passou = tamanho > LIMITE_CHAMADA_DO_LINK;
  const descricao = normalizarChamadaDoLink(texto) ?? CHAMADA_PADRAO;

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarChamadaDoLink(texto);
        if (r.erro) return falhar(r.erro);
        setSalvo(texto);
        avisar(r.ok!);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <section className="space-y-3" aria-labelledby="titulo-previa">
      <h2 id="titulo-previa" className="text-fluid-base font-bold text-titulo">
        Texto da prévia do seu link
      </h2>
      <p className="text-fluid-xs text-apoio">
        É o que aparece embaixo do título quando você manda o link do seu portfólio no WhatsApp. Em
        branco, vale “{CHAMADA_PADRAO}”.
      </p>

      <div>
        <label htmlFor="chamada-do-link" className="sr-only">
          Texto da prévia do seu link
        </label>
        <textarea
          id="chamada-do-link"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!disponivel}
          placeholder={CHAMADA_PADRAO}
          aria-describedby="contador-previa"
          className="w-full rounded-xl border border-linha-forte bg-elevado px-4 py-3 text-titulo placeholder:text-tenue outline-none transition-colors focus:border-acento disabled:opacity-60"
        />
        <p
          id="contador-previa"
          className={`text-fluid-xs mt-1 text-right ${passou ? "text-perigo" : "text-tenue"}`}
          aria-live="polite"
        >
          {tamanho}/{LIMITE_CHAMADA_DO_LINK}
        </p>
      </div>

      {/* Como o WhatsApp mostra: título em cima, descrição embaixo. */}
      <div className="border-linha-forte rounded-xl border px-4 py-3">
        <p className="text-fluid-sm font-semibold text-titulo break-words">{tituloDaPrevia({ nome })}</p>
        <p className="text-fluid-xs mt-0.5 text-apoio break-words">{descricao}</p>
      </div>

      {!disponivel ? (
        <p className="text-fluid-xs text-apoio">
          Este campo fica disponível assim que a atualização do sistema terminar.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={!disponivel || ocupado || passou || texto === salvo}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          {ocupado ? "Salvando…" : "Salvar"}
        </button>
        {texto.trim() && disponivel ? (
          <button
            type="button"
            onClick={() => setTexto("")}
            disabled={ocupado}
            className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs text-corpo hover:text-titulo"
          >
            Voltar ao padrão
          </button>
        ) : null}
      </div>
    </section>
  );
}
