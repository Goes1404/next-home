import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";
const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const roteiro = [
  "oi, vi o Vista AlphaGran no anúncio",     // cita imóvel → foco
  "Alphaville mesmo",
  "2 dormitórios",
  "quanto custa?",
  "nossa, tá caro. vou pensar",              // objeção de preço
  "acho que passa do que eu queria",
  "tem algo mais em conta?",                 // pede alternativa
  "hmm, vou ver com minha esposa",
];
const bot: Record<string, string> = {
  responder_dado: "O Vista AlphaGran começa em R$ 800.000.",
  responder_honesto: "Esse dado eu confirmo com o corretor.",
  "perguntar:regiao": "Em qual região você procura?",
  "perguntar:estagio": "Pronto para morar ou na planta?",
  "perguntar:tipologia": "Quantos dormitórios?",
  "perguntar:capacidade": "Qual faixa de valor você tem em mente?",
  convidar_visita: "Quer conhecer o decorado do Vista AlphaGran?",
  propor_horario: "Posso te mostrar sábado às 10h ou terça às 15h?",
  confirmar_visita: "Combinado, sábado às 10h.",
  devolver_escolha: "Me diz o que te ajudaria mais agora.",
  tratar_objecao: "Entendo. O que você viu por esse valor?",
  indicar_alternativa: "Tem o Serenne, a partir de R$ 320.000, também em Alphaville.",
  deixar_porta_aberta: "Claro, sem pressa. Te mando o link para vocês verem juntos.",
};
const historico: Fala[] = [];
const foco = catalogo.find(e => /vista/i.test(e.nome)) ?? null;
for (const [i, fala] of roteiro.entries()) {
  const e = estadoDaConversa({ historico, mensagemAtual: fala, imovelEmFoco: foco, catalogo });
  const j = planejarJogada(e);
  const chave = j.tipo === "perguntar" ? `perguntar:${j.assunto}` : j.tipo;
  const extra = j.tipo === "perguntar" ? `(${j.assunto})` : j.tipo === "responder_dado" ? `(${j.dado.tipo})` : "";
  console.log(`turno ${i + 1}: "${fala}"  → ${j.tipo} ${extra}`);
  const textoBot = bot[chave] ?? bot[j.tipo];
  if (!textoBot) { console.log(`   (sem texto de bot para ${j.tipo} — script)`); }
  historico.push({ remetente: "cliente", texto: fala }, { remetente: "bot", texto: textoBot ?? "..." });
}
