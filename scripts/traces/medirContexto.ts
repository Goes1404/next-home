/**
 * O que a IA REALMENTE enxerga numa conversa de produção.
 *
 * A queixa é sempre a mesma — "parece que ela não tem contexto" — e a
 * resposta não sai de ler código: sai de reconstruir, sobre a conversa de
 * verdade, as camadas que chegam ao prompt. Zero chamada de LLM.
 *
 *     npx tsx scripts/traces/medirContexto.ts conversas.json catalogo.json
 */
import { readFileSync } from "node:fs";
import { separarRajada, type Fala } from "../../src/lib/whatsapp/rajada";
import { catalogoParaAtendimento } from "../../src/lib/whatsapp/focoDaConversa";
import type { Empreendimento } from "../../src/lib/types";

const JANELA = 40; // `historicoRecente(conversaId, limite = 40)` (0106)
const SEM_TEXTO = "[mensagem não gravada — conversa sem atendimento liberado]";

type Linha = { conversa_id: string; remetente: string; conteudo: string; created_at: string };
const linhas = JSON.parse(readFileSync(process.argv[2], "utf8")) as Linha[];
const catalogo = JSON.parse(readFileSync(process.argv[3], "utf8")).map(
  (c: { slug: string; nome: string; nomes_alternativos: string[]; bairro?: string; cidade?: string }) =>
    ({
      slug: c.slug,
      nome: c.nome,
      nomesAlternativos: c.nomes_alternativos ?? [],
      bairro: c.bairro ?? "",
      cidade: c.cidade ?? "",
      tipo: "apartamento",
      descricao: "",
      midias: [],
      tipologias: [],
      lazer: [],
    }) as unknown as Empreendimento,
);

const porConversa = new Map<string, Linha[]>();
for (const l of linhas) {
  if (!porConversa.has(l.conversa_id)) porConversa.set(l.conversa_id, []);
  porConversa.get(l.conversa_id)!.push(l);
}

type Retrato = {
  id: string;
  total: number;
  naJanela: number;
  foraDaJanela: number;
  doCorretor: number;
  doBot: number;
  doCliente: number;
  semTexto: number;
  aproveitavel: number;
  foco: string | null;
};

const retratos: Retrato[] = [];

for (const [id, msgs] of porConversa) {
  msgs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (!msgs.some((m) => m.remetente === "bot")) continue;
  if (msgs.length < 4) continue;

  /*
   * Espelha a consulta desde a 0106: a marca de mensagem não gravada é
   * DESCARTADA antes do corte, não depois. Filtrar depois mediria uma janela
   * que a produção não usa — a mesma armadilha que fez o eval medir um
   * catálogo cru que webhook nenhum via.
   */
  const comTexto = msgs.filter((m) => m.conteudo !== SEM_TEXTO);
  const janela = comTexto.slice(-JANELA);
  const historico: Fala[] = janela.map((m) => ({
    remetente: m.remetente as Fala["remetente"],
    texto: m.conteudo,
  }));
  const { historico: anterior, pendentes } = separarRajada(historico);
  const { foco } = catalogoParaAtendimento({
    catalogo,
    mensagemAtual: pendentes.join(" | "),
    historico: anterior,
  });

  const semTexto = anterior.filter((m) => m.texto === SEM_TEXTO).length;

  retratos.push({
    id: id.slice(0, 8),
    total: msgs.length,
    naJanela: janela.length,
    foraDaJanela: Math.max(0, comTexto.length - JANELA),
    doCorretor: anterior.filter((m) => m.remetente === "corretor").length,
    doBot: anterior.filter((m) => m.remetente === "bot").length,
    doCliente: anterior.filter((m) => m.remetente === "cliente").length,
    semTexto,
    aproveitavel: anterior.length - semTexto,
    foco: foco?.slug ?? null,
  });
}

retratos.sort((a, b) => b.total - a.total);

const soma = (f: (r: Retrato) => number) => retratos.reduce((t, r) => t + f(r), 0);
console.log(`conversas com o bot atendendo e 4+ mensagens: ${retratos.length}`);
console.log(`  mensagens que existem no banco ...........: ${soma((r) => r.total)}`);
console.log(`  ficam FORA da janela de ${JANELA} ................: ${soma((r) => r.foraDaJanela)}`);
console.log(`  no prompt, mas SEM TEXTO (privacidade) ...: ${soma((r) => r.semTexto)}`);
console.log(`  no prompt e aproveitáveis ................: ${soma((r) => r.aproveitavel)}`);
console.log(`  dessas, falas do CORRETOR (não da IA) ....: ${soma((r) => r.doCorretor)}`);
console.log(`  conversas em que a IA se vê falando ......: ${retratos.filter((r) => r.doBot > 0).length}`);
console.log(`  conversas com foco de imóvel ............: ${retratos.filter((r) => r.foco).length}`);

console.log("\nas dez conversas mais longas (o caso em que a janela dói):");
console.log("  conversa   total  fora  semTexto  cliente  bot  corretor  foco");
for (const r of retratos.slice(0, 10)) {
  console.log(
    `  ${r.id}  ${String(r.total).padStart(5)}  ${String(r.foraDaJanela).padStart(4)}  ` +
      `${String(r.semTexto).padStart(8)}  ${String(r.doCliente).padStart(7)}  ` +
      `${String(r.doBot).padStart(3)}  ${String(r.doCorretor).padStart(8)}  ${r.foco ?? "-"}`,
  );
}
