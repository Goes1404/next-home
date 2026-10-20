import "server-only";

import type { LeituraDoGrupo } from "@/lib/admin/numerosDaEquipe";
import { idsDeContasOcultas, semContasOcultas } from "@/lib/corretores/contaOculta";
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
 *
 * Os números são de UM grupo: quem chama passa a leitura recortada
 * (`leituraDoGrupo`), e não existe caminho aqui para somar a plataforma
 * inteira (L18). O relatório roda um laço de grupos.
 */
export async function coletarNumerosDaSemana(
  grupo: LeituraDoGrupo,
  agora: Date = new Date(),
): Promise<NumerosDaSemana> {
  const umaSemanaAtras = new Date(agora.getTime() - 7 * 86_400_000).toISOString();

  const [instancias, funil, resposta, campanha, leadsNovos, imoveis] = await Promise.all([
    grupo.ler((c) => c.from("corretor_whatsapp_instancias").select("corretor_id, status_conexao, desconectado_em")),
    grupo.lerView((c) => c.from("whatsapp_funil_metricas").select("corretor_id, visitas_propostas, visitas_agendadas")),
    grupo.lerView((c) =>
      c
        .from("whatsapp_resposta_metricas")
        .select("corretor_id, conversas_com_fala_do_cliente, conversas_atendidas, mediana_segundos"),
    ),
    grupo.ler((c) => c.from("whatsapp_campanhas_fila").select("status")),
    grupo
      .ler((c) => c.from("leads").select("id", { count: "exact", head: true }))
      .gte("created_at", umaSemanaAtras)
      .is("arquivado_em", null),
    /*
     * O catálogo com o que a pendência precisa. É a MESMA função pura que a
     * tela de Imóveis usa — duas contas do "o que falta" divergiriam, e a
     * que o gestor lê no e-mail tem de ser a que ele vê na tela.
     */
    grupo
      .ler((c) => c.from("empreendimentos").select("slug, nome, nomes_alternativos, midias(tipo), tipologias(id)"))
      .eq("publicado", true),
  ]);

  // Conta oculta (0189) fora do relatório da equipe: a chave de serviço não
  // passa pela RLS, então o recorte é aqui (lido no grupo do relatório).
  const ocultas = await idsDeContasOcultas(grupo);
  const linhas = semContasOcultas(instancias.data ?? [], ocultas, (i) => i.corretor_id);
  const respostaVisivel = semContasOcultas(resposta.data ?? [], ocultas, (l) => l.corretor_id);
  const funilVisivel = semContasOcultas(funil.data ?? [], ocultas, (l) => l.corretor_id);
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
    conversasComFalaDoCliente: somar(respostaVisivel, (l) => l.conversas_com_fala_do_cliente),
    conversasAtendidasPelaIa: somar(respostaVisivel, (l) => l.conversas_atendidas),
    // A MAIOR das medianas: mediana de medianas não é mediana, e a leitura
    // conservadora é "o pior tempo da equipe".
    medianaSegundos:
      respostaVisivel.reduce<number | null>(
        (pior, l) => Math.max(pior ?? 0, l.mediana_segundos ?? 0) || null,
        null,
      ) ?? null,
    visitasPropostas: somar(funilVisivel, (l) => l.visitas_propostas),
    visitasMarcadas: somar(funilVisivel, (l) => l.visitas_agendadas),
    campanhaEntregues: fila.filter((f) => f.status === "enviado" || f.status === "respondido")
      .length,
    campanhaRespostas: fila.filter((f) => f.status === "respondido").length,
    imoveisPublicados: publicados.length,
    imoveisComCadastroIncompleto: pendenciasDoCatalogo(publicados).length,
    leadsNovosNaSemana: leadsNovos.count ?? 0,
  };
}
