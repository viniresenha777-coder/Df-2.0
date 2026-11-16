-- Fronteira Morta 2.1: perfis imutáveis e amizades.
-- Este script documenta as alterações já aplicadas no Supabase.
-- Pode ser executado novamente sem apagar partidas ou relações existentes.
begin;

create table if not exists public.fm_perfis (
  jogador uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  constraint fm_nome_tamanho check (char_length(nome) between 3 and 16 and nome = btrim(nome))
);
create unique index if not exists fm_perfis_nome_unico on public.fm_perfis (lower(nome));
alter table public.fm_perfis enable row level security;
revoke all on public.fm_perfis from public, anon, authenticated;
grant select, insert on public.fm_perfis to authenticated;

drop policy if exists fm_perfil_ver_nomes on public.fm_perfis;
create policy fm_perfil_ver_nomes on public.fm_perfis for select to authenticated using (true);
drop policy if exists fm_perfil_criar_proprio on public.fm_perfis;
create policy fm_perfil_criar_proprio on public.fm_perfis for insert to authenticated
with check ((select auth.uid()) = jogador);

create table if not exists public.fm_amizades (
  id uuid primary key default gen_random_uuid(),
  solicitante uuid not null references public.fm_perfis(jogador) on delete cascade,
  destinatario uuid not null references public.fm_perfis(jogador) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','aceito')),
  criado_em timestamptz not null default now(),
  unique (solicitante, destinatario),
  constraint fm_amigos_diferentes check (solicitante <> destinatario)
);
alter table public.fm_amizades enable row level security;
revoke all on public.fm_amizades from public, anon, authenticated;
grant select, insert on public.fm_amizades to authenticated;
grant update (status) on public.fm_amizades to authenticated;

drop policy if exists fm_amigos_ambos_ler on public.fm_amizades;
create policy fm_amigos_ambos_ler on public.fm_amizades for select to authenticated
using ((select auth.uid()) in (solicitante,destinatario));
drop policy if exists fm_amigos_solicitar on public.fm_amizades;
create policy fm_amigos_solicitar on public.fm_amizades for insert to authenticated
with check ((select auth.uid()) = solicitante and status = 'pendente');
drop policy if exists fm_amigos_aceitar on public.fm_amizades;
create policy fm_amigos_aceitar on public.fm_amizades for update to authenticated
using ((select auth.uid()) = destinatario and status = 'pendente')
with check ((select auth.uid()) = destinatario and status = 'aceito');

-- Importa os nomes já salvos de jogadores existentes; preserva os saves.
insert into public.fm_perfis (jogador, nome)
select jogador, btrim(left(progresso->>'name', 16))
from public.fm_partidas
where progresso ? 'name'
  and char_length(btrim(left(progresso->>'name', 16))) between 3 and 16
on conflict do nothing;

commit;