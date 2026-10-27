import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado, getEquipeAtiva } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { cn } from "@/lib/utils";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { diaEmSaoPaulo, lerDia, lerMes } from "@/lib/agenda/calendario";
import { lerItensDoDia, lerMarcadoresDoMes, lerProximasVisitas, lerVisitasSemHorario } from "@/lib/agenda/lerAgenda";
import { lerDiaDaEquipe, lerMarcadoresDaEquipe, lerNumerosDaAgenda, lerPreparo } from "@/lib/agenda/lerEquipe";
import { MesCompacto } from "./_componentes/MesCompacto";
import { ListaDoDia } from "./_componentes/ListaDoDia";
import { CartaoDaVisita } from "./_componentes/CartaoDaVisita";
import { GradeDaSemana } from "./_componentes/GradeDaSemana";
import { AgendaNoCelular } from "./_componentes/AgendaNoCelular";
import { NumerosDoMes } from "./_componentes/NumerosDoMes";
import { ListaDaEquipe } from "./_componentes/ListaDaEquipe";

export const metadata: Metadata = { title: "Agenda" };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Params = { [key: string]: string | string[] | undefined };

/**
 * A Agenda (27/10/2026). Fase 1: a do próprio corretor, que substituiu a
 * tela de Visitas. Fase 2: o gestor tem a chave "Minha / Equipe"; na da
 * equipe, os números do mês com seis meses de comparação, o filtro por
 * corretor e a lista do dia com quem faz cada visita.
 *
 * `?ver=equipe` só vale para o gestor: o corretor comum não vê a agenda dos
 * colegas, e o parâmetro é ignorado para ele.
 */
export default async function AgendaPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const agora = new Date();
  const mes = lerMes(um(params.mes), agora);
  const dia = lerDia(um(params.dia), mes, agora);
  const ehGestor = corretor.papel === "gestor";
  const daEquipe = ehGestor && um(params.ver) === "equipe";

  return (
    <div>
      <CabecalhoDeTela
        secao="Leads"
        titulo="Agenda"
        descricao={daEquipe ? "As visitas da equipe, dia a dia, e os números do mês." : "Suas visitas, tarefas e lembretes, dia a dia."}
      />
      {ehGestor && (
        <nav className="mt-4 flex gap-2" aria-label="De quem é a agenda">
          <Link href={`?mes=${mes}&dia=${dia}`} aria-current={!daEquipe ? "page" : undefined} className={cn("botao-aba min-h-11", !daEquipe && "bg-elevado font-semibold")}>
            Minha
          </Link>
          <Link href={`?mes=${mes}&dia=${dia}&ver=equipe`} aria-current={daEquipe ? "page" : undefined} className={cn("botao-aba min-h-11", daEquipe && "bg-elevado font-semibold")}>
            Equipe
          </Link>
        </nav>
      )}
      {daEquipe ? (
        <AgendaDaEquipe grupoId={corretor.grupoId} mes={mes} dia={dia} agora={agora} filtro={um(params.corretor) ?? null} />
      ) : (
        <MinhaAgenda corretorId={corretor.id} grupoId={corretor.grupoId} mes={mes} dia={dia} agora={agora} />
      )}
    </div>
  );
}

async function AgendaDaEquipe({
  grupoId,
  mes,
  dia,
  agora,
  filtro,
}: {
  grupoId: string;
  mes: string;
  dia: string;
  agora: Date;
  filtro: string | null;
}) {
  const equipe = await getEquipeAtiva();
  // Só filtra por quem é da equipe do gestor: id de fora vira "equipe toda".
  const corretorId = filtro && equipe.some((c) => c.id === filtro) ? filtro : null;
  const recorte = { grupoId, corretorId };
  const [numeros, marcadores, doDia] = await Promise.all([
    lerNumerosDaAgenda({ ...recorte, mes }),
    lerMarcadoresDaEquipe({ ...recorte, mes }),
    lerDiaDaEquipe({ ...recorte, dia }),
  ]);
  const consulta = `&ver=equipe${corretorId ? `&corretor=${corretorId}` : ""}`;

  return (
    <div className="mt-6 space-y-4">
      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por corretor">
        <Link href={`?mes=${mes}&dia=${dia}&ver=equipe`} aria-current={!corretorId ? "true" : undefined} className={cn("botao-aba min-h-11 text-sm", !corretorId && "bg-elevado font-semibold")}>
          Todos
        </Link>
        {equipe.map((c) => (
          <Link
            key={c.id}
            href={`?mes=${mes}&dia=${dia}&ver=equipe&corretor=${c.id}`}
            aria-current={corretorId === c.id ? "true" : undefined}
            className={cn("botao-aba min-h-11 text-sm", corretorId === c.id && "bg-elevado font-semibold")}
          >
            {c.nome.split(" ")[0]}
          </Link>
        ))}
      </nav>
      <NumerosDoMes serie={numeros.serie} medidaDesde={numeros.medidaDesde} />
      <MesCompacto mes={mes} diaSelecionado={dia} hoje={diaEmSaoPaulo(agora)} marcadores={marcadores} consulta={consulta} />
      <ListaDaEquipe itens={doDia.itens} total={doDia.total} equipe={equipe} agora={agora} />
    </div>
  );
}

