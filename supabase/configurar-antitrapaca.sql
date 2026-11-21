-- Fronteira Morta 2.0 — conferência do save no servidor (anti-trapaça).
-- Execute uma vez no Supabase → SQL Editor (pode rodar de novo; substitui a versão anterior).
-- Precisa já ter rodado: configurar-banco.sql e configurar-banimentos.sql (função fm_e_admin).
--
-- Antes, o servidor guardava qualquer save que o navegador mandasse: quem abrisse o Console podia se dar
-- dinheiro, nível, créditos ou VIP. Agora, a cada salvamento, o servidor compara com o save anterior e
-- CORRIGE o que for impossível (volta ao máximo permitido), registrando o caso em fm_suspeitas para o admin ver.
-- Administradores (fm_administradores) não passam pela conferência (o painel F2 altera valores à vontade).
--
-- O que é conferido:
--   * VIP legado (gm): só um administrador liga.
--   * Créditos: só sobem se o banco pagou ($500 por crédito) — no máximo isso.
--   * VIP (vipUntil): só aumenta se foram gastos créditos (200 por mês) ou se chegou um presente de VIP.
--   * Dinheiro (banco + mochila): ganho máximo por salvamento, proporcional ao tempo jogado, mais presentes.
--   * Nível: o jogo grava a cada subida de nível; mais de 3 níveis num salvamento é desfeito inteiro.
--   * Loja grátis (shopFreeUntil): só aumenta se um Token da Loja foi gasto (até 24 h por token).
begin;

alter table public.fm_partidas
  add column if not exists atualizado_em timestamptz not null default now();

create table if not exists public.fm_suspeitas (
  id bigint generated always as identity primary key,
  jogador uuid not null references auth.users(id) on delete cascade,
  quando timestamptz not null default now(),
  motivo text not null,
  antes jsonb,
  depois jsonb
);
alter table public.fm_suspeitas enable row level security;
revoke all on public.fm_suspeitas from public, anon, authenticated;
grant select on public.fm_suspeitas to authenticated;
drop policy if exists "fm_suspeitas_admin" on public.fm_suspeitas;
create policy "fm_suspeitas_admin" on public.fm_suspeitas for select to authenticated using (public.fm_e_admin());

