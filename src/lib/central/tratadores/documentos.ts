import "server-only";

import { lerQuando, rotuloDoDiaDoCalendario, rotuloDoInstante, rotuloDoPeriodo } from "@/lib/agenda/quandoEmTexto";
import { apagarAnotacaoPessoal, criarLembretePeloCentral } from "@/lib/anotacoes/anotacaoPessoal";
import { DOCUMENTOS_DO_CONTRATO, FASE_DOCUMENTO_LABEL, FASES_DOCUMENTO, type FaseDocumento } from "@/lib/crm/documentacao";
import { lerDocumentacaoDoLead, type DocumentacaoDoLead } from "@/lib/crm/documentacaoDados";
import {
  anexarDocumentoPeloCentral,
  mandarLinkDeDocumentosPeloCentral,
  podeMandarAoCliente,
  removerDocumentoAnexadoPeloCentral,
} from "@/lib/crm/documentoPeloCentral";
import { arquivarLeadsImportadosPeloCentral, importarLeadsPeloCentral, telefonesJaNoGrupo, type LinhaParaImportar } from "@/lib/crm/importacaoPeloCentral";
import { DOCUMENTOS_PADRAO } from "@/lib/crm/linksDoCliente";
import { dedupInterno, extrairDeXlsx, LIMITE_POR_IMPORTACAO, parsearTabelaLeads, type CandidatoLead } from "@/lib/leads/importacao";
import { createServiceClient } from "@/lib/supabase/service";
import { baixarMidiaDoProvedor, type MidiaBaixada } from "@/lib/whatsapp/provider";
import type { Acao, Consulta, ContextoDoCentral, Preparo, ResultadoDaAcao } from "../executar";
import { ehReferencia, mensagemDaReferencia, tipoDaImagem, type MidiaDoPedido, type ReferenciaDaMidia } from "../midia";
import { lerCentral } from "../numeroDoCentral";
import { resolverLead, respostaDeLeadIncerto } from "./resolverLead";

/**
 * Frente I — documentos, lembretes e planilha da onda 2: documentos_do_lead
 * (5), lembrete (8), importar_planilha (29).
 *
 * Contrato em `../executar.ts`: `preparar` resolve no banco e NUNCA grava;
 * o "sim" roda `executar` só com os `dados`; `desfazer` volta em até 24 h.
 * Nada aqui escreve em tabela: documento e link por
 * `crm/documentoPeloCentral.ts`, lembrete por `anotacoes/anotacaoPessoal.ts`,
 * planilha por `crm/importacaoPeloCentral.ts`. O escopo (grupo, papel, quem
 * pede) é o da identificação.
 *
 * A mídia (foto de documento, planilha) chega pelo contexto
 * (`ctx.midia`), posto pela conversa, nunca pela IA. O arquivo não vai aos
 * `dados`: a foto vai pela REFERÊNCIA da mensagem (baixada de novo no "sim")
 * e a planilha pelas linhas já lidas, ambas em chaves "_", que a conversa
 * tira do registro do comando (`paraORegistro`).
 */

type Supa = ReturnType<typeof createServiceClient>;

export type DependenciasDosDocumentos = {
  supabase: () => Supa;
  relogio: () => Date;
  /** Baixa de novo, no "sim", a foto que a pessoa mandou (pela referência da mensagem). */
  baixar: (r: ReferenciaDaMidia) => Promise<MidiaBaixada | { ok: false; motivo: string }>;
  anexar: typeof anexarDocumentoPeloCentral;
  removerAnexo: typeof removerDocumentoAnexadoPeloCentral;
  podeMandar: typeof podeMandarAoCliente;
  mandarLink: typeof mandarLinkDeDocumentosPeloCentral;
};

/** A foto é do WhatsApp do central: é a instância dele que decifra a mídia. */
async function baixarDeNovo(r: ReferenciaDaMidia): Promise<MidiaBaixada | { ok: false; motivo: string }> {
  const central = await lerCentral();
  if (!central) return { ok: false, motivo: "sem_central" };
  return baixarMidiaDoProvedor({ instanceName: central.instanceName, messageId: r.id, mensagemCompleta: mensagemDaReferencia(r), timeoutMs: 15_000 });
}

const PADRAO: DependenciasDosDocumentos = {
  supabase: () => createServiceClient(),
  relogio: () => new Date(),
  baixar: baixarDeNovo,
  anexar: anexarDocumentoPeloCentral,
  removerAnexo: removerDocumentoAnexadoPeloCentral,
  podeMandar: podeMandarAoCliente,
  mandarLink: mandarLinkDeDocumentosPeloCentral,
};

