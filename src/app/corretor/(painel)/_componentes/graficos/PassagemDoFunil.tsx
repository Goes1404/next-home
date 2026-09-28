import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { maiorVazamento, passagemDoFunil } from "@/lib/graficos/calculos";
import { BarrasHorizontais, CartaoDeGrafico, GraficoVazio } from "./BarrasHorizontais";

/**
 * "Onde eu perco gente?" (28/09/2026).
 *
 * O funil desenhado (`FunilVisual`) mostra QUANTOS estão em cada etapa. Este
 * mostra quantos CHEGARAM a cada uma e quanto do passo anterior passou — é a
 * porcentagem que aponta onde treinar. O passo que mais vaza ganha a marca de
 * atenção, escrita (não só cor).
 */
export function PassagemDoFunil({ contagens }: { contagens: Partial<Record<EtapaFunil, number>> }) {
  const passos = passagemDoFunil(contagens);
  const vazamento = maiorVazamento(passos);
  const perdidos = contagens.perdido ?? 0;

  return (
    <CartaoDeGrafico
      titulo="Onde os contatos ficam pelo caminho"
      subtitulo="Quantos chegaram a cada etapa, e quanto do passo anterior passou."
      rodape={
        perdidos > 0
          ? `${perdidos} ${perdidos === 1 ? "contato perdido fica" : "contatos perdidos ficam"} fora da conta: a etapa atual deles não diz até onde foram.`
          : undefined
      }
    >
      {passos[0].alcancaram === 0 ? (
        <GraficoVazio texto="Quando os primeiros contatos entrarem na carteira, este gráfico mostra em que etapa eles param." />
      ) : (
        <BarrasHorizontais
          rotulo="Passagem pelo funil"
          linhas={passos.map((p) => ({
            chave: p.etapa,
            rotulo: ETAPA_LABEL[p.etapa],
            valor: p.alcancaram,
            // O link abre quem está NESTA etapa agora, não todos que passaram
            // por ela: o detalhe diz os dois números, para a lista não
            // parecer que contradiz a barra.
            detalhe: [
              p.doAnterior === null ? "todos que entraram" : `${p.doAnterior}% do passo anterior`,
              `${contagens[p.etapa] ?? 0} nesta etapa agora`,
            ].join(" · "),
            href: `/corretor/leads?etapa=${p.etapa}`,
            destaque: p.etapa === vazamento,
          }))}
        />
      )}
    </CartaoDeGrafico>
  );
}
