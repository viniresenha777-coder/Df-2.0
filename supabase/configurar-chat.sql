-- Fronteira Morta 2.0 — chat global (executar uma vez no Supabase SQL Editor; seguro reexecutar).
-- Precisa de configurar-banimentos.sql antes (usa fm_esta_banido e fm_e_admin).
--
-- Regras, todas checadas no servidor:
--   * só jogador logado e não banido envia; o nome vem do perfil (ninguém finge ser outro);
--   * mensagem de 1 a 200 caracteres; no máximo 1 mensagem a cada 2 segundos por jogador;
--   * todos leem as mensagens das últimas 24 h; mensagens com mais de 2 dias são apagadas sozinhas;
--   * administrador pode apagar mensagens.
begin;

create table if not exists public.fm_chat (
  id        bigint generated always as identity primary key,
  jogador   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome      text not null default '',
  texto     text not null,
  criado_em timestamptz not null default now(),
  constraint fm_chat_tamanho check (char_length(btrim(texto)) between 1 and 200)
);
create index if not exists fm_chat_criado on public.fm_chat (criado_em desc);
create index if not exists fm_chat_jogador on public.fm_chat (jogador, criado_em desc);
alter table public.fm_chat enable row level security;

-- antes de gravar: dono e nome vêm do servidor, hora do servidor, limite de velocidade, limpeza
create or replace function public.fm_chat_antes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.jogador := (select auth.uid());
  new.texto := btrim(new.texto);
  new.criado_em := now();
  select p.nome into new.nome from public.fm_perfis p where p.jogador = new.jogador;
  if new.nome is null or new.nome = '' then raise exception 'Crie seu personagem antes de usar o chat.'; end if;
  if exists (select 1 from public.fm_chat c
              where c.jogador = new.jogador and c.criado_em > now() - interval '2 seconds') then
    raise exception 'Calma: espere 2 segundos entre as mensagens.';
  end if;
  delete from public.fm_chat where criado_em < now() - interval '2 days';
  return new;
end;
$$;
drop trigger if exists fm_chat_antes on public.fm_chat;
create trigger fm_chat_antes before insert on public.fm_chat
  for each row execute function public.fm_chat_antes();

revoke all on public.fm_chat from public, anon, authenticated;
grant select, delete on public.fm_chat to authenticated;
grant insert (texto) on public.fm_chat to authenticated;     -- o jogador só escolhe o texto

drop policy if exists fm_chat_ler on public.fm_chat;
create policy fm_chat_ler on public.fm_chat for select to authenticated
  using (criado_em > now() - interval '1 day');
drop policy if exists fm_chat_enviar on public.fm_chat;
create policy fm_chat_enviar on public.fm_chat for insert to authenticated
  with check ((select auth.uid()) is not null and not public.fm_esta_banido((select auth.uid())));
drop policy if exists fm_chat_apagar on public.fm_chat;
create policy fm_chat_apagar on public.fm_chat for delete to authenticated
  using (public.fm_e_admin());

-- mensagens novas chegam na hora para quem está jogando (Supabase Realtime)
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fm_chat') then
    alter publication supabase_realtime add table public.fm_chat;
  end if;
end $$;

commit;
