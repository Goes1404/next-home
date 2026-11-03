"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  atualizarDadosDaMeta,
  cadastrarNumeroManual,
  desligarNumero,
  reativarNumero,
  salvarConfiguracao,
} from "./acoes";

/**
 * O número oficial: cadastro (piloto), estado e as decisões do gestor.
 * Cada botão é uma ação do servidor com a guarda de gestor; aqui só a forma.
 */

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3 focus:outline-none";
const secundario =
  "text-fluid-sm border-linha-forte text-corpo hover:text-titulo min-h-11 rounded-xl border px-4 transition-colors disabled:opacity-60";

export function CadastroManual() {
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [enviando, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await cadastrarNumeroManual({ wabaId, phoneNumberId });
          if (r.erro) falhar(r.erro);
          else avisar(r.ok ?? "Pronto.");
        });
      }}
    >
      <label className="text-fluid-xs text-apoio">
        Id da conta (WABA)
        <input value={wabaId} onChange={(e) => setWabaId(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
      </label>
      <label className="text-fluid-xs text-apoio">
        Id do número (phone number id)
        <input
          value={phoneNumberId}
          onChange={(e) => setPhoneNumberId(e.target.value)}
          inputMode="numeric"
          className={`${campo} mt-1`}
        />
      </label>
      <button type="submit" disabled={enviando} className={`${secundario} self-end`}>
        {enviando ? "Conferindo…" : "Cadastrar"}
      </button>
    </form>
  );
}

export function ConfiguracaoDoNumero({
  inicial,
}: {
  inicial: { liberado: boolean; teto: number | null; resposta: "ia" | "mensagem_fixa" | "nenhuma"; mensagemFixa: string | null };
}) {
  const [liberado, setLiberado] = useState(inicial.liberado);
  const [teto, setTeto] = useState(inicial.teto === null ? "" : String(inicial.teto));
  const [resposta, setResposta] = useState(inicial.resposta);
  const [mensagemFixa, setMensagemFixa] = useState(inicial.mensagemFixa ?? "");
  const [enviando, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        iniciar(async () => {
          const r = await salvarConfiguracao({
            liberado,
            teto: teto.trim() === "" ? null : Number(teto),
            resposta,
            mensagemFixa,
          });
          if (r.erro) falhar(r.erro);
          else avisar(r.ok ?? "Salvo.");
        });
      }}
    >
      <label className="flex min-h-12 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={liberado}
          onChange={(e) => setLiberado(e.target.checked)}
          className="accent-acento mt-1 h-4 w-4"
        />
        <span>
          <span className="text-fluid-sm text-titulo block font-medium">Corretores podem mandar listas pelo número oficial</span>
          <span className="text-fluid-xs text-apoio block">
            Desligado, só o gestor manda. Cada mensagem é cobrada pela Meta da imobiliária.
          </span>
        </span>
      </label>

      <label className="text-fluid-xs text-apoio block max-w-xs">
        Teto de mensagens de lista por mês (vazio = sem teto)
        <input value={teto} onChange={(e) => setTeto(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-fluid-xs text-apoio">Quando um cliente responde ao número oficial</legend>
        {(
          [
            ["ia", "A IA responde até o corretor assumir", "O mesmo atendimento da IA de sempre, dentro das 24 h que a resposta do cliente abre."],
            ["mensagem_fixa", "Uma mensagem fixa", "Ex.: “Obrigado! O corretor vai te chamar em seguida.”"],
            ["nenhuma", "Ninguém responde por aqui", "O corretor dono é avisado e chama pelo WhatsApp dele."],
          ] as const
        ).map(([valor, titulo, descricao]) => (
          <label key={valor} className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="resposta"
              checked={resposta === valor}
              onChange={() => setResposta(valor)}
              className="accent-acento mt-1 h-4 w-4"
            />
            <span>
              <span className="text-fluid-sm text-titulo block">{titulo}</span>
              <span className="text-fluid-xs text-apoio block">{descricao}</span>
            </span>
          </label>
        ))}
        {resposta === "mensagem_fixa" && (
          <textarea
            value={mensagemFixa}
            onChange={(e) => setMensagemFixa(e.target.value)}
            rows={3}
            maxLength={1000}
            className={`${campo} py-2`}
          />
        )}
      </fieldset>

      <button
        type="submit"
        disabled={enviando}
        className="bg-acento hover:bg-acento-hover text-fluid-sm text-sobre-cor min-h-11 rounded-xl px-5 font-medium transition-colors disabled:opacity-60"
      >
        {enviando ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}

export function AcoesDoNumero({ pausado }: { pausado: boolean }) {
  const [enviando, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const rodar = (acao: () => Promise<{ ok?: string; erro?: string }>) =>
    iniciar(async () => {
      const r = await acao();
      if (r.erro) falhar(r.erro);
      else avisar(r.ok ?? "Pronto.");
    });
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={enviando} onClick={() => rodar(atualizarDadosDaMeta)} className={secundario}>
        Atualizar dados da Meta
      </button>
      {pausado && (
        <button type="button" disabled={enviando} onClick={() => rodar(reativarNumero)} className={secundario}>
          Reativar
        </button>
      )}
      <button
        type="button"
        disabled={enviando}
        onClick={() => {
          if (confirm("Desligar o número oficial? As listas oficiais em andamento ficam pausadas.")) rodar(desligarNumero);
        }}
        className={`${secundario} hover:text-perigo`}
      >
        Desligar
      </button>
    </div>
  );
}
