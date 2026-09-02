import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";
const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];

// O persona adversarial, turno a turno: repete "qual o valor exato?" e nunca responde ao funil.
// O texto do bot aqui é o que o EXECUTOR escreveria para cada jogada (aproximado).
const falasDoBot: Record<string, string> = {
  responder_dado: "O mais em conta do nosso catálogo começa em R$ 249.000. Quer conhecer o decorado?",
  responder_honesto: "O valor exato depende do andar e da forma de pagamento — isso o corretor fecha na visita.",
  perguntar: "Em qual região de Barueri você procura?",
  convidar_visita: "Quer conhecer o decorado?",
  propor_horario: "Posso te mostrar sábado às 10h ou terça às 15h?",
  devolver_escolha: "Me diz o que te ajudaria mais agora: fotos, o link, ou marcar de conversar?",
};
const historico: Fala[] = [];
const cliente = "qual o valor exato?";
for (let t = 1; t <= 8; t++) {
  const e = estadoDaConversa({ historico, mensagemAtual: cliente, imovelEmFoco: null, catalogo });
  const j = planejarJogada(e);
  const extra = j.tipo === "perguntar" ? `(${j.assunto})` : j.tipo === "propor_horario" ? `(já ofereceu ${j.jaOfereceu})` : j.tipo === "responder_honesto" ? `(vezes ${j.vezes})` : "";
  console.log(`turno ${t}: ${j.tipo} ${extra}`);
  historico.push({ remetente: "cliente", texto: cliente });
  historico.push({ remetente: "bot", texto: falasDoBot[j.tipo] });
}
