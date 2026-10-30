import "server-only";

import { formatarTelefoneBr, normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { LIMITE_POR_IMPORTACAO } from "@/lib/leads/importacao";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * A planilha de clientes mandada ao número central (onda 2, capacidade 29):
 * o "sim" cadastra pelas mesmas regras do botão Importar do painel
 * (`importar/actions.ts`, `importarLeads`), sem a sessão.
 *
 * Mora no domínio pela mesma razão de `leadPeloCentral.ts`: o central não
 * escreve em `leads`. Duas diferenças de propósito em relação ao painel:
 *
 * - "Já existe" é no GRUPO inteiro, e não na carteira que a RLS mostra ao
 *   corretor: é a regra do cadastro pelo central (spec 3.1, lead de outro
 *   corretor não duplica). No painel o corretor comum só compara com os
 *   dele, e o mesmo cliente pode nascer duas vezes na imobiliária.
 * - Sem "distribuir na equipe": tudo entra na carteira de quem mandou,
 *   como no painel para o corretor comum.
 */

type Supa = ReturnType<typeof createServiceClient>;

export type LinhaParaImportar = {
  nome: string;
  telefone: string;
  email: string | null;
  mensagem: string | null;
  imovelInteresse: string | null;
};

/** Os telefones (E.164) que já são lead no grupo, arquivados inclusive: arquivado também é a mesma pessoa. */
export async function telefonesJaNoGrupo(supabase: Supa, grupoId: string, chaves: string[]): Promise<Set<string> | null> {
  const unicas = [...new Set(chaves.filter(Boolean))];
  const achados = new Set<string>();
  // Em pedaços: 300 telefones num `in` só passam do tamanho de URL do PostgREST.
  for (let i = 0; i < unicas.length; i += 100) {
    const { data, error } = await supabase
      .from("leads")
      .select("telefone_e164")
      .eq("grupo_id", grupoId)
      .in("telefone_e164", unicas.slice(i, i + 100));
    if (error) {
      console.error("[central] falha ao conferir telefones da planilha:", error.message);
      return null;
    }
    for (const l of data ?? []) if (l.telefone_e164) achados.add(l.telefone_e164);
  }
  return achados;
}

export type ImportacaoPeloCentral =
  | { ok: true; ids: string[]; repetidos: number; falhas: number }
  | { ok: false; erro: string };

/**
 * Cadastra as linhas na carteira de `corretorId`. Confere a duplicidade DE
 * NOVO (entre a proposta e o "sim" cabe 1 hora, e a mesma planilha pode ter
 * sido importada pelo painel nesse meio-tempo). Em lotes de 50, como o
 * painel: um insert de 300 que falha na última linha perderia as 299.
 *
 * `consentimento_lgpd: true` como no painel: lá é a caixa "tenho autorização
 * para tratar estes dados"; aqui é o "sim" à proposta, que diz o mesmo.
 */
export async function importarLeadsPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; linhas: LinhaParaImportar[] },
): Promise<ImportacaoPeloCentral> {
  const validas = p.linhas
    .slice(0, LIMITE_POR_IMPORTACAO)
    .map((l) => ({ ...l, chave: normalizarTelefoneBrasileiro(l.telefone) }))
    .filter((l): l is typeof l & { chave: string } => Boolean(l.chave));
  const ja = await telefonesJaNoGrupo(
    supabase,
    p.grupoId,
    validas.map((l) => l.chave),
  );
  if (!ja) return { ok: false, erro: "Não consegui conferir quem já está cadastrado. Tente de novo em instantes." };
  const vistos = new Set<string>();
  const novas = validas.filter((l) => {
    if (ja.has(l.chave) || vistos.has(l.chave)) return false;
    vistos.add(l.chave);
    return true;
  });

  const ids: string[] = [];
  let falhas = 0;
  for (let i = 0; i < novas.length; i += 50) {
    const lote = novas.slice(i, i + 50).map((l) => ({
      nome: l.nome.trim().slice(0, 120) || "Contato sem nome",
      telefone: formatarTelefoneBr(l.telefone).slice(0, 40),
      email: l.email?.trim().slice(0, 160) || null,
      mensagem: l.mensagem?.trim().slice(0, 2000) || null,
      anuncio_origem: l.imovelInteresse?.trim().slice(0, 160) || null,
      grupo_id: p.grupoId,
      // Preenchido: vazio, o gatilho de distribuição sortearia outro dono.
      corretor_id: p.corretorId,
      origem_atribuicao: "manual",
      tipo: "comprador",
      origem: "painel/importacao",
      consentimento_lgpd: true,
    }));
    const { data, error } = await supabase.from("leads").insert(lote).select("id");
    if (error) {
      console.error("[central] lote da planilha recusado:", error.message);
      falhas += lote.length;
      continue;
    }
    for (const l of data ?? []) ids.push(l.id);
  }
  return { ok: true, ids, repetidos: validas.length - novas.length, falhas };
}

/**
 * O "desfaz" da importação (spec 4.6): os cadastrados por ELA voltam
 * arquivados, não apagados, como o desfaz do cadastro avulso
 * (`arquivarLeadCadastradoPeloCentral`). Só os que continuam na carteira de
 * quem importou: o que a gestão já repassou é de outra pessoa.
 */
export async function arquivarLeadsImportadosPeloCentral(
  supabase: Supa,
  p: { grupoId: string; corretorId: string; leadIds: string[] },
): Promise<{ ok: boolean; arquivados: number }> {
  let arquivados = 0;
  for (let i = 0; i < p.leadIds.length; i += 100) {
    const { data, error } = await supabase
      .from("leads")
      .update({ arquivado_em: new Date().toISOString(), arquivado_motivo: null })
      .in("id", p.leadIds.slice(i, i + 100))
      .eq("grupo_id", p.grupoId)
      .eq("corretor_id", p.corretorId)
      .is("arquivado_em", null)
      .select("id");
    if (error) {
      console.error("[central] falha ao arquivar a importação desfeita:", error.message);
      return { ok: false, arquivados };
    }
    arquivados += data?.length ?? 0;
  }
  return { ok: true, arquivados };
}
