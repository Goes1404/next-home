import { describe, expect, it } from "vitest";
import {
  escolherLeadDoRetorno,
  lerMensagemDoGrupo,
  reconhecerAutorNoGrupo,
  type Aguardando,
} from "./identificar";

const GRUPO = "120363401120401903@g.us";

function payloadDoGrupo(data: Record<string, unknown> = {}) {
  return {
    instance: "central",
    data: {
      key: { remoteJid: GRUPO, fromMe: false, id: "MSG1", participant: "5511987654321@s.whatsapp.net" },
      message: { conversation: "liguei, atendeu" },
      messageTimestamp: 1761480000,
      ...data,
    },
  };
}

describe("lerMensagemDoGrupo", () => {
  it("lê texto simples de um grupo", () => {
    const m = lerMensagemDoGrupo(payloadDoGrupo());
    expect(m).toEqual({
      grupoJid: GRUPO,
      mensagemId: "MSG1",
      autorIds: ["5511987654321@s.whatsapp.net"],
      texto: "liguei, atendeu",
      ehAudio: false,
      citadaId: null,
      enviadaEm: new Date(1761480000 * 1000),
    });
  });

  it("lê o texto de extendedTextMessage e a citação dentro dela", () => {
    const m = lerMensagemDoGrupo(
      payloadDoGrupo({
        message: { extendedTextMessage: { text: "1", contextInfo: { stanzaId: "AVISO1" } } },
      }),
    );
    expect(m?.texto).toBe("1");
    expect(m?.citadaId).toBe("AVISO1");
  });

  it("lê a citação copiada para data.contextInfo e a de audioMessage", () => {
    const copiada = lerMensagemDoGrupo(payloadDoGrupo({ contextInfo: { stanzaId: "COPIA" } }));
    expect(copiada?.citadaId).toBe("COPIA");

    const audio = lerMensagemDoGrupo(
      payloadDoGrupo({
        message: { audioMessage: { url: "x", contextInfo: { stanzaId: "NOAUDIO" } } },
      }),
    );
    expect(audio?.ehAudio).toBe(true);
    expect(audio?.texto).toBe("");
    expect(audio?.citadaId).toBe("NOAUDIO");
  });

  it("desembrulha mensagem temporária, visualização única e documento com legenda", () => {
    const temporaria = lerMensagemDoGrupo(
      payloadDoGrupo({
        message: {
          ephemeralMessage: {
            message: { extendedTextMessage: { text: "liguei pra Ana", contextInfo: { stanzaId: "AV1" } } },
          },
        },
      }),
    );
    expect(temporaria?.texto).toBe("liguei pra Ana");
    expect(temporaria?.citadaId).toBe("AV1");

    const aninhada = lerMensagemDoGrupo(
      payloadDoGrupo({
        message: { ephemeralMessage: { message: { viewOnceMessageV2: { message: { audioMessage: {} } } } } },
      }),
    );
    expect(aninhada?.ehAudio).toBe(true);

    for (const embrulho of ["viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage"]) {
      const m = lerMensagemDoGrupo(payloadDoGrupo({ message: { [embrulho]: { message: { conversation: "oi" } } } }));
      expect(m?.texto).toBe("oi");
    }
  });

  it("junta todos os ids de participante, sem repetir e sem lixo", () => {
    const m = lerMensagemDoGrupo({
      data: {
        key: {
          remoteJid: GRUPO,
          id: "M2",
          participant: "999@lid",
          participantAlt: "5511987654321@s.whatsapp.net",
          participantPn: "",
          senderPn: 42,
        },
        participant: "999@lid",
        senderPn: "5511987654321@s.whatsapp.net",
        message: { conversation: "oi" },
      },
    });
    expect(m?.autorIds).toEqual(["999@lid", "5511987654321@s.whatsapp.net"]);
  });

  it("usa a hora atual quando a mensagem não traz o horário", () => {
    const antes = Date.now();
    const m = lerMensagemDoGrupo(payloadDoGrupo({ messageTimestamp: undefined }));
    expect(m!.enviadaEm.getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("ignora conversa individual, fromMe, sem id e sem texto nem áudio", () => {
    const individual = payloadDoGrupo();
    (individual.data.key as Record<string, unknown>).remoteJid = "5511999999999@s.whatsapp.net";
    expect(lerMensagemDoGrupo(individual)).toBeNull();

    const minha = payloadDoGrupo();
    (minha.data.key as Record<string, unknown>).fromMe = true;
    expect(lerMensagemDoGrupo(minha)).toBeNull();

    const semId = payloadDoGrupo();
    delete (semId.data.key as Record<string, unknown>).id;
    expect(lerMensagemDoGrupo(semId)).toBeNull();

    expect(lerMensagemDoGrupo(payloadDoGrupo({ message: { imageMessage: {} } }))).toBeNull();
    expect(lerMensagemDoGrupo(payloadDoGrupo({ message: undefined }))).toBeNull();
    expect(lerMensagemDoGrupo(null)).toBeNull();
    expect(lerMensagemDoGrupo("texto")).toBeNull();
  });
});

describe("reconhecerAutorNoGrupo", () => {
  const corretor = { whatsapp: "(11) 98765-4321", whatsapp_lid: "777123@lid" };

  it("reconhece pelo número, com e sem 55 e com o 9 do celular", () => {
    expect(reconhecerAutorNoGrupo(["5511987654321@s.whatsapp.net"], corretor)).toBe(true);
    expect(reconhecerAutorNoGrupo(["551187654321@s.whatsapp.net"], corretor)).toBe(true);
    expect(reconhecerAutorNoGrupo(["5511987654321:12@s.whatsapp.net"], corretor)).toBe(true);
  });

  it("reconhece pelo lid guardado, sem diferenciar caixa", () => {
    expect(reconhecerAutorNoGrupo(["777123@lid"], corretor)).toBe(true);
    expect(reconhecerAutorNoGrupo(["777123@LID"], corretor)).toBe(true);
  });

  it("reconhece quando só um dos ids bate", () => {
    expect(reconhecerAutorNoGrupo(["555@lid", "5511987654321@s.whatsapp.net"], corretor)).toBe(true);
  });

  it("não reconhece gestor (outro número) nem outro lid", () => {
    expect(reconhecerAutorNoGrupo(["5511911112222@s.whatsapp.net"], corretor)).toBe(false);
    expect(reconhecerAutorNoGrupo(["999@lid"], corretor)).toBe(false);
    expect(reconhecerAutorNoGrupo(["777123@lid"], { ...corretor, whatsapp_lid: null })).toBe(false);
  });

  it("lista vazia nunca reconhece", () => {
    expect(reconhecerAutorNoGrupo([], corretor)).toBe(false);
    expect(reconhecerAutorNoGrupo([], { whatsapp: "", whatsapp_lid: "" })).toBe(false);
  });
});

describe("escolherLeadDoRetorno", () => {
  const ana: Aguardando = { envioId: "e-ana", leadId: "l-ana", nome: "Ana Souza", avisoMensagemId: "AV-ANA", corretorAtualId: "c1" };
  const paulo: Aguardando = { envioId: "e-paulo", leadId: "l-paulo", nome: "Paulo Lima", avisoMensagemId: "AV-PAULO", corretorAtualId: "c1" };
  const base = { corretorId: "c1", citadaId: null, texto: "liguei, atendeu", aguardando: [], confirmacoes: [], perguntas: [] };

  it("regra 1: citou um aviso, é o lead daquele aviso (mesmo com vários aguardando)", () => {
    const r = escolherLeadDoRetorno({ ...base, citadaId: "AV-PAULO", aguardando: [ana, paulo] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-paulo", envioId: "e-paulo" });
  });

  it("regra 2: citou uma confirmação, é correção do mesmo lead", () => {
    const r = escolherLeadDoRetorno({
      ...base,
      citadaId: "CONF1",
      texto: "não, a visita é domingo",
      aguardando: [ana, paulo],
      confirmacoes: [{ retornoId: "r1", mensagemId: "CONF1", leadId: "l-ana" }],
    });
    expect(r).toEqual({ tipo: "correcao", retornoId: "r1", leadId: "l-ana" });
  });

  it("regra 5 (resposta): '1' citando a pergunta escolhe a opção na ordem mostrada", () => {
    const perguntas = [{ retornoId: "r9", mensagemId: "PERG1", opcoes: ["l-ana", "l-paulo"] }];
    for (const [texto, indice] of [["1", 0], ["2", 1], ["1)", 0], ["opção 2", 1], [" 2 ", 1], ["Opcao 1", 0]] as const) {
      const r = escolherLeadDoRetorno({ ...base, citadaId: "PERG1", texto, aguardando: [ana, paulo], perguntas });
      expect(r).toEqual({ tipo: "escolha", retornoId: "r9", indice });
    }
  });

  it("regra 5 (resposta): número fora da lista pergunta de novo com as mesmas opções", () => {
    const perguntas = [{ retornoId: "r9", mensagemId: "PERG1", opcoes: ["l-paulo", "l-ana"] }];
    const r = escolherLeadDoRetorno({ ...base, citadaId: "PERG1", texto: "3", aguardando: [ana, paulo], perguntas });
    expect(r).toEqual({ tipo: "perguntar", opcoes: [paulo, ana] });
  });

  it("regra 3: sem citação e um só aguardando, é ele", () => {
    const r = escolherLeadDoRetorno({ ...base, aguardando: [ana] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-ana", envioId: "e-ana" });
  });

  it("regra 3: citação de mensagem desconhecida não atrapalha", () => {
    const r = escolherLeadDoRetorno({ ...base, citadaId: "OUTRA", aguardando: [ana] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-ana", envioId: "e-ana" });
  });

  it("regra 4: vários aguardando e o primeiro nome aparece uma vez (sem acento nem caixa)", () => {
    const joao: Aguardando = { ...paulo, leadId: "l-joao", envioId: "e-joao", nome: "João Pereira" };
    const r = escolherLeadDoRetorno({ ...base, texto: "Falei com o JOAO agora, quer visitar sábado", aguardando: [ana, joao] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-joao", envioId: "e-joao" });
  });

  it("regra 4: só vale palavra inteira (Ana não casa com Mariana)", () => {
    const mariana: Aguardando = { ...paulo, leadId: "l-mariana", envioId: "e-mariana", nome: "Mariana" };
    const r = escolherLeadDoRetorno({ ...base, texto: "falei com a Mariana, quer visita", aguardando: [ana, mariana] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-mariana", envioId: "e-mariana" });
  });

  it("regra 5: vários aguardando e nenhum nome no texto, pergunta com todos na ordem", () => {
    const r = escolherLeadDoRetorno({ ...base, aguardando: [ana, paulo] });
    expect(r).toEqual({ tipo: "perguntar", opcoes: [ana, paulo] });
  });

  it("regra 5: dois leads com o mesmo primeiro nome no texto é ambíguo, pergunta", () => {
    const ana2: Aguardando = { ...paulo, leadId: "l-ana2", envioId: "e-ana2", nome: "Ana Costa" };
    const r = escolherLeadDoRetorno({ ...base, texto: "falei com a Ana, atendeu", aguardando: [ana, ana2] });
    expect(r).toEqual({ tipo: "perguntar", opcoes: [ana, ana2] });
  });

  it("citou o aviso de um lead que já não é do autor: nao_e_mais_seu", () => {
    const deOutro: Aguardando = { ...ana, corretorAtualId: "c2" };
    const r = escolherLeadDoRetorno({ ...base, citadaId: "AV-ANA", aguardando: [deOutro, paulo] });
    expect(r).toEqual({ tipo: "nao_e_mais_seu", leadId: "l-ana" });
  });

  it("regra 4: mesmo primeiro nome em dois leads, o nome completo no texto desempata", () => {
    const ana2: Aguardando = { ...paulo, leadId: "l-ana2", envioId: "e-ana2", nome: "Ana Costa" };
    const r = escolherLeadDoRetorno({ ...base, texto: "falei com a Ana Souza, atendeu", aguardando: [ana, ana2] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-ana", envioId: "e-ana" });
  });

  it("citou o aviso de lead já respondido (fora de aguardando): é esse lead, não outro que aguarda", () => {
    const avisos = [
      { envioId: "e-ana", leadId: "l-ana", avisoMensagemId: "AV-ANA", corretorAtualId: "c1" },
      { envioId: "e-paulo", leadId: "l-paulo", avisoMensagemId: "AV-PAULO", corretorAtualId: "c1" },
    ];
    const r = escolherLeadDoRetorno({ ...base, citadaId: "AV-ANA", texto: "2ª ligação, marcou visita", aguardando: [paulo], avisos });
    expect(r).toEqual({ tipo: "lead", leadId: "l-ana", envioId: "e-ana" });
  });

  it("citou o aviso (em avisos) de lead que passou para outro corretor: nao_e_mais_seu", () => {
    const avisos = [{ envioId: "e-ana", leadId: "l-ana", avisoMensagemId: "AV-ANA", corretorAtualId: "c2" }];
    const r = escolherLeadDoRetorno({ ...base, citadaId: "AV-ANA", aguardando: [paulo], avisos });
    expect(r).toEqual({ tipo: "nao_e_mais_seu", leadId: "l-ana" });
  });

  it("lead de outro corretor não conta como aguardando do autor", () => {
    const deOutro: Aguardando = { ...ana, corretorAtualId: "c2" };
    const r = escolherLeadDoRetorno({ ...base, aguardando: [deOutro, paulo] });
    expect(r).toEqual({ tipo: "lead", leadId: "l-paulo", envioId: "e-paulo" });
  });

  it("nenhum aguardando e sem citação: nenhum", () => {
    expect(escolherLeadDoRetorno({ ...base })).toEqual({ tipo: "nenhum" });
  });
});
