import "server-only";

import type { LeituraDoGrupo } from "@/lib/admin/numerosDaEquipe";
import { idsDeContasOcultas } from "@/lib/corretores/contaOculta";
import { visitaConta } from "@/lib/financeiro/placarDaEquipe";
import { semanasDoResumo, type SemanaDoGrupo } from "./resumoSemanalNoWhatsapp";

/**
 * Os números do resumo semanal no WhatsApp (0246), de UM grupo, lidos pela
 * leitura recortada (`leituraDoGrupo`): não há caminho aqui para somar a
 * plataforma (L18). A semana e a anterior saem na mesma leitura.
 *
 * "Parado" é a régua da roleta por desempenho (`leads_parados_do_corretor`,
 * 0246): quem chama passa a contagem, que é uma função do banco. Sem a 0246,
 * a contagem devolve `null` e a linha dos parados some do texto (o resto
 * sai igual).
 */
export async function coletarSemanaDoGrupo(
  grupo: LeituraDoGrupo,
  hoje: string,
  contarParados: (corretorId: string) => Promise<number | null>,
  agora: Date = new Date(),
): Promise<SemanaDoGrupo> {
  const { semana, anterior } = semanasDoResumo(hoje);
  const dataDe = (iso: string) => iso.slice(0, 10);

  const [leadsSemana, leadsAnterior, visitas, vendas, equipe] = await Promise.all([
    grupo
      .ler((c) => c.from("leads").select("id", { count: "exact", head: true }))
      .gte("created_at", semana.desde)
      .lt("created_at", semana.ate),
    grupo
      .ler((c) => c.from("leads").select("id", { count: "exact", head: true }))
      .gte("created_at", anterior.desde)
      .lt("created_at", anterior.ate),
    grupo
      .ler((c) => c.from("visitas").select("inicio, status"))
      .gte("inicio", anterior.desde)
      .lt("inicio", semana.ate)
      .limit(5000),
    grupo
      .ler((c) => c.from("vendas").select("valor_venda, data_venda"))
      .eq("status", "ativa")
      .gte("data_venda", dataDe(anterior.desde))
      .lt("data_venda", dataDe(semana.ate))
      .limit(5000),
    grupo.ler((c) => c.from("corretores").select("id, nome")).eq("ativo", true),
  ]);

  const naSemana = (iso: string) => Date.parse(iso) >= Date.parse(semana.desde);
  const visitasFeitas = (visitas.data ?? []).filter((v) => visitaConta(v, agora));
  const vendasDaSemana = (vendas.data ?? []).filter((v) => v.data_venda >= dataDe(semana.desde));

  // Conta oculta (0189) não é equipe: não aparece como "parada".
  const ocultas = await idsDeContasOcultas(grupo);
  const parados = (
    await Promise.all(
      (equipe.data ?? [])
        .filter((c) => !ocultas.has(c.id))
        .map(async (c) => ({ nome: c.nome.split(/\s+/)[0] ?? c.nome, quantos: await contarParados(c.id) })),
    )
  )
    .filter((c): c is { nome: string; quantos: number } => (c.quantos ?? 0) > 0)
    .sort((a, b) => b.quantos - a.quantos || a.nome.localeCompare(b.nome, "pt-BR"));

  return {
    de: semana.de,
    ate: semana.ateDia,
    leads: { semana: leadsSemana.count ?? 0, anterior: leadsAnterior.count ?? 0 },
    visitas: {
      semana: visitasFeitas.filter((v) => naSemana(v.inicio)).length,
      anterior: visitasFeitas.filter((v) => !naSemana(v.inicio)).length,
    },
    vendas: {
      semana: vendasDaSemana.length,
      anterior: (vendas.data ?? []).length - vendasDaSemana.length,
      vgvSemana: vendasDaSemana.reduce((s, v) => s + Number(v.valor_venda ?? 0), 0),
    },
    parados,
  };
}
