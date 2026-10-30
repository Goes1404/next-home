---
title: Revisão geral de 30/10 — defeitos achados e decisões
tags: [crm, whatsapp, admin, armadilha, decisao]
type: licao
status: growing
custou: alto
codigo:
  - src/lib/painel/swDoPainel.ts
  - public/sw-painel.js
  - src/lib/whatsapp/transcricaoNoGrupo.ts
  - src/lib/crm/notaDoLeadServidor.ts
  - src/lib/cobranca/asaas.ts
  - src/lib/cobranca/webhookDoAsaas.ts
  - src/app/corretor/(painel)/perfil/SeletorArquivo.tsx
  - supabase/migrations/0251_trava_da_roleta_por_grupo.sql
created: 2026-10-30
updated: 2026-10-30
summary: Revisão de tudo que entrou em 29–30/10 achou 36 defeitos (painel, WhatsApp/IA, acesso/cobrança), todos corrigidos; 0251 aplicada (trava da roleta por grupo). Lições: escopo do SW, limite de 4,5 MB da Vercel, max_rows 1000 do PostgREST, áudio na rajada.
---

# Revisão geral de 30/10/2026

## Armadilhas que custaram caro
- **Service worker com escopo `/corretor/` não controla `/corretor`** (start_url do app). Offline nunca sincronizava e a limpeza ao sair ia para um `controller` nulo — dados offline do usuário anterior sobravam num celular compartilhado. Agora o registro novo é `/corretor`, o antigo `/corretor/` fica (desregistrar derrubaria o push), e a limpeza vai para o `.active` de todo registro do painel (`swDoPainel.ts`). `navigator.serviceWorker.ready` nunca resolvia em `/corretor`.
- **Corpo de função da Vercel: 4,5 MB.** Server Action com foto de celular é recusada antes do servidor e derruba a página. `SeletorArquivo` reduz a imagem no navegador (`lib/imagem/reduzir.ts`) e barra acima de 4 MB.
- **PostgREST `max_rows = 1000`:** `.limit(40 * n)` vira 1000 calado; a nota do lead marcava ativos como "frio — sumiu". Ler por lead.
- **Áudio na rajada:** com o áudio gravado antes da transcrição (`AUDIO_TRANSCREVENDO`), o texto que chega depois esperava o marcador sumir; o marcador sai do histórico da IA; reentrega de marcador velho (>40 s) retranscreve.
- **Trava da roleta era global** (`hashtext('roleta_leads')`); 0251 trava por grupo em `distribuir_lead` E `devolver_leads_da_imobiliaria` (as duas precisam da MESMA chave). A 0251 também consertou o texto com acentuação quebrada que a 0216 tinha gravado em produção.

## Decisões
- Asaas: cancelar conta ou ir para plano "custo" cancela a assinatura ANTES de mudar o grupo; falhou, nada muda. Mudar mensalidade/dia com assinatura ativa é recusado ("desligue, salve, religue") — o PUT do Asaas não tem `value`. Estorno/chargeback apaga o pagamento; crédito de indicação não aplicado é apagado, aplicado ganha "Revisar:".
- ADM sem ficha recupera senha pelo e-mail (fallback em `administradores_da_plataforma`).
- Consultor (IA de imóveis e crédito) só existe para o ramo imobiliário.
- Relatório semanal só para grupos ativos com gestor que ligou; avisos das 9h rodam no primeiro tique entre 9h e 21h, uma vez por dia (`travar_disparo`).
- Pendente (decisão do dono): no teste grátis com Asaas, a assinatura nasce no dia do fim do teste e não no `dia_do_vencimento`.

Ver [[multi-ramo-portais-gestor-e-negocio-da-astro]], [[ia-no-atendimento-audio-resumo-e-nota]].

## Navegação mais rápida (30/10, tarde)
- `staleTimes.dynamic = 30` (voltar a uma seção em 30 s é instantâneo; actions com revalidate limpam).
- Faixas do layout em Suspense; contadores do menu atrasados 1,2 s; onda da Astro 240 ms.
- 0252 com índices propostos; conferir chave assimétrica de JWT no Supabase (senão `getClaims` vira `getUser`).
