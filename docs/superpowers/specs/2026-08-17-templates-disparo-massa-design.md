# Templates de mensagem + disparo de WhatsApp em massa

Sub-projeto 3 (e um pedaço do 2 — filtros da tabela de leads) do módulo de
leads. Cobre: filtros na tela `/corretor/leads`, templates de mensagem por
corretor, seleção múltipla, e o botão "Enviar mensagem para selecionados".

## Contexto e restrição técnica

Investigação prévia (não é mais spike, decisão já tomada): sem a API oficial
do WhatsApp Business (Meta Cloud API) — que exige conta comercial
verificada, número dedicado e templates pré-aprovados pela Meta, dias de
processo — não existe envio automático de verdade. `wa.me` abre a conversa
com o texto pronto, mas quem manda a mensagem de fato é sempre um clique
humano em "enviar" dentro do WhatsApp Web/app.

Este spec constrói o "em massa" possível com essa restrição: abrir uma aba
`wa.me` por lead selecionado, em sequência, com espera aleatória entre cada
uma. O corretor ainda clica "enviar" em cada aba — o ganho é não precisar
abrir contato por contato manualmente, e ter registro de quem foi
contactado com qual mensagem.

Se um dia a API oficial entrar, o único lugar que muda é a função que abre
o link — o resto (templates, seleção, histórico) continua igual.

## Banco de dados — migration `0013_templates_historico.sql`

```sql
create table templates_mensagens (
  id uuid primary key default gen_random_uuid(),
  corretor_id uuid not null references corretores(id) on delete cascade,
  titulo text not null,
  -- Variáveis: {{nome_lead}}, {{nome_corretor}}, {{telefone_corretor}}.
  conteudo text not null,
  padrao boolean not null default false,
  created_at timestamptz not null default now()
);

create table historico_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  corretor_id uuid not null references corretores(id) on delete cascade,
  -- Texto já com as variáveis substituídas — o que de fato foi aberto no
  -- WhatsApp daquele lead, não o template genérico.
  mensagem_enviada text not null,
  -- Só existe 'aberto' por enquanto: é tudo que dá pra confirmar sem API
  -- oficial (a aba abriu com o texto pronto). Texto livre, não enum, pra
  -- não precisar de migration quando a API oficial trouxer status de
  -- verdade ('entregue', 'lido').
  status_envio text not null default 'aberto',
  created_at timestamptz not null default now()
);

alter table templates_mensagens enable row level security;
alter table historico_envios enable row level security;

-- Templates são só do dono — sem compartilhamento com a equipe (decisão
-- explícita: cada corretor mantém a própria lista).
create policy "corretor gerencia os proprios templates"
  on templates_mensagens for all
  to authenticated
  using (corretor_id = corretor_atual())
  with check (corretor_id = corretor_atual());

grant select, insert, update, delete on templates_mensagens to authenticated;

-- Histórico: corretor grava e lê o próprio; gestor lê de todos (auditoria),
-- mas não grava em nome de ninguém (nunca dispara).
create policy "corretor grava seu envio"
  on historico_envios for insert
  to authenticated
  with check (corretor_id = corretor_atual());

create policy "corretor le os seus, gestor le todos"
  on historico_envios for select
  to authenticated
  using (eh_gestor() or corretor_id = corretor_atual());

grant select, insert on historico_envios to authenticated;
```

`corretor_atual()` e `eh_gestor()` já existem (migration 0007) — reaproveita.

## Filtros em `/corretor/leads`

Client-side, dentro de `ListaLeads.tsx` — a lista inteira já vem carregada
via `getMeusLeads()` (RLS já filtra corretor vs. gestor), então filtrar em
memória evita ida ao banco a cada troca de filtro:

- **Corretor**: só aparece se `gestor === true`. Dropdown com
  `getEquipeAtiva()` (já existe, `{id, nome, emPausa}[]`).
- **Data de/até**: dois `<input type="date">`, compara com `lead.criadoEm`.
- **Etapa**: reaproveita `ETAPAS_FUNIL`/`ETAPA_LABEL` — é o "status" que a
  spec original pedia, sem inventar campo novo.
- **Busca texto**: `nome` ou `telefone` contém a string, case-insensitive.

Os chips de filtro que já existem (Todos/Novos/Negociando/Frios) continuam
— os filtros novos se somam a eles, não substituem (o chip é um atalho
grosso, os filtros novos são finos).

## Seleção e disparo

### `CartaoLead.tsx`

Ganha props opcionais `selecionavel`, `selecionado`, `aoAlternarSelecao` —
quando `selecionavel` é true, renderiza um checkbox no canto do card. Sem
esses props (uso no quadro do funil, que tem seu próprio `Cartao` compacto
— não é afetado), comportamento idêntico ao de hoje.

### `ListaLeads.tsx`

Estado `selecionados: Set<string>` (ids de lead). Barra fixa no rodapé
(mobile) / topo (desktop) aparece quando `selecionados.size > 0`:
"Enviar mensagem para N selecionados" + botão "Limpar seleção". Um
checkbox "selecionar todos" no topo da lista **filtrada** (não da lista
inteira) — selecionar tudo com um filtro ativo não pega quem está fora do
filtro.

### `EnviarEmMassa.tsx` (modal, client component)

