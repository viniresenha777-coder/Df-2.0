CREATE OR REPLACE FUNCTION public.fm_conferir_save()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  antes jsonb;
  depois jsonb := new.progresso;
  horas numeric;
  motivos text[] := '{}';
  banco0 numeric; banco1 numeric; mochila0 numeric; mochila1 numeric;
  cred0 numeric; cred1 numeric; vip0 numeric; vip1 numeric; nivel0 numeric; nivel1 numeric;
  loja0 numeric; loja1 numeric; agora_ms numeric := extract(epoch from now()) * 1000;
  presente_dinheiro numeric := 0; presente_vip_meses numeric := 0;
  cred_extra numeric := 0; cred_presente numeric := 0;
  permitido numeric; ganho numeric; corte numeric;
  mes_ms constant numeric := 31::numeric * 24 * 3600 * 1000;
begin
  new.atualizado_em := now();
  if public.fm_e_admin() then return new; end if;

  if tg_op = 'INSERT' then
    if coalesce((depois->>'gm')::boolean, false) then
      depois := jsonb_set(depois, '{gm}', 'false'); motivos := motivos || text 'gm ligado na criação';
    end if;
    if fm_num(depois, 'credits') > 0 then
      depois := jsonb_set(depois, '{credits}', '0'); motivos := motivos || text 'créditos na criação';
    end if;
    if fm_num(depois, 'vipUntil') > agora_ms then
      depois := jsonb_set(depois, '{vipUntil}', '0'); motivos := motivos || text 'VIP na criação';
    end if;
    if fm_num(depois, 'shopFreeUntil') > agora_ms then
      depois := jsonb_set(depois, '{shopFreeUntil}', '0'); motivos := motivos || text 'loja grátis na criação';
    end if;
    if array_length(motivos, 1) > 0 then
      insert into fm_suspeitas (jogador, motivo, antes, depois) values (new.jogador, array_to_string(motivos, '; '), null, new.progresso);
    end if;
    new.progresso := depois;
    return new;
  end if;

  antes := old.progresso;
  horas := least(greatest(extract(epoch from (now() - coalesce(old.atualizado_em, now() - interval '5 minutes'))) / 3600, 0), 2);

  select coalesce(sum(quantidade) filter (where tipo = 'dinheiro'), 0),
         coalesce(sum(quantidade) filter (where tipo = 'vip'), 0),
         coalesce(sum(quantidade) filter (where tipo = 'creditos'), 0)
    into presente_dinheiro, presente_vip_meses, cred_presente
    from fm_presentes
   where destinatario = new.jogador
     and ((recebido_em is not null and recebido_em >= coalesce(old.atualizado_em, now()) - interval '10 minutes')
       -- presente entregue neste save (o jogo confirma o recebimento só depois de salvar)
       or (recebido_em is null and jsonb_typeof(new.progresso->'receivedGifts') = 'array'
           and (new.progresso->'receivedGifts') ? id::text
           and not coalesce((old.progresso->'receivedGifts') ? id::text, false)));

  -- créditos comprados (Mercado Pago) e recompensas de bug resgatados recentemente
  select coalesce(sum(creditos), 0) into cred_extra from fm_compras
   where jogador = new.jogador and resgatado_em >= coalesce(old.atualizado_em, now()) - interval '10 minutes';
  cred_extra := cred_extra + coalesce((select sum(recompensa) from fm_bugs
   where jogador = new.jogador and resgatado_em >= coalesce(old.atualizado_em, now()) - interval '10 minutes'), 0);

  cred_extra := cred_extra + cred_presente;
  banco0 := fm_num(antes, 'bank');            banco1 := fm_num(depois, 'bank');
  mochila0 := fm_num(antes, 'run', 'g', 'money'); mochila1 := fm_num(depois, 'run', 'g', 'money');
  cred0 := fm_num(antes, 'credits');          cred1 := fm_num(depois, 'credits');
  vip0 := fm_num(antes, 'vipUntil');          vip1 := fm_num(depois, 'vipUntil');
  nivel0 := fm_num(antes, 'char', 'level');   nivel1 := fm_num(depois, 'char', 'level');
  loja0 := fm_num(antes, 'shopFreeUntil');    loja1 := fm_num(depois, 'shopFreeUntil');

  if coalesce((depois->>'gm')::boolean, false) and not coalesce((antes->>'gm')::boolean, false) then
    depois := jsonb_set(depois, '{gm}', 'false'); motivos := motivos || text 'tentou ligar VIP legado';
  end if;

  if cred1 > cred0 then
    permitido := cred0 + cred_extra + coalesce((select sum(delta) from fm_market.creditos_mov
        where jogador = new.jogador and delta > 0 and criado_em = now()), 0);
    if cred1 > permitido then
      depois := jsonb_set(depois, '{credits}', to_jsonb(permitido));
      motivos := motivos || format('créditos %s -> %s (máximo %s)', cred0, cred1, permitido);
      cred1 := permitido;
    end if;
  end if;

  if vip1 > greatest(vip0, agora_ms) then
    permitido := greatest(vip0, agora_ms)
               + (floor(greatest(cred0 - cred1, 0) / 200) + presente_vip_meses) * mes_ms
               + 24::numeric * 3600 * 1000;
    if vip1 > permitido then
      depois := jsonb_set(depois, '{vipUntil}', to_jsonb(greatest(vip0, 0)));
      motivos := motivos || text 'VIP sem pagamento';
    end if;
  end if;

  -- loja grátis: cada Token da Loja gasto dá no máximo 24 h (mais 10 min de folga)
  if loja1 > greatest(loja0, agora_ms) then
    permitido := greatest(loja0, agora_ms)
               + greatest(fm_tokens_loja(antes) - fm_tokens_loja(depois), 0) * 24::numeric * 3600 * 1000
               + 600000;
    if loja1 > permitido then
      depois := jsonb_set(depois, '{shopFreeUntil}', to_jsonb(greatest(loja0, 0)));
      motivos := motivos || text 'loja grátis sem token';
    end if;
  end if;

  ganho := (banco1 + mochila1) - (banco0 + mochila0);
  if auth.uid() is distinct from new.jogador then ganho := 0; end if;
  if ganho > 0 then
    insert into public.fm_ganhos(jogador, dinheiro) values (new.jogador, ganho);
  end if;

  if nivel1 > nivel0 and nivel1 <= least(200, nivel0 + 3) then
    ganho := (select coalesce(sum(public.fm_xp_nivel(l)), 0) from generate_series(nivel0::int, nivel1::int - 1) l);
    if ganho + coalesce((select sum(g.xp) from public.fm_ganhos g where g.jogador = new.jogador
                          and g.quando > now() - interval '1 hour'), 0) > 300000 then
      depois := jsonb_set(depois, '{char}', coalesce(antes->'char', depois->'char'));
      motivos := motivos || format('nível %s -> %s rápido demais (desfeito)', nivel0, nivel1);
    else
      insert into public.fm_ganhos(jogador, xp) values (new.jogador, ganho);
    end if;
  end if;
  if nivel1 > least(200, nivel0 + 3) then
    depois := jsonb_set(depois, '{char}', coalesce(antes->'char', depois->'char'));
    motivos := motivos || format('nível %s -> %s (desfeito)', nivel0, nivel1);
  end if;

  if array_length(motivos, 1) > 0 then
    insert into fm_suspeitas (jogador, motivo, antes, depois) values (new.jogador, array_to_string(motivos, '; '), antes, new.progresso);
  end if;
  new.progresso := depois;
  return new;
end $function$
;