const LIMITE_DO_FUTURO_MS = 366 * 24 * 3600_000;
const FALHOU: ResultadoDaAcao = { ok: false, texto: "Não consegui fazer isso agora. Peça de novo." };

function texto(v: unknown, teto: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, teto) : null;
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });
const pergunta = (p: string): Preparo => resposta({ pergunta: p });
const recusa = (erro: string): Preparo => resposta({ erro });

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

// ── Qual documento é ───────────────────────────────────────────────────────

/**
 * As pistas de qual documento a foto é, pela fala da pessoa ("o RG do
 * João", "holerite da Maria"), e como reconhecer o item na lista do lead.
 * A ordem decide: "extrato do FGTS" é FGTS antes de extrato, "imposto de
 * renda" antes de "renda", e o item do RG não pode casar o do CPF ("CPF (se
 * não estiver no RG/CNH)").
 */
const PISTAS: { fala: RegExp; item: RegExp }[] = [
  { fala: /imposto de renda|\birpf\b|\bir\b/, item: /imposto de renda/ },
  { fala: /fgts/, item: /fgts/ },
  { fala: /pro-?labore|decore/, item: /pro-?labore|decore/ },
  { fala: /extrato/, item: /extratos? bancari/ },
  { fala: /holerite|contracheque|comprovante de renda|\brenda\b/, item: /holerite|comprovante de renda/ },
  { fala: /residencia|endereco|conta de (luz|agua|gas)/, item: /residencia/ },
  { fala: /certidao|casamento|nascimento|estado civil|uniao estavel/, item: /certidao|estado civil|casamento/ },
  { fala: /\bcpf\b/, item: /^cpf\b/ },
  { fala: /\brg\b|\bcnh\b|identidade|habilitacao|carteira de motorista/, item: /^(rg|cnh)\b/ },
  { fala: /proposta/, item: /proposta assinada/ },
  { fala: /sinal/, item: /sinal/ },
  { fala: /ficha cadastral/, item: /ficha cadastral/ },
  { fala: /carta de (aprovacao|credito)/, item: /carta de aprovacao/ },
  { fala: /contrato/, item: /contrato de compra/ },
];

/** Os itens de onde escolher quando a lista do lead não tem o documento: os nomes do painel. */
const ITENS_CONHECIDOS: { fase: FaseDocumento; item: string }[] = [
  ...DOCUMENTOS_PADRAO.map((item) => ({ fase: "financiamento" as const, item })),
  { fase: "financiamento", item: "Extratos bancários dos últimos 6 meses" },
  { fase: "financiamento", item: "Pró-labore ou DECORE (se tiver empresa)" },
  ...DOCUMENTOS_DO_CONTRATO.map((item) => ({ fase: "contrato" as const, item })),
];

/**
 * O item da Documentação para a foto: primeiro na lista do LEAD (o nome que
 * o corretor deu), depois nos nomes do painel (fica como avulso na ficha, à
 * vista, se a lista dele não pede esse documento). Sem pista na fala,
 * `null`: a pergunta "qual documento é?" volta à pessoa.
 */
export function itemDaFoto(dica: string, doc: Pick<DocumentacaoDoLead, "fases">): { fase: FaseDocumento; item: string } | null {
  const fala = semAcento(dica);
  for (const pista of PISTAS) {
    if (!pista.fala.test(fala)) continue;
    for (const fase of FASES_DOCUMENTO) {
      const daLista = doc.fases[fase].itens.find((i) => pista.item.test(semAcento(i)));
      if (daLista) return { fase, item: daLista };
    }
    const conhecido = ITENS_CONHECIDOS.find((c) => pista.item.test(semAcento(c.item)));
    if (conhecido) return conhecido;
  }
  return null;
}

