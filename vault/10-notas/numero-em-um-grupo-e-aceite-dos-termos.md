---
title: Um número de WhatsApp fica num grupo só, e o painel pede o aceite dos termos no primeiro acesso
tags: [whatsapp, banco, painel, lgpd, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0198_regras_de_operacao.sql, src/lib/whatsapp/numeroDeUmGrupo.ts, src/lib/whatsapp/repositorio.ts, src/lib/whatsapp/recusaPendente.ts, src/app/api/webhooks/whatsapp/route.ts, src/app/corretor/(painel)/whatsapp/acoes.ts, src/app/corretor/senha/page.tsx, src/lib/termos/termos.ts, src/lib/termos/aceite.ts, src/app/corretor/termos/page.tsx, src/app/corretor/(painel)/layout.tsx]
created: 2026-10-20
updated: 2026-10-20
summary: Fase 2D enxuta. Gatilho recusa número já ligado a instância de outro grupo (o mesmo grupo reconecta à vontade; instância caída com 401 solta o número); o painel recusa antes com frase clara; sessão recusada que não caiu é ignorada pelo webhook e derrubada de novo pelo cron. Termos de uso (rascunho para o advogado) aceitos no primeiro acesso, por versão, em aceites_de_termos.
---

# Número em um grupo só e aceite dos termos (0198)

Escopo enxuto da fase 2D decidido com o dono em 20/10/2026. Plano:
`docs/superpowers/plans/2026-10-20-fase-2d-regras-de-operacao.md`.

## Um número, um grupo

- **A trava é por GRUPO, e por isso é gatilho, não índice.** Um índice
  único em `telefone_conectado` proibiria também o mesmo número em duas
  instâncias do MESMO grupo. Como `telefone_conectado` só é apagado no
  "Desconectar" (a sessão que cai mantém o número), o corretor que sai sem
  desconectar travaria o número para o colega da mesma imobiliária.
- **"Ocupado" = `telefone_conectado` preenchido**, conectado ou com a sessão
  caída, menos quando a instância caiu com o código **401** (o aparelho foi
  removido da conta no celular): a sessão só volta com um pareamento novo,
  e o número fica livre (`instancia_prende_o_numero`). Liberar é o
  "Desconectar" do grupo antigo (corretor ou gestor) ou, para o dono do
  celular, Aparelhos conectados → desconectar. A frase da recusa diz as
  duas saídas.
- **Corretor desativado NÃO solta o número**, de propósito: a sessão dele
  pode continuar viva na Evolution, e dois grupos receberiam as mesmas
  mensagens.
- **O número é comparado sem o nono dígito** (`chave_do_numero_whatsapp`:
  55 + DDD + 8 últimos). O WhatsApp devolve o número sem o 9 em vários DDDs,
  e o corretor digita com o 9 no pareamento por código. Espelho em
  `chaveDoNumero`, com teste que lê a migration.
- **Três caminhos conectam um número, e os três perguntam antes**:
  pareamento por código (o número vem digitado, recusa antes de falar com a
  Evolution), sincronização ativa e `connection.update` do webhook (o número
  só aparece quando abre). Nos dois últimos, número de outro grupo derruba a
  sessão na Evolution e solta a instância (`recusarNumeroDeOutroGrupo`).
- **Sem a pergunta antes, o gatilho sozinho deixaria pior**: ele recusa a
  gravação, e a instância ficaria conectada na Evolution mas "conectando"
  no banco — o número de outra conta recebendo mensagem aqui. Por isso a
  recusa do gatilho (`ehRecusaDeNumero`) também cai em
  `recusarNumeroDeOutroGrupo`.
- **A recusa apaga `conectado_em`**: sem ele o logout não vira "queda" (o
  evento de conexão para cedo em número que nunca conectou). E carimba
  `numero_recusado_em`, para a tela explicar mesmo quando quem recusou foi o
  webhook; a próxima conexão aceita apaga a marca.
