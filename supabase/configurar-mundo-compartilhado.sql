-- Fronteira Morta 2.2 — relógio único para a cidade.
-- Aplicar uma vez no Supabase. Não altera partidas e é seguro reexecutar.
begin;

create table if not exists public.fm_relogio_global (
  id smallint primary key default 1 check (id = 1),
  inicio timestamptz not null default clock_timestamp()
);
insert into public.fm_relogio_global (id) values (1)
on conflict (id) do nothing;
alter table public.fm_relogio_global enable row level security;
revoke all on public.fm_relogio_global from public, anon, authenticated;
grant select on public.fm_relogio_global to authenticated;

drop policy if exists fm_relogio_leitura on public.fm_relogio_global;
create policy fm_relogio_leitura
  on public.fm_relogio_global for select to authenticated
  using (true);

create or replace function public.fm_hora_global()
returns table (inicio_ms bigint, agora_ms bigint)
language sql stable security invoker set search_path = ''
as $$
  select (extract(epoch from g.inicio) * 1000)::bigint,
         (extract(epoch from clock_timestamp()) * 1000)::bigint
  from public.fm_relogio_global g
  where g.id = 1;
$$;
revoke all on function public.fm_hora_global() from public, anon;
grant execute on function public.fm_hora_global() to authenticated;
commit;

-- Realtime Broadcast sincroniza posições, vida e mortes de zumbis entre
-- clientes presentes no mesmo setor. O coordenador do setor é temporário.
-- Para segurança antitrapaça e combate verdadeiramente autoritativo,
-- use um servidor de jogo dedicado no futuro.
