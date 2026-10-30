"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import type { TipoDoGrupo } from "@/lib/grupos/grupo";
import { useGuardadoNoAparelho } from "@/lib/navegador/guardadoNoAparelho";
import {
  acoesRapidasDoRamo,
  chaveDasRecentes,
  MINIMO_PARA_BUSCAR,
  RESPOSTA_VAZIA,
  filtrarAtalhos,
  lembrarBusca,
  lerRecentes,
  proximoIndice,
  type Atalho,
  type RespostaDaBusca,
  type ResultadoDaBusca,
} from "@/lib/painel/buscaRapida";
import { useRamoDoPainel } from "@/lib/ramos/RamoDoPainel";
import { temModulo, type Ramo } from "@/lib/ramos/ramos";
import { gruposVisiveis, itensDaConta, moduloAtivo } from "../navegacao";

/** Espera da digitação antes de ir ao servidor. */
const ESPERA_MS = 220;

type Estado = "parado" | "buscando" | "pronto" | "erro";

/**
 * As telas do menu (só as que esta pessoa vê, no ramo da conta) viram
 * atalhos da busca. Exportada para o teste (`paletaDeBusca.test.ts`).
 */
export function atalhosDoMenu(ehGestor: boolean, tipoDoGrupo: TipoDoGrupo, ramo: Ramo): Atalho[] {
  const saida: Atalho[] = [];
  const vistos = new Set<string>();
  const por = (a: Atalho) => {
    if (vistos.has(a.href)) return;
    vistos.add(a.href);
    saida.push(a);
  };
  for (const grupo of gruposVisiveis(ehGestor, tipoDoGrupo, ramo)) {
    for (const item of grupo.itens) {
      if (item.subitens?.length) {
        for (const sub of item.subitens) por({ tipo: "pagina", href: sub.href, titulo: sub.label, detalhe: item.label });
      } else {
        por({ tipo: "pagina", href: item.href, titulo: item.label, detalhe: grupo.titulo });
      }
    }
  }
  // Só os itens da conta que esta pessoa vê ("Indique e ganhe" é do gestor).
  for (const item of itensDaConta(ehGestor)) por({ tipo: "pagina", href: item.href, titulo: item.label, detalhe: "Conta" });
  return [...acoesRapidasDoRamo(ramo), ...saida];
}

const ROTULO: Record<ResultadoDaBusca["tipo"], string> = {
  acao: "Ações",
  pagina: "Telas",
  lead: "Leads",
  conversa: "Conversas",
  imovel: "Catálogo",
};

/**
 * A paleta da busca rápida (29/10/2026). Carregada sob demanda por
 * `BotaoBuscaRapida`.
 *
 * Telas e ações filtram aqui mesmo, na hora; leads, conversas e catálogo vêm
 * de `/api/painel/busca` depois de uma pausa na digitação, cancelando o
 * pedido anterior. Teclado: ↑/↓ andam, Enter abre, Esc fecha. As buscas
 * recentes ficam só neste aparelho (localStorage protegido).
 *
 * Mora num PORTAL no `<body>` (o cabeçalho tem `backdrop-filter`, que prende
 * `fixed`), então repete `data-rota="painel"` e `data-modulo` na raiz — sem
 * eles a paleta perde as cores do painel (ver GavetaLateral).
 */
