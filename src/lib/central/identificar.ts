import type { createServiceClient } from "@/lib/supabase/service";
import { telefoneCanonico, variantesDoTelefone } from "./telefone";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Quem está escrevendo para o número central (spec 4.2).
 *
 * O contexto (corretor, imobiliária, papel) sai DAQUI, nunca do que a IA
 * escreve: a IA não escolhe de quem são os dados. Busca pelo WhatsApp do
 * perfil (todas as formas do número) e pelo `whatsapp_lid`, que o WhatsApp
 * passou a usar no lugar do número em alguns casos.
 */
export type Remetente =
  | { tipo: "desconhecido" }
  | { tipo: "inativo" }
  | { tipo: "desligado"; grupoId: string }
  | { tipo: "escolher"; telefone: string; opcoes: OpcaoDeImobiliaria[] }
  | { tipo: "pessoa"; corretorId: string; grupoId: string; papel: "corretor" | "gestor"; nome: string; imobiliaria: string };

export type OpcaoDeImobiliaria = { corretorId: string; grupoId: string; nome: string };

type LinhaCorretor = {
  id: string;
  nome: string;
  papel: string;
  grupo_id: string;
  ativo: boolean;
};

export async function identificarRemetente(
  supabase: Supa,
  entrada: { telefone: string | null; lid: string | null },
): Promise<Remetente> {
  const variantes = entrada.telefone ? variantesDoTelefone(entrada.telefone) : [];
  const filtros = [
    ...(variantes.length > 0 ? [`whatsapp.in.(${variantes.join(",")})`] : []),
    ...(entrada.lid ? [`whatsapp_lid.eq.${entrada.lid.replace(/[^\w@.]/g, "")}`] : []),
  ];
  if (filtros.length === 0) return { tipo: "desconhecido" };

  const { data: corretores, error } = await supabase
    .from("corretores")
    .select("id, nome, papel, grupo_id, ativo")
    .or(filtros.join(","))
    .returns<LinhaCorretor[]>();
  // Erro de leitura é silêncio, como desconhecido: responder sem saber quem
  // é poderia mostrar dado de outra pessoa.
  if (error || !corretores || corretores.length === 0) return { tipo: "desconhecido" };

  const ativos = corretores.filter((c) => c.ativo);
  if (ativos.length === 0) return { tipo: "inativo" };

  const { data: grupos } = await supabase
    .from("grupos")
    .select("id, nome, central_whatsapp_ativo")
    .in("id", [...new Set(ativos.map((c) => c.grupo_id))]);
  const grupoPorId = new Map((grupos ?? []).map((g) => [g.id, g]));
  const ligados = ativos.filter((c) => grupoPorId.get(c.grupo_id)?.central_whatsapp_ativo === true);
  if (ligados.length === 0) return { tipo: "desligado", grupoId: ativos[0].grupo_id };

  const pessoa = (c: LinhaCorretor): Remetente => ({
    tipo: "pessoa",
    corretorId: c.id,
    grupoId: c.grupo_id,
    papel: c.papel === "gestor" ? "gestor" : "corretor",
    nome: c.nome,
    imobiliaria: grupoPorId.get(c.grupo_id)?.nome ?? "",
  });
  if (ligados.length === 1) return pessoa(ligados[0]);

  // Duas imobiliárias com o recurso ligado: vale a escolha guardada, se ainda
  // for uma das opções; senão pergunta.
  const telefone = entrada.telefone ? telefoneCanonico(entrada.telefone) : `lid:${entrada.lid}`;
  const { data: escolha } = await supabase
    .from("central_escolha_de_grupo")
    .select("corretor_id")
    .eq("telefone", telefone)
    .maybeSingle();
  const escolhido = ligados.find((c) => c.id === escolha?.corretor_id);
  if (escolhido) return pessoa(escolhido);

  return {
    tipo: "escolher",
    telefone,
    opcoes: ligados
      .map((c) => ({ corretorId: c.id, grupoId: c.grupo_id, nome: grupoPorId.get(c.grupo_id)?.nome ?? "Imobiliária" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}
