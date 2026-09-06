import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { getEquipeAtiva } from "@/lib/corretorSessao";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getAgregadoDaEquipe } from "@/lib/admin/agregados";
import { createClient } from "@/lib/supabase/server";
import { ETAPA_LABEL, ETAPAS_FUNIL } from "@/lib/types";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Visão geral" };

/**
 * O retrato do negócio numa tela.
 *
 * Os números vêm de `getAgregadoDaEquipe` — uma consulta magra, sem joins —
 * e não mais da mesma query que desenha o quadro do funil: contar e listar
 * são necessidades diferentes, e o teto do quadro faria as contas mentirem.
 *
 * Todo número aqui é CLICÁVEL e cai na lista já filtrada (roadmap F5). Um
 * KPI que não leva a lugar nenhum obriga o gestor a refazer o filtro à mão
 * para ver de quem o número é feito.
 */
function Kpi({
  rotulo,
  valor,
  detalhe,
  href,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  href?: string;
}) {
  const conteudo = (
    <>
      <p className="text-fluid-xs text-tenue">{rotulo}</p>
      <p className="text-fluid-xl text-titulo font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-fluid-xs text-apoio mt-0.5">{detalhe}</p>}
    </>
  );

  if (!href) {
    return <div className="cartao p-4">{conteudo}</div>;
  }

  return (
    <Link
      href={href}
      className="cartao hover:border-acento-linha p-4 transition-colors"
    >
      {conteudo}
    </Link>
  );
}

