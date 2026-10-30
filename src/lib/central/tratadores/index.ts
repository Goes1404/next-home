import type { Tratadores } from "../executar";
import { ACOES_AGENDA, CONSULTAS_AGENDA } from "./agenda";
import { ACOES_CONSULTAS, CONSULTAS_CONSULTAS } from "./consultas";
import { ACOES_CONTROLE, CONSULTAS_CONTROLE } from "./controle";
import { ACOES_FOTO, CONSULTAS_FOTO } from "./foto";
import { ACOES_LEADS, CONSULTAS_LEADS } from "./leads";

/**
 * Os tratadores das ondas 1 a 3, um arquivo por frente. Entram todos em
 * `TRATADORES`; quem decide se rodam é a `onda` de cada ferramenta contra
 * `ONDA_ATUAL` (`criarExecutor`). Tratador pronto de onda futura responde
 * "ainda não sei" até a onda ser ligada.
 */
export const TRATADORES_DAS_ONDAS: Tratadores = {
  consultas: { ...CONSULTAS_CONSULTAS, ...CONSULTAS_LEADS, ...CONSULTAS_AGENDA, ...CONSULTAS_CONTROLE, ...CONSULTAS_FOTO },
  acoes: { ...ACOES_CONSULTAS, ...ACOES_LEADS, ...ACOES_AGENDA, ...ACOES_CONTROLE, ...ACOES_FOTO },
};
