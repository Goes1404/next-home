import { chamarLlmJson } from "@/lib/whatsapp/llm";

/**
 * Lista de leads SEM cabeçalho lida pela IA (28/09/2026).
 *
 * Relatado: "quando mandamos uma lista de leads txt, ele não está preenchendo
 * o formulário de forma correta". Medido com três listas do jeito que o
 * corretor escreve, o leitor de tabela sem cabeçalho errava todas:
 *
 *   "Maria Silva - (11) 99876-5432 - quer 2 dorm no Vitra"
 *     → nome "Contato sem nome", telefone = a linha inteira
 *   "1. Carlos Souza — whats 11 91234-5678, visita sábado"
 *     → nome "visita sábado"
 *   "Nome: Roberto Alves" / "Telefone: 11 95555-4444" (ficha em várias linhas)
 *     → nome perdido, e a observação também
 *
 * Lista solta não tem colunas: o que separa nome, telefone e observação é o
 * sentido da frase, e é aí que um modelo lê melhor que uma regra. Por isso a
 * IA vem ANTES do leitor sem cabeçalho — e DEPOIS do leitor com cabeçalho,
 * que acerta 100% do que entende e não precisa de modelo nenhum.
 *
 * O que torna seguro: nada do que ela devolve entra sem estar no TEXTO. O
 * telefone precisa existir ali (um número inventado mandaria a campanha para
 * um desconhecido), o e-mail também, e o nome precisa ter as palavras que
 * aparecem na lista. O corretor ainda revisa tudo antes de gravar.
 */

/** O que o modelo devolve para cada contato, antes da conferência. */
export type LeadLidoPelaIa = {
  nome: string | null;
  telefone: string;
  email: string | null;
  mensagem: string | null;
  imovelInteresse: string | null;
};

const PROMPT = `Você lê listas de clientes que um corretor de imóveis colou ou enviou como arquivo de texto.
A lista NÃO tem colunas fixas: cada contato pode estar numa linha ("Maria - 11 99999-0000 - quer 2 dorm"), em várias linhas seguidas (Nome:, Telefone:, Obs:), numerado, com traços, vírgulas ou texto solto.

Devolva TODOS os contatos que tenham telefone. Para cada um:
- nome: só o nome da pessoa, sem número de item, sem "Nome:", sem cargo e sem observação. Sem nome na lista: null. NUNCA invente um nome.
- telefone: copie EXATAMENTE como está escrito na lista, dígito por dígito. Se a pessoa tem mais de um, escolha o CELULAR (é o que tem WhatsApp; celular brasileiro tem 9 dígitos depois do DDD e começa com 9). Nunca complete dígito que falta e nunca crie um número.
- email: exatamente como está escrito, ou null.
- imovelInteresse: o empreendimento, região ou tipo de imóvel que a lista diz que a pessoa quer, ou null.
- mensagem: o resto do que a lista diz sobre a pessoa (observação, horário, orçamento), em uma frase curta, ou null.

Ignore telefones que claramente são da imobiliária, do corretor ou de rodapé.
Não repita o mesmo telefone.

Responda EXCLUSIVAMENTE um JSON válido, sem crases e sem texto em volta:
{"leads":[{"nome":"...","telefone":"...","email":null,"imovelInteresse":null,"mensagem":null}]}

Lista:
`;

/**
 * Pedaço que cabe numa resposta. A saída do modelo tem teto de 4096 tokens e
 * cada contato devolvido custa ~45; com 2.500 caracteres de lista (~50
 * contatos de uma linha) sobra folga. Cortar sempre em quebra de linha — e,
 * quando der, em linha EM BRANCO, que é onde uma ficha termina e a próxima
 * começa. Cortar no meio de uma ficha deixaria o nome num pedaço e o
 * telefone no outro.
 */
const TAMANHO_DO_PEDACO = 2_500;
/** Quantos pedaços vão à IA ao mesmo tempo: rápido sem martelar a conta. */
const EM_PARALELO = 4;
/** Cada pedaço tem o próprio prazo; o corretor está esperando na tela. */
const ORCAMENTO_POR_PEDACO_MS = 40_000;

export function dividirEmPedacos(texto: string, tamanho = TAMANHO_DO_PEDACO): string[] {
  const pedacos: string[] = [];
  let resto = texto.trim();
  while (resto.length > tamanho) {
    const janela = resto.slice(0, tamanho);
    let corte = janela.lastIndexOf("\n\n");
    if (corte < tamanho / 2) corte = janela.lastIndexOf("\n");
    if (corte <= 0) corte = tamanho;
    pedacos.push(resto.slice(0, corte).trim());
    resto = resto.slice(corte).trim();
  }
  if (resto) pedacos.push(resto);
  return pedacos;
}

