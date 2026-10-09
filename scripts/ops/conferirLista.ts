/**
 * Confere se uma lista de transmissão está saindo, pelo GitHub Actions
 * (09/10/2026). Só LÊ: não muda nada no banco.
 *
 * Por que existe: a sessão que acompanha a lista não tem acesso ao banco, e
 * o cron do disparo não deixa rastro no log da Vercel. A chave de serviço
 * mora nos secrets do repositório.
 *
 * O repositório é PÚBLICO, e o log do Actions também. Por isso a saída é só
 * agregado: contagens, horários, intervalos e motivos do sistema. Nenhum
 * telefone, nome ou texto de mensagem; motivo de erro do provedor sai com os
 * números mascarados.
 *
 * O que importa medir é o intervalo REAL entre envios (`enviado_em` contra o
 * anterior): o `agendado_para` sai perfeito mesmo quando a lista dispara em
 * rajada (ver a nota do espaçamento no vault).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { INTERVALO_MINIMO_SEGUNDOS } from "@/lib/whatsapp/antiBan";

type Pedido = { campanhaId: string; pedido: string };

const FUSO = "America/Sao_Paulo";
const emSP = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: FUSO }) : "—");
const diaSP = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d);
const mascarar = (t: string) => t.replace(/\d{5,}/g, "…").slice(0, 120);

/** Linha do log e anotação da execução, para ler mesmo sem baixar o log. */
function aviso(texto: string) {
  console.log(texto);
  console.log(`::notice title=Conferir lista::${texto.replace(/\r?\n/g, " ")}`);
}

async function main() {
  const pedido: Pedido = JSON.parse(readFileSync(join(process.cwd(), "scripts/ops/conferir-lista.json"), "utf8"));
  const supabase = createServiceClient();
  const agora = new Date();
  const hoje = diaSP(agora);

  const { data: lista, error } = await supabase
    .from("whatsapp_campanhas")
    .select("id, titulo, status, corretor_id, pausa_automatica, total_enviados, total_leads, total_respondidos")
    .eq("id", pedido.campanhaId)
    .maybeSingle();
  if (error || !lista) throw new Error(`lista ${pedido.campanhaId} não encontrada: ${error?.message ?? "sem linha"}`);

  aviso(`Lista "${lista.titulo}": ${lista.status}. Conferido em ${emSP(agora.toISOString())}.`);
  if (lista.pausa_automatica) aviso(`Pausa automática: ${lista.pausa_automatica}`);

  const { data: itens, error: erroItens } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("status, enviado_em, erro_motivo, semelhanca_max")
    .eq("campanha_id", lista.id);
  if (erroItens || !itens) throw new Error(`fila ilegível: ${erroItens?.message ?? "sem linhas"}`);

  const porStatus = new Map<string, number>();
  for (const i of itens) porStatus.set(i.status, (porStatus.get(i.status) ?? 0) + 1);
  aviso(`Fila: ${[...porStatus].map(([s, n]) => `${s} ${n}`).join(", ")}.`);

  const deHoje = itens
    .filter((i) => i.enviado_em && diaSP(new Date(i.enviado_em)) === hoje)
    .map((i) => ({ em: new Date(i.enviado_em as string), semelhanca: i.semelhanca_max }))
    .sort((a, b) => a.em.getTime() - b.em.getTime());

  if (deHoje.length === 0) {
    aviso("Hoje: nenhuma mensagem saiu ainda.");
  } else {
    const intervalos = deHoje.slice(1).map((d, k) => Math.round((d.em.getTime() - deHoje[k].em.getTime()) / 1000));
    const ordenados = [...intervalos].sort((a, b) => a - b);
    const mediana = ordenados.length ? ordenados[Math.floor(ordenados.length / 2)] : null;
    const abaixo = intervalos.filter((s) => s < INTERVALO_MINIMO_SEGUNDOS).length;
    aviso(
      `Hoje: ${deHoje.length} enviadas, a primeira às ${emSP(deHoje[0].em.toISOString())} e a última às ${emSP(deHoje[deHoje.length - 1].em.toISOString())}.`,
    );
    if (ordenados.length) {
      aviso(
        `Intervalo real entre envios: mínimo ${ordenados[0]}s, mediana ${mediana}s, máximo ${ordenados[ordenados.length - 1]}s; abaixo de ${INTERVALO_MINIMO_SEGUNDOS}s: ${abaixo}.`,
      );
    }
    const semelhancas = deHoje.map((d) => d.semelhanca).filter((s): s is number => typeof s === "number");
    if (semelhancas.length) {
      aviso(`Semelhança dos textos de hoje com os anteriores do número: maior ${Math.max(...semelhancas).toFixed(2)} (o teto é 0,70).`);
    }
  }

  const motivos = new Map<string, number>();
  for (const i of itens) {
    if (!i.erro_motivo) continue;
    const chave = `${i.status === "erro" ? "erro" : "esperando"}: ${mascarar(i.erro_motivo)}`;
    motivos.set(chave, (motivos.get(chave) ?? 0) + 1);
  }
  for (const [m, n] of motivos) aviso(`${n} × ${m}`);

  const { data: numero } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("status_conexao, bloqueado_ate, falhas_seguidas, envios_campanha_data, envios_campanha_contador, expediente_inicio, expediente_fim")
    .eq("corretor_id", lista.corretor_id)
    .maybeSingle();
  if (numero) {
    const doDia = numero.envios_campanha_data === hoje ? numero.envios_campanha_contador : 0;
    aviso(
      `Número: ${numero.status_conexao}; falhas seguidas ${numero.falhas_seguidas}; pausa do disjuntor até ${emSP(numero.bloqueado_ate)}; envios do número hoje ${doDia}; expediente ${numero.expediente_inicio}h às ${numero.expediente_fim}h.`,
    );
  } else {
    aviso("O corretor não tem número cadastrado.");
  }
}

main().catch((e) => {
  const texto = e instanceof Error ? e.message : String(e);
  console.error(texto);
  console.log(`::error title=Conferir lista::${texto}`);
  process.exit(1);
});
