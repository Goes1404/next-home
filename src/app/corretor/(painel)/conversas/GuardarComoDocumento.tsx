"use client";

import { useState, useTransition } from "react";
import { FolderInput } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  avisoDePaginaVelha,
  ehActionDeOutroBuild,
} from "@/lib/erros/actionDeOutroBuild";
import { FASE_DOCUMENTO_LABEL, type FaseDocumento } from "@/lib/crm/documentacao";
import { guardarComoDocumento, opcoesParaGuardar } from "./documentoAcoes";

type Fases = { fase: FaseDocumento; itens: { item: string; jaTem: boolean }[] }[];

/**
 * O botão "Guardar como documento" embaixo da foto ou do PDF que o cliente
 * mandou (16/10/2026). As opções são as listas do lead, carregadas só quando
 * o corretor toca — o chat não paga essa leitura em cada balão.
 */
export function GuardarComoDocumento({ mensagemId }: { mensagemId: string }) {
  const [fases, setFases] = useState<Fases | null>(null);
  const [escolha, setEscolha] = useState<{ fase: FaseDocumento; item: string } | null>(
    null,
  );
  const [guardado, setGuardado] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  function abrir() {
    iniciar(async () => {
      try {
        const r = await opcoesParaGuardar(mensagemId);
        if ("erro" in r) return falhar(r.erro);
        setFases(r.fases);
        const primeira = r.fases[0];
        const livre = primeira.itens.find((i) => !i.jaTem) ?? primeira.itens[0];
        setEscolha({ fase: primeira.fase, item: livre.item });
      } catch (err) {
        falhar(
          ehActionDeOutroBuild(err)
            ? avisoDePaginaVelha()
            : "Sem conexão. Tente de novo.",
        );
      }
    });
  }

  function guardar() {
    if (!escolha) return;
    iniciar(async () => {
      try {
        const r = await guardarComoDocumento(mensagemId, escolha.fase, escolha.item);
        if (r.erro) return falhar(r.erro);
        setGuardado(escolha.item);
        setFases(null);
        avisar(`Guardado em "${escolha.item}". Confira na ficha do lead.`);
      } catch (err) {
        falhar(
          ehActionDeOutroBuild(err)
            ? avisoDePaginaVelha()
            : "Sem conexão. Tente de novo.",
        );
      }
    });
  }

  if (guardado) {
    return <p className="text-wa-meta mt-1 text-[12px]">Guardado em “{guardado}”.</p>;
  }

  if (!fases || !escolha) {
    return (
      <button
        type="button"
        disabled={ocupado}
        onClick={abrir}
        className="text-wa-texto botao-secundario mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium disabled:opacity-60"
      >
        <FolderInput className="h-4 w-4" aria-hidden />
        {ocupado ? "Abrindo…" : "Guardar como documento"}
      </button>
    );
  }

  const itensDaFase = fases.find((f) => f.fase === escolha.fase)?.itens ?? [];
  return (
    <div className="mt-1 space-y-1.5">
      {fases.length > 1 && (
        <select
          aria-label="Lista de documentos"
          value={escolha.fase}
          onChange={(e) => {
            const fase = e.target.value as FaseDocumento;
            const itens = fases.find((f) => f.fase === fase)?.itens ?? [];
            setEscolha({
              fase,
              item: (itens.find((i) => !i.jaTem) ?? itens[0])?.item ?? "",
            });
          }}
          className="select-seta text-wa-texto bg-wa-barra border-linha-forte min-h-11 w-full rounded-lg border px-2 text-[13px]"
        >
          {fases.map((f) => (
            <option key={f.fase} value={f.fase}>
              {FASE_DOCUMENTO_LABEL[f.fase]}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Documento"
        value={escolha.item}
        onChange={(e) => setEscolha({ ...escolha, item: e.target.value })}
        className="select-seta text-wa-texto bg-wa-barra border-linha-forte min-h-11 w-full rounded-lg border px-2 text-[13px]"
      >
        {itensDaFase.map((i) => (
          <option key={i.item} value={i.item}>
            {i.item}
            {i.jaTem ? " (já guardado)" : ""}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          disabled={ocupado || !escolha.item}
          onClick={guardar}
          className="bg-acento text-sobre-cor min-h-11 rounded-lg px-3 text-[12.5px] font-bold disabled:opacity-60"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={() => setFases(null)}
          className="text-wa-meta botao-secundario min-h-11 px-2 text-[12.5px]"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
