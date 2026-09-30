"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Os contadores do menu, lidos no navegador a cada troca de tela
 * (30/09/2026). Voltam o que as abas mostravam antes de a caixa de abas sair
 * (29/09): visitas de hoje, respostas da IA sem 👍/👎, mensagens na fila de
 * disparo e o ponto de "número no ar".
 *
 * Um armazém só no módulo, para o menu lateral e a gaveta do celular
 * mostrarem o MESMO número com UMA ida ao servidor por navegação. Pedido que
 * falha deixa o último número bom na tela: sumir com o contador por uma
 * piscada de rede ensinaria que ele não é confiável.
 */

type Contadores = {
  visitasHoje: number;
  semRevisao: number;
  naFila: number;
  conectado: boolean | null;
};

let atual: Contadores | null = null;
let pedidoDaRota: string | null = null;
const ouvintes = new Set<() => void>();

function avisar() {
  for (const ouvir of ouvintes) ouvir();
}

function buscar(rota: string) {
  if (pedidoDaRota === rota) return;
  pedidoDaRota = rota;
  fetch("/api/painel/contadores", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((dados: Contadores | null) => {
      if (!dados) return;
      atual = dados;
      avisar();
    })
    .catch(() => {
      // Falha de rede: fica o último número conhecido. Libera a rota para
      // a próxima tentativa na mesma tela.
      pedidoDaRota = null;
    });
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  return () => ouvintes.delete(ouvir);
}

/** Número e ponto por href de subtópico. Número só quando é maior que zero. */
export type MarcaDoMenu = { numero?: number; ponto?: "ok" | "perigo" };

export function marcasDosContadores(c: Contadores | null): Record<string, MarcaDoMenu> {
  if (!c) return {};
  const marcas: Record<string, MarcaDoMenu> = {};
  // Contador que vive em zero ensina a ignorar o contador: só aparece com algo.
  if (c.visitasHoje > 0) marcas["/corretor/visitas"] = { numero: c.visitasHoje };
  if (c.semRevisao > 0) marcas["/corretor/conversas"] = { numero: c.semRevisao };
  if (c.naFila > 0) marcas["/corretor/campanhas"] = { numero: c.naFila };
  // Sem instância, nenhum ponto: pintar de vermelho um estado que ninguém
  // configurou seria inventar um problema.
  if (c.conectado !== null) marcas["/corretor/whatsapp"] = { ponto: c.conectado ? "ok" : "perigo" };
  return marcas;
}

export function useContadoresDoMenu(): Record<string, MarcaDoMenu> {
  const rota = usePathname();
  useEffect(() => {
    if (rota) buscar(rota);
  }, [rota]);
  const dados = useSyncExternalStore(
    assinar,
    () => atual,
    () => null,
  );
  return marcasDosContadores(dados);
}