- A frase não diz de quem é o número. A função de pergunta
  (`numero_whatsapp_em_outro_grupo`) só responde sim/não e só a chave de
  serviço executa.

## Aceite dos termos

- `aceites_de_termos (corretor, versão, quando)`: grupo pelo carimbo da
  0191, policy restritiva, `revoke all` de anon e authenticated, `insert
  (corretor_id, versao)` só do próprio. Sem update nem delete: aceite não se
  desfaz. Gestor lê os da equipe.
- **A versão mora no código** (`VERSAO_DOS_TERMOS`). Mudou o texto, muda a
  versão, e todo mundo aceita de novo no próximo acesso.
- **A página fica FORA do `(painel)`** (`/corretor/termos`): dentro dele o
  próprio layout a redirecionaria para si mesma. Entrar, "esqueci a senha" e
  criar senha (convite) também já moram fora. "Sair" está na própria página.
- **A troca de senha mora FORA do `(painel)`** (`src/app/corretor/senha`,
  URL igual): trocar a senha provisória é segurança e não espera o aceite.
  Ela não tem o menu do painel; o "Voltar ao painel" passa pelo layout, que
  confere o aceite. Exceção pelo `pathname` no layout não serviria: layout
  não re-executa entre rotas irmãs, e da tela isenta o corretor navegaria
  pelo menu sem nunca passar pelos termos.
- **Depois de aceitar**, quem ainda tem senha provisória vai para
  `/corretor/senha`, para não esquecer.
- **Erro ao ler o aceite NÃO tranca o painel**: a migration pode chegar
  depois do deploy. Conectar o WhatsApp também exige o aceite (o risco do
  número é do corretor, L44).
- O texto é **RASCUNHO para o advogado**, escrito para não prometer o que o
  produto não faz (nada de "seu número nunca será bloqueado"). Há teste que
  barra promessas desse tipo.

## A sessão recusada que não cai (revisão da fase 2D)

- **O logout da recusa pode falhar** (Evolution fora, tempo esgotado). O
  banco dizia "desconectado" e a sessão seguia aberta: o webhook resolve a
  instância pelo nome e gravava as mensagens dos clientes da outra conta
  neste grupo, e a IA daqui podia responder por um número que não é dela.
- **Hoje são três camadas**: a recusa grava `logout_pendente_em` quando o
  logout falha; a varredura do cron de disparo (`rederrubarNumerosRecusados`)
  tenta de novo a cada tique; e o webhook só deixa a mensagem seguir
  (`mensagemDoNumeroPodeSeguir`) depois de conferir o número, quando há
  recusa em aberto ou o número está "conectando" (as mensagens paradas
  chegam junto com a abertura, antes de alguém conferir).
- **A varredura nunca derruba o número certo**: com a sessão aberta e o
  número informado, quem decide é a sincronização, que aceita o número que
  não é de outra conta e apaga a pendência. A pendência também é apagada
  por toda conexão aceita e conferida.
- **"Já conectado" no botão Conectar passa pela sincronização**, que confere
  o número; antes gravava conectado direto e liberava campanha e rodízio
  pelo número de outra conta.
- **Só conexão conferida apaga a recusa.** Evento "open" sem `wuid`/`owner`
  pergunta o número ao provedor; erro ao gravar a conexão (que não seja a
  recusa do gatilho) não diz "conectado".
- **A 0198 para se já houver o mesmo número em dois grupos**
  (`numero_em_dois_grupos`): o conflito precisa de decisão humana, senão a
  primeira reconexão derrubaria um dos lados sem ninguém ter visto.
- **Diagnóstico**: `select instance_name, status_conexao, numero_recusado_em,
  logout_pendente_em from corretor_whatsapp_instancias where
  numero_recusado_em is not null`. Pendência que não some é o provedor fora
  do ar; o log `[whatsapp] o número recusado continua no ar` diz por quê.
