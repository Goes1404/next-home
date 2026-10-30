import { AINDA_NAO } from "../ferramentas";
import type { Acao, Consulta, Preparo } from "../executar";
import { ACOES_LEADS } from "./leads";

/**
 * Frente E — foto da onda 1: cadastrar_lead_da_foto (3).
 *
 * Contrato em `../executar.ts` (`Consulta`, `Acao` com `preparar` →
 * "sim" → `executar` → `desfazer`).
 *
 * Não tem cadastro próprio: DELEGA ao `cadastrar_lead` (Frente B), que já
 * tem a regra de lead de outro corretor, a duplicidade e o desfazer. Dois
 * cadastros divergiriam no primeiro ajuste (o defeito de `aiParser.ts` e
 * `campaignQueue.ts`, que tinham `fetch` próprio). A foto só muda a ENTRADA:
 * o que a IA leu vira os argumentos do cadastro.
 *
 * A busca do `cadastrar_lead` é feita na hora (`ACOES_LEADS[...]` dentro da
 * função), não na carga do módulo: a ordem de import entre os tratadores não
 * decide se a foto funciona.
 */

/** O que a foto entrega; o resto do cadastro (renda, região) a pessoa completa depois. */
export const ORIGEM_DA_FOTO = "foto";

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * DDD + número (10 ou 11 dígitos, com ou sem o 55). Só o final, ou um número
 * meio ilegível que a IA completou pela metade, não identifica ninguém
 * (spec 3.1): cadastrar com ele cria um lead que ninguém acha depois.
 */
export function telefoneInteiro(bruto: string): boolean {
  const digitos = bruto.replace(/\D/g, "");
  const nacional = digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  return nacional.length === 10 || nacional.length === 11;
}

const resposta = (resultado: unknown): Preparo => ({ tipo: "resposta", resultado });

/**
 * A ação da foto em cima de um `cadastrar_lead`. `cadastro` é chamado a cada
 * uso; nos testes, um falso.
 */
export function acaoDaFoto(cadastro: () => Acao | undefined): Acao {
  return {
    preparar: async (ctx, a) => {
      const alvo = cadastro();
      if (!alvo) return resposta({ aindaNao: true, mensagem: AINDA_NAO });
      const nome = texto(a.nome);
      const telefone = texto(a.telefone);
      const interesse = texto(a.interesse);
      // Sem nome e telefone inteiro não há cadastro: foto de documento (RG,
      // holerite) costuma cair aqui, e é da onda 2 (capacidade 5).
      if (!nome) {
        return resposta({ erro: "Não li o nome do cliente na foto. Peça o nome, ou uma foto mais nítida." });
      }
      if (!telefone || !telefoneInteiro(telefone)) {
        return resposta({
          erro: "Não li o telefone inteiro do cliente na foto (com DDD). Peça o número inteiro antes de cadastrar.",
        });
      }
      // `interesse` é texto livre ("2 dorms em Alphaville, até 400 mil"):
      // vai na observação, sem adivinhar região ou orçamento a partir dele.
      const preparo = await alvo.preparar(ctx, {
        nome,
        telefone,
        origem: ORIGEM_DA_FOTO,
        ...(interesse ? { observacao: `Interesse (lido na foto): ${interesse}` } : {}),
      });
      // O resumo avisa que veio de leitura: é o momento de conferir o número.
      return preparo.tipo === "proposta" ? { ...preparo, resumo: `${preparo.resumo} (lido da foto)` } : preparo;
    },
    executar: async (ctx, dados) => {
      const alvo = cadastro();
      return alvo ? alvo.executar(ctx, dados) : { ok: false, texto: AINDA_NAO };
    },
    desfazer: async (ctx, desfazer) => {
      const alvo = cadastro();
      return alvo?.desfazer ? alvo.desfazer(ctx, desfazer) : { ok: false, texto: "Esse cadastro não tem como desfazer por aqui." };
    },
  };
}

export const CONSULTAS_FOTO: Record<string, Consulta> = {};
export const ACOES_FOTO: Record<string, Acao> = {
  cadastrar_lead_da_foto: acaoDaFoto(() => ACOES_LEADS.cadastrar_lead),
};
