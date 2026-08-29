# Número restrito pelo WhatsApp — o que fazer

> Escrito em 28/08/2026, depois de dois números restringidos em teste. O
> defeito que causou isso está corrigido (ver `docs/MEMORIA.md`, seção "O
> espaçamento anti-ban não valia no envio"), mas restrição já aplicada não
> se desfaz com deploy. Este documento é o procedimento para o caso de
> acontecer de novo.

## O que aconteceu

O intervalo de 35-75s entre disparos existia só em `agendado_para`,
calculado na criação da campanha. O disparador respeitava esse horário pela
metade: item no futuro, ele esperava; item **vencido**, mandava na hora — e
o seguinte, e o seguinte. Bastava a fila atrasar para tudo sair junto.

Medido na campanha `e59c871a` (27/08): **15 mensagens agendadas ao longo de
14 minutos saíram em 57 segundos**, com 2 a 5 segundos entre elas.

Hoje a trava é de tempo real e vive no banco
(`proximo_envio_permitido_em`), carimbada no mesmo UPDATE atômico que
consome a cota. Não importa quem chame nem o quanto a fila esteja atrasada.

## Agora (enquanto o número está restrito)

1. **Não force reconexão enquanto o disjuntor estiver fechado.** É a regra
   que mais importa: restrição temporária do WhatsApp costuma durar de
   horas a dias, e o que a transforma em permanente é insistir durante ela
   — reconectar, disparar, tomar bloqueio, repetir.
   O sistema já protege isso sozinho (`bloqueado_ate`, 12h,
   `FALHAS_PARA_ABRIR_DISJUNTOR = 3`). Conferir quando abre:

   ```sql
   select instance_name, status_conexao,
          bloqueado_ate at time zone 'America/Sao_Paulo' as libera_em_brt,
          falhas_seguidas
     from corretor_whatsapp_instancias;
   ```

2. **Não crie campanha nova para "testar se voltou".** A fila pendente já
   retoma sozinha quando o número reconectar e a janela (9h-20h59) abrir.
   Campanha nova só aumenta o volume no pior momento.

3. **Limpe os telefones inválidos antes da próxima lista.** Disparo para
   número que não existe no WhatsApp é, por si só, sinal de lista comprada
   — pesa contra mesmo com espaçamento perfeito. Em 28/08 eram **8**:

   ```sql
   select l.nome, l.telefone, f.erro_motivo
     from whatsapp_campanhas_fila f
     join leads l on l.id = f.lead_id
    where f.erro_motivo = 'Número não está no WhatsApp';
   ```

   Atenção ao diagnosticar: essa mensagem **não é prova de telefone errado**.
   Já houve um defeito nosso (envio sem DDI) que produzia exatamente ela —
   ver `docs/MEMORIA.md`. Confira o que foi de fato enviado antes de culpar
   o cadastro.

## Quando o número voltar

4. **Reconecte e não dispare nada no primeiro dia.** Deixe o número receber
   e responder conversa normal. A curva de aquecimento
   (`limiteDiarioCampanha`) já começa baixa — 15 disparos/dia nos 3
   primeiros dias, subindo até 150 depois de 30 — e ela conta a partir de
   `conectado_em`.

5. **Se trocar o chip/número, a reputação zera de propósito**
   (`trocaDeNumero.ts`): contador do dia, `bloqueado_ate`, `falhas_seguidas`
   e a curva de aquecimento voltam ao zero. Número novo herdando maturidade
   do anterior é o caminho curto para o banimento. Reconectar o **mesmo**
   número não zera nada.

## Como verificar que o espaçamento está valendo

O que importa **não é** `agendado_para` — ele sempre pareceu correto, e foi
justamente isso que escondeu o defeito. O que importa é o intervalo real
entre `enviado_em`:

```sql
select to_char(enviado_em at time zone 'America/Sao_Paulo','DD/MM HH24:MI:SS') as enviado,
       extract(epoch from enviado_em - lag(enviado_em) over (order by enviado_em)) as gap_s
  from whatsapp_campanhas_fila
 where status in ('enviado','respondido')
 order by enviado_em desc
 limit 20;
```

**Nenhum `gap_s` pode ficar abaixo de 35.** Se algum ficar, existe um
caminho de envio que não passa pela trava — é defeito, não variação.

Medida resumida, para acompanhar ao longo do tempo:

```sql
select count(*) as msgs,
       count(*) filter (where gap < 30) as abaixo_de_30s,
       round(min(gap)) as menor
  from (
    select extract(epoch from enviado_em - lag(enviado_em) over (partition by campanha_id order by enviado_em)) as gap
      from whatsapp_campanhas_fila where enviado_em is not null
  ) t where gap is not null;
```

### A linha de base (tudo o que saiu ANTES da correção)

Medido em 28/08/2026, sobre o histórico inteiro de disparos:

| medida | valor |
|---|---|
| intervalos medidos | 80 |
| **abaixo de 30s** | **50** |
| menor intervalo | 2s |

Ou seja: **62% de todos os disparos da vida do sistema saíram em rajada.**
É contra este número que se compara. Rodando a consulta acima depois da
próxima campanha, `abaixo_de_30s` só pode crescer se a trava furou — os 50
antigos ficam no histórico para sempre, então o jeito de olhar é filtrar por
`enviado_em > '2026-08-29'`.

## As quatro proteções, e o que cada uma defende

Confundi-las é o risco ao mexer aqui — elas **não** são redundantes:

| proteção | defende | onde |
|---|---|---|
| Espaçamento 35-75s | o número (rajada) | `proximo_envio_permitido_em`, banco |
| Cota diária / aquecimento | o número (volume) | `limiteDiarioCampanha` |
| Disjuntor 12h | o número (insistir sob restrição) | `bloqueado_ate` |
| Janela 9h-20h59 | a **reputação** junto a quem recebe | `dentroDaJanela` |

A janela é a única que protege outra coisa: mensagem de propaganda às 3h é
o que faz o destinatário denunciar, e denúncia é o sinal mais forte que
existe. Por isso o botão "enviar a qualquer hora" (0058) afrouxa **só** a
janela, e há teste para cada uma das outras três continuar barrando.

## Ao criar caminho novo que fala com o cliente

Todo envio por **iniciativa nossa** (campanha, follow-up, o que vier) tem
de passar por `reservarCotaCampanha`. É o único ponto onde as travas de
cota e espaçamento são aplicadas — hoje campanha e follow-up passam por
ali, e foi isso que fez a correção de 28/08 cobrir os dois de graça.

Resposta a quem nos escreveu é outra classe de risco (conversa iniciada
pelo cliente) e continua isenta de propósito: deixar no vácuo seria pior,
inclusive para o número.
