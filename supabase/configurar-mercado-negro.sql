begin;

create schema if not exists fm_market;
revoke all on schema fm_market from public, anon, authenticated;

create table if not exists fm_market.listings (
  id uuid primary key default gen_random_uuid(),
  seller uuid not null references auth.users(id) on delete cascade,
  item jsonb not null,
  price integer not null check (price between 1 and 1000000),
  state text not null default 'open' check (state in ('open', 'sold', 'closed')),
  created_at timestamptz not null default now()
);
alter table fm_market.listings enable row level security;
create index if not exists fm_market_seller_idx on fm_market.listings (seller, state);
create index if not exists fm_market_open_idx on fm_market.listings (created_at, id) where state = 'open';

create or replace function fm_market.listar()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or public.fm_esta_banido(uid) then
    raise exception 'Mercado indisponível para esta conta.';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(l) order by l.meu desc, l.criado desc)
    from (
      select id, item, price, state, seller = uid as meu, created_at as criado
      from fm_market.listings
      where state = 'open' or (state = 'sold' and seller = uid)
      order by (seller = uid) desc, created_at desc, id
      limit 100
    ) l
  ), '[]'::jsonb);
end;
$$;

create or replace function fm_market.operar(
  acao text, anuncio uuid, local_item text, posicao integer,
  preco integer, versao uuid, nova_versao uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  partida jsonb;
  oferta fm_market.listings%rowtype;
  objeto jsonb;
  mochila jsonb;
  path text[];
  saldo numeric;
  espacos integer;
begin
  if uid is null or public.fm_esta_banido(uid) then
    raise exception 'Mercado indisponível para esta conta.';
  end if;
  if acao is null or acao not in ('listar', 'comprar', 'cancelar', 'receber')
     or nova_versao is null or nova_versao = versao then
    raise exception 'Operação inválida.';
  end if;
  if acao <> 'listar' then
    select * into oferta from fm_market.listings where id = anuncio for update;
    if not found then raise exception 'Anúncio indisponível.'; end if;
  end if;

  select progresso into partida from public.fm_partidas
    where jogador = uid and revisao = versao for update;
  if not found then raise exception 'Progresso desatualizado. Saia e entre novamente.'; end if;
  mochila := partida #> '{run,p,pack}';
  if jsonb_typeof(mochila) is distinct from 'array' then
    raise exception 'Salve a partida antes de negociar.';
  end if;
  saldo := coalesce((partida #>> '{run,g,money}')::numeric, 0);

  if acao = 'listar' then
    if local_item is null or local_item not in ('pack', 'slots') or posicao is null or posicao < 0
       or preco is null or preco not between 1 and 1000000 then
      raise exception 'Item ou preço inválido.';
    end if;
    if (select count(*) from fm_market.listings where seller = uid and state <> 'closed') >= 20 then
      raise exception 'Limite de 20 anúncios ativos ou aguardando recebimento.';
    end if;
    path := array['run', 'p', local_item];
    objeto := partida #> (path || posicao::text);
    if objeto->'loot' is distinct from 'true'::jsonb
       or coalesce(objeto->>'kind', '') not in ('weapon', 'mat')
       or coalesce(objeto->>'id', '') = ''
       or objeto->>'id' in ('reset_stats', 'token_loja')
       or objeto->'tokenBound' = 'true'::jsonb then
      raise exception 'Esse item não pode ser anunciado.';
    end if;
    if objeto->>'kind' = 'weapon' then
      objeto := jsonb_set(objeto, '{ammo}', '0');
    end if;
    if local_item = 'slots' then
      partida := jsonb_set(partida, path || posicao::text, 'null');
    else
      partida := jsonb_set(partida, path, mochila - posicao);
    end if;
    insert into fm_market.listings(seller, item, price) values (uid, objeto, preco);
  elsif acao = 'receber' then
    if oferta.seller <> uid or oferta.state <> 'sold' then
      raise exception 'Pagamento indisponível.';
    end if;
    if saldo + oferta.price > 2147483647 then raise exception 'Saldo da mochila no limite.'; end if;
    partida := jsonb_set(partida, '{run,g,money}', to_jsonb(saldo + oferta.price));
    update fm_market.listings set state = 'closed' where id = anuncio;
  else
    if oferta.state <> 'open' or (acao = 'cancelar') <> (oferta.seller = uid) then
      raise exception 'Anúncio indisponível para esta operação.';
    end if;
    select coalesce(sum(ceil(greatest(value::numeric, 0) / 500)), 0)::int
      into espacos from jsonb_each_text(coalesce(partida #> '{run,p,reserve}', '{}'::jsonb));
    -- Mesmo limite de items.js (PACK_MAX) e survival.js (AMMO_STACK).
    if jsonb_array_length(mochila) + espacos >= 20 then raise exception 'Mochila cheia.'; end if;
    if acao = 'comprar' then
      if saldo < oferta.price then raise exception 'Dinheiro insuficiente.'; end if;
      partida := jsonb_set(partida, '{run,g,money}', to_jsonb(saldo - oferta.price));
    end if;
    partida := jsonb_set(partida, '{run,p,pack}', mochila || jsonb_build_array(oferta.item));
    update fm_market.listings set state = case when acao = 'comprar' then 'sold' else 'closed' end where id = anuncio;
  end if;

  update public.fm_partidas set progresso = partida, revisao = nova_versao
    where jogador = uid returning progresso into partida;
  return partida;
end;
$$;

create or replace function public.fm_mercado_listar()
returns jsonb language sql security invoker set search_path = '' as $$
  select fm_market.listar();
$$;
create or replace function public.fm_mercado_operar(
  acao text, anuncio uuid, local_item text, posicao integer,
  preco integer, versao uuid, nova_versao uuid
) returns jsonb language sql security invoker set search_path = '' as $$
  select fm_market.operar(acao, anuncio, local_item, posicao, preco, versao, nova_versao);
$$;

revoke all on function fm_market.listar(), public.fm_mercado_listar() from public, anon;
revoke all on function fm_market.operar(text, uuid, text, integer, integer, uuid, uuid),
  public.fm_mercado_operar(text, uuid, text, integer, integer, uuid, uuid) from public, anon;
grant usage on schema fm_market to authenticated;
grant execute on function fm_market.listar(), public.fm_mercado_listar() to authenticated;
grant execute on function fm_market.operar(text, uuid, text, integer, integer, uuid, uuid),
  public.fm_mercado_operar(text, uuid, text, integer, integer, uuid, uuid) to authenticated;

commit;
