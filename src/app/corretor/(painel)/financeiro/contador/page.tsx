import type { Metadata } from "next";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getAcessosContador, getMesesFechados } from "@/lib/financeiro/contadorDados";
import { mesesAte } from "@/lib/financeiro/resultado";
import { somarMeses } from "@/lib/financeiro/caixa";
import { nomeDoMes } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { BotaoFecharMes, BotaoReabrirMes, BotaoRevogarAcesso, NovoAcessoContador } from "./ControlesDoContador";

export const metadata: Metadata = { title: "Contador" };

const rotuloDoMes = (mes: string) => `${nomeDoMes(`${mes}-01`)} ${mes.slice(0, 4)}`;
const curto = (mes: string) => `${nomeDoMes(`${mes}-01`).slice(0, 3).toLowerCase()}/${mes.slice(2, 4)}`;
const dataBr = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
const baixar = "text-fluid-sm border-linha text-corpo hover:border-acento-linha inline-flex min-h-11 items-center rounded-xl border px-4";

/**
 * O contador (0168), só para o gestor. O dono fecha cada mês; o fechamento
 * guarda o pacote em planilha e trava o que foi pago naquele mês. O contador
 * baixa os meses fechados por um link, sem login.
 */
export default async function ContadorPage() {
  await exigirGestorNaPagina();
  const hoje = hojeEmSaoPaulo();
  const mesAtual = hoje.slice(0, 7);

  const cabecalho = (
    <CabecalhoDeTela
      secao="Financeiro"
      titulo="Contador"
      descricao="Feche cada mês e mande o pacote em planilha para o contador. Mês fechado não muda mais por baixo dele."
    />
  );

  const [leitura, acessos] = await Promise.all([getMesesFechados(), getAcessosContador()]);
  if (!leitura.ok) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <p className="cartao text-fluid-sm text-corpo p-4">
          {leitura.motivo === "sem_tabela"
            ? "O fechamento de mês ainda não foi ativado no banco. Assim que for, esta tela passa a funcionar."
            : "Não foi possível carregar agora. Recarregue a página."}
        </p>
      </div>
    );
  }

  const fechados = new Map(leitura.meses.map((m) => [m.mes, m]));
  // Os 12 meses que terminaram, mais o mês corrente como prévia.
  const meses = [mesAtual, ...mesesAte(somarMeses(`${mesAtual}-01`, -1).slice(0, 7), 12).reverse()];
  const ativos = acessos.filter((a) => !a.revogadoEm && a.expiraEm > new Date().toISOString());

  return (
    <div className="space-y-4">
      {cabecalho}

      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Meses</h2>
        <p className="text-fluid-xs text-tenue">
          O pacote tem uma aba por assunto: resumo do mês, entradas e saídas, impostos estimados, RPA dos corretores e notas fiscais das comissões.
          Mês aberto baixa uma prévia com os números de agora.
        </p>
        <ul className="divide-linha divide-y">
          {meses.map((m) => {
            const f = fechados.get(m);
            const corrente = m === mesAtual;
            return (
              <li key={m} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-corpo font-medium">{rotuloDoMes(m)}</p>
                  <p className={`text-fluid-xs ${f ? "text-tenue" : corrente ? "text-apoio" : "text-alerta"}`}>
                    {f
                      ? `Fechado em ${dataBr(f.fechadoEm)}${typeof f.totais.resultado === "number" ? ` · resultado ${formatarReais(f.totais.resultado)}` : ""}${f.totais.semNota ? ` · ${f.totais.semNota} comissão(ões) sem nota` : ""}`
                      : corrente
                        ? "Em andamento"
                        : "Aberto"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <a href={`/api/painel/contador-excel?mes=${m}`} className={baixar} download>
                    {f ? "Baixar" : `Prévia de ${curto(m)}`}
                  </a>
                  {f ? <BotaoReabrirMes mes={m} /> : !corrente ? <BotaoFecharMes mes={m} rotulo={curto(m)} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-fluid-xs text-tenue">
          Antes de fechar, confira em Caixa e Vendas se tudo o que foi pago e recebido no mês está marcado.
        </p>
      </section>

      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Link do contador</h2>
        <p className="text-fluid-xs text-tenue">
          Quem tem o link baixa os meses fechados, sem login. Vale por um ano. Se o contador mudar ou o link vazar, revogue.
        </p>
        <NovoAcessoContador />
        {ativos.length > 0 && (
          <ul className="divide-linha divide-y">
            {ativos.map((a) => (
              <li key={a.token} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-corpo">{a.nome}</p>
                  <p className="text-fluid-xs text-tenue">
                    Criado em {dataBr(a.criadoEm)} · {a.ultimoAcessoEm ? `último acesso em ${dataBr(a.ultimoAcessoEm)}` : "ainda não abriu"}
                  </p>
                </div>
                <BotaoRevogarAcesso token={a.token} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
