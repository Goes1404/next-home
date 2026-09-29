---
title: As plantas do editor nunca eram salvas, e a tela dizia que sim
tags: [painel, armadilha]
type: nota
status: stable
custou: baixo
codigo:
  - src/app/corretor/(painel)/imoveis/actions.ts
  - src/app/corretor/(painel)/imoveis/_componentes/EditorImovelClient.tsx
created: 2026-09-26
updated: 2026-09-26
summary: O botão Salvar do editor do imóvel gravava dados gerais e lazer e mostrava "Todas as alterações foram salvas". As plantas editadas na tela nunca chegavam ao banco. salvarTipologias (26/09) atualiza, insere, remove e devolve os ids.
---

# As plantas do editor nunca eram salvas

Achado construindo a lista de unidades (que precisa do id da planta):
`handleSalvarTudo` chamava `salvarDadosGerais` e `salvarLazerEmpreendimento`
e nada mais. A aba de plantas deixava editar nome, metragem, dormitórios e
imagem, e o aviso verde dizia que tudo estava salvo. Só a importação (PDF,
site) escrevia em `tipologias`.

- **Mensagem de sucesso tem de corresponder a CADA passo que ela afirma.**
  "Todas as alterações" com dois de três passos é o defeito calado mais caro:
  o corretor confia e segue.
- `salvarTipologias` atualiza as que têm id, insere as novas, apaga as que
  saíram da tela, e **devolve o id das novas** — sem isso, um segundo Salvar
  inseriria a mesma planta de novo.
- `unidades_disponiveis` fica fora do salvamento: na tela o número vem
  derivado da lista de unidades, e gravá-lo de volta criaria um contador
  manual que envelhece.

## Relacionadas
- [[oito-funcionalidades-de-26-09]] · [[MOC — CRM e Painel]]
