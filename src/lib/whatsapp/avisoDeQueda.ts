import "server-only";

import { enviarEmail } from "@/lib/email";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import {
  avaliarSaudeDaConexao,
  montarEmailDeQueda,
  type AvisoDaConexao,
  type FotoDaConexao,
} from "./saudeDaConexao";

/**
 * Descobre no banco se o número está no ar e, quando não está, avisa.
 *
 * Duas entradas, uma decisão (`avaliarSaudeDaConexao`):
 *
 * - `carregarAvisoDaConexao` alimenta a FAIXA do painel (toda tela);
 * - `avisarQuedaSeNecessario` alimenta o E-MAIL, chamado pelo cron de
 *   disparo, que é quem descobre a queda primeiro.
 *
 * ## O custo da faixa foi medido antes de escrever
 *
 * A faixa vive no layout do painel, ou seja, roda em TODA tela — inclusive
 * no Início, a mais aberta de todas, cujas consultas foram enxugadas de
 * propósito na F3. Por isso o caminho feliz é UMA consulta: a linha da
 * instância e mais nada. A contagem da fila só acontece quando já se sabe
 * que há um aviso a dar, e serve apenas para engrossar o texto ("e 15
 * mensagens estão paradas").
 *
 * Consequência deliberada: a faixa nunca mostra o estado `fila_esperando`
 * (cota do dia esgotada), porque na primeira passada a contagem é zero e
 * esse estado exige fila > 0. É a decisão certa: `fila_esperando` não é um
 * apagão — é o sistema funcionando —, e a tela de Campanhas já explica isso
 * em português de gente (`statusDisparo`). A faixa do painel inteiro é para
 * o caso em que NADA está acontecendo e o corretor não sabe.
 */

interface LinhaInstancia {
  id: string;
  corretor_id: string;
  status_conexao: string;
  conectado_em: string | null;
  desconectado_em: string | null;
  bloqueado_ate: string | null;
  envios_campanha_data: string | null;
  envios_campanha_contador: number;
  aviso_queda_enviado_em: string | null;
}

const COLUNAS =
  "id, corretor_id, status_conexao, conectado_em, desconectado_em, bloqueado_ate, envios_campanha_data, envios_campanha_contador, aviso_queda_enviado_em";

function fotoDe(linha: LinhaInstancia, pendentes: number): FotoDaConexao {
  return {
    statusConexao: linha.status_conexao,
    conectadoEm: linha.conectado_em ? new Date(linha.conectado_em) : null,
    desconectadoEm: linha.desconectado_em ? new Date(linha.desconectado_em) : null,
    bloqueadoAte: linha.bloqueado_ate ? new Date(linha.bloqueado_ate) : null,
    enviosCampanhaData: linha.envios_campanha_data,
    enviosCampanhaContador: linha.envios_campanha_contador ?? 0,
    pendentes,
  };
}

/**
 * Quantos itens de campanha deste corretor ainda não saíram.
 *
 * A fila não guarda a instância — o vínculo é por campanha. Duas consultas
 * magras (ids das campanhas, depois um `count` com `head`) custam menos que
 * trazer linha de fila para contar na aplicação.
 */
async function contarPendentes(corretorId: string): Promise<number> {
  const supabase = createServiceClient();

  const { data: campanhas } = await supabase
    .from("whatsapp_campanhas")
    .select("id")
    .eq("corretor_id", corretorId);

  const ids = (campanhas ?? []).map((c) => c.id);
  if (ids.length === 0) return 0;

  const { count } = await supabase
    .from("whatsapp_campanhas_fila")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente")
    .in("campanha_id", ids);

  return count ?? 0;
}

/**
 * O e-mail de login, quando o cadastro não tem um.
 *
 * Medido em 31/08/2026: **0 de 8 corretores** têm `corretores.email`
 * preenchido — a coluna só é escrita por `criarAcesso`, e quase todos os
 * cadastros são anteriores a ela. Sem esta reserva o aviso de queda não
 * teria destinatário nenhum e o recurso nasceria decorativo, que é o defeito
 * recorrente desta base (caminho que existe e não produz efeito).
 *
 * O endereço do login é o mesmo que a pessoa usa para entrar no painel, ou
 * seja, um endereço que ela de fato lê.
 */
