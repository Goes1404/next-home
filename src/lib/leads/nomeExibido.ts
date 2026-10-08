/**
 * Como um lead é CHAMADO na tela e na mensagem.
 *
 * Módulo puro e sem dependência nenhuma, de propósito: quem precisa disto é
 * a fila do Início (a tela mais aberta do painel) e o disparo de campanha
 * (que importa o `llm.ts`). Deixar a função morar junto do disparo
 * arrastaria a IA inteira para o grafo do Início — a mesma armadilha do
 * `limitesPdf.ts`, que virou regra desta base: constante ou função pura
 * compartilhada mora sozinha.
 */

/**
 * O nome, quando ele serve para chamar uma pessoa.
 *
 * "Contato sem nome" é o rótulo que a IMPORTAÇÃO grava quando a planilha
 * não trouxe nome. Serve para a ficha do CRM não ficar em branco — e não
 * serve para ser dito a ninguém. Já vazou uma vez para o WhatsApp de um
 * cliente ("Olá, Contato sem nome. É um prazer me apresentar…") e uma
 * segunda vez para o painel, onde a fila do Início mostrou seis linhas
 * idênticas de "Falar com Contato sem nome" — seis pessoas diferentes,
 * indistinguíveis na tela.
 *
 * Telefone também não é nome: quem cadastra o número no campo do nome não
 * está dando um nome.
 */
export function nomeUtilDoLead(nome: string | null | undefined): string | null {
  const limpo = (nome ?? "").trim();
  if (limpo.length < 2) return null;
  if (/^contato sem nome$/i.test(limpo)) return null;
  if (/^[\d\s()+-]+$/.test(limpo)) return null;
  return limpo;
}

const TITULO = /^(dr|dra|sr|sra|srta|prof|profa)\.?$/i;

/** Palavras que aparecem no campo do nome e não são nome de ninguém. */
const NAO_E_NOME = new Set([
  "whatsapp", "contato", "cliente", "lead", "teste", "desconhecido", "interessado",
  "usuario", "sem", "nome", "anonimo", "fulano", "ciclano", "beltrano",
]);

/** Primeiros nomes que costumam formar nome composto ("Ana Paula", "João Pedro"). */
const ABRE_COMPOSTO = new Set([
  "ana", "maria", "joana", "joao", "jose", "pedro", "paulo", "luiz", "luis", "carlos", "marco", "marcos", "antonio",
]);

/** Segundos nomes de batismo (os sobrenomes ficam de fora: "Maria Silva" é Maria). */
const SEGUNDO_NOME = new Set([
  "paula", "clara", "luiza", "luisa", "julia", "beatriz", "carolina", "cristina", "eduarda", "fernanda",
  "gabriela", "helena", "laura", "lucia", "vitoria", "alice", "cecilia", "sofia", "rita", "teresa",
  "tereza", "claudia", "flavia", "livia", "isabel", "isabela", "jose", "antonia", "aparecida", "luana",
  "pedro", "paulo", "victor", "vitor", "gabriel", "lucas", "miguel", "henrique", "felipe", "carlos",
  "antonio", "augusto", "eduardo", "guilherme", "ricardo", "roberto", "rafael", "luis", "luiz",
  "francisco", "otavio", "arthur", "artur", "davi", "emanuel", "manoel", "manuel", "matheus", "mateus",
  "rodrigo", "fernando", "cesar", "vinicius", "lucio", "marcos",
]);

function comparavel(palavra: string): string {
  return palavra.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** "MARIA" e "maria" viram "Maria"; quem já escreveu com caixa mista fica como está. */
function capitalizar(palavra: string): string {
  if (palavra !== palavra.toUpperCase() && palavra !== palavra.toLowerCase()) return palavra;
  return palavra
    .toLowerCase()
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("-");
}

/**
 * O nome que vai na mensagem: o PRIMEIRO, como gente chama gente.
 *
 * A lista de transmissão prometia `{nome}` = "primeiro nome da pessoa" e
 * mandava o nome inteiro ("Oi Gabriely Bonfim,"), que é como sistema escreve.
 * Nome composto continua inteiro ("Ana Paula", "João Pedro"); sobrenome sai
 * ("Maria Silva" é Maria). Título fica junto ("Dr. Roberto"). O nome que a
 * plataforma dá a quem chegou sem nome ("WhatsApp 1234") não é nome, e
 * telefone, e-mail e "Contato sem nome" também não.
 */
export function primeiroNomeUtil(nome: string | null | undefined): string | null {
  const util = nomeUtilDoLead(nome);
  if (!util || util.includes("@")) return null;
  const partes = util.split(/\s+/).filter((p) => /\p{L}/u.test(p) && !/\d/.test(p));

  let titulo = "";
  if (partes.length > 1 && TITULO.test(partes[0])) {
    titulo = capitalizar(partes[0].replace(/\.?$/, "."));
    partes.shift();
  }
  const [primeiro, segundo] = partes;
  if (!primeiro || comparavel(primeiro).replace(/[^a-z]/g, "").length < 2) return null;
  if (NAO_E_NOME.has(comparavel(primeiro))) return null;

  let escolhido = capitalizar(primeiro);
  if (segundo && ABRE_COMPOSTO.has(comparavel(primeiro)) && SEGUNDO_NOME.has(comparavel(segundo))) {
    escolhido = `${escolhido} ${capitalizar(segundo)}`;
  }
  return titulo ? `${titulo} ${escolhido}` : escolhido;
}

/**
 * Telefone brasileiro em formato de gente: `(11) 95721-6675`.
 *
 * Devolve `null` quando não reconhece — melhor não mostrar nada do que
 * mostrar um número remontado errado.
 */
export function telefoneLegivel(telefone: string | null | undefined): string | null {
  const n = (telefone ?? "").replace(/\D/g, "");
  const semDdi = n.startsWith("55") && n.length >= 12 ? n.slice(2) : n;

  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`;
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`;
  return null;
}

/**
 * Como chamar este lead na tela.
 *
 * Sem nome utilizável, o TELEFONE é a identidade — é o que distingue uma
 * linha da outra numa lista de importados, e é o que o corretor reconhece.
 * "Contato sem nome" só sobra quando não há nem nome nem telefone, e aí é
 * a verdade: não sabemos quem é.
 */
export function nomeParaExibir(lead: {
  nome?: string | null;
  telefone?: string | null;
}): string {
  return nomeUtilDoLead(lead.nome) ?? telefoneLegivel(lead.telefone) ?? "Contato sem nome";
}
