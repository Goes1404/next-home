/**
 * Quanto a conversa REAL fica sem foco — e quanto ela desfila mesmo com foco.
 *
 * Diferente dos traces vizinhos, este não simula: ele lê um export de
 * `whatsapp_mensagens` (conversa_id, remetente, conteudo, created_at) e roda
 * `detectarFoco` / `imoveisCitados` sobre o histórico de verdade. Zero
 * chamada de LLM.
 *
 *     npx tsx scripts/traces/medirFoco.ts conversas.json catalogo.json [AAAA-MM-DD]
 *
 * Foi ele que dimensionou o defeito de 10/09/2026: em 153 respostas do bot a
 * uma fala do cliente, 31 estavam SEM foco embora a IA já tivesse oferecido
 * um imóvel — o estado em que o prompt volta a mostrar dez fichas e ela
 * desfila em cima de quem tinha acabado de se interessar.
 */
import { readFileSync } from "node:fs";
import { imoveisCitados, detectarFoco } from "../../src/lib/whatsapp/focoDaConversa";
import type { Empreendimento } from "../../src/lib/types";

type Linha = { conversa_id: string; remetente: string; conteudo: string; created_at: string };

const CLIPE = String.fromCodePoint(0x1f4ce);

const linhas = (JSON.parse(readFileSync(process.argv[2], "utf8")) as Linha[]).map((l) => ({
  ...l,
  // A nota de auditoria de anexo (clipe + título + url) não é fala: contá-la
  // como citação faria uma FOTO do Bosque parecer uma OFERTA do Bosque.
  conteudo: l.conteudo.split(CLIPE)[0],
}));

const catalogo = JSON.parse(readFileSync(process.argv[3], "utf8")).map(
  (c: { slug: string; nome: string; nomes_alternativos: string[] }) =>
    ({ slug: c.slug, nome: c.nome, nomesAlternativos: c.nomes_alternativos ?? [] }) as Empreendimento,
);

const porConversa = new Map<string, Linha[]>();
for (const l of linhas) {
  if (!porConversa.has(l.conversa_id)) porConversa.set(l.conversa_id, []);
  porConversa.get(l.conversa_id)!.push(l);
}

const corte = process.argv[4] ?? "0000-00-00";
let analisadas = 0;
let comFoco = 0;
let desfileComFoco = 0;
let semFocoComOferta = 0;
let desfileSemFoco = 0;
const exemplos: string[] = [];

const trecho = (t: string, n: number) => t.slice(0, n).replace(/\s+/g, " ");

for (const [id, msgs] of porConversa) {
  msgs.sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (let i = 1; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.remetente !== "bot") continue;
    if (m.created_at < corte) continue;
    const anterior = msgs[i - 1];
    if (anterior.remetente !== "cliente") continue;

    const historico = msgs.slice(0, i - 1).map((x) => ({
      remetente: x.remetente as "cliente" | "bot",
      texto: x.conteudo,
    }));
    const foco = detectarFoco({ catalogo, mensagemAtual: anterior.conteudo, historico });

    const ofertas = msgs
      .slice(0, i - 1)
      .filter((x) => x.remetente === "bot")
      .flatMap((x) => imoveisCitados(x.conteudo, catalogo));
    const ultimaOferta = ofertas[ofertas.length - 1] ?? null;

    analisadas++;
    const citados = [...new Set(imoveisCitados(m.conteudo, catalogo))];
    const registrar = (rotulo: string, ancora: string, outros: string[]) => {
      if (exemplos.length >= 12) return;
      exemplos.push(
        [
          `${m.created_at.slice(0, 10)}  ${id.slice(0, 8)}  ${rotulo} ${ancora}`,
          `  CLIENTE: ${trecho(anterior.conteudo, 130)}`,
          `  BOT....: ${trecho(m.conteudo, 210)}`,
          `  -> outros: ${outros.join(", ")}`,
        ].join("\n"),
      );
    };

    if (foco) {
      comFoco++;
      const outros = citados.filter((s) => s !== foco.imovel.slug);
      if (outros.length > 0) {
        desfileComFoco++;
        registrar("[COM FOCO]", foco.imovel.slug, outros);
      }
    } else if (ultimaOferta) {
      semFocoComOferta++;
      const outros = citados.filter((s) => s !== ultimaOferta);
      if (outros.length > 0) {
        desfileSemFoco++;
        registrar("[SEM FOCO, oferta anterior]", ultimaOferta, outros);
      }
    }
  }
}

console.log(`corte: ${corte}`);
console.log(`respostas do bot a uma fala do cliente ....: ${analisadas}`);
console.log(`  com foco detectado ......................: ${comFoco}`);
console.log(`    e ainda assim citou OUTRO imóvel ......: ${desfileComFoco}`);
console.log(`  sem foco, mas o bot já tinha oferecido um : ${semFocoComOferta}`);
console.log(`    e citou outro imóvel ..................: ${desfileSemFoco}`);
console.log("\n" + exemplos.join("\n\n"));
