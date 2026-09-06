import type { Metadata } from "next";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "WhatsApp & IA da equipe" };

/**
 * O estado do WhatsApp e da IA de toda a equipe num lugar só.
 *
 * Esta tela só é possível por causa da 0031: até ela, as policies de
 * `whatsapp_*` e `ia_interacoes` amarravam tudo ao dono, e o gestor via
 * exatamente nada da operação dos colegas — apesar de comentários no código
 * prometerem o contrário.
 */

const ROTULO_MODO: Record<string, string> = {
  "24_7": "24 horas",
  noturno_e_fds: "Noturno e fim de semana",
  co_piloto_3min: "Co-piloto (3 min)",
  desativado: "Desligada",
};

/**
 * O enum de `admin_eventos` em frase de gente. Sem isto a tela mostrava o
 * valor cru com underscores trocados por espaço ("conta criada") — legível
 * por sorte, e só até alguém criar uma ação nova.
 */
const ROTULO_EVENTO: Record<string, string> = {
  conta_criada: "criou o acesso de",
  senha_redefinida: "redefiniu a senha de",
  papel_alterado: "mudou o papel de",
  corretor_desativado: "desativou",
  corretor_reativado: "reativou",
  leads_redistribuidos: "redistribuiu os leads de",
};

function Selo({ ok, texto }: { ok: boolean; texto: string }) {
  return (
    <span
      className={`text-fluid-xs rounded-full border px-2.5 py-1 font-medium ${
        ok ? "border-ok-linha bg-ok-lavado text-ok" : "border-alerta-linha bg-alerta-lavado text-alerta"
      }`}
    >
      {texto}
    </span>
  );
}

