import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { inicioDoDiaEmSaoPaulo } from "@/lib/imagens/imagensTipos";
import {
  diasDesde,
  inicioDoPrimeiroContato,
  motivoDoPrimeiroContato,
  vagasDePrimeiroContato,
} from "./primeiroContato";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * A régua de primeiro contato (`primeiroContato.ts`) aplicada no envio, para
 * TODO caminho que abre conversa por iniciativa nossa (27/10/2026): lista de
 * transmissão, botão ✨ da IA, aviso de imóvel novo e roleta dos anúncios.
 * Um contador só por corretor (`primeiros_contatos_do_corretor`, 0222): para
 * o WhatsApp é o mesmo número falando com desconhecido, venha de onde vier.
 */

/**
 * A pessoa nunca escreveu ao corretor, em nenhum dos cadastros dados?
 * Em dúvida (sem lead, erro de leitura), trata como primeiro contato: é o
 * lado que protege o número.
 */
export async function nuncaFalouComOCorretor(supabase: Supa, leadIds: (string | null)[]): Promise<boolean> {
  const ids = leadIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return true;
  const { data: conversas, error } = await supabase.from("whatsapp_conversas").select("id").in("lead_id", ids);
  if (error) return true;
  const conversaIds = (conversas ?? []).map((c) => c.id);
  if (conversaIds.length === 0) return true;
  const { count, error: erroDaContagem } = await supabase
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .in("conversa_id", conversaIds)
    .eq("remetente", "cliente");
  if (erroDaContagem) return true;
  return (count ?? 0) === 0;
}

/**
 * Os primeiros contatos que o corretor já fez hoje (dia de São Paulo) e nos
 * últimos 7 dias, contados pelas mensagens que saíram (0222). `null` quando
 * não deu para ler: aí não sai nenhum.
 */
export async function contarPrimeirosContatos(
  supabase: Supa,
  corretorId: string,
  agora: Date = new Date(),
): Promise<{ hoje: number; semana: number } | null> {
  const contar = async (desde: string) => {
    const { data, error } = await supabase.rpc("primeiros_contatos_do_corretor", {
      p_corretor: corretorId,
      p_desde: desde,
    });
    return error || typeof data !== "number" ? null : data;
  };
  const hoje = await contar(new Date(inicioDoDiaEmSaoPaulo(agora)).toISOString());
  const semana = await contar(new Date(agora.getTime() - 7 * 86_400_000).toISOString());
  if (hoje === null || semana === null) return null;
  return { hoje, semana };
}

/**
 * Pode abrir conversa com quem nunca escreveu, agora, por este corretor?
 * Lê a instância (conexão e volta da última queda) e o contador. Devolve o
 * motivo em português quando não pode.
 */
export async function liberarPrimeiroContato(
  supabase: Supa,
  corretorId: string,
  agora: Date = new Date(),
): Promise<{ pode: true } | { pode: false; motivo: string }> {
  const { data: instancia, error } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("conectado_em, aquecimento_desde")
    .eq("corretor_id", corretorId)
    .maybeSingle();
  const diasDesdeInicio = diasDesde(
    inicioDoPrimeiroContato(
      instancia?.conectado_em ? new Date(instancia.conectado_em) : null,
      instancia?.aquecimento_desde ? new Date(instancia.aquecimento_desde) : null,
    ),
    agora,
  );
  if (error || !instancia) return { pode: false, motivo: motivoDoPrimeiroContato({ diasDesdeInicio: 0 }) };

  const feitos = await contarPrimeirosContatos(supabase, corretorId, agora);
  const vagas = feitos
    ? vagasDePrimeiroContato({ diasDesdeInicio, enviadosHoje: feitos.hoje, enviadosNaSemana: feitos.semana })
    : 0;
  return vagas > 0 ? { pode: true } : { pode: false, motivo: motivoDoPrimeiroContato({ diasDesdeInicio }) };
}
