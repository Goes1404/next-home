// Funções `security definer` e o grupo (0192, spec §14).
//
// Dentro de uma função `security definer` a RLS não vale: ela roda como o
// dono (`postgres`) e enxerga todos os grupos. A regra da fase 1: toda função
// assim que lê ou escreve linhas de outra pessoa restringe ao grupo — o de
// quem chama (`grupo_atual()`), o da linha do gatilho (`new.grupo_id`) ou o
// do parâmetro (o grupo do imóvel no porteiro). As que só tocam a linha do
// próprio chamador, a de um id que o servidor já resolveu, ou que são da
// plataforma (cron, trava de disparo), ficam em `FUNCOES_SEM_GRUPO`, com o
// motivo. Declarada à mão, como `TABELAS_GLOBAIS`.
//
// Duas guardas leem isto: `funcoesSeguras.test.ts` (o texto das migrations)
// e `funcoesSeguras.db.test.ts` (o `pg_proc` do banco local, que pega a
// função que existe só no banco e o EXECUTE que o texto não mostra).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Funções `security definer` que não citam o grupo, com o motivo. A chave é
 * a assinatura como o Postgres a escreve: `nome(tipo, tipo)`.
 */
export const FUNCOES_SEM_GRUPO: Record<string, string> = {
  // Identidade de quem chama: lê só a própria linha.
  "corretor_atual()": "lê só a linha de quem está logado",
  "eh_gestor()": "lê só a linha de quem está logado; significa 'gestor do meu grupo'",
  "eh_admin_da_plataforma()": "lê só a linha de quem está logado em administradores_da_plataforma",
  "participa_da_venda(uuid)": "confere só a participação de quem está logado (corretor_atual())",

  // Olham TODOS os grupos de propósito (Task 4): os slugs e o e-mail de
  // acesso são únicos na plataforma inteira, e a resposta é só sim/não, sem
  // id, nome nem grupo. Slug de corretor e e-mail: só gestor executa (é quem
  // cria acesso). Slug de imóvel: qualquer corretor ativo (é quem cria
  // imóvel); pela sessão ele só veria o próprio grupo e bateria na chave
  // global com "já existe" (achado B da revisão final da fase 1).
  "slug_de_corretor_livre(text)": "unicidade global do slug; devolve só sim/não; só gestor",
  "slug_de_imovel_livre(text)": "unicidade global do slug de imóvel; devolve só sim/não; só corretor ativo",
  "email_de_acesso_livre(text)": "unicidade global do e-mail de acesso (e do Auth); devolve só sim/não; só gestor",

  // A assinatura antiga do porteiro, `sortear_corretor_whatsapp(uuid, uuid)`,
  // ficou aqui da 0192 até a 0194, que a apaga depois do deploy. Se ela
  // voltar a existir sem grupo no corpo, a guarda reprova.

  // Cotas e créditos por id que o servidor já resolveu. Só a chave de
  // serviço executa (o authenticated não tem EXECUTE).
  "consumir_cota_campanha(uuid, integer)": "cota da instância já resolvida pelo disparador; só service_role",
  "consumir_cota_campanha_espacada(uuid, integer, integer, integer)":
    "cota da instância já resolvida pelo disparador; só service_role",
  "devolver_cota_campanha(uuid)": "cota da instância já resolvida pelo disparador; só service_role",
  "reservar_credito_video(uuid)": "crédito do corretor resolvido pelo servidor (fila de vídeo); só service_role desde a 0192",
  "devolver_credito_video(uuid, text)": "crédito do corretor resolvido pelo servidor (fila de vídeo); só service_role desde a 0192",
  "registrar_resposta_do_lead(uuid)": "lead já resolvido pelo webhook; só service_role",
  "registrar_tentativa_contato(uuid)": "lead já resolvido pelo disparador; só service_role",
  "reservar_horario_visita(uuid, timestamp with time zone)":
    "lead já resolvido pela conversa; só service_role desde a 0192",

  // Gatilhos que tocam só a linha-mãe ou filhas da própria linha: o grupo
  // de todas elas é o mesmo, conferido pelo carimbo da 0191.
  "contar_mensagem_nao_lida()": "gatilho: soma na conversa da própria mensagem (mesmo grupo pela 0191)",
  "conversa_sem_lead_so_em_conta_so_whatsapp()": "gatilho: lê o corretor da própria conversa",
  "iniciar_sla_lead()": "gatilho: cria o SLA do próprio lead (o grupo vem da mãe, 0191)",
  "registrar_consentimento_inicial_lead()": "gatilho: grava filhas do próprio lead (o grupo vem da mãe, 0191)",
  "registrar_touchpoint_inicial_lead()": "gatilho: grava o touchpoint do próprio lead (o grupo vem da mãe, 0191)",
  "registrar_sla_interacao_humana()": "gatilho: atualiza o SLA do lead da própria interação",
  "registrar_sla_mensagem_whatsapp()": "gatilho: atualiza o SLA do lead da própria conversa",

  // Plataforma: cron e infraestrutura, sobre todos os grupos de propósito,
  // sem EXECUTE para o authenticated.
  "arquivar_leads_sem_resposta()": "rotina do cron, a mesma regra para todos os grupos; só postgres/service_role",
  "processar_outbox_analytics_interno(integer)": "fila de entrega da plataforma; só service_role",
  "travar_disparo(text, text, integer)": "trava de infraestrutura (whatsapp_disparo_lock, tabela global)",
  "destravar_disparo(text, text)": "trava de infraestrutura (whatsapp_disparo_lock, tabela global)",
  "configurar_aviso_de_espera(text, text)": "agenda o cron da plataforma; só postgres",
  "configurar_disparo_automatico(text, text)": "agenda o cron da plataforma; só postgres",
  "configurar_followups_automaticos(text, text)": "agenda o cron da plataforma; só postgres",
  "configurar_relatorio_semanal(text, text)": "agenda o cron da plataforma; só postgres",
  "desligar_aviso_de_espera()": "desagenda o cron da plataforma; só postgres",
  "desligar_disparo_automatico()": "desagenda o cron da plataforma; só postgres",
  "desligar_followups_automaticos()": "desagenda o cron da plataforma; só postgres",
  "desligar_relatorio_semanal()": "desagenda o cron da plataforma; só postgres",
};

