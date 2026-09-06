# Vault Obsidian do next-home

Base de conhecimento do projeto em formato Obsidian. **Abra esta pasta
(`vault/`) como vault no Obsidian** (Open folder as vault).

## Estrutura

```
Home.md            ← ponto de entrada (fixe na sidebar)
00-inbox/          ← capturas não triadas
10-notas/          ← notas atômicas (1 fato por nota)
20-mocs/           ← mapas de conteúdo + Painel do Vault (Dataview)
30-arquitetura/    ← visão geral e fluxos do sistema
bases/Notas.base   ← tabelas nativas (Obsidian 1.9+, sem plugin)
templates/         ← nota, decisão, runbook
99-arquivo/        ← notas obsoletas (não apagar — arquivar)
```

## Convenções

- Frontmatter obrigatório: `title`, `tags`, `type`, `status`, `created`,
  `updated`, `summary`. Ver `10-notas/vocabulario-de-tags.md`.
- `custou: alto|medio|baixo` — quanto tempo o fato custou para descobrir.
- Tags são vocabulário FECHADO (domínio + natureza).
- Nota nova sempre linkada de pelo menos um MOC.
- **Renomear/mover só dentro do Obsidian** (atualiza os wikilinks). Editar
  conteúdo por fora é ok.
- A fonte histórica é `docs/MEMORIA.md`; descoberta nova entra AQUI como nota
  atômica e, se for da régua ("10+ minutos poupados"), também lá.

## Plugins

- **Bases** é nativo (Obsidian ≥ 1.9) — `bases/Notas.base` funciona de cara.
- **Dataview** (opcional) habilita o `20-mocs/Painel do Vault.md`.
