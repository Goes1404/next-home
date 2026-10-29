// Quais tabelas do `public` pertencem a um grupo e quais são da plataforma.
//
// Regra da fase 1 (spec docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md):
// toda tabela do `public` tem `grupo_id`, EXCETO as listadas aqui. A lista é
// declarada à mão, como os `RESERVADOS` de `migrations.test.ts`: tabela nova
// que ficar sem grupo tem de estar aqui, com o motivo. A 0191 pôs `grupo_id`
// em todas as outras, e `isolamento.db.test.ts` confere as duas direções no
// banco (tabela sem grupo fora daqui; tabela daqui que ganhou grupo ou sumiu).
// A mesma lista está no SQL da 0191, que não lê este arquivo. Nenhuma tabela
// daqui é lida pela API, menos `grupos` (cada logado lê o próprio, 0190).
//
// `parametros_credito` NÃO é global: desde a decisão de 19/10/2026 cada grupo
// tem as próprias taxas do simulador (0190).

export const TABELAS_GLOBAIS = [
  // A própria lista de grupos: a linha É o grupo.
  "grupos",
  // Quem administra a plataforma, acima de todos os grupos.
  "administradores_da_plataforma",
  // Trava de infraestrutura do disparador (escopo + dono + prazo), tocada só
  // por `travar_disparo`/`destravar_disparo`; não é dado de nenhum grupo.
  "whatsapp_disparo_lock",
  // Diagnóstico do provedor de WhatsApp, por `instance_name`, gravado pela
  // sonda com a chave de serviço.
  "whatsapp_diagnosticos",
  // Parâmetros fiscais NACIONAIS (IRRF, INSS) com vigência e fonte (0232):
  // lei federal vale para todo grupo; só leitura pela sessão.
  "parametros_fiscais",
  // Pedidos de contratação da página de vendas (0238, 29/10/2026): chegam
  // ANTES de existir o grupo. O grupo que nasce do pedido fica em
  // `grupo_criado_id` (não `grupo_id`, que traria o carimbo e as regras de
  // tabela do grupo). Só a chave de serviço lê e escreve.
  "pedidos_de_contratacao",
  // Aparelhos dos administradores da plataforma com aviso ligado (0239,
  // 29/10/2026): o dono do aparelho é o usuário do Auth, acima dos grupos.
  "inscricoes_push_da_plataforma",
  // Chamados de suporte e contato com a Astro (0240, 29/10/2026): o contato
  // do site não tem grupo, e o do painel é conversa da imobiliária COM a
  // Astro, não dado dela. O grupo de onde veio fica em `grupo_origem_id`
  // (não `grupo_id`, pelo mesmo motivo dos pedidos). Só a chave de serviço
  // lê e escreve.
  "chamados_de_suporte",
  // Acessos da visão de suporte da plataforma (0243, 29/10/2026): o acesso
  // é um ato da Astro SOBRE a conta, não dado dela. O grupo acessado fica em
  // `grupo_alvo_id` (não `grupo_id`, pelo mesmo motivo dos chamados). Só a
  // chave de serviço lê e escreve; o gestor vê os do grupo dele pela chave
  // filtrada pela sessão.
  "acessos_de_suporte",
  // Avisos da Astro para o painel de todos os clientes (0242, 29/10/2026):
  // o recado é da plataforma e vale para todos os grupos; o público é
  // recortado por papel (todos ou só gestores), nunca por grupo. Só a chave
  // de serviço lê e escreve.
  "avisos_aos_clientes",
  // Indique e ganhe (0247, 29/10/2026): a linha liga DUAS contas (quem
  // indicou e quem foi indicada), então não cabe num grupo só. Os grupos
  // ficam em `grupo_indicador_id` e `grupo_indicado_id` (não `grupo_id`,
  // pelo mesmo motivo dos chamados). Só a chave de serviço lê e escreve; o
  // gestor vê as do grupo dele pela chave filtrada pela sessão.
  "indicacoes",
  // O crédito do indique e ganhe (0247, 29/10/2026): ato da Astro sobre a
  // conta que indicou (desconto a aplicar), gerado pelo pagamento de OUTRA
  // conta. A conta beneficiada fica em `grupo_beneficiado_id`. Só a chave de
  // serviço lê e escreve.
  "creditos_de_indicacao",
] as const;

export type TabelaGlobal = (typeof TABELAS_GLOBAIS)[number];

// Chaves únicas que continuam GLOBAIS (valem entre todos os grupos), com o
// motivo. Regra da 0192: toda chave única de uma tabela com grupo inclui
// `grupo_id` ou uma coluna-mãe (FK para tabela com grupo), porque chave de
// negócio global faz o grupo B ser recusado como "duplicado" de uma linha do
// grupo A (Review Focus 5). Ficam de fora a chave primária `id` (uuid
// sorteado) e as desta lista. `isolamento.db.test.ts` confere as duas
// direções: chave global fora daqui reprova, e entrada daqui que deixou de
// existir ou passou a ser escopada também. A mesma lista está no cabeçalho
// da 0192.
export const CHAVES_UNICAS_GLOBAIS = {
  // O site resolve imóvel e corretor pelo slug, sem grupo, até a fase 3.
  empreendimentos_slug_key: "slug do imóvel na URL pública (fase 3 escopa)",
  corretores_slug_key: "slug do corretor na URL pública (fase 3 escopa)",
  // Um login, um grupo.
  corretores_user_id_key: "um login pertence a um corretor só",
  // Nome da instância no provedor de WhatsApp, que é um servidor só.
  corretor_whatsapp_instancias_instance_name_key: "identidade da instância no provedor",
  // Um endereço de site pertence a um grupo só (0201): o mesmo host em dois
  // grupos seria dois sites disputando a mesma URL.
  enderecos_do_site_pkey: "host do site público; um endereço, um grupo",
  // O endereço de push identifica um navegador num aparelho; se outra conta o
  // inscrever (celular trocado de mão), ele passa para ela (0203).
  inscricoes_push_endpoint_key: "um aparelho recebe as notificações de uma conta só",
  // Tokens sorteados: são a credencial do link, não um dado de negócio.
  acessos_contador_pkey: "token sorteado do link do contador",
  links_do_cliente_pkey: "token sorteado do link do cliente",
  corretor_agenda_token_key: "token sorteado da agenda .ics",
  parceiros_token_key: "token sorteado da página do parceiro",
  // 0245 (29/10/2026): o token da URL do webhook dos portais diz o grupo
  // (a chave do Grupo OLX é por CRM, não por cliente), e o código curto da
  // vitrine (`/v/<codigo>`) não tem grupo no caminho.
  integracoes_de_portais_token_key: "token sorteado do webhook dos portais",
  links_do_cliente_codigo_key: "código curto sorteado da vitrine (/v/<codigo>)",
  // Ids que a Meta emite: únicos na Meta inteira, e a integração é só do
  // grupo 1 até a fase 7, que escopa a métrica por grupo.
  leads_meta_lead_id_key: "id do lead na Meta; upsert do webhook (fase 7)",
  meta_ads_metricas_pkey: "dia + id da campanha na Meta (fase 7)",
} as const;