async function emailDoLogin(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const { data } = await createServiceClient().auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

/** O aviso a mostrar na faixa, ou `null` quando está tudo certo. */
export async function carregarAvisoDaConexao(
  corretorId: string,
  agora: Date = new Date(),
): Promise<AvisoDaConexao | null> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("corretor_whatsapp_instancias")
    .select(COLUNAS)
    .eq("corretor_id", corretorId)
    .maybeSingle<LinhaInstancia>();

  // Corretor sem instância nenhuma nunca começou a configurar o WhatsApp.
  // Cobrar isso numa faixa vermelha em toda tela seria cobrar de quem talvez
  // nem use o recurso — o convite mora na tela de WhatsApp, não aqui.
  if (!data) return null;

  const semFila = avaliarSaudeDaConexao(fotoDe(data, 0), agora);
  if (!semFila) return null;

  return avaliarSaudeDaConexao(fotoDe(data, await contarPendentes(data.corretor_id)), agora);
}

/**
 * Passa por TODAS as instâncias e avisa as que estiverem caídas.
 *
 * ## Por que uma varredura, e não um gancho no caminho do disparo
 *
 * A primeira versão disto (31/08, manhã) chamava o aviso de dentro do
 * disparador, no ponto em que a conexão falha. Uma auditoria do próprio
 * roadmap derrubou a ideia no mesmo dia, e o contraexemplo é o incidente
 * que originou o recurso: em 28/08 os três timeouts abriram o disjuntor **no
 * mesmo minuto** da queda, e `processarInstancia` devolve `numero_bloqueado`
 * ANTES de chegar à checagem de conexão. Ou seja: nas 12 horas de bloqueio,
 * o aviso não sairia — justamente no caso que ele existe para cobrir.
 *
 * Havia ainda dois outros desvios pela frente: fora da janela comercial o
 * disparador retorna antes de olhar instância nenhuma, e sem campanha ativa
 * ele também sai cedo. Aviso pendurado no caminho do disparo herda todas as
 * saídas antecipadas do disparo.
 *
 * Por isso a varredura roda ANTES de tudo, a cada tique do cron, e não
 * depende de haver fila, janela aberta ou número liberado. É barata: uma
 * consulta para todas as instâncias, e cada uma que já foi avisada sai no
 * primeiro `if`.
 */
export async function varrerQuedasDeNumero(agora: Date = new Date()): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id")
      .is("aviso_queda_enviado_em", null);

    for (const linha of data ?? []) {
      await avisarQuedaSeNecessario(linha.id, agora);
    }
  } catch (e) {
    console.error("[aviso-queda] varredura falhou sem derrubar o ciclo:", e);
  }
}

/**
 * Manda o e-mail de queda — no máximo UM por queda.
 *
 * Chamado pelo cron de disparo, que roda a cada minuto: sem a marca em
 * `aviso_queda_enviado_em`, uma queda de três dias viraria mais de quatro
 * mil e-mails. A marca (e o marco da queda) voltam a `null` quando o número
 * reconecta — é isso que arma o aviso da próxima vez.
 *
 * Nunca lança: quem chama está no meio de um ciclo de disparo, e derrubar o
 * disparo porque um aviso não saiu troca um problema pequeno por um grande.
 */
export async function avisarQuedaSeNecessario(
  instanciaId: string,
  agora: Date = new Date(),
): Promise<void> {
  try {
    const supabase = createServiceClient();

    const { data } = await supabase
      .from("corretor_whatsapp_instancias")
      .select(COLUNAS)
      .eq("id", instanciaId)
      .maybeSingle<LinhaInstancia>();

    if (!data || data.aviso_queda_enviado_em) return;

    const aviso = avaliarSaudeDaConexao(fotoDe(data, await contarPendentes(data.corretor_id)), agora);
    if (!aviso?.mereceEmail) return;

    const { data: corretor } = await supabase
      .from("corretores")
      .select("nome, email, user_id")
      .eq("id", data.corretor_id)
      .maybeSingle<{ nome: string; email: string | null; user_id: string | null }>();

    if (!corretor) return;

    const email = corretor.email ?? (await emailDoLogin(corretor.user_id));

    if (!email) {
      console.warn(
        `[aviso-queda] corretor ${data.corretor_id} não tem e-mail no cadastro nem no login — aviso não enviado.`,
      );
      return;
    }

    const { assunto, html, texto } = montarEmailDeQueda(aviso, {
      nomeCorretor: corretor.nome,
      urlPainel: site.url,
    });

    const resultado = await enviarEmail({ para: email, assunto, html, texto });

    /*
     * A marca só é gravada quando o e-mail SAIU. Marcar mesmo em falha
     * transformaria uma indisponibilidade momentânea do provedor de e-mail
     * em silêncio permanente sobre a queda — que é exatamente o defeito que
     * este código veio consertar.
     */
    if (resultado.enviado) {
      await supabase
        .from("corretor_whatsapp_instancias")
        .update({ aviso_queda_enviado_em: agora.toISOString() })
        .eq("id", instanciaId);
    }
  } catch (e) {
    console.error("[aviso-queda] falhou sem derrubar o ciclo:", e);
  }
}
