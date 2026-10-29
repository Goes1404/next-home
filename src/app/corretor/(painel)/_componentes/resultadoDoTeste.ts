/**
 * O texto da notificação de teste e a frase que volta para a tela
 * (29/10/2026). Fora do arquivo `"use server"`, que só pode exportar ações.
 */

export type ResultadoDoTeste = { ok?: string; erro?: string };

export const NOTIFICACAO_DE_TESTE = {
  titulo: "Notificação de teste",
  corpo: "Se você está vendo isto, os avisos estão chegando neste aparelho.",
  url: "/corretor/perfil",
  tag: "teste",
} as const;

export function resultadoDoTeste(entregues: number): ResultadoDoTeste {
  if (entregues <= 0) {
    return {
      erro: "Nenhum aparelho recebeu. Recarregue a página, ligue os avisos neste celular e tente de novo.",
    };
  }
  return {
    ok: entregues === 1 ? "Enviada. Deve chegar em alguns segundos." : `Enviada para ${entregues} aparelhos.`,
  };
}
