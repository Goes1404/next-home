import type { Metadata } from "next";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { diaEmSaoPaulo, lerDia, lerMes } from "@/lib/agenda/calendario";
import { lerItensDoDia, lerMarcadoresDoMes, lerProximasVisitas } from "@/lib/agenda/lerAgenda";
import type { DadosDoPreparo } from "@/lib/crm/preparoDaVisita";
import { MesCompacto } from "./_componentes/MesCompacto";
import { ListaDoDia } from "./_componentes/ListaDoDia";
import { CartaoDaVisita } from "./_componentes/CartaoDaVisita";
import { GradeDaSemana } from "./_componentes/GradeDaSemana";
import { AgendaNoCelular } from "./_componentes/AgendaNoCelular";

export const metadata: Metadata = { title: "Agenda" };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * A Agenda do corretor (27/10/2026, fase 1): substitui a tela de Visitas.
 *
 * O mês compacto em cima, a lista do dia escolhido embaixo (visitas, tarefas
 * da ficha e lembretes de anotação) e, quando o dia não tem visita, as
 * próximas — o que a tela de Visitas mostrava. A grade semanal, que é o que
 * a assistente lê para oferecer horário, fica em "Configurar horários".
 *
 * Só a agenda do próprio corretor nesta fase; a visão da equipe para o
 * gestor é a fase 2 (publicadas juntas).
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const agora = new Date();
  const mes = lerMes(um(params.mes), agora);
  const dia = lerDia(um(params.dia), mes, agora);
  const recorte = { corretorId: corretor.id, grupoId: corretor.grupoId };

  const [marcadores, itens, proximas] = await Promise.all([
    lerMarcadoresDoMes({ ...recorte, mes }),
    lerItensDoDia({ ...recorte, dia }),
    lerProximasVisitas({ ...recorte, agora, limite: 10 }),
  ]);
  const temVisitaNoDia = itens.some((i) => i.tipo === "visita");

  /*
   * O PREPARO da visita (o que o cliente procura, a objeção aberta), numa
   * consulta à parte e só para os leads que aparecem: engordar a leitura da
   * agenda cobraria a coluna em todo marcador do mês. `numeric` chega como
   * string no supabase-js: sem o `Number`, a moeda sai quebrada sem erro.
   */
  const ids = [
    ...new Set([
      ...itens.flatMap((i) => (i.tipo === "visita" ? [i.leadId] : [])),
      ...(temVisitaNoDia ? [] : proximas.map((v) => v.leadId)),
    ]),
  ];
  const supabase = await createClient();
  const [{ data: perfis }, { data: dossies }] = ids.length
    ? await Promise.all([
        supabase
          .from("leads")
          .select("id, regiao_interesse, dormitorios_min, orcamento_min, orcamento_max, renda_mensal")
          .in("id", ids),
        supabase.from("lead_observacoes_ia").select("lead_id, resumo_executivo, objecoes_identificadas").in("lead_id", ids),
      ])
    : [{ data: null }, { data: null }];
  const preparoPorLead = new Map<string, DadosDoPreparo>();
  for (const p of perfis ?? []) {
    preparoPorLead.set(p.id, {
      regiaoInteresse: p.regiao_interesse,
      dormitoriosMin: numero(p.dormitorios_min),
      orcamentoMin: numero(p.orcamento_min),
      orcamentoMax: numero(p.orcamento_max),
      rendaMensal: numero(p.renda_mensal),
    });
  }
  for (const d of dossies ?? []) {
    preparoPorLead.set(d.lead_id, {
      ...(preparoPorLead.get(d.lead_id) ?? {}),
      resumoExecutivo: d.resumo_executivo,
      objecoes: Array.isArray(d.objecoes_identificadas)
        ? d.objecoes_identificadas.filter((o): o is string => typeof o === "string")
        : null,
    });
  }

  // Configuração: o token do feed .ics (0126, tabela fechada ao painel) e a grade semanal.
  const { data: agenda } = await createServiceClient()
    .from("corretor_agenda")
    .select("token")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  const linkDaAgenda = agenda ? `${await lerEnderecoDoCliente(corretor.grupoId)}/api/agenda/${agenda.token}.ics` : null;
  const { data: grade } = await supabase
    .from("corretor_disponibilidade")
    .select("dia_semana, hora_inicio, hora_fim, horas_preferidas")
    .eq("corretor_id", corretor.id);

  return (
    <div>
      <CabecalhoDeTela secao="Leads" titulo="Agenda" descricao="Suas visitas, tarefas e lembretes, dia a dia." />

      <div className="mt-6 space-y-4">
        <MesCompacto mes={mes} diaSelecionado={dia} hoje={diaEmSaoPaulo(agora)} marcadores={marcadores} />
        <ListaDoDia itens={itens} preparoPorLead={preparoPorLead} />
      </div>

      {!temVisitaNoDia && proximas.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-titulo">Próximas visitas</h2>
          <div className="mt-3 space-y-4">
            {proximas.map((visita) => (
              <CartaoDaVisita key={visita.id} visita={visita} preparo={preparoPorLead.get(visita.leadId) ?? {}} comDia />
            ))}
          </div>
        </section>
      )}

      <details className="cartao mt-8 p-5">
        <summary className="min-h-11 cursor-pointer font-medium text-titulo">Configurar horários</summary>
        <div className="mt-4 space-y-4">
          <AgendaNoCelular link={linkDaAgenda} />
          <GradeDaSemana
            inicial={(grade ?? []).map((f) => ({
              diaSemana: f.dia_semana,
              horaInicio: f.hora_inicio,
              horaFim: f.hora_fim,
              horasPreferidas: f.horas_preferidas ?? [],
            }))}
          />
        </div>
      </details>
    </div>
  );
}
