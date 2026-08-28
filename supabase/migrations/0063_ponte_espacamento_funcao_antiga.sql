-- 0063 — A função ANTIGA também passa a respeitar o intervalo
--
-- A 0062 criou `consumir_cota_campanha_espacada` e o código novo a usa. Mas
-- entre aplicar a migration e o deploy sair existe uma janela em que a
-- produção continua chamando `consumir_cota_campanha` — a versão sem trava
-- de tempo — e portanto continua podendo mandar a fila inteira em rajada.
--
-- Essa janela não é aceitável aqui: o número do corretor já foi restrito
-- duas vezes, e a fila pendente volta a vencer assim que a janela comercial
-- abrir. Proteger o banco é o que vale para TODOS os chamadores, incluindo o
-- código que já está no ar.
--
-- A função antiga devolve um inteiro e não tem como dizer "espere 40s". Ela
-- responde -1, que o código antigo lê como "cota atingida" e usa para
-- encerrar o laço. A frase que aparece no painel fica imprecisa por algumas
-- horas; o comportamento fica correto — o disparo para em vez de continuar,
-- e o tique seguinte do pg_cron (1x/min) retoma. Entre uma mensagem por
-- minuto com rótulo errado e quinze em um minuto com rótulo certo, não há
-- dúvida.
--
-- Depois do deploy esta função deixa de ser chamada. Mantê-la endurecida é
-- de graça e remove a única forma de alguém reintroduzir o defeito
-- chamando a versão antiga sem perceber.

create or replace function public.consumir_cota_campanha(
  p_instancia_id uuid,
  p_limite integer
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_total integer;
  v_intervalo integer;
begin
  v_intervalo := 35 + floor(random() * 41)::integer;  -- 35..75

  update public.corretor_whatsapp_instancias
     set envios_campanha_contador =
           case when envios_campanha_data = current_date
                then envios_campanha_contador + 1
                else 1 end,
         envios_campanha_data = current_date,
         proximo_envio_permitido_em = now() + make_interval(secs => v_intervalo),
         updated_at = now()
   where id = p_instancia_id
     and (bloqueado_ate is null or bloqueado_ate <= now())
     and (
       envios_campanha_data is distinct from current_date
       or envios_campanha_contador < p_limite
     )
     -- O mesmo piso da 0062. Sem ele, esta função é a porta dos fundos.
     and (proximo_envio_permitido_em is null or proximo_envio_permitido_em <= now())
  returning envios_campanha_contador into v_total;

  if v_total is null then
    return -1;
  end if;

  return v_total;
end;
$$;
