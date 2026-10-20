/**
 * Textos e regras puras da saída do corretor (fase 5, 0200). A tela e a
 * action usam as mesmas frases, para o gestor ler a mesma coisa nos dois
 * lugares.
 */

export type DivisaoDaCarteira = { doCorretor: number; daImobiliaria: number };

const leads = (n: number) => `${n} lead${n === 1 ? "" : "s"}`;

/** O que acontece com a carteira, em uma frase por lado. */
export function frasesDaDivisao(nome: string, d: DivisaoDaCarteira): { daCasa: string; dele: string } {
  return {
    daCasa:
      d.daImobiliaria === 0
        ? "Nenhum lead da imobiliária para redistribuir."
        : `${leads(d.daImobiliaria)} ${d.daImobiliaria === 1 ? "veio" : "vieram"} da imobiliária e ${d.daImobiliaria === 1 ? "fica" : "ficam"} com ela.`,
    dele:
      d.doCorretor === 0
        ? `${nome} não trouxe nenhum lead por conta própria.`
        : `${leads(d.doCorretor)} ${d.doCorretor === 1 ? "foi trazido" : "foram trazidos"} por ${nome}. Ele leva só a ficha (sem as conversas).`,
  };
}

/** Os erros da `devolver_leads_da_imobiliaria` em português de gente. */
export function traduzirErroDaSaida(mensagem: string): string {
  if (mensagem.includes("sem_permissao")) return "Esta ação é restrita a quem administra a imobiliária.";
  if (mensagem.includes("corretor_nao_encontrado")) return "Corretor não encontrado.";
  if (mensagem.includes("destino_invalido")) {
    return "Escolha um corretor ativo da equipe, que não seja quem está saindo.";
  }
  if (mensagem.includes("devolver_leads_da_imobiliaria")) {
    return "O banco ainda não tem a saída do corretor (migration 0200).";
  }
  return "Não foi possível passar os leads agora. Tente de novo.";
}

/** O desfecho da divisão, em uma frase. */
export function fraseDoDesfecho(movidos: number, semDestino: number): string {
  const passou =
    movidos === 0
      ? "Nenhum lead precisou mudar de dono."
      : `${leads(movidos)} ${movidos === 1 ? "passou" : "passaram"} para a equipe.`;
  return semDestino === 0
    ? passou
    : `${passou} ${leads(semDestino)} ${semDestino === 1 ? "ficou" : "ficaram"} sem destino: não há corretor ativo que atenda a região.`;
}
