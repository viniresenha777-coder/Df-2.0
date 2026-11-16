-- Fronteira Morta 2.0 — execute uma vez no Supabase SQL Editor.
-- O Supabase Auth gerencia senhas; esta tabela guarda APENAS o save por usuário.
-- Script seguro para executar novamente: substitui políticas antigas desta tabela.
begin;

create table if not exists public.fm_partidas (
  jogador uuid primary key references auth.users(id) on delete cascade,
  progresso jsonb not null default '{}'::jsonb,
  revisao uuid not null default gen_random_uuid()
);

alter table public.fm_partidas
  add column if not exists progresso jsonb not null default '{}'::jsonb;
alter table public.fm_partidas
  add column if not exists revisao uuid not null default gen_random_uuid();

alter table public.fm_partidas enable row level security;

-- Uma eventual política permissiva anterior também daria acesso. Limpar todas
-- as políticas da tabela dedicada ao jogo antes de aplicar as novas.
do $$
declare p record;
begin
  for p in (
    select policyname
      from pg_policies
     where schemaname = 'public' and tablename = 'fm_partidas'
  ) loop
    execute format('drop policy %I on public.fm_partidas', p.policyname);
  end loop;
end $$;

revoke all on public.fm_partidas from public, anon, authenticated;
grant select, insert, update on public.fm_partidas to authenticated;

create policy "fm_ler_proprio_save"
  on public.fm_partidas for select to authenticated
  using ((select auth.uid()) = jogador);

create policy "fm_criar_proprio_save"
  on public.fm_partidas for insert to authenticated
  with check ((select auth.uid()) = jogador);

create policy "fm_atualizar_proprio_save"
  on public.fm_partidas for update to authenticated
  using ((select auth.uid()) = jogador)
  with check ((select auth.uid()) = jogador);

commit;