export function PaletaDeBusca({
  aberta,
  aoFechar,
  ehGestor,
  tipoDoGrupo,
  usuarioId,
}: {
  aberta: boolean;
  aoFechar: () => void;
  ehGestor: boolean;
  tipoDoGrupo: TipoDoGrupo;
  /** As buscas recentes são guardadas por usuário (celular compartilhado). */
  usuarioId: string;
}) {
  const { ramo } = useRamoDoPainel();
  const router = useRouter();
  const atual = usePathname();
  const modulo = moduloAtivo(atual);
  const idBase = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [resposta, setResposta] = useState<RespostaDaBusca>(RESPOSTA_VAZIA);
  const [estado, setEstado] = useState<Estado>("parado");
  const [ativo, setAtivo] = useState(0);
  const [guardadas, guardar] = useGuardadoNoAparelho(chaveDasRecentes(usuarioId));
  const recentes = useMemo(() => lerRecentes(guardadas), [guardadas]);
  const atalhos = useMemo(() => atalhosDoMenu(ehGestor, tipoDoGrupo, ramo), [ehGestor, tipoDoGrupo, ramo]);

  const limpo = termo.trim();
  const vaiAoServidor = limpo.length >= MINIMO_PARA_BUSCAR;

  // Consulta com espera e cancelamento. O estado "buscando" é escrito no
  // próprio temporizador (nunca em sincronia no efeito).
  useEffect(() => {
    if (!aberta || !vaiAoServidor) return;
    const controle = new AbortController();
    const t = window.setTimeout(async () => {
      setEstado("buscando");
      try {
        const r = await fetch(`/api/painel/busca?q=${encodeURIComponent(limpo)}`, { signal: controle.signal, cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        setResposta((await r.json()) as RespostaDaBusca);
        setEstado("pronto");
      } catch {
        if (!controle.signal.aborted) setEstado("erro");
      }
    }, ESPERA_MS);
    return () => {
      window.clearTimeout(t);
      controle.abort();
    };
  }, [aberta, limpo, vaiAoServidor]);

  // Abrir: foco no campo, página de trás parada. Fechar: o foco volta ao botão.
  useEffect(() => {
    if (!aberta) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => campo.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = overflow;
      document.querySelector<HTMLElement>("[data-busca-rapida]")?.focus();
    };
  }, [aberta]);

  const doServidor = vaiAoServidor && estado !== "parado" ? resposta : RESPOSTA_VAZIA;
  const secoes: { chave: string; itens: ResultadoDaBusca[] }[] = [
    {
      chave: "atalhos",
      itens: filtrarAtalhos(atalhos, limpo).map((a) => ({ tipo: a.tipo, id: a.href, titulo: a.titulo, detalhe: a.detalhe, href: a.href })),
    },
    { chave: "leads", itens: doServidor.leads },
    { chave: "conversas", itens: doServidor.conversas },
    { chave: "imoveis", itens: doServidor.imoveis },
  ].filter((s) => s.itens.length > 0);
  // Recentes primeiro quando o campo está vazio (cada uma vira "buscar de novo").
  const itensDeRecente: ResultadoDaBusca[] = !limpo
    ? recentes.map((r) => ({ tipo: "pagina", id: `recente:${r}`, titulo: r, detalhe: "Busca recente", href: "" }))
    : [];
  const lista = [...itensDeRecente, ...secoes.flatMap((s) => s.itens)];
  const indiceAtivo = lista.length === 0 ? -1 : Math.min(ativo, lista.length - 1);
  const idDoItem = (i: number) => `${idBase}-item-${i}`;

  function fechar() {
    setTermo("");
    setAtivo(0);
    setEstado("parado");
    aoFechar();
  }

  function escolher(item: ResultadoDaBusca) {
    if (item.id.startsWith("recente:")) {
      setTermo(item.titulo);
      setAtivo(0);
      campo.current?.focus();
      return;
    }
    if (limpo.length >= MINIMO_PARA_BUSCAR) guardar(JSON.stringify(lembrarBusca(recentes, limpo)));
    fechar();
    router.push(item.href);
  }

  function aoTeclar(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const prox = proximoIndice(indiceAtivo, lista.length, e.key === "ArrowDown" ? 1 : -1);
      setAtivo(Math.max(0, prox));
      document.getElementById(idDoItem(prox))?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      const item = lista[indiceAtivo];
      if (item) {
        e.preventDefault();
        escolher(item);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      fechar();
    }
  }

  if (!aberta || typeof document === "undefined") return null;

  let indice = 0;
  const renderItem = (item: ResultadoDaBusca) => {
    const i = indice++;
    const marcado = i === indiceAtivo;
    return (
      <li
        key={`${item.tipo}-${item.id}`}
        id={idDoItem(i)}
        role="option"
        aria-selected={marcado}
        onMouseMove={() => i !== indiceAtivo && setAtivo(i)}
        onClick={() => escolher(item)}
        className={cn(
          "flex min-h-12 cursor-pointer flex-col justify-center rounded-xl px-3 py-2 transition-colors",
          marcado ? "bg-acento-lavado" : "hover:bg-vidro",
        )}
      >
        <span className="text-fluid-sm text-titulo block truncate font-medium">{item.titulo}</span>
        {item.detalhe && <span className="text-fluid-xs text-apoio block truncate">{item.detalhe}</span>}
      </li>
    );
  };

  return createPortal(
    <div data-rota="painel" data-modulo={modulo ?? undefined} className="fixed inset-0 z-[70]">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Fechar busca"
        onClick={fechar}
        className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca rápida"
        onKeyDown={aoTeclar}
        className={cn(
          "bg-superficie border-linha absolute inset-x-0 top-0 flex max-h-[100dvh] flex-col border-b shadow-2xl",
          "pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]",
          "md:inset-x-auto md:top-[12vh] md:left-1/2 md:max-h-[70vh] md:w-[min(40rem,calc(100vw-4rem))] md:-translate-x-1/2 md:rounded-2xl md:border md:pt-0 md:pb-0",
        )}
      >
        <div className="border-linha flex items-center gap-2 border-b px-3 py-2">
          <svg viewBox="0 0 24 24" aria-hidden className="text-tenue ml-1 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <circle cx="11" cy="11" r="6.5" />
            <path d="M20 20l-4.2-4.2" />
          </svg>
          <input
            ref={campo}
            type="search"
            enterKeyHint="go"
            autoComplete="off"
            spellCheck={false}
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value);
              setAtivo(0);
              if (e.target.value.trim().length < MINIMO_PARA_BUSCAR) setEstado("parado");
            }}
            placeholder={temModulo(ramo, "catalogoDeImoveis") ? "Nome, telefone, imóvel ou tela" : "Nome, telefone ou tela"}
            role="combobox"
            aria-expanded={lista.length > 0}
            aria-controls={`${idBase}-lista`}
            aria-activedescendant={indiceAtivo >= 0 ? idDoItem(indiceAtivo) : undefined}
            aria-autocomplete="list"
            className="text-titulo placeholder:text-tenue min-h-12 w-full min-w-0 bg-transparent text-base outline-none"
          />
          <button
            type="button"
            onClick={fechar}
            className="border-linha text-apoio hover:text-titulo min-h-11 shrink-0 cursor-pointer rounded-full border px-3 text-sm md:border-0"
          >
            <span className="md:hidden">Cancelar</span>
            <kbd className="border-linha hidden rounded-md border px-1.5 py-0.5 font-sans text-[11px] md:inline">Esc</kbd>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-2 py-2">
          <ul id={`${idBase}-lista`} role="listbox" aria-label="Resultados" className="space-y-3">
            {itensDeRecente.length > 0 && (
              <li role="presentation">
                <p className="text-tenue px-3 pb-1 text-[11px] font-medium tracking-[0.12em] uppercase">Buscas recentes</p>
                <ul role="presentation" className="space-y-0.5">
                  {itensDeRecente.map(renderItem)}
                </ul>
              </li>
            )}
            {secoes.map((s) => (
              <li key={s.chave} role="presentation">
                <p className="text-tenue px-3 pb-1 text-[11px] font-medium tracking-[0.12em] uppercase">
                  {s.chave === "atalhos" ? (limpo ? "Telas e ações" : ROTULO.acao) : ROTULO[s.itens[0].tipo]}
                </p>
                <ul role="presentation" className="space-y-0.5">
                  {s.itens.map(renderItem)}
                </ul>
              </li>
            ))}
          </ul>

          <p aria-live="polite" className="text-fluid-sm text-apoio px-3 py-3">
            {estado === "buscando"
              ? "Buscando…"
              : estado === "erro"
                ? "Não deu para buscar agora. Confira a conexão e tente de novo."
                : vaiAoServidor && estado === "pronto" && lista.length === 0
                  ? `Nada encontrado para “${limpo}”.`
                  : !limpo
                    ? "Digite ao menos 2 letras para buscar leads, conversas e o catálogo."
                    : ""}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
