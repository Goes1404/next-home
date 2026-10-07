import { precoAPartirDe } from "@/lib/format";
import { LIMITE_TITULO_PAGINA, limitar } from "@/lib/seo";
import { resumoTipologias } from "@/lib/resumoTipologias";
import { STATUS_LABEL, type Empreendimento, type TipoImovel } from "@/lib/types";

/**
 * O que a página do imóvel diz ao Google (07/10/2026). Funções puras.
 *
 * O site antigo da casa (nexthomeimobiliaria.com.br, que o dono decidiu
 * manter) rankeia pelos mesmos empreendimentos com títulos de bairro
 * ("apartamento lançamentos jardim tupanci barueri"). O nosso título levava
 * só nome e cidade — o bairro e a palavra "apartamento", que são o que as
 * pessoas digitam, ficavam de fora. Agora entram quando CABEM.
 */

const TIPO_PLURAL: Record<TipoImovel, string> = {
  apartamento: "Apartamentos",
  alto_padrao: "Apartamentos de alto padrão",
  casa: "Casas",
  terreno: "Terrenos",
};

/**
 * Título da página, do mais completo ao mais curto, o primeiro que cabe nos
 * 48 caracteres que sobram depois do sufixo " · Next Home":
 *
 * 1. "Joy — Apartamentos no Jardim Tupanci, Barueri"
 * 2. "Joy — Jardim Tupanci, Barueri"
 * 3. "Joy — Barueri"   (o que era antes; continua sendo a rede)
 *
 * Bairro igual à cidade ou já contido no nome não se repete: "Vitta Barueri —
 * Barueri, Barueri" diria a mesma coisa três vezes.
 */
export function tituloDoImovel(e: Pick<Empreendimento, "nome" | "tipo" | "bairro" | "cidade">): string {
  const nome = e.nome.trim();
  const cidade = e.cidade.trim();
  const bairro = e.bairro.trim();
  const bairroVale = bairro && bairro.toLowerCase() !== cidade.toLowerCase() && !nome.toLowerCase().includes(bairro.toLowerCase());
  const lugar = bairroVale ? `${bairro}, ${cidade}` : cidade;

  const candidatos = [
    bairroVale ? `${nome} — ${TIPO_PLURAL[e.tipo]} em ${lugar}` : `${nome} — ${TIPO_PLURAL[e.tipo]} em ${cidade}`,
    `${nome} — ${lugar}`,
    `${nome} — ${cidade}`,
  ];
  const cabe = candidatos.find((c) => c.length <= LIMITE_TITULO_PAGINA);
  return cabe ?? limitar(`${nome} — ${cidade}`, LIMITE_TITULO_PAGINA);
}

export type Pergunta = { pergunta: string; resposta: string };

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Perguntas e respostas montadas SÓ do cadastro: cada uma entra quando há
 * dado para respondê-la, e nenhuma inventa o que falta (sem data de entrega,
 * a resposta diz que o corretor confirma — a lição do prazo inventado pela
 * IA vale para o site). O mesmo texto vai para a tela e para o FAQPage: o
 * Google exige que a marcação descreva o que está visível.
 */
export function perguntasDoImovel(e: Empreendimento): Pergunta[] {
  const perguntas: Pergunta[] = [];
  const nome = e.nome.trim();

  const resumo = resumoTipologias(e.tipologias);
  if (resumo) {
    const dorms = [...new Set(e.tipologias.map((t) => t.dormitorios).filter((d) => d > 0))].sort((a, b) => a - b);
    const suites = Math.max(0, ...e.tipologias.map((t) => t.suites));
    const vagas = [...new Set(e.tipologias.map((t) => t.vagas).filter((v) => v > 0))].sort((a, b) => a - b);
    const partes = [`O ${nome} tem plantas de ${resumo}`];
    if (suites > 0) partes.push(`com até ${plural(suites, "suíte", "suítes")}`);
    if (vagas.length > 0) partes.push(`e ${vagas.length === 1 ? plural(vagas[0], "vaga", "vagas") : `${vagas[0]} a ${vagas.at(-1)} vagas`}`);
    perguntas.push({
      pergunta: dorms.length > 1 ? `Quantos dormitórios tem o ${nome}?` : `Qual a planta do ${nome}?`,
      resposta: `${partes.join(" ")}.`,
    });
  }

  perguntas.push({ pergunta: `Onde fica o ${nome}?`, resposta: ondeFica(e) });

  const estagio = STATUS_LABEL[e.status];
  const entrega = e.entregaPrevista ? formatarEntrega(e.entregaPrevista) : null;
  perguntas.push({
    pergunta: e.status === "pronto_para_morar" ? `O ${nome} está pronto para morar?` : `Quando o ${nome} fica pronto?`,
    resposta:
      e.status === "pronto_para_morar"
        ? `Sim. O ${nome} está pronto para morar.`
        : entrega
          ? `O ${nome} está em estágio de ${estagio.toLowerCase()}, com entrega prevista para ${entrega}.`
          : `O ${nome} está em estágio de ${estagio.toLowerCase()}. A data de entrega é confirmada com o corretor.`,
  });

  perguntas.push({
    pergunta: `Qual o valor do ${nome}?`,
    resposta: e.precoAPartir
      ? `${precoAPartirDe(e.precoAPartir)}. As condições de pagamento e a simulação de financiamento são feitas com o corretor.`
      : `O valor é sob consulta: o corretor passa a tabela atualizada e simula o financiamento com você.`,
  });

  if (e.lazer.length > 0) {
    const amostra = e.lazer.slice(0, 4).join(", ");
    perguntas.push({
      pergunta: `O que tem de lazer no ${nome}?`,
      resposta: `${plural(e.lazer.length, "item", "itens")} de lazer${e.lazer.length > 4 ? `, entre eles ${amostra}` : `: ${amostra}`}.`,
    });
  }

  if (e.construtora) {
    perguntas.push({ pergunta: `Quem é a construtora do ${nome}?`, resposta: `O ${nome} é da ${e.construtora}.` });
  }

  perguntas.push({
    pergunta: `Como agendar uma visita ao ${nome}?`,
    resposta: `Pelo WhatsApp, pelo botão desta página: um corretor da Next Home combina o dia e a hora com você.`,
  });

  return perguntas;
}

/**
 * "Rua Terra, 56, Jardim Tupanci, Barueri." — sem repetir o que o endereço
 * cadastrado já traz (medido: o endereço do Joy vem com o bairro dentro, e a
 * primeira versão escrevia "Jardim Tupanci, Jardim Tupanci").
 */
function ondeFica(e: Pick<Empreendimento, "endereco" | "bairro" | "cidade">): string {
  const endereco = e.endereco.trim().replace(/[.\s]+$/, "");
  if (!endereco) return `No bairro ${e.bairro}, em ${e.cidade}.`;
  const ja = endereco.toLowerCase();
  const partes = [endereco];
  if (e.bairro && !ja.includes(e.bairro.toLowerCase())) partes.push(e.bairro);
  if (e.cidade && !ja.includes(e.cidade.toLowerCase())) partes.push(e.cidade);
  return `${partes.join(", ")}.`;
}

/** "2027-06-01" → "junho de 2027"; só mês e ano, que é o que a construtora promete. */
function formatarEntrega(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number);
  const nomes = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return mes >= 1 && mes <= 12 ? `${nomes[mes - 1]} de ${ano}` : String(ano);
}

export function faqJsonLd(perguntas: Pergunta[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: perguntas.map((p) => ({
      "@type": "Question",
      name: p.pergunta,
      acceptedAnswer: { "@type": "Answer", text: p.resposta },
    })),
  };
}
