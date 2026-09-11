/**
 * O perfil que faltava: o cliente que NÃO QUER.
 *
 * Foi a queixa de produção (11/09/2026): "ela não está conseguindo entender
 * quando o cliente não quer". E era literal — medido no banco:
 *
 *   01/09 13:25  cliente: "No momento não tenho interesse. Obrigada"
 *                     IA: "Me conta, em qual região de Barueri você procura?"
 *   23/08 10:00  cliente: "E eu não quero ir"
 *                     IA: "Quer conhecer o decorado?"
 *
 * O planner não tinha detector de recusa, então "não tenho interesse" era
 * fala não classificada — e fala não classificada cai na pergunta de funil.
 *
 * Este trace roda as TRÊS famílias (desinteresse, já resolvido, pedido de
 * parada) mais os falsos positivos que derrubariam conversa boa. Custa zero:
 * nenhuma chamada de LLM, um segundo para rodar.
 *
 * O critério é simples e está no fim: nenhuma linha `perguntar:*` depois de
 * uma recusa, e nenhuma recusa detectada nas conversas que devem seguir.
 */
import { readFileSync } from "node:fs";
import { estadoDaConversa, planejarJogada } from "../../src/lib/whatsapp/jogada";
import { catalogoParaAtendimento } from "../../src/lib/whatsapp/focoDaConversa";
import type { Empreendimento } from "../../src/lib/types";
import type { Fala } from "../../src/lib/whatsapp/rajada";

const catalogo = JSON.parse(readFileSync("eval/fixtures/catalogo.json", "utf8")) as Empreendimento[];
const oferta = catalogo.find((e) => e.slug === "terra-alta-ta141")!;

const falasDoBot: Record<string, string> = {
  responder_dado: `O ${oferta.nome} tem 3 dormitórios e 2 vagas.`,
  responder_honesto: "Esse dado eu confirmo com o corretor e te trago.",
  responder_pergunta_aberta: "Deixa eu te responder isso certinho.",
  "perguntar:regiao": "Em qual região de Barueri você procura?",
  "perguntar:estagio": "Pronto para morar ou na planta?",
  "perguntar:tipologia": "Quantos dormitórios você precisa?",
  "perguntar:capacidade": "Qual faixa de valor você tem em mente?",
  convidar_visita: `Quer conhecer o decorado do ${oferta.nome}?`,
  propor_horario: "Posso te mostrar sábado às 10h ou terça às 15h?",
  devolver_escolha: "Me diz o que te ajudaria mais agora.",
  confirmar_visita: "Combinado, sábado às 10h está reservado para você.",
  encerrar_confirmado: "Te espero no stand.",
  tratar_objecao: "Entendo. O que você tinha em mente?",
  indicar_alternativa: "Tenho outra opção que pode caber melhor.",
  deixar_porta_aberta: "Tranquilo, fico à disposição.",
  agendar: "Perfeito, qual horário fica melhor?",
  retomar: "Oi! Você ainda está procurando?",
  acolher_recusa: "Sem problema! Só pra eu entender: foi preço, região, ou já resolveu?",
  encerrar_recusado: "Tudo bem, obrigado! Qualquer coisa é só chamar.",
};

type Roteiro = {
  nome: string;
  /** O que a IA disse antes — quase sempre um disparo de campanha. */
  abertura: string;
  falas: string[];
  /** A partir de qual turno (1-based) nenhuma pergunta de funil é aceitável. */
  recusaNoTurno: number | null;
};

const ROTEIROS: Roteiro[] = [
  {
    nome: "desinteresse — o caso literal de 01/09",
    abertura: `Tenho uma novidade: o ${oferta.nome}, no ${oferta.bairro}. Quer ver?`,
    falas: ["Oi , Boa tarde ! No momento não tenho interesse. Obrigada", "não, obrigada"],
    recusaNoTurno: 1,
  },
  {
    nome: "já resolvido — não há o que reofertar",
    abertura: "Oi! Vi que você procurava apartamento em Barueri.",
    falas: ["já comprei outro, obrigado"],
    recusaNoTurno: 1,
  },
  {
    nome: "pedido de parada — pula a tentativa",
    abertura: "Oi! Temos novidades em Alphaville.",
    falas: ["me tira da lista, por favor"],
    recusaNoTurno: 1,
  },
  {
    nome: "recusa no MEIO de uma conversa que ia bem",
    abertura: "Oi! Quer conhecer o decorado?",
    falas: ["quero sim", "2 dormitórios", "olha, pensando melhor não tenho interesse"],
    recusaNoTurno: 3,
  },
  {
    /*
     * O contraponto. Se este roteiro disparar recusa, o detector está
     * encerrando atendimento de quem está justamente escolhendo — o erro
     * mais caro que ele pode cometer.
     */
    nome: "PREFERÊNCIA, não recusa — tem de seguir a conversa",
    abertura: "Temos pronto para morar e na planta. Qual prefere?",
    falas: ["não quero na planta", "não tenho interesse em Alphaville, prefiro Barueri", "não posso sábado, pode ser domingo?"],
    recusaNoTurno: null,
  },
];

let problemas = 0;

for (const roteiro of ROTEIROS) {
  console.log(`\n=== ${roteiro.nome} ===`);
  const historico: Fala[] = [{ remetente: "bot", texto: roteiro.abertura }];

  for (const [i, fala] of roteiro.falas.entries()) {
    const turno = i + 1;
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

    const depoisDaRecusa = roteiro.recusaNoTurno !== null && turno >= roteiro.recusaNoTurno;
    const ehRecusa = chave === "acolher_recusa" || chave === "encerrar_recusado";

    let veredito = "";
    if (depoisDaRecusa && !ehRecusa) {
      veredito = "  ← ERRADO: recusa respondida com outra coisa";
      problemas++;
    } else if (!depoisDaRecusa && ehRecusa) {
      veredito = "  ← ERRADO: encerrou uma conversa que estava indo bem";
      problemas++;
    }

    console.log(`turno ${turno}: "${fala}"\n   jogada ..: ${chave}${veredito}`);

    historico.push({ remetente: "cliente", texto: fala });
    historico.push({ remetente: "bot", texto: falasDoBot[chave] ?? "..." });
  }
}

console.log(
  problemas === 0
    ? "\n✓ nenhuma recusa caiu no funil, e nenhuma preferência foi tratada como recusa."
    : `\n✗ ${problemas} turno(s) errado(s).`,
);
process.exit(problemas === 0 ? 0 : 1);