function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function texto(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const limpo = String(valor).trim();
  return limpo && limpo.toLowerCase() !== "null" ? limpo : null;
}

/**
 * O telefone precisa estar no texto. A comparação é por DÍGITOS dentro de
 * cada linha, para aceitar a mesma sequência com outra pontuação
 * ("(11) 99876-5432" devolvido como "11998765432") e recusar o que não está
 * lá. Aceita também a forma com DDI 55 acrescentado, que é o que o modelo
 * costuma fazer por conta própria — mas nunca um número cujos dígitos não
 * aparecem.
 */
export function telefoneEstaNoTexto(telefone: string, fonte: string): boolean {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 8) return false;
  const candidatos = [digitos];
  if (digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)) {
    candidatos.push(digitos.slice(2));
  }
  return fonte
    .split(/\r?\n/)
    .map((linha) => linha.replace(/\D/g, ""))
    .some((linha) => candidatos.some((c) => linha.includes(c)));
}

/**
 * Cada palavra do nome tem de aparecer na lista (sem acento, sem caixa). É o
 * que impede o modelo de "completar" um nome que a lista não tem — o erro
 * que faria o corretor cumprimentar a pessoa pelo nome errado.
 */
export function nomeEstaNoTexto(nome: string, fonte: string): boolean {
  const alvo = semAcento(fonte);
  const palavras = semAcento(nome)
    .split(/[^\p{L}\p{N}']+/u)
    .filter((p) => p.length >= 2);
  return palavras.length > 0 && palavras.every((p) => alvo.includes(p));
}

/**
 * Confere a resposta do modelo contra o texto que ele leu. O que não passa
 * NÃO é corrigido nem adivinhado: telefone ausente derruba o contato, nome ou
 * e-mail ausentes viram vazio.
 */
export function conferirLeituraDaIa(json: unknown, fonte: string): LeadLidoPelaIa[] {
  const bruto = json as { leads?: unknown } | unknown[] | null;
  const lista = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.leads) ? bruto.leads : [];
  const fonteMinuscula = fonte.toLowerCase();
  const lidos: LeadLidoPelaIa[] = [];

  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const registro = item as Record<string, unknown>;
    const telefone = texto(registro.telefone);
    if (!telefone || !telefoneEstaNoTexto(telefone, fonte)) continue;

    const nome = texto(registro.nome);
    const email = texto(registro.email);
    lidos.push({
      nome: nome && nomeEstaNoTexto(nome, fonte) ? nome : null,
      telefone,
      email: email && fonteMinuscula.includes(email.toLowerCase()) ? email : null,
      mensagem: texto(registro.mensagem),
      imovelInteresse: texto(registro.imovelInteresse),
    });
  }
  return lidos;
}

export type ResultadoLeituraPorIa =
  | { ok: true; leads: LeadLidoPelaIa[]; pedacosSemResposta: number }
  | { ok: false };

/**
 * Lê a lista inteira, em pedaços. Se NENHUM pedaço responder, devolve
 * `ok: false` e quem chamou segue pelo leitor determinístico — falha da IA
 * nunca bloqueia a importação. Se só ALGUNS falharem, o resultado é parcial
 * e diz quantos, para a tela avisar em vez de fingir que leu tudo.
 */
export async function lerListaComIa(conteudo: string): Promise<ResultadoLeituraPorIa> {
  const pedacos = dividirEmPedacos(conteudo);
  const respostas: (LeadLidoPelaIa[] | null)[] = new Array(pedacos.length).fill(null);

  let proximo = 0;
  async function trabalhador() {
    while (proximo < pedacos.length) {
      const i = proximo;
      proximo += 1;
      const pedaco = pedacos[i];
      const r = await chamarLlmJson(PROMPT + pedaco, { temperature: 0, orcamentoMs: ORCAMENTO_POR_PEDACO_MS });
      if (!r.ok) {
        console.error("[importacao] IA não leu um pedaço da lista:", r.erro);
        continue;
      }
      respostas[i] = conferirLeituraDaIa(r.json, pedaco);
    }
  }
  await Promise.all(Array.from({ length: Math.min(EM_PARALELO, pedacos.length) }, trabalhador));

  const lidos = respostas.filter((r): r is LeadLidoPelaIa[] => r !== null);
  if (lidos.length === 0) return { ok: false };
  return { ok: true, leads: lidos.flat(), pedacosSemResposta: pedacos.length - lidos.length };
}
