"use client";

import { useEffect, useRef, useState } from "react";

export type EstadoDoSalvamento = "salvo" | "esperando" | "salvando" | "erro";

/**
 * Salva sozinho, pouco depois da última mudança.
 *
 * A espera (padrão 900ms) não é enfeite. Arrumar uma lista são várias trocas
 * seguidas, e gravar cada uma seria uma ida ao banco e o cache do site
 * derrubado por troca. Com a espera, dez setas seguidas viram UMA gravação.
 * Enquanto `pausado` for verdadeiro (dedo arrastando), nada é gravado: a
 * lista muda a cada quadro e só o lugar onde o item foi solto interessa.
 *
 * `chave` descreve o estado da tela e `chaveSalva` o que o banco tem. Quando
 * elas diferem há o que salvar. `salvar` recebe o instante em que foi chamado
 * e devolve se deu certo. Se a pessoa mexeu DURANTE a gravação, as chaves
 * continuam diferentes quando ela termina e o ciclo roda de novo. Nada se
 * perde.
 *
 * Em falha, NÃO tenta de novo sozinho: um erro de permissão repetido a cada
 * segundo não é persistência, é barulho. A tela oferece "Tentar de novo".
 */
export function useSalvarSozinho({
  chave,
  chaveSalva,
  pausado = false,
  salvar,
  espera = 900,
}: {
  chave: string;
  chaveSalva: string;
  pausado?: boolean;
  salvar: () => Promise<boolean>;
  espera?: number;
}) {
  const [estado, setEstado] = useState<EstadoDoSalvamento>("salvo");
  const [falhouEm, setFalhouEm] = useState<string | null>(null);
  const salvando = useRef(false);
  const salvarRef = useRef(salvar);
  useEffect(() => {
    salvarRef.current = salvar;
  }, [salvar]);

  const pendente = chave !== chaveSalva;

  useEffect(() => {
    if (!pendente || pausado || salvando.current || falhouEm === chave) return;
    const t = setTimeout(async () => {
      salvando.current = true;
      setEstado("salvando");
      const ok = await salvarRef.current().catch(() => false);
      salvando.current = false;
      if (ok) {
        setFalhouEm(null);
        setEstado("salvo");
      } else {
        setFalhouEm(chave);
        setEstado("erro");
      }
    }, espera);
    return () => clearTimeout(t);
  }, [chave, pendente, pausado, espera, falhouEm]);

  // Fechar a aba com mudança ainda não gravada pede confirmação ao navegador.
  useEffect(() => {
    if (!pendente) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [pendente]);

  const exibido: EstadoDoSalvamento =
    estado === "salvando"
      ? "salvando"
      : estado === "erro" && falhouEm === chave
        ? "erro"
        : pendente
          ? "esperando"
          : "salvo";

  return {
    estado: exibido,
    tentarDeNovo: () => setFalhouEm(null),
  };
}

/** A frase de cada estado, igual nas duas telas. */
export const TEXTO_DO_SALVAMENTO: Record<EstadoDoSalvamento, string> = {
  salvo: "Tudo salvo — o site já mostra esta ordem.",
  esperando: "Mudança feita, salvando em instantes…",
  salvando: "Salvando…",
  erro: "Não consegui salvar a ordem.",
};
