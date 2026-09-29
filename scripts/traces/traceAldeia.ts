/**
 * A conversa REAL de 28/09/2026 (9d731b8a), turno a turno: foco + jogada,
 * sem chamar modelo nenhum.
 *
 * O cliente pediu 2 dormitórios na Aldeia e recebeu o Breeze (Jardim
 * Júlio) porque a abertura "da Next Home" virava foco no "Breeze HOME
 * Clube". Depois perguntou "tem algo que entregue o ano que vem?" e ouviu
 * só que o imóvel em foco NÃO entrega.
 */
import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import { detectarFoco } from "../../src/lib/whatsapp/focoDaConversa";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];

const turnos: { de: "cliente" | "bot"; texto: string }[] = [
  { de: "bot", texto: "Oi Matheus, tudo bem? Aqui é a Lia, da Next Home em Alphaville." },
  { de: "cliente", texto: "Oi\nVc tem apartamento de dois dormitórios em Barueri" },
  { de: "bot", texto: "Que bom receber seu oi! Em qual região de Barueri você procura o imóvel?" },
  { de: "cliente", texto: "Na aldeia" },
  { de: "bot", texto: "Oi Matheus, tudo bem? Quer conhecer o decorado do Breeze Home Clube?" },
  { de: "cliente", texto: "Onde fica ?" },
  { de: "bot", texto: "O Breeze Home Clube fica no Jardim Júlio, em Barueri. Quer conhecer o decorado na terça às 9h ou às 15h?" },
  { de: "cliente", texto: "Tem algum próximo da estação ?" },
  { de: "bot", texto: "Tem sim, o Estação 267 fica na Nova Aldeinha, pertinho da estação de Barueri. Quer que eu te envie a apresentação digital?" },
  { de: "cliente", texto: "Pode ser" },
  { de: "bot", texto: "Te mandei a apresentação digital do Estação 267 aqui embaixo, dá uma olhada e me diz o que achou" },
  { de: "cliente", texto: "Tem algo que entregue o ano que vem ?" },
  { de: "bot", texto: "O Estação 267 é pronto para morar, não tem entrega para o ano que vem. Quer conhecer o decorado na terça às 9h ou às 15h?" },
  { de: "cliente", texto: "Quero informações do manaca" },
  { de: "bot", texto: "O Manacá Barueri entrega em janeiro do ano que vem e tem 2 dormitórios com suíte. Você prefere imóvel pronto para morar ou na planta?" },
  { de: "cliente", texto: "Na planta" },
  { de: "bot", texto: "O Manacá Barueri tem opções de 2 e 3 dormitórios. Quer que eu te envie a apresentação digital?" },
  { de: "cliente", texto: "Quero Simm" },
];

const historico: Fala[] = [];
for (const t of turnos) {
  if (t.de === "bot") {
    historico.push({ remetente: "bot", texto: t.texto });
    continue;
  }
  const foco = detectarFoco({ catalogo, mensagemAtual: t.texto, historico });
  const jogada = planejarJogada(
    estadoDaConversa({ historico, mensagemAtual: t.texto, imovelEmFoco: foco?.imovel ?? null, catalogo }),
  );
  const chave = jogada.tipo === "perguntar" ? `perguntar:${jogada.assunto}` : jogada.tipo;
  console.log(`CLIENTE: "${t.texto.replace(/\n/g, " / ")}"`);
  console.log(`   foco ......: ${foco ? `${foco.imovel.nome} (${foco.origem})` : "(nenhum)"}`);
  console.log(`   jogada ....: ${chave}\n`);
  historico.push({ remetente: "cliente", texto: t.texto });
}
