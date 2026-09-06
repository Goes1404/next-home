"use server";

import { getPaginaDePessoas, type PessoaNaLista } from "@/lib/crm/pessoas";

/**
 * A próxima página da lista.
 *
 * O filtro vindo do cliente não precisa ser confiável: quem recorta por
 * corretor é a RLS, no banco. O pior que uma busca forjada consegue é
 * devolver as pessoas do próprio corretor em outra ordem.
 */
export async function carregarMaisPessoas(busca: string, pagina: number): Promise<PessoaNaLista[]> {
  const { pessoas } = await getPaginaDePessoas({ busca: busca || undefined }, pagina);
  return pessoas;
}
