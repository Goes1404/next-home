// Os vocabulários fechados do grupo (0186, desenho §10) e os rótulos da tela.
//
// Módulo PURO: a lista de grupos, o formulário de grupo novo (cliente) e a
// validação da action usam as mesmas listas. As três precisam concordar com
// os CHECKs de `grupos` (0186); `rotulosDoGrupo.test.ts` lê a migration.

export const TIPOS_DE_GRUPO = ["imobiliaria", "independente"] as const;
export type TipoDeGrupo = (typeof TIPOS_DE_GRUPO)[number];

export const PLANOS = ["essencial", "profissional", "imobiliaria", "custo"] as const;
export type Plano = (typeof PLANOS)[number];

export const SITUACOES = ["ativo", "suspenso", "encerrado"] as const;
export type Situacao = (typeof SITUACOES)[number];

export const ROTULO_DO_TIPO: Record<TipoDeGrupo, string> = {
  imobiliaria: "Imobiliária",
  independente: "Corretor independente",
};

export const ROTULO_DO_PLANO: Record<Plano, string> = {
  essencial: "Essencial",
  profissional: "Profissional",
  imobiliaria: "Imobiliária",
  custo: "Preço de custo",
};

export function ehTipoDeGrupo(valor: string): valor is TipoDeGrupo {
  return (TIPOS_DE_GRUPO as readonly string[]).includes(valor);
}

export function ehPlano(valor: string): valor is Plano {
  return (PLANOS as readonly string[]).includes(valor);
}