export default async function AdminWhatsappPage() {
  await exigirGestorNaPagina();
  const supabase = await createClient();

  // Os nomes vêm numa consulta à parte e são casados em memória: as relações
  // entre `admin_eventos`/instâncias e `corretores` não estão declaradas nos
  // tipos gerados, e um embed pelo nome da FK quebraria no primeiro rename.
  const [{ data: instancias }, { data: interacoes }, { data: eventos }, { data: pessoas }] =
    await Promise.all([
    supabase
      .from("corretor_whatsapp_instancias")
      .select(
        "id, corretor_id, instance_name, status_conexao, telefone_conectado, conectado_em, modo_bot, bloqueado_ate",
      ),
    supabase
      .from("ia_interacoes")
      .select("fallback, latencia_ms, anexos_bloqueados, avaliacao, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("admin_eventos")
      .select("acao, detalhes, created_at, ator_id, alvo_corretor_id")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("corretores").select("id, nome"),
  ]);

  const nomePor = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  const total = interacoes?.length ?? 0;
  const fallbacks = interacoes?.filter((i) => i.fallback).length ?? 0;
  const ruins = interacoes?.filter((i) => i.avaliacao === "ruim").length ?? 0;
  const bloqueados = interacoes?.reduce((s, i) => s + (i.anexos_bloqueados ?? 0), 0) ?? 0;
  const latencias = (interacoes ?? []).map((i) => i.latencia_ms).filter((l): l is number => l !== null);
  const latenciaMedia = latencias.length
    ? Math.round(latencias.reduce((s, l) => s + l, 0) / latencias.length)
    : null;
  // "Últimas 500" sem dizer desde quando não é comparável com nada: 500
  // respostas podem ser dois dias ou quatro meses.
  const desde = total > 0 ? new Date(interacoes![total - 1].created_at) : null;

  const dataHora = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <div>
        <CabecalhoDeTela secao="Administração" titulo="WhatsApp da equipe" descricao="Os números da equipe e como a IA está atendendo em cada um deles." />
      </div>

      <AbasAdmin ativa="/corretor/admin/whatsapp" />

      <section className="cartao p-5">
        <h2 className="text-fluid-base font-bold text-titulo">Números da equipe</h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Quem está pareado, em que modo a IA está e se algum número foi bloqueado por falhas.
        </p>

        {(instancias ?? []).length === 0 ? (
          <p className="text-fluid-sm text-apoio mt-4">
            Nenhum número conectado ainda. Cada corretor conecta o dele em WhatsApp IA.
          </p>
        ) : (
          <ul className="divide-linha mt-4 divide-y">
            {(instancias ?? []).map((i) => {
              const conectado = i.status_conexao === "conectado" && i.conectado_em !== null;
              const bloqueado = i.bloqueado_ate !== null && new Date(i.bloqueado_ate) > new Date();
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-fluid-sm font-medium text-titulo">
                      {nomePor.get(i.corretor_id) ?? i.instance_name}
                    </p>
                    <p className="text-fluid-xs text-apoio mt-0.5">
                      {i.telefone_conectado ?? "sem número"} · IA:{" "}
                      {ROTULO_MODO[i.modo_bot] ?? i.modo_bot}
                      {bloqueado &&
                        ` · bloqueado até ${dataHora.format(new Date(i.bloqueado_ate as string))}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Selo
                      ok={conectado && !bloqueado}
                      texto={conectado ? "Conectado" : "Desconectado"}
                    />
                    {/* Conectar exige o CELULAR do dono do número (QR ou
                        código) — não existe ação remota honesta aqui. O que
                        o gestor pode fazer é saber a quem pedir, e é isso
                        que a linha diz. */}
                    {!conectado && (
                      <span className="text-fluid-xs text-apoio">
                        peça para {nomePor.get(i.corretor_id) ?? "o corretor"} conectar em
                        WhatsApp → Conexão
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="cartao p-5">
        <h2 className="text-fluid-base font-bold text-titulo">Qualidade da IA</h2>
        <p className="text-fluid-xs text-apoio mt-1">
          As últimas {total} respostas da IA
          {desde ? ` — desde ${dataHora.format(desde)}` : ""}.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Respostas", String(total), ""],
            [
              "Vieram da contingência",
              String(fallbacks),
              total ? `${Math.round((fallbacks / total) * 100)}% — a IA falhou e um texto padrão cobriu` : "",
            ],
            [
              "Tempo até responder",
              latenciaMedia === null ? "—" : `${(latenciaMedia / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`,
              "média — é o que o cliente espera no chat",
            ],
            ["Avaliadas como ruins", String(ruins), bloqueados ? `${bloqueados} anexos barrados` : ""],
          ].map(([rotulo, valor, detalhe]) => (
            <div key={rotulo} className="border-linha bg-elevado rounded-xl border p-3">
              <p className="text-fluid-xs text-tenue">{rotulo}</p>
              <p className="text-fluid-lg font-bold text-titulo">{valor}</p>
              {detalhe && <p className="text-fluid-xs text-apoio">{detalhe}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="cartao p-5">
        <h2 className="text-fluid-base font-bold text-titulo">Registro de ações</h2>
        <p className="text-fluid-xs text-apoio mt-1">
          Quem criou conta, redefiniu senha ou mudou papel — cada ação administrativa fica
          registrada e ninguém consegue apagar.
        </p>
        {(eventos ?? []).length === 0 ? (
          <p className="text-fluid-sm text-apoio mt-4">Nenhuma ação administrativa ainda.</p>
        ) : (
          <ul className="divide-linha mt-4 divide-y">
            {(eventos ?? []).map((e, i) => (
              <li key={i} className="text-fluid-sm py-2.5 text-corpo">
                <span className="text-tenue">{dataHora.format(new Date(e.created_at))}</span>{" "}
                <strong className="text-titulo">
                  {(e.ator_id && nomePor.get(e.ator_id)) || "Alguém"}
                </strong>{" "}
                {ROTULO_EVENTO[e.acao] ?? e.acao.replace(/_/g, " ")}
                {e.alvo_corretor_id && nomePor.get(e.alvo_corretor_id) && (
                  <> — {nomePor.get(e.alvo_corretor_id)}</>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
