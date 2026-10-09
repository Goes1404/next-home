/**
 * Retoma uma lista de transmissão pausada, pelo GitHub Actions (09/10/2026).
 *
 * Por que existe: o botão "Retomar" do painel só funciona com o login do DONO
 * da lista (`mudarEstadoDaLista` filtra pelo corretor da sessão), e a sessão
 * que recebeu o pedido não tinha acesso ao banco. A chave de serviço mora nos
 * secrets do repositório, como a das fotos do catálogo.
 *
 * Faz exatamente o que `retomarCampanha` faz, na mesma ordem:
 *
 * 1. os sinais de hoje viram a base da pausa automática (0172), para a lista
 *    não parar de novo pelos mesmos sinais;
 * 2. a lista volta a `em_andamento`, só se ainda estiver `pausada`;
 * 3. a conferência de texto recomeça (contadores e motivos de texto zerados).
 *
 * O horário fica com o disparador: fora das 9h–20h59 (e do expediente do
 * corretor) nada sai, então retomar de noite faz a lista andar às 9h. A única
 * exceção é a lista marcada para "qualquer hora": essa, fora da janela, o
 * script se RECUSA a retomar, porque mandaria de madrugada.
 *
 * Idempotente: lista que já não está pausada é deixada como está.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { lerSinaisDaLista } from "@/lib/whatsapp/sinaisDaLista";
import { dentroDaJanela } from "@/lib/whatsapp/antiBan";
import { MOTIVO_TEXTO_PARECIDO, MOTIVO_TEXTO_SEM_IA } from "@/lib/whatsapp/variacaoDeTexto";

type Pedido = { campanhaId: string; pedido: string };

const emSP = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

async function main() {
  const pedido: Pedido = JSON.parse(readFileSync(join(process.cwd(), "scripts/ops/retomar-lista.json"), "utf8"));
  const supabase = createServiceClient();
  const agora = new Date();

  const { data: lista, error } = await supabase
    .from("whatsapp_campanhas")
    .select("id, titulo, status, corretor_id, ignorar_janela, janela_liberada_ate, pausa_automatica")
    .eq("id", pedido.campanhaId)
    .maybeSingle();
  if (error || !lista) throw new Error(`lista ${pedido.campanhaId} não encontrada: ${error?.message ?? "sem linha"}`);

  console.log(`Lista "${lista.titulo}" (${lista.id}): ${lista.status}`);
  if (lista.pausa_automatica) console.log(`Motivo da pausa: ${lista.pausa_automatica}`);

  if (lista.status !== "pausada") {
    console.log("Nada a fazer: a lista não está pausada.");
    return;
  }

  const qualquerHora =
    lista.ignorar_janela ||
    (lista.janela_liberada_ate !== null && new Date(lista.janela_liberada_ate).getTime() > agora.getTime());
  if (qualquerHora && !dentroDaJanela(agora)) {
    throw new Error(
      "A lista está marcada para enviar a qualquer hora e agora está fora das 9h–20h59: retomar mandaria mensagem fora do horário. Rode de novo dentro da janela.",
    );
  }

  const sinais = await lerSinaisDaLista(supabase, lista.id);
  const { data: mudou, error: erroEstado } = await supabase
    .from("whatsapp_campanhas")
    .update({ status: "em_andamento", pausa_automatica: null, ...(sinais ? { pausa_base: sinais } : {}) })
    .eq("id", lista.id)
    .eq("status", "pausada")
    .select("id");
  if (erroEstado) throw new Error(`falha ao retomar: ${erroEstado.message}`);
  if (!mudou || mudou.length === 0) {
    console.log("Nada a fazer: a lista deixou de estar pausada no meio do caminho.");
    return;
  }

  await supabase
    .from("whatsapp_campanhas_fila")
    .update({ tentativas_texto: 0 })
    .eq("campanha_id", lista.id)
    .eq("status", "pendente")
    .gt("tentativas_texto", 0);
  await supabase
    .from("whatsapp_campanhas_fila")
    .update({ erro_motivo: null })
    .eq("campanha_id", lista.id)
    .eq("status", "pendente")
    .in("erro_motivo", [MOTIVO_TEXTO_PARECIDO, MOTIVO_TEXTO_SEM_IA]);

  await supabase.from("admin_eventos").insert({
    acao: "lista_retomada",
    ator_id: null,
    alvo_corretor_id: lista.corretor_id,
    detalhes: { campanha_id: lista.id, titulo: lista.titulo, origem: "github_actions", pedido: pedido.pedido, sinais_base: sinais },
  });

  const [{ count: pendentes }, { data: proximo }, { data: numero }] = await Promise.all([
    supabase
      .from("whatsapp_campanhas_fila")
      .select("id", { count: "exact", head: true })
      .eq("campanha_id", lista.id)
      .eq("status", "pendente"),
    supabase
      .from("whatsapp_campanhas_fila")
      .select("agendado_para")
      .eq("campanha_id", lista.id)
      .eq("status", "pendente")
      .order("agendado_para", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("corretor_whatsapp_instancias")
      .select("status_conexao, bloqueado_ate, expediente_inicio, expediente_fim")
      .eq("corretor_id", lista.corretor_id)
      .maybeSingle(),
  ]);

  console.log("Retomada. A lista voltou a andar.");
  console.log(`Pendentes: ${pendentes ?? 0}; o próximo estava agendado para ${emSP(proximo?.agendado_para ?? null)}.`);
  console.log(`Sinais que viraram a base da pausa automática: ${JSON.stringify(sinais)}`);
  if (numero) {
    console.log(
      `Número do corretor: ${numero.status_conexao}; pausa do disjuntor até ${emSP(numero.bloqueado_ate)}; expediente ${numero.expediente_inicio}h às ${numero.expediente_fim}h.`,
    );
  } else {
    console.log("O corretor não tem número cadastrado: nada sai até ele conectar.");
  }
  console.log(
    dentroDaJanela(agora)
      ? "Estamos na janela de envio: a fila começa no próximo ciclo do disparador (1 por minuto)."
      : "Fora da janela de envio: o disparador começa sozinho às 9h (ou no início do expediente do corretor).",
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
