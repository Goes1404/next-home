---
title: Um número de WhatsApp fica num grupo só, e o painel pede o aceite dos termos no primeiro acesso
tags: [whatsapp, banco, painel, lgpd, decisao]
type: nota
status: seedling
custou: medio
codigo: [supabase/migrations/0198_regras_de_operacao.sql, src/lib/whatsapp/numeroDeUmGrupo.ts, src/lib/whatsapp/repositorio.ts, src/app/corretor/(painel)/whatsapp/acoes.ts, src/lib/termos/termos.ts, src/lib/termos/aceite.ts, src/app/corretor/termos/page.tsx, src/app/corretor/(painel)/layout.tsx]
created: 2026-10-20
updated: 2026-10-20
summary: Fase 2D enxuta. Gatilho recusa número já ligado a instância de outro grupo (o mesmo grupo reconecta à vontade); o painel recusa antes com frase clara. Termos de uso (rascunho para o advogado) aceitos no primeiro acesso, por versão, em aceites_de_termos.
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
  caída. Liberar é o "Desconectar" do grupo antigo (corretor ou gestor).
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
- **Depois de aceitar**, quem ainda tem senha provisória vai para
  `/corretor/senha` (que está dentro do painel e passaria pelos termos
  antes): a ordem fica termos → senha, sem loop.
- **Erro ao ler o aceite NÃO tranca o painel**: a migration pode chegar
  depois do deploy. Conectar o WhatsApp também exige o aceite (o risco do
  número é do corretor, L44).
- O texto é **RASCUNHO para o advogado**, escrito para não prometer o que o
  produto não faz (nada de "seu número nunca será bloqueado"). Há teste que
  barra promessas desse tipo.