/** O que a seção Documentação da ficha mostra, em texto (nunca o arquivo nem o link assinado). */
function resumoDaDocumentacao(nome: string, doc: DocumentacaoDoLead): Record<string, unknown> {
  const situacao = (s: string, motivo: string | null) =>
    s === "falta"
      ? "falta"
      : s === "recebido"
        ? "chegou, esperando conferência"
        : s === "conferido"
          ? "conferido"
          : `recusado${motivo ? ` (${motivo})` : ""}, precisa mandar de novo`;
  const fases = FASES_DOCUMENTO.flatMap((fase) => {
    const f = doc.fases[fase];
    const daFase = doc.documentos.filter((d) => d.fase === fase);
    if (f.itens.length === 0 && daFase.length === 0) return [];
    return [
      {
        fase: FASE_DOCUMENTO_LABEL[fase],
        documentos: f.resumo.itens.map((i) => ({ documento: i.item, situacao: situacao(i.situacao, i.motivo) })),
        faltam: f.resumo.pendentesDoCliente,
        conferidos: f.resumo.conferidos,
        aConferir: f.resumo.aConferir,
        foraDaLista: f.resumo.avulsos.length,
        pronta: f.resumo.pronta,
        link: f.link ? (f.link.valido ? "link de documentos enviado e válido" : "link de documentos vencido") : "sem link de documentos",
      },
    ];
  });
  if (fases.length === 0) {
    return { cliente: nome, semLista: true, mensagem: `${nome} ainda não tem lista de documentos nem arquivo recebido. Dá para mandar o link de documentos.` };
  }
  return {
    cliente: nome,
    fases,
    ...(doc.migrado ? {} : { aviso: "A conferência dos documentos ainda não está ativa no banco; tudo aparece como recebido." }),
  };
}

/**
 * A fase em aberto, para o link: a do financiamento, até ela ficar pronta
 * (tudo conferido) com a lista do contrato já montada.
 */
function faseDoLink(doc: DocumentacaoDoLead): FaseDocumento {
  return doc.fases.financiamento.resumo.pronta && doc.fases.contrato.itens.length > 0 ? "contrato" : "financiamento";
}

// ── Planilha ───────────────────────────────────────────────────────────────

