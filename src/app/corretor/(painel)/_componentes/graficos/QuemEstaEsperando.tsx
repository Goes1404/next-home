import { createClient } from "@/lib/supabase/server";
import { FAIXAS_DE_ESPERA, faixasDeEspera, type FaixaDeEspera } from "@/lib/graficos/calculos";
import { BarrasHorizontais, CartaoDeGrafico, type TomDaBarra } from "./BarrasHorizontais";

/**
 * "Quem está esfriando?" (28/09/2026) — no Início.
 *
 * Conversas de atendimento cuja última mensagem é do CLIENTE (a view da
 * 0087), separadas pelo tempo de espera. A cor aqui É estado — quanto mais
 * espera, mais urgente —, então usa as cores de estado da casa, sempre com o
 * tempo escrito ao lado. Série de cor não cabe: seria identidade, e aqui a
 * faixa tem ordem.
 *
 * Some quando ninguém espera: um gráfico que vive em zero ensina a ignorar o
 * gráfico, a mesma régua do contador de aba.
 */
const TOM: Record<FaixaDeEspera, TomDaBarra> = {
  ate_1h: "ok",
  ate_6h: "alerta",
  ate_24h: "alerta",
  mais_de_24h: "perigo",
};

export async function QuemEstaEsperando({ corretorId }: { corretorId: string }) {
  const supabase = await createClient();
  // Filtro explícito por corretor: o gestor enxerga a equipe toda pela RLS, e
  // o Início é o trabalho DELE.
  const { data, error } = await supabase
    .from("whatsapp_esperando_resposta")
    .select("esperando_desde")
    .eq("corretor_id", corretorId);
  const desde = (error ? [] : (data ?? [])).map((d) => d.esperando_desde).filter((d): d is string => d !== null);
  if (desde.length === 0) return null;

  const faixas = faixasDeEspera(desde);
  const total = desde.length;
  const atrasados = faixas.ate_24h + faixas.mais_de_24h;

  return (
    <CartaoDeGrafico
      titulo={total === 1 ? "1 cliente esperando sua resposta" : `${total} clientes esperando sua resposta`}
      subtitulo={
        atrasados > 0
          ? "Comece pelos que esperam há mais tempo: resposta depois de um dia costuma chegar tarde."
          : "Todos esperando há menos de 6 horas."
      }
    >
      <BarrasHorizontais
        rotulo="Clientes esperando resposta, por tempo de espera"
        maximo={Math.max(...Object.values(faixas))}
        linhas={[...FAIXAS_DE_ESPERA].reverse().map((f) => ({
          chave: f.faixa,
          rotulo: f.rotulo,
          valor: faixas[f.faixa],
          tom: TOM[f.faixa],
          href: "/corretor/pessoas",
        }))}
      />
    </CartaoDeGrafico>
  );
}
