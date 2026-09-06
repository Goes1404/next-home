import Link from "next/link";
import { getCandidatosDoCatalogo } from "@/lib/imoveis/candidatosDoCatalogo";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { PendenciasDoCatalogo } from "../_componentes/PendenciasDoCatalogo";
import { FilaCandidatos } from "./FilaCandidatos";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { AbasImoveis } from "@/app/corretor/(painel)/_componentes/AbasImoveis";

export const metadata = {
  title: "Fila de cadastro | Painel do Corretor",
  description: "O que falta cadastrar: imóveis do catálogo com ficha incompleta e lançamentos levantados no mercado.",
};

export const dynamic = "force-dynamic";

/**
 * A rota fica DENTRO de `/corretor/imoveis`, e isso não é organização de
 * pastas: o menu casa por prefixo, então "Imóveis" continua aceso aqui sem
 * um oitavo destino. A régua de destinos do painel é a que a reforma de
 * bolso deixou — o que é parente vira sub-rota, não item de menu.
 */
export default async function CandidatosPage() {
  const [candidatos, imoveis] = await Promise.all([
    getCandidatosDoCatalogo(),
    getEmpreendimentosDoPainel(),
  ]);

  /*
   * A lista de PENDÊNCIAS só olha o que está publicado. O cartão promete o
   * que "a assistente sente na conversa", e ela só enxerga publicado —
   * encher aquilo com rascunho recém-criado, incompleto por definição,
   * esvaziaria a promessa.
   */
  const publicados = imoveis.filter((i) => i.publicado ?? true);

  return (
    <div className="space-y-6">
      <CabecalhoDeTela secao="Imóveis" titulo="Fila de cadastro" descricao="Tudo que falta cadastrar, em ordem: primeiro a ficha incompleta dos imóveis que já são nossos — é o que a assistente sente na conversa —, depois os lançamentos de Barueri levantados no mercado, que ainda não são cadastro nenhum." />

      <AbasImoveis ativa="/corretor/imoveis/candidatos" />

      {/*
        A ficha incompleta vem ANTES dos lançamentos do mercado, e a ordem é
        de custo: imóvel nosso com ficha furada já está sendo oferecido ao
        cliente todo dia — a assistente promete a planta que não existe e
        inventa metragem que a ficha não tem. Lançamento de fora ainda não
        custa nada; é decisão a tomar.
      */}
      <PendenciasDoCatalogo imoveis={publicados} />

      <FilaCandidatos candidatos={candidatos} />
    </div>
  );
}