export default async function AdminVisaoGeralPage() {
  await exigirGestorNaPagina();

  const supabase = await createClient();
  const equipe = await getEquipeAtiva();

  const [agregado, { data: funilWhats }, { data: respostaWhats }] = await Promise.all([
    getAgregadoDaEquipe(equipe),
    supabase
      .from("whatsapp_funil_metricas")
      .select("conversas, conversas_com_lead, leads_quentes, visitas_agendadas, em_negociacao"),
    /*
     * As métricas-norte 1 e 3 do roadmap (cobertura e tempo até a primeira
     * resposta), que nunca tinham tela — embora o dado estivesse no banco
     * desde sempre. Ver 0075.
     */
    supabase
      .from("whatsapp_resposta_metricas")
      .select("conversas_com_fala_do_cliente, conversas_atendidas, mediana_segundos, atendidas_em_ate_60s"),
  ]);

  const whats = (funilWhats ?? []).reduce(
    (acc, l) => ({
      conversas: acc.conversas + (l.conversas ?? 0),
      quentes: acc.quentes + (l.leads_quentes ?? 0),
      visitas: acc.visitas + (l.visitas_agendadas ?? 0),
    }),
    { conversas: 0, quentes: 0, visitas: 0 },
  );

  /*
   * Soma da equipe. A mediana NÃO se soma nem se tira média entre
   * corretores — mediana de medianas não é mediana. Com um corretor
   * atendendo, o valor é o dele; com vários, mostramos a MAIOR, que é a
   * leitura conservadora: "o pior tempo de resposta da equipe".
   */
  const resposta = (respostaWhats ?? []).reduce(
    (acc, l) => ({
      escreveram: acc.escreveram + (l.conversas_com_fala_do_cliente ?? 0),
      atendidas: acc.atendidas + (l.conversas_atendidas ?? 0),
      ateUmMinuto: acc.ateUmMinuto + (l.atendidas_em_ate_60s ?? 0),
      piorMediana: Math.max(acc.piorMediana, l.mediana_segundos ?? 0),
    }),
    { escreveram: 0, atendidas: 0, ateUmMinuto: 0, piorMediana: 0 },
  );

  const cobertura =
    resposta.escreveram > 0
      ? Math.round((resposta.atendidas / resposta.escreveram) * 100)
      : null;

  const maxEtapa = Math.max(1, ...Object.values(agregado.porEtapa));
  const maxCorretor = Math.max(1, ...agregado.porCorretor.map((r) => r.total));

  return (
    <div className="space-y-6">
      <div>
        <CabecalhoDeTela secao="Administração" titulo="Visão geral" descricao="O retrato da operação. Todo número aqui abre a lista por trás dele." />
      </div>

      <AbasAdmin ativa="/corretor/admin" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi
          rotulo="Leads na base"
          valor={String(agregado.total)}
          detalhe={`${agregado.semDono} sem dono`}
          // O detalhe é a parte acionável do cartão: cai na lista JÁ
          // recortada nos órfãos, que é o que o gestor vai resolver.
          href={agregado.semDono > 0 ? "/corretor/leads?dono=sem" : "/corretor/leads"}
        />
        <Kpi
          rotulo="Conversão"
          valor={agregado.conversao === null ? "—" : `${agregado.conversao}%`}
          detalhe="dos leads já concluídos"
          href="/corretor/leads?filtro=frios"
        />
        <Kpi
          rotulo="Parados há 15+ dias"
          valor={String(agregado.parados15d)}
          detalhe="pedem cutucão"
          href="/corretor/leads?parado=15"
        />
        <Kpi
          rotulo="Visitas pelo WhatsApp"
          valor={String(whats.visitas)}
          detalhe={`${whats.conversas} conversas · ${whats.quentes} quentes`}
          href="/corretor/conversas"
        />
      </div>

      {/*
        As duas métricas-norte do roadmap que nunca tinham tela (0075).
        Ficam JUNTAS de propósito: separadas, cada uma engana. "Mediana de 9
        segundos" sozinha diz que a IA é rápida e esconde que ela responde a
        um em cada cinco; "21% de cobertura" sozinha faz parecer que ela é
        lenta, quando o problema é outro — ela não é acionada.
      */}
      {resposta.escreveram > 0 && (
        <section className="cartao p-5">
          <h2 className="text-fluid-base text-titulo font-bold">A IA está atendendo?</h2>
          <p className="text-fluid-xs text-apoio mt-1">
            De quem escreveu, quantos a assistente respondeu — e em quanto tempo.
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Kpi
              rotulo="Cobertura"
              valor={cobertura === null ? "—" : `${cobertura}%`}
              detalhe={`${resposta.atendidas} de ${resposta.escreveram} que escreveram`}
              href="/corretor/conversas"
            />
            <Kpi
              rotulo="Tempo até responder"
              valor={resposta.piorMediana > 0 ? `${resposta.piorMediana}s` : "—"}
              // Mediana, não média: a cauda desta base tem conversa
              // respondida dias depois, e uma média descreveria um sistema
              // lento que não existe.
              detalhe="mediana da primeira resposta"
            />
            <Kpi
              rotulo="Respondidas na hora"
              valor={String(resposta.ateUmMinuto)}
              detalhe="em menos de 1 minuto"
            />
          </div>

          {cobertura !== null && cobertura < 50 && (
            <p className="text-fluid-xs text-corpo border-alerta-linha bg-alerta-lavado mt-4 rounded-xl border px-4 py-3 leading-relaxed text-pretty">
              <strong className="text-titulo">
                A maior parte de quem escreve não está sendo respondida pela assistente.
              </strong>{" "}
              Quando ela responde, responde rápido — então o gargalo não é velocidade. Os motivos
              costumam ser: número fora do ar, conversa esperando a palavra-chave de liberação, ou
              o corretor tendo assumido antes.
            </p>
          )}
        </section>
      )}

      <section className="cartao p-5">
        <h2 className="text-fluid-base text-titulo font-bold">Onde está cada contato</h2>
        <ul className="mt-4 space-y-2.5">
          {ETAPAS_FUNIL.map((etapa) => {
            const total = agregado.porEtapa[etapa] ?? 0;
            return (
              <li key={etapa}>
                <Link
                  href={`/corretor/leads?etapa=${etapa}`}
                  className="flex items-center gap-3 transition-opacity hover:opacity-80"
                >
                  <span className="text-fluid-xs text-apoio w-36 shrink-0">
                    {ETAPA_LABEL[etapa]}
                  </span>
                  <span className="bg-campo h-2.5 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-acento block h-full rounded-full"
                      style={{ width: `${(total / maxEtapa) * 100}%` }}
                    />
                  </span>
                  <span className="text-fluid-xs text-titulo w-8 shrink-0 text-right font-bold tabular-nums">
                    {total}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="cartao p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-bold">Carga por corretor</h2>
          <Link
            href="/corretor/admin/leads"
            className="text-fluid-xs text-acento-suave font-medium underline-offset-4 hover:underline"
          >
            Redistribuir →
          </Link>
        </div>
        <ul className="mt-4 space-y-2.5">
          {agregado.porCorretor.map((linha) => (
            <li key={linha.id}>
              <Link
                href={`/corretor/leads?corretor=${linha.id}`}
                className="flex items-center gap-3 transition-opacity hover:opacity-80"
              >
                <span className="text-fluid-xs text-apoio w-36 shrink-0 truncate">
                  {linha.nome}
                  {linha.emPausa && " (pausa)"}
                </span>
                <span className="bg-campo h-2.5 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-acento-suave block h-full rounded-full"
                    style={{ width: `${(linha.total / maxCorretor) * 100}%` }}
                  />
                </span>
                <span className="text-fluid-xs text-titulo w-8 shrink-0 text-right font-bold tabular-nums">
                  {linha.total}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