/** CSV em UTF-8 ou no Latin-1 do Excel em português ("Jo\xe3o" vira "João"). */
function textoDoCsv(bytes: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/**
 * As linhas da planilha pelos leitores do painel (`importacao.ts`): o .xlsx
 * pelo mesmo `extrairDeXlsx`, o CSV pelo mesmo leitor de tabela. Sem IA: a
 * planilha tem colunas, e a IA aqui custaria por linha para ler pior.
 */
async function lerPlanilha(m: Extract<MidiaDoPedido, { tipo: "planilha" }>): Promise<{ candidatos: CandidatoLead[]; aviso?: string }> {
  const bytes = Buffer.from(m.base64, "base64");
  if (m.formato === "xlsx") {
    const r = await extrairDeXlsx(bytes);
    return { candidatos: r.candidatos, aviso: r.aviso };
  }
  const candidatos = dedupInterno(parsearTabelaLeads(textoDoCsv(bytes).replace(/^﻿/, "")));
  return candidatos.length
    ? { candidatos }
    : { candidatos, aviso: "Não achei contatos na planilha. Confira se há uma coluna de nome e outra de telefone, com o título na primeira linha." };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function lerLinhas(v: unknown): LinhaParaImportar[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object")
    .map((l) => ({
      nome: String(l.nome ?? ""),
      telefone: String(l.telefone ?? ""),
      email: typeof l.email === "string" ? l.email : null,
      mensagem: typeof l.mensagem === "string" ? l.mensagem : null,
      imovelInteresse: typeof l.imovelInteresse === "string" ? l.imovelInteresse : null,
    }))
    .filter((l) => l.telefone);
}

// ── As ações ───────────────────────────────────────────────────────────────

export function criarTratadoresDeDocumentos(dependencias: Partial<DependenciasDosDocumentos> = {}): {
  consultas: Record<string, Consulta>;
  acoes: Record<string, Acao>;
} {
  const deps: DependenciasDosDocumentos = { ...PADRAO, ...dependencias };

  /** O lead pelo texto, no escopo da identificação. `Preparo` quando não ficou claro. */
  async function acharLead(ctx: ContextoDoCentral, pedido: string, supabase: Supa) {
    const achado = await resolverLead(ctx, pedido, supabase);
    return achado.tipo === "um" ? achado.lead : resposta(respostaDeLeadIncerto(achado, pedido));
  }

  const documentosDoLead: Acao = {
    async preparar(ctx, argumentos) {
      const oQue = argumentos.o_que;
      if (oQue !== "ver" && oQue !== "anexar" && oQue !== "mandar_link") {
        return pergunta("Ver os documentos do cliente, guardar a foto de um documento ou mandar a ele o link de documentos?");
      }
      const foto = ctx.midia?.tipo === "foto" ? ctx.midia : null;
      if (oQue === "anexar" && !foto) {
        return recusa("Não achei a foto do documento. Peça para mandar a foto (como foto, não como arquivo) dizendo de qual cliente é.");
      }
      const pedido = texto(argumentos.lead, 120);
      if (!pedido) return pergunta(oQue === "anexar" ? "De qual cliente é esse documento?" : "De qual cliente?");
      const supabase = deps.supabase();
      const lead = await acharLead(ctx, pedido, supabase);
      if ("tipo" in lead) return lead;

      const doc = await lerDocumentacaoDoLead(supabase, lead.id);
      if (oQue === "ver") return resposta(resumoDaDocumentacao(lead.nome, doc));

      // Escrever e falar com o cliente é só de quem cuida dele, como no
      // painel: o gestor lê os documentos de todos, mas não mexe.
      if (lead.corretorId !== ctx.corretorId) {
        return recusa(`${lead.nome} não é cliente seu: só o corretor dele mexe nos documentos e fala com ele.`);
      }

      if (oQue === "mandar_link") {
        const pode = await deps.podeMandar(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadId: lead.id }, deps.relogio());
        if (!pode.ok) return recusa(pode.erro);
        const fase = faseDoLink(doc);
        return {
          tipo: "proposta",
          resumo: `Mandar a ${lead.nome}, pelo seu WhatsApp, o link para enviar os documentos ${fase === "financiamento" ? "do financiamento" : "do contrato"}`,
          dados: { o_que: "mandar_link", leadId: lead.id, nome: lead.nome, fase },
        };
      }

      const alvo = itemDaFoto(foto!.dica, doc);
      if (!alvo) {
        const faltam = doc.fases.financiamento.resumo.pendentesDoCliente.slice(0, 6);
        return pergunta(
          `Qual documento de ${lead.nome} é essa foto?${faltam.length ? ` Na lista dele faltam: ${faltam.join("; ")}.` : " (ex.: RG, holerite, comprovante de residência)"}`,
        );
      }
      return {
        tipo: "proposta",
        resumo: `Guardar a foto como "${alvo.item}" na Documentação de ${lead.nome} (${FASE_DOCUMENTO_LABEL[alvo.fase].toLowerCase()}), para você conferir na ficha`,
        // A referência da foto vai numa chave "_": fica na proposta até o
        // "sim" e não vai ao registro do comando.
        dados: { o_que: "anexar", leadId: lead.id, nome: lead.nome, fase: alvo.fase, item: alvo.item, _midia: foto!.referencia },
      };
    },

    async executar(ctx, dados) {
      const leadId = typeof dados.leadId === "string" ? dados.leadId : null;
      const nome = String(dados.nome ?? "o cliente");
      const fase = dados.fase === "contrato" ? "contrato" : "financiamento";
      if (!leadId) return FALHOU;
      const supabase = deps.supabase();

      if (dados.o_que === "mandar_link") {
        const r = await deps.mandarLink(supabase, { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadId, fase }, deps.relogio());
        // Mensagem que saiu não volta: sem `desfazer` (spec 4.6).
        return r.ok ? { ok: true, texto: `Mandei a ${nome}, pelo seu WhatsApp, o link de documentos.` } : { ok: false, texto: r.erro };
      }

      if (dados.o_que === "anexar") {
        const item = texto(dados.item, 120);
        if (!item || !ehReferencia(dados._midia)) return FALHOU;
        const midia = await deps.baixar(dados._midia).catch(() => null);
        if (!midia?.ok) return { ok: false, texto: "Não consegui abrir a foto de novo. Mande a foto outra vez e diga de qual cliente é." };
        const base64 = midia.base64.replace(/^data:[^,]*,/, "").replace(/\s/g, "");
        const mimeType = tipoDaImagem(base64);
        if (!mimeType) return { ok: false, texto: "Essa foto não está em JPG, PNG ou WEBP; não consigo guardar." };
        const r = await deps.anexar(supabase, {
          grupoId: ctx.grupoId,
          corretorId: ctx.corretorId,
          leadId,
          fase,
          item,
          bytes: Buffer.from(base64, "base64"),
          mimeType,
        });
        if (!r.ok) return { ok: false, texto: r.erro };
        return {
          ok: true,
          texto: `Guardei a foto como "${item}" na Documentação de ${nome}. Confira na ficha dele.`,
          desfazer: { o_que: "anexar", documentoId: r.documentoId, nome },
        };
      }
      return FALHOU;
    },

    async desfazer(ctx, d) {
      if (d.o_que !== "anexar" || typeof d.documentoId !== "string") return { ok: false, texto: "Não consegui desfazer isso." };
      const r = await deps.removerAnexo(deps.supabase(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, documentoId: d.documentoId });
      return r.ok ? { ok: true, texto: `Tirei o documento da ficha de ${String(d.nome ?? "o cliente")}.` } : { ok: false, texto: r.erro ?? "Não consegui desfazer isso." };
    },
  };

  const lembrete: Acao = {
    async preparar(ctx, argumentos) {
      const agora = deps.relogio();
      const nota = texto(argumentos.texto, 500);
      if (!nota) return pergunta("Do que é para lembrar?");
      const dito = texto(argumentos.quando, 80);
      if (!dito) return pergunta("Para quando? Diga o dia e a hora (ex.: amanhã às 10h).");
      const q = lerQuando(dito, agora);
      // Lembrete avisa NA HORA: sem hora dita não há instante, e inventar um
      // ("sexta" = 9h?) avisaria quando a pessoa não pediu.
      switch (q.tipo) {
        case "periodo":
          return pergunta(`Que horas, ${rotuloDoPeriodo(q.dia, q.periodo)}?`);
        case "so_dia":
          return pergunta(`Que horas, ${rotuloDoDiaDoCalendario(q.dia)}?`);
        case "hora_ambigua":
          return pergunta(`${q.hora}h da manhã ou ${q.hora + 12}h?`);
        case "sem_dia":
          return pergunta("Qual dia? (ex.: amanhã às 10h)");
        case "nao_entendi":
          return pergunta(`Não entendi o horário "${dito}". Diga o dia e a hora (ex.: amanhã às 10h).`);
      }
      if (q.inicio.getTime() < agora.getTime() - 60_000) return recusa(`${rotuloDoInstante(q.inicio)} já passou. Peça outro horário.`);
      if (q.inicio.getTime() > agora.getTime() + LIMITE_DO_FUTURO_MS) return recusa("Essa data está a mais de um ano. Confira o dia.");

      let lead: { id: string; nome: string } | null = null;
      const pedido = texto(argumentos.lead, 120);
      if (pedido) {
        const achado = await acharLead(ctx, pedido, deps.supabase());
        if ("tipo" in achado) return achado;
        lead = { id: achado.id, nome: achado.nome };
      }
      return {
        tipo: "proposta",
        resumo: `Lembrar você ${rotuloDoInstante(q.inicio)}: ${nota}${lead ? ` (cliente ${lead.nome})` : ""}`,
        dados: { texto: nota, quando: q.inicio.toISOString(), leadId: lead?.id ?? null },
      };
    },

    async executar(ctx, dados) {
      const quando = typeof dados.quando === "string" ? new Date(dados.quando) : null;
      const nota = texto(dados.texto, 500);
      if (!quando || Number.isNaN(quando.getTime()) || !nota) return FALHOU;
      const r = await criarLembretePeloCentral(
        {
          grupoId: ctx.grupoId,
          corretorId: ctx.corretorId,
          texto: nota,
          lembreteEm: quando,
          leadId: typeof dados.leadId === "string" ? dados.leadId : null,
        },
        deps.supabase(),
        deps.relogio(),
      );
      if (!r.id) return { ok: false, texto: r.erro ?? FALHOU.texto };
      return {
        ok: true,
        texto: `Lembrete marcado para ${rotuloDoInstante(quando)}. Está nas suas Anotações do painel, e o aviso chega no seu WhatsApp na hora.`,
        desfazer: { o_que: "lembrete", anotacaoId: r.id },
      };
    },

    async desfazer(ctx, d) {
      if (typeof d.anotacaoId !== "string") return { ok: false, texto: "Não consegui desfazer esse lembrete." };
      const r = await apagarAnotacaoPessoal({ grupoId: ctx.grupoId, corretorId: ctx.corretorId, anotacaoId: d.anotacaoId }, deps.supabase());
      return r.erro ? { ok: false, texto: r.erro } : { ok: true, texto: "Lembrete apagado." };
    },
  };

  const importarPlanilha: Acao = {
    async preparar(ctx) {
      const m = ctx.midia?.tipo === "planilha" ? ctx.midia : null;
      if (!m) {
        return resposta({ mensagem: "Mande a planilha de clientes (Excel .xlsx ou CSV) aqui na conversa, como arquivo, que eu conto quantos entram." });
      }
      const lida = await lerPlanilha(m);
      if (lida.candidatos.length === 0) return resposta({ mensagem: lida.aviso ?? "Não achei contatos com telefone na planilha." });

      const invalidos = lida.candidatos.filter((c) => !c.telefoneE164).length;
      const validos = lida.candidatos.filter((c): c is CandidatoLead & { telefoneE164: string } => Boolean(c.telefoneE164));
      const ja = await telefonesJaNoGrupo(
        deps.supabase(),
        ctx.grupoId,
        validos.map((c) => c.telefoneE164),
      );
      if (!ja) return resposta({ mensagem: "Não consegui conferir quem já está cadastrado. Mande a planilha de novo em instantes." });
      const novos = validos.filter((c) => !ja.has(c.telefoneE164));
      const existentes = validos.length - novos.length;
      const teto = lida.candidatos.length >= LIMITE_POR_IMPORTACAO ? ` Li só as ${LIMITE_POR_IMPORTACAO} primeiras linhas (o teto por importação).` : "";
      const fora = `${plural(existentes, "já existia", "já existiam")} e ${plural(invalidos, "tem telefone inválido", "têm telefone inválido")}`;

      if (novos.length === 0) {
        return resposta({ mensagem: `Li a planilha ${m.nome}: nenhum cliente novo para cadastrar (${fora}).${teto}` });
      }
      return {
        tipo: "proposta",
        resumo:
          `Importar a planilha ${m.nome}: ${plural(novos.length, "cliente entra", "clientes entram")} na sua carteira, como Novo lead; ${fora}, e ficam de fora.${teto}` +
          " Ao confirmar, você declara ter autorização para tratar esses contatos, como na importação do painel.",
        dados: {
          arquivo: m.nome,
          novos: novos.length,
          existentes,
          invalidos,
          // As linhas lidas, não o arquivo; a chave "_" não vai ao registro.
          _linhas: novos.map((c) => ({
            nome: c.nome,
            telefone: c.telefoneE164,
            email: c.email,
            mensagem: c.mensagem,
            imovelInteresse: c.imovelInteresse,
          })),
        },
      };
    },

    async executar(ctx, dados) {
      const linhas = lerLinhas(dados._linhas);
      if (linhas.length === 0) return FALHOU;
      const r = await importarLeadsPeloCentral(deps.supabase(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, linhas });
      if (!r.ok) return { ok: false, texto: r.erro };
      if (r.ids.length === 0) return { ok: false, texto: "Nenhum cliente entrou: os telefones já estavam cadastrados." };
      const extra = [
        r.repetidos ? `${plural(r.repetidos, "já tinha entrado", "já tinham entrado")} enquanto você confirmava` : "",
        r.falhas ? `${plural(r.falhas, "não entrou", "não entraram")} por erro; mande de novo para tentar` : "",
      ].filter(Boolean);
      return {
        ok: true,
        texto: `Pronto: ${plural(r.ids.length, "cliente cadastrado", "clientes cadastrados")} na sua carteira.${extra.length ? ` ${extra.join("; ")}.` : ""}`,
        desfazer: { o_que: "importar", leadIds: r.ids },
      };
    },

    async desfazer(ctx, d) {
      const ids = Array.isArray(d.leadIds) ? d.leadIds.filter((i): i is string => typeof i === "string") : [];
      if (ids.length === 0) return { ok: false, texto: "Não consegui desfazer essa importação." };
      const r = await arquivarLeadsImportadosPeloCentral(deps.supabase(), { grupoId: ctx.grupoId, corretorId: ctx.corretorId, leadIds: ids });
      if (!r.ok) return { ok: false, texto: "Não consegui desfazer a importação agora." };
      return { ok: true, texto: `Importação desfeita: ${plural(r.arquivados, "cliente voltou arquivado", "clientes voltaram arquivados")}.` };
    },
  };

  return { consultas: {}, acoes: { documentos_do_lead: documentosDoLead, lembrete, importar_planilha: importarPlanilha } };
}

const TRATADORES_DE_DOCUMENTOS = criarTratadoresDeDocumentos();
export const CONSULTAS_DOCUMENTOS: Record<string, Consulta> = TRATADORES_DE_DOCUMENTOS.consultas;
export const ACOES_DOCUMENTOS: Record<string, Acao> = TRATADORES_DE_DOCUMENTOS.acoes;
