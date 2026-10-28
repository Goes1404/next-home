/**
 * O relatório que chega no grupo do corretor a cada lead (0229, 28/10/2026).
 * Puro: a tela usa para a prévia e o servidor para o envio — uma conta só.
 * A imobiliária escreve o modelo; sem modelo, vale o padrão (o texto de
 * sempre).
 */

export const MARCADORES_DO_AVISO = ["corretor", "cliente", "telefone", "origem", "imovel"] as const;
export type VariaveisDoAviso = Partial<Record<(typeof MARCADORES_DO_AVISO)[number], string | null>>;

export const TEXTO_AVISO_NO_GRUPO_PADRAO = [
  "📥 *Novo lead distribuído*",
  "*Corretor:* {corretor}",
  "*Cliente:* {cliente}",
  "*WhatsApp:* {telefone}",
  "*Origem:* {origem}",
  "*Imóvel:* {imovel}",
  "Abra o CRM para atender e registrar o contato.",
].join("\n");

export const LIMITE_DO_AVISO_NO_GRUPO = 1000;

/** Nome e telefone nunca ficam vazios no relatório: o corretor precisa ligar. */
const RESERVA: VariaveisDoAviso = { cliente: "Cliente novo", telefone: "não informado" };

function umaLinha(valor: string | null | undefined): string {
  return (valor ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);
}

/**
 * Troca `{marcador}` pelo valor. Linha com marcador sem valor sai inteira
 * ("*Imóvel:* " sozinho não diz nada); cliente e telefone têm reserva.
 */
export function montarAvisoNoGrupo(modelo: string | null | undefined, vars: VariaveisDoAviso): string {
  const texto = modelo?.trim() ? modelo : TEXTO_AVISO_NO_GRUPO_PADRAO;
  const valores = new Map<string, string>(MARCADORES_DO_AVISO.map((m) => [m, umaLinha(vars[m]) || umaLinha(RESERVA[m])]));
  return texto
    .split("\n")
    .flatMap((linha) => {
      const usados = [...linha.matchAll(/\{(\w+)\}/g)].map((x) => x[1]);
      if (usados.some((m) => valores.get(m) === "")) return [];
      return [linha.replace(/\{(\w+)\}/g, (todo, m: string) => valores.get(m) ?? todo)];
    })
    .join("\n")
    .trim();
}

/** Valida o modelo salvo pelo gestor. Vazio volta ao padrão (`null`). */
export function validarModeloDoAviso(entrada: string): { ok: true; modelo: string | null } | { ok: false; erro: string } {
  const modelo = entrada.replace(/\r\n/g, "\n").trim();
  if (!modelo) return { ok: true, modelo: null };
  if (modelo.length > LIMITE_DO_AVISO_NO_GRUPO) {
    return { ok: false, erro: `O relatório pode ter até ${LIMITE_DO_AVISO_NO_GRUPO} caracteres.` };
  }
  const desconhecido = [...modelo.matchAll(/\{([^}]*)\}/g)].find(
    (m) => !(MARCADORES_DO_AVISO as readonly string[]).includes(m[1]),
  );
  if (desconhecido) return { ok: false, erro: `Marcador desconhecido: {${desconhecido[1]}}.` };
  if (modelo === TEXTO_AVISO_NO_GRUPO_PADRAO) return { ok: true, modelo: null };
  return { ok: true, modelo };
}
