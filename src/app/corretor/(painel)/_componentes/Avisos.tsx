"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/**
 * O retorno visual de uma ação — o que o painel não tinha.
 *
 * Antes daqui, o feedback de ~30 componentes era `useTransition` mais um
 * `useState<string | null>(erro)` desenhado à mão, e o SUCESSO quase nunca
 * aparecia: a ação rodava, a tela dava `router.refresh()` e nada dizia que
 * deu certo. Numa lista de trinta leads em que uma linha mudou de etapa, "não
 * aconteceu nada" e "aconteceu e você não viu" são indistinguíveis.
 *
 * Duas regras que valem para não virar ruído — as mesmas que este projeto já
 * aplicou ao aviso de evolução da conversa e à faixa de queda do número:
 *
 * 1. Sucesso só é anunciado quando o resultado NÃO está visível. Arrastar um
 *    cartão de coluna já se vê; salvar uma senha, não.
 * 2. Erro nunca some sozinho. Aviso que desaparece antes de ser lido é o
 *    mesmo que aviso nenhum, e erro costuma chegar quando a pessoa já olhou
 *    para outro lugar.
 */

export type Aviso = { id: number; texto: string; tipo: "ok" | "erro" };

type Contexto = {
  avisar: (texto: string, tipo?: Aviso["tipo"]) => void;
  falhar: (texto: string) => void;
};

const ContextoAvisos = createContext<Contexto | null>(null);

/** Quanto um sucesso fica na tela. Erro não usa isto: erro fica. */
const DURACAO_MS = 4000;

export function ProvedorDeAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const proximoId = useRef(0);

  const avisar = useCallback((texto: string, tipo: Aviso["tipo"] = "ok") => {
    setAvisos((atuais) => [...atuais, { id: proximoId.current++, texto, tipo }]);
  }, []);

  const falhar = useCallback((texto: string) => avisar(texto, "erro"), [avisar]);

  return (
    <ContextoAvisos.Provider value={{ avisar, falhar }}>
      {children}
      <RegiaoDeAvisos avisos={avisos} aoFechar={(id) => setAvisos((a) => a.filter((x) => x.id !== id))} />
    </ContextoAvisos.Provider>
  );
}

/**
 * Fora do provedor o hook não explode: devolve funções que não fazem nada.
 *
 * É de propósito. Um componente do painel pode ser renderizado por um teste,
 * pelo Storybook de ninguém ou por uma rota que ainda não tem o provedor, e
 * derrubar a tela inteira porque um aviso não tinha para onde ir seria trocar
 * um retorno visual por um erro de verdade.
 */
export function useAvisos(): Contexto {
  return useContext(ContextoAvisos) ?? { avisar: () => {}, falhar: () => {} };
}

function RegiaoDeAvisos({ avisos, aoFechar }: { avisos: Aviso[]; aoFechar: (id: number) => void }) {
  return (
    <div
      // `pointer-events-none` no contêiner e `auto` em cada aviso: a faixa
      // cobre a largura da tela e não pode roubar o toque de quem está
      // usando o que está embaixo dela.
      className="acima-da-nav pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-4 pb-4"
    >
      {avisos.map((aviso) => (
        <CartaoAviso key={aviso.id} aviso={aviso} aoFechar={() => aoFechar(aviso.id)} />
      ))}
    </div>
  );
}

const ESTILO: Record<Aviso["tipo"], string> = {
  ok: "border-ok-linha bg-ok-lavado text-ok",
  erro: "border-perigo-linha bg-perigo-lavado text-perigo",
};

function CartaoAviso({ aviso, aoFechar }: { aviso: Aviso; aoFechar: () => void }) {
  useEffect(() => {
    // Erro fica até alguém fechar; sucesso sai sozinho.
    if (aviso.tipo === "erro") return;
    const t = setTimeout(aoFechar, DURACAO_MS);
    return () => clearTimeout(t);
  }, [aviso.tipo, aoFechar]);

  return (
    <div
      // `alert` interrompe o leitor de tela, `status` espera a vez. Erro
      // merece interromper; confirmação de que deu certo, não.
      role={aviso.tipo === "erro" ? "alert" : "status"}
      className={`bg-superficie shadow-painel-alto text-fluid-sm pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 ${ESTILO[aviso.tipo]}`}
    >
      <span className="flex-1 text-pretty">{aviso.texto}</span>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar aviso"
        className="shrink-0 cursor-pointer opacity-70 transition-opacity hover:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
