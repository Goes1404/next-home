/**
 * O perfil que faltava: o cliente que SE INTERESSA pelo imóvel que a IA
 * ofereceu — e nunca repete o nome dele.
 *
 * Foi a queixa de produção (10/09/2026): "ele oferece um produto, o cliente
 * se interessa e faz perguntas sobre o imóvel, e ele tenta redirecionar para
 * outro em vez de vender aquele". Os traces anteriores nunca exercitaram
 * isto: no cooperativo o cliente responde ao funil, no adversarial ele
 * insiste em preço. Nos dois, o imóvel é pano de fundo.
 *
 * O que este trace mostra, e nenhum teste unitário mostra, é o par
 * (foco, jogada) turno a turno — que é o que decide se a conversa aprofunda
 * ou desfila. Custa zero: nenhuma chamada de LLM.
 */
import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import { catalogoParaAtendimento } from "../../src/lib/whatsapp/focoDaConversa";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const oferta = catalogo.find((e) => e.slug === "terra-alta-ta141")!;

const roteiroDoCliente = [
  "oi, vi a mensagem",
  "essa tá massa",
  "quantos quartos tem?",
  "e o tamanho?",
  "gostei mesmo, fica onde?",
  "tem lazer?",
  "quero ver ao vivo",
];

const falasDoBot: Record<string, string> = {
  responder_dado: `O ${oferta.nome} tem 3 dormitórios e 2 vagas.`,
  responder_honesto: "Esse dado eu confirmo com o corretor e te trago.",
  "perguntar:regiao": "Em qual região de Barueri você procura?",
  "perguntar:estagio": "Pronto para morar ou na planta?",
  "perguntar:tipologia": "Quantos dormitórios você precisa?",
  "perguntar:capacidade": "Qual faixa de valor você tem em mente?",
  convidar_visita: `Quer conhecer o decorado do ${oferta.nome}?`,
  propor_horario: "Posso te mostrar sábado às 10h ou terça às 15h?",
  devolver_escolha: "Me diz o que te ajudaria mais agora.",
  confirmar_visita: "Combinado, sábado às 10h está reservado para você.",
  encerrar_confirmado: "Te espero no stand. Qualquer dúvida até lá, me chama.",
  tratar_objecao: "Entendo. O que você tinha em mente?",
  indicar_alternativa: "Tenho outra opção que pode caber melhor.",
  deixar_porta_aberta: "Tranquilo, fico à disposição.",
};

// A conversa começa com a IA falando: é o disparo de campanha.
const historico: Fala[] = [
  { remetente: "bot", texto: `Tenho uma novidade: o ${oferta.nome}, no ${oferta.bairro}. Quer ver?` },
];

for (const [i, fala] of roteiroDoCliente.entries()) {
  const { catalogo: doPrompt, foco } = catalogoParaAtendimento({
    catalogo,
    mensagemAtual: fala,
    historico,
  });
  const imovelEmFoco = foco ? (doPrompt.find((e) => e.slug === foco.slug) ?? null) : null;
  const jogada = planejarJogada(
    estadoDaConversa({ historico, mensagemAtual: fala, imovelEmFoco, catalogo: doPrompt }),
  );
  const chave = jogada.tipo === "perguntar" ? `perguntar:${jogada.assunto}` : jogada.tipo;

  console.log(
    `turno ${i + 1}: "${fala}"\n` +
      `   foco ....: ${foco?.slug ?? "NENHUM"}\n` +
      `   fichas ..: ${doPrompt.length} (${doPrompt.map((e) => e.slug).join(", ")})\n` +
      `   jogada ..: ${chave}`,
  );

  historico.push({ remetente: "cliente", texto: fala });
  historico.push({ remetente: "bot", texto: falasDoBot[chave] ?? falasDoBot[jogada.tipo] ?? "..." });
}
