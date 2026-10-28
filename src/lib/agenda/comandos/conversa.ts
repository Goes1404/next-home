import type { Dia } from "@/lib/agenda/calendario";
import type { EstadoDaConversa } from "@/lib/agenda/conversaDeAgenda";
import type { PedidoAConfirmar, PedidoDoCorretor } from "./tipos";
import { escolherLeadsPorNome } from "./escolherLead";
import { lerRespostaCurta } from "./respostasCurtas";
import { formatarQuando, textoDaAgendaDoDia, textoDeConfirmacao, textoDeEscolha, textoNaoEntendi } from "./textos";

/**
 * A conversa do corretor (ou do gestor) com o sistema pelo WhatsApp (fase 5).
 *
 * Toda mensagem tem resposta — nunca some calada (anti-objetivo 7). Nada é
 * gravado sem um "sim" (decisão do dono). A pergunta pendente (cobrança da
 * visita, pedido aguardando "sim", escolha entre clientes de mesmo nome)
 * vive em `conversa_de_agenda`; quem fala outra coisa no meio começa um
 * pedido novo.
 *
 * Tudo que toca banco, IA ou WhatsApp chega por `Dependencias`: aqui é só a
 * decisão, testável sem rede. O adaptador real é `canal.ts`.
 */

export type Dependencias = {
  agora: Date;
  ehGestor: boolean;
  lerEstado(): Promise<EstadoDaConversa | null>;
  gravarEstado(estado: EstadoDaConversa): Promise<void>;
  limparEstado(): Promise<void>;
  /** A IA do grupo pode ser usada agora (créditos do mês). */
  podeUsarIa(): Promise<boolean>;
  interpretar(texto: string): Promise<PedidoDoCorretor>;
  /** Clientes pelo nome: do próprio corretor; do gestor, do grupo. */
  buscarLeads(nome: string): Promise<{ id: string; nome: string }[]>;
  buscarEquipe(): Promise<{ id: string; nome: string }[]>;
  agendaDoDia(dia: Dia): Promise<{ inicio: string; descricao: string }[]>;
  marcarVisita(leadId: string, quando: Date): Promise<{ erro?: string }>;
  bloquear(inicio: Date, fim: Date, motivo: string | null): Promise<{ erro?: string }>;
  lembrete(leadId: string | null, texto: string, quando: Date): Promise<{ erro?: string }>;
  reuniao(titulo: string, inicio: Date, fim: Date, participantes: "equipe" | string[]): Promise<{ erro?: string; comVisita?: string[] }>;
  responderVisita(visitaId: string, resposta: "aconteceu" | "faltou" | "remarcou", nova?: Date): Promise<{ erro?: string; ok?: string }>;
  /** Devolve a visita à fila da cobrança: o próximo tick pergunta de novo. */
  devolverCobranca(visitaId: string): Promise<void>;
};

const SEM_IA =
  "Agora não consigo entender pedidos por mensagem: a assistente está sem créditos este mês. A Agenda do painel continua funcionando.";

export async function responderAoCorretor(texto: string, d: Dependencias): Promise<string> {
  const estado = await d.lerEstado();
  const curta = lerRespostaCurta(texto);

  if (estado) {
    const resposta = await responderAoEstado(estado, texto, curta, d);
    if (resposta !== null) return resposta;
  }

  // Sem pergunta pendente, "sim" ou "2" sozinho não diz nada: sem gastar IA.
  if (curta) return textoNaoEntendi(d.ehGestor);
  if (!(await d.podeUsarIa())) return SEM_IA;
  /*
   * Pedido novo no meio da cobrança: a pergunta nova ocupa o lugar da
   * pendente (uma por corretor), então a visita volta à fila e é perguntada
   * de novo quando esta conversa terminar. Só se o pedido gravar estado: uma
   * consulta não mexe na cobrança.
   */
  const cobranca = estado?.tipo === "cobranca" ? estado.visitaId : null;
  const dd: Dependencias = cobranca
    ? {
        ...d,
        gravarEstado: async (novo) => {
          await d.devolverCobranca(cobranca);
          await d.gravarEstado(novo);
        },
      }
    : d;
  return comecarPedido(await d.interpretar(texto), dd);
}

/** Responde à pergunta pendente; null = a mensagem é outra coisa (pedido novo). */
async function responderAoEstado(
  estado: EstadoDaConversa,
  texto: string,
  curta: ReturnType<typeof lerRespostaCurta>,
  d: Dependencias,
): Promise<string | null> {
  switch (estado.tipo) {
    case "cobranca": {
      if (curta?.tipo !== "numero" || curta.n > 3) return null;
      if (curta.n === 3) {
        await d.gravarEstado({ tipo: "cobranca_nova_data", visitaId: estado.visitaId, nome: estado.nome });
        return `Para quando ficou a visita com ${estado.nome}? Ex.: sábado 10h`;
      }
      const r = await d.responderVisita(estado.visitaId, curta.n === 1 ? "aconteceu" : "faltou");
      await d.limparEstado();
      return r.ok ?? r.erro ?? "Anotado.";
    }
    case "cobranca_nova_data": {
      if (curta?.tipo === "nao") {
        await d.limparEstado();
        return "Ok, não remarquei. Dá para responder depois no Início do painel.";
      }
      if (!(await d.podeUsarIa())) return SEM_IA;
      // A data sai pelo mesmo entendimento dos pedidos: "visita com <nome> <quando>".
      const pedido = await d.interpretar(`visita com ${estado.nome} ${texto}`);
      if (pedido.tipo !== "marcar_visita") return `Não entendi a data. Diga, por exemplo: sábado 10h.`;
      const r = await d.responderVisita(estado.visitaId, "remarcou", new Date(pedido.quando));
      if (r.ok) await d.limparEstado();
      return r.ok ?? `${r.erro} Diga outro horário, ou "não" para deixar para depois.`;
    }
    case "confirmar": {
      if (curta?.tipo === "nao") {
        await d.limparEstado();
        return "Ok, não marquei nada.";
      }
      if (curta?.tipo !== "sim") return null;
      await d.limparEstado();
      return executar(estado.pedido, estado.leadId ?? null, estado.participantes, d);
    }
    case "escolher_lead": {
      if (curta?.tipo !== "numero") return null;
      const lead = estado.opcoes[curta.n - 1];
      if (!lead) return `Responda com um número de 1 a ${estado.opcoes.length}.`;
      await d.gravarEstado({ tipo: "confirmar", pedido: estado.pedido, leadId: lead.id });
      return textoDeConfirmacao(estado.pedido, { nomeDoLead: lead.nome, nomeDoImovel: imovelDo(estado.pedido) });
    }
  }
}

