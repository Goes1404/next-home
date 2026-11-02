"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cadastrarLoja, marcarEnviado, mudarEtapa, salvarFicha, type DadosDaFicha } from "./acoes";
import { ETAPAS, MODELOS, ROTULO_DA_ETAPA, ROTULO_DO_MODELO } from "@/lib/prospeccao/tipos";

const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo placeholder:text-tenue focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none";
const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor inline-flex min-h-11 items-center justify-center rounded-full px-4 font-medium disabled:opacity-60";

function Erro({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <p role="alert" className="text-fluid-xs text-perigo">
      {texto}
    </p>
  );
}

/**
 * Abre o WhatsApp de quem está no painel com a mensagem pronta e marca a loja
 * como abordada. O `window.open` acontece no clique (antes da ação), senão o
 * navegador bloqueia a janela.
 */
export function EnviarNoWhatsapp({
  id,
  link,
  bloqueado,
  rotulo = "Enviar no WhatsApp",
}: {
  id: string;
  link: string | null;
  bloqueado: string | null;
  rotulo?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  if (bloqueado || !link) {
    return <span className="text-fluid-xs text-apoio">{bloqueado ?? "Sem WhatsApp cadastrado"}</span>;
  }

  function enviar() {
    setErro(null);
    window.open(link!, "_blank", "noopener");
    iniciar(async () => {
      const r = await marcarEnviado(id);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button type="button" onClick={enviar} disabled={pendente} className={BOTAO_PRINCIPAL}>
        {pendente ? "Marcando…" : rotulo}
      </button>
      <Erro texto={erro} />
    </div>
  );
}

export function MudarEtapa({ id, etapa }: { id: string; etapa: string }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function mudar(nova: string) {
    if (nova === etapa) return;
    let motivo: string | undefined;
    if (nova === "perdido") {
      const resposta = window.prompt("Por que a loja não fechou? (ajuda a comparar segmentos e mensagens)");
      if (resposta === null) return;
      motivo = resposta;
    }
    setErro(null);
    iniciar(async () => {
      const r = await mudarEtapa(id, nova, motivo);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Etapa
        <select value={etapa} disabled={pendente} onChange={(e) => mudar(e.target.value)} className={CAMPO}>
          {ETAPAS.map((e) => (
            <option key={e} value={e}>
              {ROTULO_DA_ETAPA[e]}
            </option>
          ))}
        </select>
      </label>
      <Erro texto={erro} />
    </div>
  );
}

export function FichaDaLoja({ id, inicial }: { id: string; inicial: DadosDaFicha }) {
  const [dados, setDados] = useState(inicial);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  function campo<K extends keyof DadosDaFicha>(chave: K, valor: DadosDaFicha[K]) {
    setSalvo(false);
    setDados((d) => ({ ...d, [chave]: valor }));
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await salvarFicha(id, dados);
      if (r.ok) setSalvo(true);
      else setErro(r.erro);
    });
  }

  return (
    <form onSubmit={salvar} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          WhatsApp da loja
          <input className={CAMPO} value={dados.whatsapp} onChange={(e) => campo("whatsapp", e.target.value)} inputMode="tel" placeholder="11 91234-5678" />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Instagram
          <input className={CAMPO} value={dados.instagram} onChange={(e) => campo("instagram", e.target.value)} placeholder="@loja" />
        </label>
      </div>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Gancho da abordagem
        <textarea className={`${CAMPO} min-h-20`} value={dados.gancho} onChange={(e) => campo("gancho", e.target.value)} />
      </label>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Mensagem que vai no WhatsApp
        <textarea className={`${CAMPO} min-h-48`} value={dados.mensagem} onChange={(e) => campo("mensagem", e.target.value)} />
      </label>
      <label className="text-fluid-xs text-apoio flex flex-col gap-1">
        Observações
        <textarea className={`${CAMPO} min-h-20`} value={dados.observacoes} onChange={(e) => campo("observacoes", e.target.value)} />
      </label>
      <label className="text-fluid-sm text-corpo flex min-h-11 items-center gap-2">
        <input type="checkbox" checked={dados.naoContatar} onChange={(e) => campo("naoContatar", e.target.checked)} className="size-5" />
        Pediu para não receber mais mensagens
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={BOTAO_PRINCIPAL}>
          {pendente ? "Salvando…" : "Salvar ficha"}
        </button>
        {salvo && <span className="text-fluid-xs text-ok">Ficha salva.</span>}
        <Erro texto={erro} />
      </div>
    </form>
  );
}

const LOJA_VAZIA = {
  nome: "",
  segmento: "",
  modelo: "varejo",
  cidade: "",
  bairro: "",
  endereco: "",
  whatsapp: "",
  instagram: "",
  gancho: "",
  corPrimaria: "#D81B6A",
};

export function NovaLoja() {
  const router = useRouter();
  const [loja, setLoja] = useState(LOJA_VAZIA);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function campo(chave: keyof typeof LOJA_VAZIA, valor: string) {
    setLoja((l) => ({ ...l, [chave]: valor }));
  }

  function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await cadastrarLoja(loja);
      if (r.ok) router.push(`/plataforma/prospeccao/${r.id}`);
      else setErro(r.erro);
    });
  }

  return (
    <details className="cartao p-4">
      <summary className="text-fluid-sm text-titulo min-h-11 cursor-pointer content-center font-medium">Cadastrar loja à mão</summary>
      <form onSubmit={cadastrar} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-fluid-xs text-apoio flex flex-col gap-1 sm:col-span-2">
          Nome da loja
          <input required className={CAMPO} value={loja.nome} onChange={(e) => campo("nome", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Modelo da amostra
          <select className={CAMPO} value={loja.modelo} onChange={(e) => campo("modelo", e.target.value)}>
            {MODELOS.map((m) => (
              <option key={m} value={m}>
                {ROTULO_DO_MODELO[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Segmento
          <input className={CAMPO} value={loja.segmento} onChange={(e) => campo("segmento", e.target.value)} placeholder="Perfumaria, padaria, barbearia…" />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Cidade
          <input className={CAMPO} value={loja.cidade} onChange={(e) => campo("cidade", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Bairro
          <input className={CAMPO} value={loja.bairro} onChange={(e) => campo("bairro", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1 sm:col-span-2">
          Endereço
          <input className={CAMPO} value={loja.endereco} onChange={(e) => campo("endereco", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          WhatsApp
          <input className={CAMPO} value={loja.whatsapp} onChange={(e) => campo("whatsapp", e.target.value)} inputMode="tel" />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1">
          Instagram
          <input className={CAMPO} value={loja.instagram} onChange={(e) => campo("instagram", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex flex-col gap-1 sm:col-span-2">
          Gancho (o problema real da loja, em uma frase)
          <textarea className={`${CAMPO} min-h-20`} value={loja.gancho} onChange={(e) => campo("gancho", e.target.value)} />
        </label>
        <label className="text-fluid-xs text-apoio flex items-center gap-3">
          Cor da marca
          <input type="color" value={loja.corPrimaria} onChange={(e) => campo("corPrimaria", e.target.value)} className="h-11 w-16 rounded-lg" />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pendente} className={BOTAO_PRINCIPAL}>
            {pendente ? "Cadastrando…" : "Cadastrar e abrir a ficha"}
          </button>
          <Erro texto={erro} />
        </div>
      </form>
    </details>
  );
}
