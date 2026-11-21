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
  tipo text;
  chave text;
  quantidade integer;
  reserva integer;
  vinculada integer;
  atuais integer;
  colete integer;
  inventario jsonb;
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
    if local_item is null or posicao is null or posicao < 0 or preco is null or preco not between 1 and 1000000 then
      raise exception 'Item ou preço inválido.';
    end if;
    if (select count(*) from fm_market.listings where seller = uid and state <> 'closed') >= 20 then
      raise exception 'Limite de 20 anúncios ativos ou aguardando recebimento.';
    end if;
    tipo := split_part(local_item, ':', 1);
    chave := split_part(local_item, ':', 2);
    if local_item in ('slots', 'pack', 'vault', 'bag') then
      path := case when local_item = 'vault' then array['vault'] else array['run', 'p', local_item] end;
      inventario := partida #> path;
      objeto := inventario -> posicao;
      if jsonb_typeof(objeto) is distinct from 'object' or coalesce(objeto->>'id', '') = ''
         or objeto->'tokenBound' = 'true'::jsonb
         or (local_item <> 'bag' and coalesce(objeto->>'kind', '') not in ('weapon', 'mat')) then
        raise exception 'Esse item não pode ser anunciado.';
      end if;
      if local_item = 'bag' then objeto := objeto || '{"kind":"implant"}'::jsonb; end if;
      if local_item = 'slots' then
        partida := jsonb_set(partida, path || posicao::text, 'null');
      else
        partida := jsonb_set(partida, path, inventario - posicao);
      end if;
    elsif local_item = 'vest' then
      chave := posicao::text;
      if partida #> array['vestsOwned', chave] is distinct from 'true'::jsonb
         or partida->>'vest' = chave then
        raise exception 'Guarde o colete antes de anunciá-lo.';
      end if;
      objeto := jsonb_build_object('kind', 'vest', 'id', posicao,
        'dur', coalesce(partida #> array['vestDur', chave], '100'::jsonb),
        'up', coalesce(partida #> array['vestUpgrades', chave], '{}'::jsonb));
      partida := jsonb_set(partida, array['vestsOwned', chave], 'false');
      partida := partida #- array['vestDur', chave] #- array['vestUpgrades', chave];
    else
      if tipo = 'ammo' and chave in ('9mm', '.45', '.50', '5.56', '7.62', 'cartucho', 'combustível', 'virote', 'granada') then
        path := array['run', 'p', 'reserve', chave];
      elsif tipo = 'food' and chave in ('fresca', 'comum', 'podre') then
        path := array['run', 'p', 'foodQ', chave];
      elsif local_item in ('water', 'med', 'anti') then
        path := array['run', 'p', local_item];
      else
        raise exception 'Categoria de item inválida.';
      end if;
      atuais := coalesce((partida #>> path)::integer, 0);
      vinculada := 0;
      if tipo = 'ammo' then
        vinculada := case
          when partida #> '{run,p,tokenAmmo}' is null and coalesce((partida->>'shopFreeUntil')::numeric, 0) > 0 then atuais
          else greatest(0, coalesce((partida #>> array['run','p','tokenAmmo',chave])::integer, 0))
        end;
      end if;
      quantidade := atuais - vinculada;
      if quantidade <= 0 then raise exception 'Nenhuma unidade disponível para revenda.'; end if;
      objeto := jsonb_build_object('kind', tipo, 'id', chave, 'qty', quantidade);
      partida := jsonb_set(partida, path, to_jsonb(atuais - quantidade));
      if tipo = 'food' then
        partida := jsonb_set(partida, '{run,p,food}', to_jsonb((partida #>> '{run,p,food}')::int - quantidade));
      end if;
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
    objeto := oferta.item;
    tipo := objeto->>'kind';
    chave := objeto->>'id';
    if acao = 'comprar' then
      if saldo < oferta.price then raise exception 'Dinheiro insuficiente.'; end if;
      partida := jsonb_set(partida, '{run,g,money}', to_jsonb(saldo - oferta.price));
    end if;
    if tipo in ('weapon', 'mat', 'ammo') then
      select coalesce(sum(ceil(greatest(value::numeric, 0) / 500)), 0)::int
        into espacos from jsonb_each_text(coalesce(partida #> '{run,p,reserve}', '{}'::jsonb));
      if tipo = 'ammo' then
        quantidade := (objeto->>'qty')::int;
        path := array['run','p','reserve',chave];
        reserva := coalesce((partida #>> path)::int, 0);
        espacos := espacos - ceil(reserva / 500.0)::int + ceil((reserva::numeric + quantidade) / 500)::int;
        if jsonb_array_length(mochila) + espacos > 20 then raise exception 'Mochila cheia para essa munição.'; end if;
        partida := jsonb_set(partida, path, to_jsonb(reserva + quantidade));
      else
        if jsonb_array_length(mochila) + espacos >= 20 then raise exception 'Mochila cheia.'; end if;
        if tipo = 'weapon' and acao = 'comprar' then objeto := jsonb_set(objeto, '{ammo}', '0'); end if;
        partida := jsonb_set(partida, '{run,p,pack}', mochila || jsonb_build_array(objeto));
      end if;
    elsif tipo = 'implant' then
      inventario := coalesce(partida #> '{run,p,bag}', '[]'::jsonb);
      if jsonb_array_length(inventario) >= 8 then raise exception 'Mochila de implantes cheia.'; end if;
      partida := jsonb_set(partida, '{run,p,bag}', inventario || jsonb_build_array(objeto - 'kind'));
    elsif tipo = 'vest' then
      colete := chave::int;
      inventario := partida->'vestsOwned';
      if colete < 0 or colete >= jsonb_array_length(inventario) or inventario->colete = 'true'::jsonb then
        raise exception 'Você já tem esse colete ou ele está indisponível.';
      end if;
      partida := jsonb_set(partida, array['vestsOwned',chave], 'true');
      partida := jsonb_set(partida, array['vestDur',chave], objeto->'dur');
      partida := jsonb_set(partida, array['vestUpgrades',chave], objeto->'up');
    elsif tipo in ('food', 'water', 'med', 'anti') then
      quantidade := (objeto->>'qty')::int;
      path := case when tipo = 'food' then array['run','p','foodQ',chave] else array['run','p',tipo] end;
      atuais := coalesce((partida #>> path)::int, 0);
      partida := jsonb_set(partida, path, to_jsonb(atuais + quantidade));
      if tipo = 'food' then
        partida := jsonb_set(partida, '{run,p,food}', to_jsonb((partida #>> '{run,p,food}')::int + quantidade));
      end if;
    else
      raise exception 'Categoria de item inválida.';
    end if;
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
