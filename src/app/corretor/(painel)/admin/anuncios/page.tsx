import { redirect } from "next/navigation";

/*
 * A tela "Anúncios" da Administração virou seção de Anúncios pagos em
 * 30/09/2026. O endereço antigo continua valendo (link salvo, favorito) e
 * leva direto à seção.
 */
export default function AnunciosAntigo() {
  redirect("/corretor/marketing/impulsionamentos#conta-da-meta");
}