async function MinhaAgenda({
  corretorId,
  grupoId,
  mes,
  dia,
  agora,
}: {
  corretorId: string;
  grupoId: string;
  mes: string;
  dia: string;
  agora: Date;
}) {
  const recorte = { corretorId, grupoId };
  const [marcadores, itens, proximas, semHorario] = await Promise.all([
    lerMarcadoresDoMes({ ...recorte, mes }),
    lerItensDoDia({ ...recorte, dia }),
    lerProximasVisitas({ ...recorte, agora, limite: 10 }),
    lerVisitasSemHorario(recorte),
  ]);
  const temVisitaNoDia = itens.some((i) => i.tipo === "visita");

  /*
   * O PREPARO da visita (o que o cliente procura, a objeção aberta), numa
   * consulta à parte e só para os leads que aparecem. Pela chave de serviço:
   * a visita passada pelo gestor (0223) é de lead de outro corretor, e a RLS
   * esconderia o preparo de quem a faz.
   */
  const ids = [
    ...new Set([
      ...itens.flatMap((i) => (i.tipo === "visita" ? [i.leadId] : [])),
      ...(temVisitaNoDia ? [] : proximas.map((v) => v.leadId)),
    ]),
  ];
  const preparoPorLead = await lerPreparo(grupoId, ids);

  // Configuração: o token do feed .ics (0126, tabela fechada ao painel) e a grade semanal.
  const { data: agenda } = await createServiceClient()
    .from("corretor_agenda")
    .select("token")
    .eq("corretor_id", corretorId)
    .maybeSingle();
  const linkDaAgenda = agenda ? `${await lerEnderecoDoCliente(grupoId)}/api/agenda/${agenda.token}.ics` : null;
  const { data: grade } = await (await createClient())
    .from("corretor_disponibilidade")
    .select("dia_semana, hora_inicio, hora_fim, horas_preferidas")
    .eq("corretor_id", corretorId);

  return (
    <>
      <div className="mt-6 space-y-4">
        {semHorario.length > 0 && (
          <section className="cartao border-alerta/40 p-5" aria-labelledby="visita-sem-horario">
            <h2 id="visita-sem-horario" className="font-medium text-titulo">
              Visita sem horário ({semHorario.length})
            </h2>
            <p className="text-fluid-xs mt-1 text-apoio">Estão na etapa Visita, mas sem dia marcado. Marque na ficha.</p>
            <ul className="mt-3 space-y-2">
              {semHorario.map((lead) => (
                <li key={lead.id}>
                  <Link href={`/corretor/leads/${lead.id}`} className="botao-aba min-h-11 w-full justify-start text-sm">
                    {lead.nome}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <MesCompacto mes={mes} diaSelecionado={dia} hoje={diaEmSaoPaulo(agora)} marcadores={marcadores} />
        <ListaDoDia itens={itens} preparoPorLead={preparoPorLead} vistaDe={corretorId} />
      </div>

      {!temVisitaNoDia && proximas.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-lg text-titulo">Próximas visitas</h2>
          <div className="mt-3 space-y-4">
            {proximas.map((visita) => (
              <CartaoDaVisita
                key={visita.id}
                visita={visita}
                preparo={preparoPorLead.get(visita.leadId) ?? {}}
                comDia
                vistaDe={corretorId}
              />
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
    </>
  );
}