/**
 * Regra do EXECUTE (L20): função `security definer` que o `authenticated`
 * executa e que recebe id de corretor, instância ou lead no parâmetro tem de
 * conferir que o id é do chamador (ou do grupo dele, para o gestor). As que
 * conferem estão aqui, com o como. As demais perdem o EXECUTE do
 * `authenticated` e ficam só para a chave de serviço.
 */
export const FUNCOES_QUE_CONFEREM_O_CHAMADOR: Record<string, string> = {
  "definir_papel_corretor(uuid, text)": "só gestor (eh_gestor()), e o alvo tem de ser do grupo dele (grupo_atual())",
  "definir_preferencia_contato(uuid, text, boolean)":
    "o lead tem de ser do grupo de quem chama, e do próprio corretor ou de um gestor",
  "marcar_repasse_pago(uuid, uuid, date)": "só gestor, e a venda tem de ser do grupo dele",
};

/** Parâmetro com id de corretor, instância ou lead (L20). */
export const NOME_DE_PARAMETRO_COM_ID = /(corretor|instancia|lead|alvo)/i;

export type FuncaoDefinida = {
  /** `nome(tipo, tipo)`, como `oidvectortypes` escreve. */
  assinatura: string;
  nome: string;
  /** O corpo, sem os comentários `--`. */
  corpo: string;
  securityDefiner: boolean;
  arquivo: string;
};

const DIR = join(process.cwd(), "supabase", "migrations");

/** Remove comentários de linha (`--`), fora de strings simples. */
export function semComentarios(sql: string): string {
  return sql
    .split("\n")
    .map((linha) => {
      let dentro = false;
      for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === "'") dentro = !dentro;
        else if (!dentro && c === "-" && linha[i + 1] === "-") return linha.slice(0, i);
      }
      return linha;
    })
    .join("\n");
}

const SINONIMOS: Record<string, string> = {
  timestamptz: "timestamp with time zone",
  timestamp: "timestamp without time zone",
  int: "integer",
  int4: "integer",
  int8: "bigint",
  bool: "boolean",
  varchar: "character varying",
  float8: "double precision",
};