function imovelDo(pedido: PedidoAConfirmar): string | undefined {
  return pedido.tipo === "marcar_visita" ? (pedido.imovel ?? undefined) : undefined;
}

async function comecarPedido(pedido: PedidoDoCorretor, d: Dependencias): Promise<string> {
  switch (pedido.tipo) {
    case "nao_entendi":
      return textoNaoEntendi(d.ehGestor);
    case "consultar":
      return textoDaAgendaDoDia(pedido.dia, await d.agendaDoDia(pedido.dia));
    case "bloquear":
      await d.gravarEstado({ tipo: "confirmar", pedido });
      return textoDeConfirmacao(pedido, {});
    case "reuniao": {
      if (pedido.participantes === "equipe") {
        await d.gravarEstado({ tipo: "confirmar", pedido, participantes: [] });
        return textoDeConfirmacao(pedido, {});
      }
      const equipe = await d.buscarEquipe();
      const ids: string[] = [];
      const nomes: string[] = [];
      for (const nome of pedido.participantes) {
        const achado = escolherLeadsPorNome(nome, equipe);
        if (achado.tipo !== "um") {
          return achado.tipo === "nenhum"
            ? `Não achei "${nome}" na equipe. Diga o nome como está no painel.`
            : `Há mais de uma pessoa com "${nome}" na equipe: ${achado.opcoes.map((o) => o.nome).join(", ")}. Diga o nome completo.`;
        }
        ids.push(achado.lead.id);
        nomes.push(achado.lead.nome);
      }
      await d.gravarEstado({ tipo: "confirmar", pedido, participantes: ids });
      return textoDeConfirmacao(pedido, { nomesDosParticipantes: nomes });
    }
    case "marcar_visita":
    case "lembrete": {
      if (pedido.cliente === null) {
        await d.gravarEstado({ tipo: "confirmar", pedido });
        return textoDeConfirmacao(pedido, {});
      }
      const achado = escolherLeadsPorNome(pedido.cliente, await d.buscarLeads(pedido.cliente));
      if (achado.tipo === "nenhum") {
        return `Não achei cliente com o nome "${pedido.cliente}" entre os seus. Confira o nome na Lista do painel.`;
      }
      if (achado.tipo === "varios") {
        await d.gravarEstado({ tipo: "escolher_lead", pedido, opcoes: achado.opcoes });
        return textoDeEscolha(pedido.cliente, achado.opcoes);
      }
      await d.gravarEstado({ tipo: "confirmar", pedido, leadId: achado.lead.id });
      return textoDeConfirmacao(pedido, { nomeDoLead: achado.lead.nome, nomeDoImovel: imovelDo(pedido) });
    }
  }
}

async function executar(
  pedido: PedidoAConfirmar,
  leadId: string | null,
  participantes: string[] | undefined,
  d: Dependencias,
): Promise<string> {
  switch (pedido.tipo) {
    case "marcar_visita": {
      if (!leadId) return "Não achei o cliente. Mande o pedido de novo.";
      const r = await d.marcarVisita(leadId, new Date(pedido.quando));
      return r.erro ?? `Pronto: visita marcada para ${formatarQuando(pedido.quando)}. Já está na sua Agenda.`;
    }
    case "bloquear": {
      const r = await d.bloquear(new Date(pedido.inicio), new Date(pedido.fim), pedido.motivo);
      return r.erro ?? "Pronto: horário bloqueado. A assistente não vai oferecer esse horário aos clientes.";
    }
    case "lembrete": {
      const r = await d.lembrete(leadId, pedido.texto, new Date(pedido.quando));
      return r.erro ?? `Pronto: eu te lembro ${formatarQuando(pedido.quando)}.`;
    }
    case "reuniao": {
      const quem = pedido.participantes === "equipe" || !participantes?.length ? "equipe" : participantes;
      const r = await d.reuniao(pedido.titulo, new Date(pedido.inicio), new Date(pedido.fim), quem);
      if (r.erro) return r.erro;
      const aviso = r.comVisita?.length ? ` Atenção: ${r.comVisita.join(", ")} tem visita nesse horário.` : "";
      return `Pronto: reunião marcada e avisada a quem participa.${aviso}`;
    }
  }
}
