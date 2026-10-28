import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado, getEquipeAtiva } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { cn } from "@/lib/utils";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { diaEmSaoPaulo, lerDia, lerMes, mesDoDia, type Dia, type Mes } from "@/lib/agenda/calendario";
import { ordenarItens, type ItemDaAgenda } from "@/lib/agenda/itens";
import { resumoDoDia, rotuloDoDia, semanaDoDia } from "@/lib/agenda/semana";
import { lerItensDoDia, lerMarcadoresDoMes, lerProximasVisitas, lerVisitasSemHorario } from "@/lib/agenda/lerAgenda";
import {
  lerCompromissosDoDiaDaEquipe,
  lerDiaDaEquipe,
  lerMarcadoresDaEquipe,
  lerNumerosDaAgenda,
  lerPreparo,
} from "@/lib/agenda/lerEquipe";
import { BloquearHorario, MarcarReuniao } from "./_componentes/FormulariosDeCompromisso";
import { MesCompacto } from "./_componentes/MesCompacto";
import { CalendarioDoCelular } from "./_componentes/CalendarioDoCelular";
import { DiaDaAgenda } from "./_componentes/DiaDaAgenda";
import { AcoesDaAgenda } from "./_componentes/AcoesDaAgenda";
import { GradeDaSemana } from "./_componentes/GradeDaSemana";
import { AgendaNoCelular } from "./_componentes/AgendaNoCelular";
import { NumerosDoMes } from "./_componentes/NumerosDoMes";

export const metadata: Metadata = { title: "Agenda" };

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Params = { [key: string]: string | string[] | undefined };

/**
 * A Agenda (27/10/2026; visual de 28/10/2026). No celular: a semana numa
 * faixa que abre o mês inteiro, o dia numa lista fina e o detalhe numa
 * gaveta. No computador: o mês e as próximas visitas à esquerda, o dia no
 * meio e, na tela larga, o detalhe da visita à direita.
 *
 * O gestor tem a chave "Minha / Equipe"; na da equipe, os números do mês, o
 * filtro por corretor e o dia com quem faz cada visita. `?ver=equipe` só vale
 * para o gestor: o corretor comum não vê a agenda dos colegas.
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

  const abas = ehGestor ? (
    <nav className="flex gap-2" aria-label="De quem é a agenda">
      <Link href={`?mes=${mes}&dia=${dia}`} aria-current={!daEquipe ? "page" : undefined} className={cn("botao-aba min-h-11", !daEquipe && "bg-elevado font-semibold")}>
        Minha
      </Link>
      <Link href={`?mes=${mes}&dia=${dia}&ver=equipe`} aria-current={daEquipe ? "page" : undefined} className={cn("botao-aba min-h-11", daEquipe && "bg-elevado font-semibold")}>
        Equipe
      </Link>
    </nav>
  ) : null;

  return (
    <div>
      <CabecalhoDeTela
        secao="Leads"
        titulo="Agenda"
        descricao={daEquipe ? "As visitas da equipe, dia a dia, e os números do mês." : "Suas visitas, tarefas e lembretes, dia a dia."}
      />
      {daEquipe ? (
        <AgendaDaEquipe grupoId={corretor.grupoId} mes={mes} dia={dia} agora={agora} filtro={um(params.corretor) ?? null} abas={abas} />
      ) : (
        <MinhaAgenda corretorId={corretor.id} grupoId={corretor.grupoId} mes={mes} dia={dia} agora={agora} abas={abas} ehGestor={ehGestor} />
      )}
    </div>
  );
}

/** Os meses que a semana do dia toca além do mês mostrado: a faixa do celular atravessa a virada. */
function outrosMesesDaSemana(dia: Dia, mes: Mes): Mes[] {
  return [...new Set(semanaDoDia(dia).map(mesDoDia))].filter((m) => m !== mes);
}

function Barra({ abas, acoes }: { abas: React.ReactNode; acoes: React.ReactNode }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
      <div>{abas}</div>
      {acoes}
    </div>
  );
}