function normalizarTipo(tipo: string): string {
  let t = tipo.toLowerCase().replace(/\s+/g, " ").trim();
  t = t.replace(/^public\./, "");
  t = t.replace(/\s*\([^)]*\)/, ""); // numeric(16, 2) → numeric
  const vetor = t.endsWith("[]");
  if (vetor) t = t.slice(0, -2).trim();
  t = SINONIMOS[t] ?? t;
  return vetor ? `${t}[]` : t;
}

/** Divide por vírgula fora de parênteses. */
function dividir(lista: string): string[] {
  const partes: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const c of lista) {
    if (c === "(") nivel++;
    if (c === ")") nivel--;
    if (c === "," && nivel === 0) {
      partes.push(atual);
      atual = "";
    } else atual += c;
  }
  if (atual.trim()) partes.push(atual);
  return partes;
}

/** Os tipos de identidade da lista de parâmetros (sem OUT, sem default). */
export function tiposDosParametros(lista: string): string[] {
  const tipos: string[] = [];
  for (const parte of dividir(lista)) {
    let p = parte.replace(/\s+(default|=)\s[\s\S]*$/i, "").replace(/\s*=\s*[\s\S]*$/, "").trim();
    if (!p) continue;
    const modo = /^(in|out|inout|variadic)\s+/i.exec(p);
    if (modo) {
      if (/^out$/i.test(modo[1])) continue;
      p = p.slice(modo[0].length);
    }
    // `nome tipo...`: o primeiro token é o nome do parâmetro.
    const espaco = p.search(/\s/);
    tipos.push(normalizarTipo(espaco === -1 ? p : p.slice(espaco + 1)));
  }
  return tipos;
}

function fechaParenteses(sql: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < sql.length; i++) {
    if (sql[i] === "(") nivel++;
    else if (sql[i] === ")") {
      nivel--;
      if (nivel === 0) return i;
    }
  }
  return -1;
}

/**
 * A última definição viva de cada função do `public` nas migrations, na
 * ordem em que elas rodam. `drop function` apaga (sem lista de tipos, todas
 * as sobrecargas). Os comentários saem antes de ler, senão um `drop function`
 * citado num comentário de reversão apagaria a função.
 */
export function funcoesDasMigrations(): Map<string, FuncaoDefinida> {
  const vivas = new Map<string, FuncaoDefinida>();
  const arquivos = readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  const comando = /\b(create\s+(?:or\s+replace\s+)?function|drop\s+function(?:\s+if\s+exists)?)\s+public\.([a-z0-9_]+)\s*(\()?/gi;

  for (const arquivo of arquivos) {
    const sql = semComentarios(readFileSync(join(DIR, arquivo), "utf8"));
    comando.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = comando.exec(sql))) {
      const ehCriacao = /^create/i.test(m[1]);
      const nome = m[2].toLowerCase();
      if (!m[3]) {
        // `drop function public.x;` sem lista: todas as sobrecargas.
        if (!ehCriacao) for (const chave of [...vivas.keys()]) if (vivas.get(chave)!.nome === nome) vivas.delete(chave);
        continue;
      }
      const abre = m.index + m[0].length - 1;
      const fecha = fechaParenteses(sql, abre);
      const assinatura = `${nome}(${tiposDosParametros(sql.slice(abre + 1, fecha)).join(", ")})`;

      if (!ehCriacao) {
        vivas.delete(assinatura);
        comando.lastIndex = fecha;
        continue;
      }

      // O corpo vai de `as $tag$` até o mesmo `$tag$`; os atributos
      // (`security definer`, `set search_path`) podem vir antes ou depois.
      const resto = sql.slice(fecha);
      const as = /\bas\s+(\$[a-z_]*\$)/i.exec(resto);
      if (!as) continue;
      const inicioCorpo = as.index + as[0].length;
      const fimCorpo = resto.indexOf(as[1], inicioCorpo);
      const fimComando = resto.indexOf(";", fimCorpo + as[1].length);
      const atributos = resto.slice(0, as.index) + resto.slice(fimCorpo + as[1].length, fimComando);
      vivas.set(assinatura, {
        assinatura,
        nome,
        corpo: resto.slice(inicioCorpo, fimCorpo),
        securityDefiner: /\bsecurity\s+definer\b/i.test(atributos),
        arquivo,
      });
      comando.lastIndex = fecha + fimComando;
    }
  }
  return vivas;
}
