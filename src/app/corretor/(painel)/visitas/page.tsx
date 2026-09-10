import type { Metadata } from "next";
import Link from "next/link";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import { BuscaLeads } from "@/app/corretor/(painel)/_componentes/BuscaLeads";
import { getCorretorLogado, getLeadsDeVisita } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { GradeDaSemana } from "./_componentes/GradeDaSemana";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { linkWhatsappPara } from "@/lib/site";
import {
  etiquetasDoPreparo,
  objecaoEmAberto,
  resumoCurto,
  temPreparo,
  type DadosDoPreparo,
} from "@/lib/crm/preparoDaVisita";

export const metadata: Metadata = { title: "Minhas Visitas" };

const horaFormatada = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function VisitasPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const buscaParam = params.busca;
  const busca = (Array.isArray(buscaParam) ? buscaParam[0] : buscaParam) ?? "";

  // Visita É o lead na etapa "visita_agendada" (migration 0009) — não um
  // registro à parte. Ver CampoVisita.tsx para onde a data é definida.
  // A query já vem recortada e ordenada (sem data primeiro) — antes esta
  // tela baixava a carteira inteira para filtrar meia dúzia de visitas.
  const visitas = await getLeadsDeVisita(busca);

  /*
   * A grade semanal de disponibilidade (0073). É o que a assistente lê
   * para oferecer horário que EXISTE — sem ela, ela fala de horário de
   * cabeça, e o eval de 31/08 mediu o custo disso.
   */
  const corretor = await getCorretorLogado();
  const supabase = await createClient();
  const { data: grade } = corretor
    ? await supabase
        .from("corretor_disponibilidade")
        .select("dia_semana, hora_inicio, hora_fim")
        .eq("corretor_id", corretor.id)
    : { data: null };

  /*
   * O PREPARO da visita, numa consulta à parte.
   *
   * Não entra em `SELECT_LEAD` de propósito: aquele select é lido por toda
   * tela de lead do painel, e engordá-lo por causa desta cobraria a coluna
   * extra na lista paginada e no quadro de até 300 cartões. Aqui são poucas
   * linhas — as visitas marcadas de um corretor — e só quando há visita.
   *
   * `numeric` do Postgres chega como STRING no supabase-js: sem o `Number`,
   * a formatação de moeda sai quebrada sem erro nenhum.
   */
  const ids = visitas.map((v) => v.id);
  const [{ data: perfis }, { data: dossies }] = ids.length
    ? await Promise.all([
        supabase
          .from("leads")
          .select("id, regiao_interesse, dormitorios_min, orcamento_min, orcamento_max, renda_mensal")
          .in("id", ids),
        supabase
          .from("lead_observacoes_ia")
          .select("lead_id, resumo_executivo, objecoes_identificadas")
          .in("lead_id", ids),
      ])
    : [{ data: null }, { data: null }];

  const numero = (v: unknown) => (v === null || v === undefined ? null : Number(v));
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
    const atual = preparoPorLead.get(d.lead_id) ?? {};
    preparoPorLead.set(d.lead_id, {
      ...atual,
      resumoExecutivo: d.resumo_executivo,
      objecoes: Array.isArray(d.objecoes_identificadas)
        ? d.objecoes_identificadas.filter((o): o is string => typeof o === "string")
        : null,
    });
  }

  return (
    <div>
      <CabecalhoDeTela secao="Leads" titulo="Visitas" descricao="Leads com visita marcada, ordenados pelo horário." />

      <BuscaLeads className="mt-6" />
      <div className="mt-3">
        <AbasLeads ativa="/corretor/visitas" visitas={busca ? undefined : visitas.length} />
      </div>

      {/*
        A grade de disponibilidade desceu para DEPOIS da busca e das abas
        (06/09/2026, pedido do usuário). Ela é configuração — "quando eu
        recebo visitas" —, e estava entre o cabeçalho e a navegação da seção,
        empurrando as abas para fora da primeira tela no celular. Quem abre
        Visitas vem ver as visitas de hoje; ajustar horário é o que se faz
        depois.
      */}
      <div className="mt-6">
        <GradeDaSemana
          inicial={(grade ?? []).map((f) => ({
            diaSemana: f.dia_semana,
            horaInicio: f.hora_inicio,
            horaFim: f.hora_fim,
          }))}
        />
      </div>

      {visitas.length === 0 ? (
        <div className="cartao mt-8 p-6">
          <p className="text-fluid-sm text-corpo">
            {busca
              ? `Nenhuma visita marcada para “${busca}”.`
              : "Nenhuma visita agendada no momento. Mova um lead para a etapa “Visita” no funil e marque a data para ele aparecer aqui."}
          </p>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {visitas.map((lead) => {
            const hora = lead.visitaAgendadaEm
              ? horaFormatada.format(new Date(lead.visitaAgendadaEm))
              : null;
            const preparo = preparoPorLead.get(lead.id) ?? {};
            const endereco = lead.empreendimento?.endereco ?? lead.empreendimento?.nome;
            const linkMaps = endereco
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
              : null;

            return (
              <article
                key={lead.id}
                className="cartao p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display text-lg text-titulo">
                      {hora ? `${hora} — ${lead.nome}` : lead.nome}
                    </p>
                    <p className="text-fluid-sm mt-0.5 text-apoio">
                      {lead.empreendimento?.nome ?? "Imóvel não informado"}
                    </p>
                  </div>
                  <div>
                    <span className="text-fluid-xs rounded-full bg-etapa-visita-lavado px-2.5 py-1 font-medium text-etapa-visita">
                      {hora ? "Agendada" : "Sem horário"}
                    </span>
                  </div>
                </div>

                {/*
                  O endereço, por extenso. O botão de GPS já existia, mas o
                  corretor não conseguia LER para onde ia sem sair do painel —
                  e no dia da visita a rua é a informação, não o link.
                */}
                {lead.empreendimento?.endereco && (
                  <p className="text-fluid-sm mt-2 text-corpo">{lead.empreendimento.endereco}</p>
                )}

                {/*
                  O PREPARO: o que ele procura, e a objeção que ficou aberta.
                  Só aparece quando há o que mostrar — seção que vive vazia
                  ensina a pular a seção.
                */}
                {temPreparo(preparo) && (
                  <div className="mt-3 border-t border-linha pt-3">
                    {etiquetasDoPreparo(preparo).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {etiquetasDoPreparo(preparo).map((etiqueta) => (
                          <span
                            key={etiqueta}
                            className="text-fluid-xs rounded-full bg-elevado px-2.5 py-1 text-corpo"
                          >
                            {etiqueta}
                          </span>
                        ))}
                      </div>
                    )}
                    {objecaoEmAberto(preparo) && (
                      <p className="text-fluid-xs mt-2 text-apoio">
                        <span className="font-medium text-alerta">Atenção:</span>{" "}
                        {objecaoEmAberto(preparo)}
                      </p>
                    )}
                    {resumoCurto(preparo.resumoExecutivo) && (
                      <p className="text-fluid-xs mt-2 text-apoio">
                        {resumoCurto(preparo.resumoExecutivo)}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-3">
                  {lead.telefone && (
                    <a
                      href={linkWhatsappPara(
                        lead.telefone.replace(/\D/g, ""),
                        `Oi, ${lead.nome.split(" ")[0]}! Passando para confirmar nossa visita${hora ? ` às ${hora}` : ""}.`,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-32 flex-1 rounded-xl border border-acento-linha bg-acento-lavado px-4 py-2.5 text-center text-sm font-medium text-acento-suave transition-colors hover:opacity-85"
                    >
                      WhatsApp
                    </a>
                  )}
                  {linkMaps && (
                    <a
                      href={linkMaps}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-32 flex-1 rounded-xl bg-elevado px-4 py-2.5 text-center text-sm font-medium text-corpo transition-colors hover:bg-vidro-forte"
                    >
                      Ir (GPS)
                    </a>
                  )}
                  {lead.telefone && (
                    <a
                      href={`tel:${lead.telefone}`}
                      className="min-w-32 flex-1 rounded-xl bg-elevado px-4 py-2.5 text-center text-sm font-medium text-corpo transition-colors hover:bg-vidro-forte"
                    >
                      Ligar
                    </a>
                  )}
                  <Link
                    href={`/corretor/leads/${lead.id}`}
                    className="min-w-32 flex-1 rounded-xl bg-elevado px-4 py-2.5 text-center text-sm font-medium text-corpo transition-colors hover:bg-vidro-forte"
                  >
                    Abrir ficha
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
