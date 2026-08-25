# Roadmap Next Home — da IA pronta ao produto aberto

> Escrito em 25/08/2026, logo após as oito fases do chatbot (F0–F7) e a
> correção da memória (`7cde0d4`). Cada horizonte tem um PORTÃO: a condição
> medível que autoriza passar ao seguinte. Sem portão, roadmap vira lista
> de desejos.

## Onde estamos (medido em produção, 25/08 03h)

| medida | valor | leitura |
|---|---|---|
| respostas reais da IA (sem fallback) | 90 | todas em teste; nenhum lead real atendido |
| mensagens do bot gravadas desde o fix | 0 | nenhuma conversa nova chegou — memória NÃO verificada ao vivo |
| rótulos humanos | 0 | a fila nova existe; ninguém rotulou ainda |
| leads | 59, sendo **9 pré-cadastrados** | os 9 são quem a IA atenderia hoje sem palavra-chave |
| leads com renda ou orçamento | 0 | o fluxo novo grava daqui em diante; o passado fica vazio |
| visitas marcadas | 2 | a métrica que importa |
| follow-ups enviados na vida | 0 | 13 criados, 13 cancelados |
| imóveis publicados | 25 | 10 no fixture do eval |
| corretores ativos | 8 | 1 com WhatsApp pareado (linha PESSOAL) |

## H0 — Fechar o ciclo (agora; portão para tudo)

O que já está construído precisa ser PROVADO antes de escalar.

- **H0.1 Verificar a memória ao vivo.** Uma conversa de teste com 3+ trocas;
  conferir no banco que as respostas do bot foram gravadas e que a resposta
  seguinte referencia o que já foi dito. *(Só um WhatsApp real prova; nenhum
  teste local substitui.)*
- **H0.2 Linha de base oficial dos DOIS evals.** `npm run eval` (36 casos,
  juiz com cota cheia) + `npm run eval:conversa` (6 personas × 12 turnos,
  fixture real de 10 imóveis). Duas rodadas de cada — uma só não separa
  regressão de variância (medido: 2, 4 e 1 falhas duras em rodadas iguais).
- **H0.3 Primeiros rótulos.** Ler as transcrições de `eval/resultados/
  transcricoes/` e rotular a fila de revisão. Meta mínima: 20 rótulos.
  Zero rótulos desde a 0040 é o maior buraco do ciclo de melhoria.
- **H0.4 Decisão de privacidade (LGPD).** O número é pessoal: toda mensagem
  que chega é gravada, liberada ou não. Decidir entre (a) não persistir
  conteúdo de conversa nunca liberada, (b) retenção curta com purga, ou
  (c) linha de trabalho dedicada por corretor. **Bloqueia a abertura** — 
  abrir para leads com esse passivo é assumir o risco por escrito.

**Portão H0→H1:** memória confirmada + linha de base registrada + decisão
de privacidade tomada.

## H1 — Piloto com leads reais (1–2 semanas)

- **H1.1 Piloto controlado.** Cadastrar 5–10 leads reais no CRM (a regra da
  F3 liga a IA para eles automaticamente). Acompanhar cada conversa na fila
  de revisão no mesmo dia.
- **H1.2 Follow-ups saindo de verdade.** Zero enviados na vida. Conferir o
  pg_cron (`followups-whatsapp` roda a cada 5 min), o cancelamento por
  resposta e o texto de retomada com o novo turno compartilhado.
- **H1.3 Rótulo diário vira rotina.** A fila ordenada por sinais do mundo
  existe; a meta é o corretor gastar 10 min/dia nela. Se não acontecer em
  uma semana, o problema é de produto, não de disciplina — voltar ao desenho.
- **H1.4 v18 do prompt guiada por dado real.** Só depois de 1 semana de
  conversas reais: os defeitos que aparecerem mandam, não a intuição.

**Portão H1→H2:** 10+ conversas reais atendidas, ≥1 visita marcada pela IA,
zero incidente de voz/contexto, 50+ rótulos acumulados.

## H2 — Escalar o atendimento (semanas 3–4)

- **H2.1 Campanhas religadas.** A fila, a cota anti-ban e a corrente já
  existem; religar com a IA respondendo quem responde (conversa de campanha
  já nasce liberada). Começar com lista pequena e cota conservadora.
- **H2.2 Áudio medido.** 104 áudios recebidos e nenhuma medida de qualidade.
  Amostrar 20 transcrições contra o áudio original; decidir se o Gemini
  basta ou se o Whisper precisa subir de posição.
- **H2.3 Golden dataset com rótulos reais.** `exportarGolden` passa a ter
  matéria-prima; o eval começa a medir o critério do corretor.
- **H2.4 Dossiê alimentando o funil.** Renda/orçamento agora fluem para
  `leads`; conferir que a ficha do CRM os mostra e que `montarResumo` os usa
  na distribuição de leads.

**Portão H2→H3:** campanha completa despachada sem bloqueio anti-ban,
conversão lead→visita medida por 2 semanas seguidas.

## H3 — Produto multi-corretor (mês 2)

- **H3.1 Segundo corretor no ar.** Onboarding completo: parear número,
  configurar tom, testar no playground, abrir. O que travar aqui é o custo
  real de escala — documentar cada atrito.
- **H3.2 Painel do gestor com o funil da IA.** Taxa de resposta, tempo até
  primeira resposta, visitas por corretor — os agregados magros da F5 do
  Painel de Bolso servem de modelo.
- **H3.3 E2E autenticado do painel.** Continua sem existir (registrado na
  memória do projeto). Sessão de corretor + fluxos críticos: lead → conversa
  → revisão → visita.
- **H3.4 Ingestão de material fechando o ciclo.** PDF/Drive → curadoria →
  `midias`/`tipologias` → catálogo que a IA lê. As pontas existem; falta o
  caminho virar rotina de cadastro.

## H4 — Diferenciais (mês 3+, reavaliar antes)

Visão nas imagens recebidas (cliente manda print de anúncio → IA reconhece
o imóvel) · agenda real de visitas (slot do corretor, confirmação, lembrete)
· integração com portais · relatório semanal automático para o gestor.
Nenhum destes entra antes de H1–H2 provarem o núcleo.

## Métricas-norte (medir toda semana, a partir de H1)

1. **Leads atendidos pela IA / leads que escreveram** — a taxa de cobertura.
2. **Visitas marcadas pela IA / semana** — a métrica de negócio.
3. **Tempo até a primeira resposta** — meta < 5s (motor único ~2,6s).
4. **Rótulos colhidos / semana** — o combustível do ciclo; se zerar, o
   ciclo de melhoria parou, mesmo que tudo pareça bem.
5. **Conversas com >1 modelo** — deve ser sempre 0; se subir, a cascata de
   reserva entrou e o motor está doente.
