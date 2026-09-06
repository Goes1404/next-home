import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";
const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];

// Cliente que responde ao funil, na ordem em que a Sofia pergunta.
const roteiroDoCliente = [
  "oi, vi o anúncio de vocês",
  "procuro em Alphaville",
  "pode ser na planta",
  "2 dormitórios",
  "sim, quero conhecer",
  "uns 600 mil, financiando",
  "sábado de manhã pode ser",
  "perfeito, sábado às 10h então",
  "onde encontro vocês?",
  "só quero ver o apartamento",
];
const falasDoBot: Record<string, string> = {
  responder_dado: "O Vista AlphaGran começa em R$ 800.000.",
  responder_honesto: "Esse dado eu confirmo com o corretor e te trago.",
  "perguntar:regiao": "Em qual região de Barueri você procura?",
  "perguntar:estagio": "Pronto para morar ou na planta?",
  "perguntar:tipologia": "Quantos dormitórios você precisa?",
  "perguntar:capacidade": "Qual faixa de valor você tem em mente?",
  convidar_visita: "Quer conhecer o decorado do Vista AlphaGran?",
  propor_horario: "Posso te mostrar sábado às 10h ou terça às 15h?",
  devolver_escolha: "Me diz o que te ajudaria mais agora.",
  confirmar_visita: "Combinado, sábado às 10h está reservado para você.",
  encerrar_confirmado: "No stand do Vista AlphaGran. Qualquer dúvida até lá, me chama.",
};
const historico: Fala[] = [];
for (const [i, fala] of roteiroDoCliente.entries()) {
  const e = estadoDaConversa({ historico, mensagemAtual: fala, imovelEmFoco: null, catalogo });
  const j = planejarJogada(e);
  const chave = j.tipo === "perguntar" ? `perguntar:${j.assunto}` : j.tipo;
  const extra = j.tipo === "perguntar" ? `(${j.assunto})` : j.tipo === "propor_horario" ? `(já ofereceu ${j.jaOfereceu})` : "";
  console.log(`turno ${i + 1}: cliente "${fala}"  →  ${j.tipo} ${extra}`);
  historico.push({ remetente: "cliente", texto: fala });
  historico.push({ remetente: "bot", texto: falasDoBot[chave] ?? falasDoBot[j.tipo] });
}