Props: `leadsSelecionados: Lead[]`, `templates: TemplateMensagem[]`,
`nomeCorretor: string`, `whatsappCorretor: string`, `onFechar: () => void`.

1. Dropdown de template (pré-seleciona o marcado `padrao`, se houver).
2. Prévia: `preencherTemplate()` (novo helper, `src/lib/mensagem.ts`)
   aplicado ao primeiro lead selecionado, mostrado como texto read-only.
3. Contagem: "X contatos, aproximadamente Y min" (estimativa: `X * 10s`
   médio, só pra dar noção de duração).
4. Botão "Confirmar disparo" → estado `enviando`, barra de progresso
   "N de X".
5. Loop sequencial (`async function`, não `Promise.all` — precisa ser
   sequencial pelo delay):
   ```ts
   for (const lead of leadsSelecionados) {
     const numero = lead.telefone ? normalizarWhatsapp(lead.telefone) : null;
     if (!numero) continue; // sem telefone ou número inválido, pula, não conta erro
     const mensagem = preencherTemplate(templateEscolhido.conteudo, {
       nomeLead: lead.nome,
       nomeCorretor,
       telefoneCorretor: whatsappCorretor,
     });
     const url = linkWhatsappPara(numero, mensagem);
     window.open(url, "_blank");
     await registrarEnvio(lead.id, mensagem); // fire-and-forget na UI, mas awaited pra não estourar a Server Action
     atualizarProgresso();
     await espera(5000 + Math.random() * 10000); // 5-15s
   }
   ```
6. Ao terminar (ou se o usuário fechar o modal no meio — `AbortController`
   ou uma ref `cancelado` checada a cada iteração do loop): mensagem final
   "Enviado para N de X" e botão "Fechar".

Pop-up blocker: `window.open` dentro de um loop assíncrono com `await`
antes de cada chamada pode ser bloqueado pelo navegador depois da primeira
aba (só a primeira chamada acontece "dentro" do gesto de clique original).
Mitigação: nenhuma automática de código — aviso de texto no modal, antes de
confirmar: "Seu navegador pode pedir permissão pra abrir múltiplas
janelas — permita para o envio continuar." É uma limitação do navegador,
não do código; não dá pra contornar sem extensão ou permissão explícita do
usuário.

## Templates — `/corretor/templates`

Página nova, mesmo padrão de `/corretor/perfil`: lista os templates do
corretor logado (`getMeusTemplates()`), formulário de criar/editar
(`titulo`, `conteudo` com hint das variáveis disponíveis, checkbox
`padrao` — marcar um como padrão desmarca o anterior, resolvido na Server
Action com um único `update` antes do insert/update do novo), botão
apagar com confirmação simples (`confirm()` do navegador — é uma ação de
baixo risco, o template não está em uso por lead nenhum).

Acesso: aba nova em `NavPainel.tsx` (desktop). Não entra na
`NavMobileBottom.tsx` (5 vagas já ocupadas) — no mobile, o acesso é pelo
link "Gerenciar templates" dentro do próprio modal `EnviarEmMassa`.

## `src/lib/mensagem.ts` (novo)

```ts
export type VariaveisTemplate = {
  nomeLead: string;
  nomeCorretor: string;
  telefoneCorretor: string;
};

export function preencherTemplate(conteudo: string, vars: VariaveisTemplate): string {
  return conteudo
    .replaceAll("{{nome_lead}}", vars.nomeLead)
    .replaceAll("{{nome_corretor}}", vars.nomeCorretor)
    .replaceAll("{{telefone_corretor}}", vars.telefoneCorretor);
}
```

Teste unitário (Vitest, mesmo padrão de `src/lib/whatsapp.test.ts`):
substituição simples, variável repetida duas vezes no texto, variável
ausente do texto (não quebra), texto sem variável nenhuma.

## Server Actions novas (`src/app/corretor/actions.ts`)

```ts
export async function criarTemplate(titulo: string, conteudo: string, padrao: boolean): Promise<ResultadoAcao>
export async function editarTemplate(id: string, titulo: string, conteudo: string, padrao: boolean): Promise<ResultadoAcao>
export async function apagarTemplate(id: string): Promise<ResultadoAcao>
export async function registrarEnvio(leadId: string, mensagem: string): Promise<ResultadoAcao>
```

Todas seguem o padrão de `exigirSessao()` + checagem de linhas afetadas já
usado em `salvarPerfil`/`moverEtapa`. `criarTemplate`/`editarTemplate` com
`padrao: true`: primeiro um `update templates_mensagens set padrao = false
where corretor_id = ... and padrao = true`, depois grava o novo — dentro
da mesma function, duas queries (não precisa de transação explícita: RLS já
restringe ao próprio corretor, e uma falha no segundo passo só deixa
"nenhum padrão marcado", nunca dois).

## Testes

- Unitário: `preencherTemplate` (4 casos acima).
- Manual: criar 2 templates, marcar um padrão, confirmar que marcar o
  segundo desmarca o primeiro.
- Manual: filtrar leads por etapa + busca texto, conferir contagem.
- Manual: selecionar 2-3 leads com telefone, disparar, confirmar que abrem
  as abas em sequência com delay perceptível e que `historico_envios` grava
  uma linha por lead.
- Manual: lead sem telefone selecionado junto de outros — confirma que é
  pulado sem quebrar o loop nem contar como enviado.
