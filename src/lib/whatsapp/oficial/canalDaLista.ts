import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { PapelCorretor } from "@/lib/corretorSessao";
import { leadsComConsentimento } from "./consentimento";
import { botoesDoBanco, type BotaoDoModelo } from "./modelos";
import { numeroDoGrupo, tokenDoNumero } from "./numeros";
import { tarifaEmReais } from "./tarifas";

/**
 * O que o assistente da lista precisa saber do número oficial, para o
 * corretor logado. As tabelas do número oficial são só do servidor (0256):
 * quem lê é a chave de serviço, sempre com o grupo do corretor como filtro
 * explícito (a régua de `central-le-sem-sessao-e-sem-rls`). Quem decide se
 * o corretor PODE é a sessão, antes de chamar daqui.
 */

export type ModeloParaLista = {
  id: string;
  nome: string;
  corpo: string;
  cabecalho: "nenhum" | "imagem" | "texto";
  cabecalhoTexto: string | null;
  rodape: string | null;
  botoes: BotaoDoModelo[];
};

export type CanalOficial =
  | {
      disponivel: true;
      numeroId: string;
      numero: string | null;
      nomeExibicao: string | null;
      modelos: ModeloParaLista[];
      /** R$ por mensagem de marketing entregue (estimativa, ver tarifas.ts). */
      tarifa: number;
      /** Quantas mensagens ainda cabem no teto do mês; nulo = sem teto. */
      tetoRestante: number | null;
    }
  | { disponivel: false; motivo: string; modelos: [] };

export async function canalOficialDoCorretor(corretor: {
  id: string;
  grupoId: string;
  papel: PapelCorretor;
}): Promise<CanalOficial> {
  const supabase = createServiceClient();
  const numero = await numeroDoGrupo(supabase, corretor.grupoId);
  const indisponivel = (motivo: string): CanalOficial => ({ disponivel: false, motivo, modelos: [] });

  if (!numero) return indisponivel("A imobiliária ainda não tem número oficial do WhatsApp conectado.");
  if (numero.estado !== "ativo") {
    return indisponivel(`O número oficial está pausado: ${numero.motivo_estado ?? "fale com o gestor"}.`);
  }
  if (!numero.liberado_para_corretores && corretor.papel !== "gestor") {
    return indisponivel("O gestor ainda não liberou o número oficial para as listas dos corretores.");
  }
  if ("erro" in tokenDoNumero(numero)) {
    return indisponivel("O número oficial está sem acesso à Meta. Fale com o gestor.");
  }

  const { data: modelos } = await supabase
    .from("whatsapp_modelos_oficiais")
    .select("id, nome, corpo, cabecalho, cabecalho_texto, rodape, botoes")
    .eq("grupo_id", corretor.grupoId)
    .eq("numero_oficial_id", numero.id)
    .eq("estado", "aprovado")
    .order("atualizado_em", { ascending: false });

  let tetoRestante: number | null = null;
  if (numero.teto_mensal !== null) {
    const usado = await usadoNoMes(supabase, numero.id);
    tetoRestante = Math.max(0, numero.teto_mensal - usado);
  }

  return {
    disponivel: true,
    numeroId: numero.id,
    numero: numero.numero,
    nomeExibicao: numero.nome_exibicao,
    modelos: (modelos ?? []).map((m) => ({
      id: m.id,
      nome: m.nome,
      corpo: m.corpo,
      cabecalho: m.cabecalho,
      cabecalhoTexto: m.cabecalho_texto,
      rodape: m.rodape,
      botoes: botoesDoBanco(m.botoes),
    })),
    tarifa: tarifaEmReais("marketing"),
    tetoRestante,
  };
}

/**
 * O que já saiu no mês MAIS o que está na fila das listas em andamento: a
 * lista nova só cabe no que sobra disso, senão o teto estouraria no meio de
 * uma lista já aceita.
 */
async function usadoNoMes(supabase: ReturnType<typeof createServiceClient>, numeroId: string): Promise<number> {
  const { data: listas } = await supabase.from("whatsapp_campanhas").select("id, status").eq("numero_oficial_id", numeroId);
  const todas = (listas ?? []).map((l) => l.id);
  if (todas.length === 0) return 0;
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const inicioDoMes = new Date(Date.UTC(sp.getFullYear(), sp.getMonth(), 1, 3, 0, 0)).toISOString();
  const [{ count: saiu }, { count: naFila }] = await Promise.all([
    supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .in("campanha_id", todas)
      .not("wamid", "is", null)
      .gte("enviado_em", inicioDoMes),
    supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .in(
        "campanha_id",
        (listas ?? []).filter((l) => l.status === "em_andamento" || l.status === "pausada").map((l) => l.id),
      )
      .eq("status", "pendente"),
  ]);
  return (saiu ?? 0) + (naFila ?? 0);
}

/**
 * Dos leads dados (já recortados pela sessão do corretor), os que têm
 * consentimento de marketing no WhatsApp. Os ids chegam da sessão, mas o
 * filtro pelo grupo vai junto: defesa contra id de outro grupo. `null` =
 * não deu para ler (falha fechada: ninguém entra).
 */
export async function consentidosDentre(leadIds: string[], grupoId: string): Promise<Set<string> | null> {
  if (leadIds.length === 0) return new Set();
  const supabase = createServiceClient();
  const doGrupo = new Set<string>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data, error } = await supabase
      .from("leads")
      .select("id")
      .eq("grupo_id", grupoId)
      .in("id", leadIds.slice(i, i + 200));
    if (error) return null;
    for (const l of data ?? []) doGrupo.add(l.id);
  }
  return leadsComConsentimento(supabase, [...doGrupo]);
}
