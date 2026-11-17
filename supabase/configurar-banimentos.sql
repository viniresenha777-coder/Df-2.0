-- Fronteira Morta 2.0 — banimento de jogadores (executar uma vez no Supabase SQL Editor).
-- Seguro para executar de novo. Não apaga partidas.
--
-- Quem bane e desbane: somente contas em public.fm_administradores (checado AQUI no servidor;
-- o botão no jogo é só a interface). Jogador banido:
--   * não consegue ler nem gravar a própria partida (políticas de fm_partidas abaixo);
--   * ao entrar vê a mensagem de banimento e volta para o login;
--   * se estiver jogando, é desconectado em até 1 minuto.
-- ate = null  -> banimento permanente.
begin;

create table if not exists public.fm_banimentos (
  jogador   uuid primary key references auth.users(id) on delete cascade,
  ate       timestamptz,
  motivo    text not null default '',
  por       uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint fm_ban_motivo_tamanho check (char_length(motivo) <= 200)
);
alter table public.fm_banimentos enable row level security;

-- quem é administrador (sem depender das permissões de leitura de fm_administradores)
create or replace function public.fm_e_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.fm_administradores a where a.jogador = (select auth.uid()));
$$;

create or replace function public.fm_esta_banido(alvo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.fm_banimentos b
                  where b.jogador = alvo and (b.ate is null or b.ate > now()));
$$;

-- o próprio jogador vê o seu banimento (para a mensagem); administradores veem todos.
-- Ninguém grava direto na tabela: só pelas funções fm_banir / fm_desbanir.
revoke all on public.fm_banimentos from public, anon, authenticated;
grant select on public.fm_banimentos to authenticated;
drop policy if exists fm_ban_ver on public.fm_banimentos;
create policy fm_ban_ver on public.fm_banimentos for select to authenticated
  using ((select auth.uid()) = jogador or public.fm_e_admin());

create or replace function public.fm_banir(alvo uuid, dias integer, motivo text default '')
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare fim timestamptz;
begin
  if not public.fm_e_admin() then raise exception 'Somente administradores podem banir.'; end if;
  if alvo is null then raise exception 'Jogador inválido.'; end if;
  if alvo = (select auth.uid()) then raise exception 'Você não pode banir a própria conta.'; end if;
  if exists (select 1 from public.fm_administradores a where a.jogador = alvo) then
    raise exception 'Não é possível banir outro administrador.';
  end if;
  fim := case when dias is null or dias <= 0 then null else now() + make_interval(days => dias) end;
  insert into public.fm_banimentos (jogador, ate, motivo, por)
  values (alvo, fim, left(coalesce(motivo, ''), 200), (select auth.uid()))
  on conflict (jogador) do update
    set ate = excluded.ate, motivo = excluded.motivo, por = excluded.por, criado_em = now();
  return fim;
end;
$$;

create or replace function public.fm_desbanir(alvo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.fm_e_admin() then raise exception 'Somente administradores podem desbanir.'; end if;
  delete from public.fm_banimentos where jogador = alvo;
end;
$$;

-- lista para o painel F2 (só banimentos ainda valendo), com o nome do jogador
create or replace function public.fm_listar_banidos()
returns table (jogador uuid, nome text, ate timestamptz, motivo text, criado_em timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.fm_e_admin() then raise exception 'Somente administradores.'; end if;
  return query
    select b.jogador, coalesce(p.nome, '(sem nome)'), b.ate, b.motivo, b.criado_em
      from public.fm_banimentos b
      left join public.fm_perfis p on p.jogador = b.jogador
     where b.ate is null or b.ate > now()
     order by b.criado_em desc;
end;
$$;

revoke all on function public.fm_e_admin() from public, anon;
revoke all on function public.fm_esta_banido(uuid) from public, anon;
revoke all on function public.fm_banir(uuid, integer, text) from public, anon;
revoke all on function public.fm_desbanir(uuid) from public, anon;
revoke all on function public.fm_listar_banidos() from public, anon;
grant execute on function public.fm_e_admin() to authenticated;
grant execute on function public.fm_esta_banido(uuid) to authenticated;
grant execute on function public.fm_banir(uuid, integer, text) to authenticated;
grant execute on function public.fm_desbanir(uuid) to authenticated;
grant execute on function public.fm_listar_banidos() to authenticated;

-- partidas: as mesmas regras de configurar-banco.sql, mais "não está banido"
drop policy if exists "fm_ler_proprio_save" on public.fm_partidas;
create policy "fm_ler_proprio_save"
  on public.fm_partidas for select to authenticated
  using ((select auth.uid()) = jogador and not public.fm_esta_banido(jogador));

drop policy if exists "fm_criar_proprio_save" on public.fm_partidas;
create policy "fm_criar_proprio_save"
  on public.fm_partidas for insert to authenticated
  with check ((select auth.uid()) = jogador and not public.fm_esta_banido(jogador));

drop policy if exists "fm_atualizar_proprio_save" on public.fm_partidas;
create policy "fm_atualizar_proprio_save"
  on public.fm_partidas for update to authenticated
  using ((select auth.uid()) = jogador and not public.fm_esta_banido(jogador))
  with check ((select auth.uid()) = jogador and not public.fm_esta_banido(jogador));

commit;
