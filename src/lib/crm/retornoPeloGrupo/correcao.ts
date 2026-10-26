import "server-only";

import type { Json } from "@/lib/supabase/types";
import type { Banco } from "./situacao";

/** Corrente de correções mais longa que isto é defeito (laço), não uso real. */
const TETO_DA_CADEIA = 20;

type Elo = { id: string; texto: string | null; leitura: Json | null; corrige_id: string | null; status: string };

const COLUNAS = "id, texto, leitura, corrige_id, status";

/**
 * A correção vale sobre o ÚLTIMO retorno da cadeia (spec 6.5), cite o
 * corretor a confirmação original ou uma posterior. Corrigir em cima de um
 * elo antigo desfaria de novo o que a correção seguinte já desfez (tentativa
 * contada duas vezes, retorno que não sai), e o relato perderia o meio.
 *
 * Devolve o último elo aplicado e o relato inteiro: o original e cada
 * correção, na ordem.
 */
export async function cadeiaDaCorrecao(
  supabase: Banco,
  grupoId: string,
  corretorId: string,
  citadoId: string,
): Promise<{ ultimo: Elo; relato: string } | null> {
  const ler = (id: string) =>
    supabase
      .from("retornos_de_ligacao")
      .select(COLUNAS)
      .eq("id", id)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .maybeSingle();

  const { data: citado, error } = await ler(citadoId);
  if (error) throw new Error(`retorno corrigido: ${error.message}`);
  if (!citado) return null;

  // Sobe até o relato original.
  let raiz: Elo = citado;
  for (let i = 0; raiz.corrige_id && i < TETO_DA_CADEIA; i++) {
    const { data: pai, error: erroPai } = await ler(raiz.corrige_id);
    if (erroPai) throw new Error(`retorno corrigido: ${erroPai.message}`);
    if (!pai) break;
    raiz = pai;
  }

  // Desce pelas correções que chegaram a ser gravadas na ficha.
  const cadeia: Elo[] = [raiz];
  for (let i = 0; i < TETO_DA_CADEIA; i++) {
    const { data: filhos, error: erroFilhos } = await supabase
      .from("retornos_de_ligacao")
      .select(COLUNAS)
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .eq("corrige_id", cadeia[cadeia.length - 1].id)
      .in("status", ["aplicado", "sem_leitura"])
      .order("created_at", { ascending: true });
    if (erroFilhos) throw new Error(`correções do retorno: ${erroFilhos.message}`);
    const proximo = filhos?.[filhos.length - 1];
    if (!proximo || cadeia.some((e) => e.id === proximo.id)) break;
    cadeia.push(proximo);
  }

  const [original, ...correcoes] = cadeia;
  const relato = [original.texto ?? "", ...correcoes.map((c) => `Correção do corretor: ${c.texto ?? ""}`)].join("\n");
  return { ultimo: cadeia[cadeia.length - 1], relato };
}