create or replace function public.fm_num(j jsonb, variadic caminho text[])
returns numeric language sql immutable as $$
  select coalesce(nullif(j #>> caminho, '')::numeric, 0)
$$;

create or replace function public.fm_tokens_loja(j jsonb)
returns numeric language sql immutable set search_path = public as $$
  select coalesce(sum(coalesce((it->>'qty')::numeric, 1)), 0)
    from (select jsonb_array_elements(coalesce(j #> '{run,p,pack}', '[]'::jsonb)) as it
          union all
          select jsonb_array_elements(coalesce(j -> 'vault', '[]'::jsonb))) t
   where it->>'id' = 'token_loja'
$$;

create or replace function public.fm_conferir_save()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  antes jsonb;
  depois jsonb := new.progresso;
  horas numeric;
  motivos text[] := '{}';
  -- valores antes/depois
  banco0 numeric; banco1 numeric; mochila0 numeric; mochila1 numeric;
  cred0 numeric; cred1 numeric; vip0 numeric; vip1 numeric; nivel0 numeric; nivel1 numeric;
  loja0 numeric; loja1 numeric; agora_ms numeric := extract(epoch from now()) * 1000;
  -- presentes recebidos desde o último salvamento
  presente_dinheiro numeric := 0; presente_vip_meses numeric := 0;
  permitido numeric; ganho numeric; corte numeric;
  mes_ms constant numeric := 31::numeric * 24 * 3600 * 1000;
begin
  new.atualizado_em := now();
  if public.fm_e_admin() then return new; end if;

  if tg_op = 'INSERT' then
    -- conta nova (ou progresso antigo importado): sem VIP legado; VIP e créditos não vêm de fora
    if coalesce((depois->>'gm')::boolean, false) then
      depois := jsonb_set(depois, '{gm}', 'false'); motivos := motivos || text 'gm ligado na criação';
    end if;
    if fm_num(depois, 'credits') > 0 then
      depois := jsonb_set(depois, '{credits}', '0'); motivos := motivos || text 'créditos na criação';
    end if;
    if fm_num(depois, 'vipUntil') > extract(epoch from now()) * 1000 then
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
  -- tempo desde o último salvamento (no máximo 2 h contam: tempo parado fora do jogo não rende)
  horas := least(greatest(extract(epoch from (now() - coalesce(old.atualizado_em, now() - interval '5 minutes'))) / 3600, 0), 2);

  select coalesce(sum(quantidade) filter (where tipo = 'dinheiro'), 0),
         coalesce(sum(quantidade) filter (where tipo = 'vip'), 0)
    into presente_dinheiro, presente_vip_meses
    from fm_presentes
   where destinatario = new.jogador
     and recebido_em is not null
     and recebido_em >= coalesce(old.atualizado_em, now()) - interval '10 minutes';

  banco0 := fm_num(antes, 'bank');            banco1 := fm_num(depois, 'bank');
  mochila0 := fm_num(antes, 'run', 'g', 'money'); mochila1 := fm_num(depois, 'run', 'g', 'money');
  cred0 := fm_num(antes, 'credits');          cred1 := fm_num(depois, 'credits');
  vip0 := fm_num(antes, 'vipUntil');          vip1 := fm_num(depois, 'vipUntil');
  nivel0 := fm_num(antes, 'char', 'level');   nivel1 := fm_num(depois, 'char', 'level');
  loja0 := fm_num(antes, 'shopFreeUntil');    loja1 := fm_num(depois, 'shopFreeUntil');

  -- 1) VIP legado: só administrador liga
  if coalesce((depois->>'gm')::boolean, false) and not coalesce((antes->>'gm')::boolean, false) then
    depois := jsonb_set(depois, '{gm}', 'false'); motivos := motivos || text 'tentou ligar VIP legado';
  end if;

  -- 2) créditos: cada crédito novo custa $500 do banco
  if cred1 > cred0 then
    permitido := cred0 + floor(greatest(banco0 - banco1, 0) / 500);
    if cred1 > permitido then
      depois := jsonb_set(depois, '{credits}', to_jsonb(permitido));
      motivos := motivos || format('créditos %s -> %s (máximo %s)', cred0, cred1, permitido);
      cred1 := permitido;
    end if;
  end if;

  -- 3) VIP: precisa ter gastado 200 créditos por mês, ou ter recebido presente de VIP (1 dia de folga)
  if vip1 > greatest(vip0, extract(epoch from now()) * 1000) then
    permitido := greatest(vip0, extract(epoch from now()) * 1000)
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

  -- 4) dinheiro (banco + mochila): ganho máximo por salvamento
  ganho := (banco1 + mochila1) - (banco0 + mochila0);
  permitido := floor(5000000 + 10000000 * horas + presente_dinheiro);
  if ganho > permitido then
    corte := ganho - permitido;                      -- tira o excesso: primeiro da mochila, depois do banco
    if mochila1 >= corte then
      depois := jsonb_set(depois, '{run,g,money}', to_jsonb(floor(mochila1 - corte)));
    else
      depois := jsonb_set(depois, '{run,g,money}', to_jsonb(0));
      depois := jsonb_set(depois, '{bank}', to_jsonb(floor(greatest(banco1 - (corte - mochila1), 0))));
    end if;
    motivos := motivos || format('dinheiro +%s em %s h (máximo +%s)', ganho, round(horas, 2), permitido);
  end if;

  -- 5) nível
  -- o jogo grava a cada subida de nível: mais de 3 níveis num salvamento é impossível e é desfeito inteiro
  -- (nível, XP e pontos voltam ao salvamento anterior)
  if nivel1 > least(200, nivel0 + 3) then
    depois := jsonb_set(depois, '{char}', coalesce(antes->'char', depois->'char'));
    motivos := motivos || format('nível %s -> %s (desfeito)', nivel0, nivel1);
  end if;

  if array_length(motivos, 1) > 0 then
    insert into fm_suspeitas (jogador, motivo, antes, depois) values (new.jogador, array_to_string(motivos, '; '), antes, new.progresso);
  end if;
  new.progresso := depois;
  return new;
end $$;

drop trigger if exists fm_conferir_save on public.fm_partidas;
create trigger fm_conferir_save
  before insert or update on public.fm_partidas
  for each row execute function public.fm_conferir_save();

commit;

-- Para ver as suspeitas (como administrador, no SQL Editor):
--   select s.quando, p.nome, s.motivo from public.fm_suspeitas s
--     left join public.fm_perfis p on p.jogador = s.jogador order by s.quando desc limit 50;
