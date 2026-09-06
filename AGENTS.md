<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Vault Obsidian (`vault/`) — atualização OBRIGATÓRIA

O conhecimento do projeto vive em dois lugares que andam juntos:
`docs/MEMORIA.md` (narrativa) e `vault/` (Obsidian, notas atômicas —
entrada por `vault/Home.md`).

**Toda tarefa que gere descoberta, decisão, migration, mudança de
arquitetura ou correção de defeito termina atualizando o vault.** Não é
opcional: vault desatualizado aponta diagnóstico para o lugar errado, que é
o defeito recorrente nº 5 deste projeto.

Checklist ao encerrar a tarefa:

1. Criar/atualizar a nota atômica em `vault/10-notas/` — frontmatter
   completo (`title`, `tags` do vocabulário fechado em
   `vault/10-notas/vocabulario-de-tags.md`, `type`, `status`, `custou`,
   `codigo`, `summary`) e `updated` com a data de hoje.
2. Linkar a nota de pelo menos um MOC em `vault/20-mocs/`.
3. Mexeu no fluxo do webhook ou de campanhas? Atualizar também
   `vault/30-arquitetura/`.
4. A régua é a da MEMORIA.md: "teria me poupado 10+ minutos se eu já
   soubesse" → entra no vault E na `docs/MEMORIA.md`.
5. Renomear/mover nota só dentro do Obsidian (preserva wikilinks); criar e
   editar conteúdo por qualquer ferramenta é ok.
