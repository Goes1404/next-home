import "server-only";

import { clienteParaNumerosDaEquipe } from "@/lib/admin/numerosDaEquipe";

/**
 * Os horários da primeira resposta da equipe, para a tela de Desempenho do
 * ADM. Saiu de `dados.ts` porque é a única leitura do Financeiro feita pela
 * chave de serviço: separada, a guarda `servicoComGrupo.test.ts` cobra o
 * recorte do grupo aqui sem misturar com as leituras pela sessão.
 */

const TETO = 5000;

export type PrimeiraRespostaLida = {
  corretorId: string;
  primeiraFalaCliente: string;
  primeiraRespostaCorretor: string | null;
  primeiraRespostaIa: string | null;
};

export async function getPrimeirasRespostas(desde: string): Promise<PrimeiraRespostaLida[]> {
  // Só horários, e só para o ADM (a tela de Desempenho é dele). A RLS da
  // 0134 recortaria a view para as conversas do próprio ADM; a leitura sai
  // recortada pelo grupo dele.
  const equipe = await clienteParaNumerosDaEquipe();
  const { data, error } = await equipe
    .lerView((c) =>
      c
        .from("whatsapp_primeira_resposta")
        .select("corretor_id, primeira_fala_cliente, primeira_resposta_corretor, primeira_resposta_ia"),
    )
    .gte("primeira_fala_cliente", desde)
    .limit(TETO);
  if (error) return [];
  return (data ?? []).map((r) => ({
    corretorId: r.corretor_id,
    primeiraFalaCliente: r.primeira_fala_cliente,
    primeiraRespostaCorretor: r.primeira_resposta_corretor,
    primeiraRespostaIa: r.primeira_resposta_ia,
  }));
}
