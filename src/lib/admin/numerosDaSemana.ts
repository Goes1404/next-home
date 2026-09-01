import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { pendenciasDoCatalogo } from "@/lib/imoveis/pendenciasDoCatalogo";
import type { NumerosDaSemana } from "./relatorioSemanal";

/**
 * Os números que o relatório semanal reporta, lidos do banco.
 *
 * Separado da composição (`relatorioSemanal.ts`, puro) pela mesma razão de
 * sempre nesta casa: a regra de negócio — o que é notícia e o que é
 * paisagem — merece teste, e teste não deve precisar de banco.
 *
 * Roda uma vez por semana, então pode ser generoso em consultas. Ainda
 * assim são poucas: duas views que já existem (0072 e 0075) e três
 * contagens.
 */
export async function coletarNumerosDaSemana(agora: Date = new Date()): Promise<NumerosDaSemana> {
  const supabase = createServiceClient();
  const umaSemanaAtras = new Date(agora.getTime() - 7 * 86_400_000).toISOString();

  const [instancias, funil, resposta, campanha, leadsNovos, imoveis] = await Promise.all([
    supabase
      .from("corretor_whatsapp_instancias")
      .select("status_conexao, desconectado_em"),
    supabase.from("whatsapp_funil_metricas").select("visitas_propostas, visitas_agendadas"),
    supabase
      .from("whatsapp_resposta_metricas")
      .select("conversas_com_fala_do_cliente, conversas_atendidas, mediana_segundos"),
    supabase.from("whatsapp_campanhas_fila").select("status"),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .gte("created_at", umaSemanaAtras)
      .is("arquivado_em", null),
    /*
     * O catálogo com o que a pendência precisa. É a MESMA função pura que a
     * tela de Imóveis usa — duas contas do "o que falta" divergiriam, e a
     * que o gestor lê no e-mail tem de ser a que ele vê na tela.
     */
    supabase
      .from("empreendimentos")
      .select("slug, nome, nomes_alternativos, midias(tipo), tipologias(id)")
      .eq("publicado", true),
  ]);

  const linhas = instancias.data ?? [];
  /*
   * "No ar" é: existe instância E nenhuma delas está desconectada. Com um
   * corretor pareado, isso é a linha dele. `null` quando não há instância
   * nenhuma — que não é queda, é ausência de configuração.
   */
  const numeroNoAr =
    linhas.length === 0 ? null : linhas.some((i) => i.status_conexao === "conectado");

  const caiuEm = linhas
    .map((i) => i.desconectado_em)
    .filter((d): d is string => Boolean(d))
    .sort()[0];

  const diasForaDoAr =
    numeroNoAr === false && caiuEm
      ? Math.floor((agora.getTime() - new Date(caiuEm).getTime()) / 86_400_000)
      : null;

  const somar = <T,>(linhas: T[] | null, campo: (l: T) => number | null) =>
    (linhas ?? []).reduce((s, l) => s + (campo(l) ?? 0), 0);

  const fila = campanha.data ?? [];

  const publicados = (imoveis.data ?? []).map((e) => ({
    slug: e.slug,
    nome: e.nome,
    nomesAlternativos: e.nomes_alternativos ?? [],
    plantas: (e.midias ?? []).filter((m) => m.tipo === "planta"),
    tipologias: e.tipologias ?? [],
  }));

  return {
    numeroNoAr,
    diasForaDoAr,
    conversasComFalaDoCliente: somar(resposta.data, (l) => l.conversas_com_fala_do_cliente),
    conversasAtendidasPelaIa: somar(resposta.data, (l) => l.conversas_atendidas),
    // A MAIOR das medianas: mediana de medianas não é mediana, e a leitura
    // conservadora é "o pior tempo da equipe".
    medianaSegundos:
      (resposta.data ?? []).reduce<number | null>(
        (pior, l) => Math.max(pior ?? 0, l.mediana_segundos ?? 0) || null,
        null,
      ) ?? null,
    visitasPropostas: somar(funil.data, (l) => l.visitas_propostas),
    visitasMarcadas: somar(funil.data, (l) => l.visitas_agendadas),
    campanhaEntregues: fila.filter((f) => f.status === "enviado" || f.status === "respondido")
      .length,
    campanhaRespostas: fila.filter((f) => f.status === "respondido").length,
    imoveisPublicados: publicados.length,
    imoveisComCadastroIncompleto: pendenciasDoCatalogo(publicados).length,
    leadsNovosNaSemana: leadsNovos.count ?? 0,
  };
}
