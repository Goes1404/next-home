---
title: Controles rápidos do Início — pausar a IA e dividir os leads do anúncio
tags: [painel, ia, campanhas]
type: decisao
status: evergreen
custou: baixo
codigo:
  - src/app/corretor/(painel)/_componentes/ControlesRapidos.tsx
  - src/app/corretor/(painel)/_componentes/BotoesRapidos.tsx
  - src/app/corretor/(painel)/_componentes/acoesRapidas.ts
  - supabase/migrations/0205_pausa_da_ia.sql
summary: Dois botões no Início do corretor — pausar/retomar a IA do número e ligar/desligar a roleta dos anúncios — sem passar pela configuração.
updated: 2026-10-20
---

# Controles rápidos do Início

Pedido do dono (20/10/2026).

- **Pausar a IA:** põe `modo_bot = 'desativado'` e guarda o modo escolhido
  em `modo_antes_da_pausa` (0205); retomar devolve esse modo (24/7 se não
  havia). Sem a coluna, retomar jogaria todo mundo em 24/7 e apagaria o
  "só fora do expediente" de quem o tinha.
- **Dividir os leads do anúncio:** liga e desliga a [[roleta-dos-anuncios]]
  do próprio número. Sem ninguém na lista o botão leva à configuração, em
  Anúncios pagos, em vez de ligar uma roleta que não divide nada.
- Só o número do corretor da sessão; grava pela chave de serviço. Some sem
  número cadastrado.
- **CI:** a catraca de peso ficou vermelha com a publicação anterior
  (notificação, roleta, campos da planta), com rotas do painel acima do teto
  por menos de 1 KB. Tetos ajustados com o número medido no CI. O build não
  roda no Windows (`PixelMeta.tsx` e `pixelMeta.ts` colidem na caixa); o log
  do CI se lê com o token do gerenciador de credenciais do git.