function TituloDoDia({ dia, hoje, itens }: { dia: Dia; hoje: Dia; itens: ItemDaAgenda[] }) {
  return (
    <div>
      <h2 className="font-display text-xl text-titulo">{rotuloDoDia(dia, hoje)}</h2>
      <p className="text-fluid-xs text-apoio">{resumoDoDia(itens)}</p>
    </div>
  );
}

const SEMANA_CURTA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short" });
const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
/** "qua 28 · 10:00" */
function quandoCurto(inicio: string): string {
  const d = new Date(inicio);
  return `${SEMANA_CURTA.format(d).replace(".", "")} ${Number(diaEmSaoPaulo(d).slice(8))} · ${HORA.format(d)}`;
}

/** As próximas visitas, em linhas que levam ao dia de cada uma. */
function ProximasVisitas({ visitas }: { visitas: Extract<ItemDaAgenda, { tipo: "visita" }>[] }) {
  return (
    <section className="cartao p-4" aria-labelledby="proximas-visitas">
      <h2 id="proximas-visitas" className="text-fluid-xs font-medium tracking-[0.14em] text-tenue uppercase">
        Próximas visitas
      </h2>
      <ul className="mt-2 space-y-1">
        {visitas.map((v) => {
          const diaDaVisita = diaEmSaoPaulo(new Date(v.inicio));
          return (
            <li key={v.id}>
              <Link
                href={`?mes=${mesDoDia(diaDaVisita)}&dia=${diaDaVisita}`}
                className="flex min-h-12 flex-col justify-center rounded-xl bg-elevado/40 px-3 py-1.5 transition-colors hover:bg-elevado"
              >
                <span className="text-fluid-sm block truncate font-medium text-titulo">{v.nome}</span>
                <span className="text-fluid-xs block text-apoio">{quandoCurto(v.inicio)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function AgendaDaEquipe({
  grupoId,
  mes,
  dia,
  agora,
  filtro,
  abas,
}: {
  grupoId: string;
  mes: string;
  dia: string;
  agora: Date;
  filtro: string | null;
  abas: React.ReactNode;
}) {
  const equipe = await getEquipeAtiva();
  // Só filtra por quem é da equipe do gestor: id de fora vira "equipe toda".
  const corretorId = filtro && equipe.some((c) => c.id === filtro) ? filtro : null;
  const recorte = { grupoId, corretorId };
  const [numeros, marcadores, doDia, compromissos, ...vizinhos] = await Promise.all([
    lerNumerosDaAgenda({ ...recorte, mes }),
    lerMarcadoresDaEquipe({ ...recorte, mes }),
    lerDiaDaEquipe({ ...recorte, dia }),
    lerCompromissosDoDiaDaEquipe({ ...recorte, dia }),
    ...outrosMesesDaSemana(dia, mes).map((m) => lerMarcadoresDaEquipe({ ...recorte, mes: m })),
  ]);
  const consulta = `&ver=equipe${corretorId ? `&corretor=${corretorId}` : ""}`;
  const hoje = diaEmSaoPaulo(agora);
  const itens = ordenarItens([...compromissos, ...doDia.itens]);

  return (
    <>
      <Barra abas={abas} acoes={<AcoesDaAgenda novo={<MarcarReuniao dia={dia} equipe={equipe} aberto />} />} />

      <nav className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar por corretor">
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

      <div className="mt-4">
        <NumerosDoMes serie={numeros.serie} medidaDesde={numeros.medidaDesde} />
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="hidden space-y-4 lg:sticky lg:top-4 lg:block">
          <MesCompacto mes={mes} diaSelecionado={dia} hoje={hoje} marcadores={marcadores} consulta={consulta} compacto />
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="lg:hidden">
            <CalendarioDoCelular mes={mes} dia={dia} hoje={hoje} marcadores={Object.assign({}, ...vizinhos, marcadores)} consulta={consulta} />
          </div>
          <TituloDoDia dia={dia} hoje={hoje} itens={itens} />
          <DiaDaAgenda
            itens={itens}
            preparoPorLead={{}}
            agoraIso={agora.toISOString()}
            dia={dia}
            modo="equipe"
            equipe={equipe}
            vazio="Nada marcado na equipe neste dia."
          />
          {doDia.total > doDia.itens.length && (
            <p className="text-fluid-xs text-apoio">
              Mostrando {doDia.itens.length} de {doDia.total} visitas. Filtre por corretor para ver o resto.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

async function MinhaAgenda({
  corretorId,
  grupoId,
  mes,
  dia,
  agora,
  abas,
  ehGestor,
}: {
  corretorId: string;
  grupoId: string;
  mes: string;
  dia: string;
  agora: Date;
  abas: React.ReactNode;
  ehGestor: boolean;
}) {
  const recorte = { corretorId, grupoId };
  const [marcadores, itens, proximas, semHorario, equipe, ...vizinhos] = await Promise.all([
    lerMarcadoresDoMes({ ...recorte, mes }),
    lerItensDoDia({ ...recorte, dia }),
    lerProximasVisitas({ ...recorte, agora, limite: 10 }),
    lerVisitasSemHorario(recorte),
    ehGestor ? getEquipeAtiva() : Promise.resolve([]),
    ...outrosMesesDaSemana(dia, mes).map((m) => lerMarcadoresDoMes({ ...recorte, mes: m })),
  ]);
  const temVisitaNoDia = itens.some((i) => i.tipo === "visita");
  const hoje = diaEmSaoPaulo(agora);

  /*
   * O PREPARO da visita (o que o cliente procura, a objeção aberta), numa
   * consulta à parte e só para os leads que aparecem. Pela chave de serviço:
   * a visita passada pelo gestor (0225) é de lead de outro corretor, e a RLS
   * esconderia o preparo de quem a faz.
   */
  const ids = [...new Set(itens.flatMap((i) => (i.tipo === "visita" ? [i.leadId] : [])))];
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

  const novo = (
    <>
      <BloquearHorario dia={dia} aberto />
      {ehGestor && <MarcarReuniao dia={dia} equipe={equipe} aberto />}
    </>
  );
  const ajustes = (
    <>
      <AgendaNoCelular link={linkDaAgenda} />
      <GradeDaSemana
        inicial={(grade ?? []).map((f) => ({
          diaSemana: f.dia_semana,
          horaInicio: f.hora_inicio,
          horaFim: f.hora_fim,
          horasPreferidas: f.horas_preferidas ?? [],
        }))}
      />
    </>
  );
  const proximasCurtas = proximas.slice(0, 6);

  return (
    <>
      <Barra abas={abas} acoes={<AcoesDaAgenda novo={novo} ajustes={ajustes} />} />

      {semHorario.length > 0 && (
        <section className="cartao mt-4 border-alerta/40 p-5" aria-labelledby="visita-sem-horario">
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

      <div className="mt-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside className="hidden space-y-4 lg:sticky lg:top-4 lg:block">
          <MesCompacto mes={mes} diaSelecionado={dia} hoje={hoje} marcadores={marcadores} compacto />
          {proximasCurtas.length > 0 && <ProximasVisitas visitas={proximasCurtas} />}
        </aside>
        <div className="min-w-0 space-y-4">
          <div className="lg:hidden">
            <CalendarioDoCelular mes={mes} dia={dia} hoje={hoje} marcadores={Object.assign({}, ...vizinhos, marcadores)} />
          </div>
          <TituloDoDia dia={dia} hoje={hoje} itens={itens} />
          <DiaDaAgenda
            itens={itens}
            preparoPorLead={Object.fromEntries(preparoPorLead)}
            vistaDe={corretorId}
            agoraIso={agora.toISOString()}
            dia={dia}
            vazio="Nada marcado neste dia."
          />
          {!temVisitaNoDia && proximasCurtas.length > 0 && (
            <div className="lg:hidden">
              <ProximasVisitas visitas={proximasCurtas} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
