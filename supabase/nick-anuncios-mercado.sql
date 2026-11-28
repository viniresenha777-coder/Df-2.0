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
      select a.id, a.item, a.price, a.state, a.seller = uid as meu, a.created_at as criado,
             p.nome as vendedor
      from fm_market.listings a
      left join public.fm_perfis p on p.jogador = a.seller
      where a.state = 'open' or (a.state = 'sold' and a.seller = uid)
      order by (a.seller = uid) desc, a.created_at desc, a.id
      limit 100
    ) l
  ), '[]'::jsonb);
end;
$$;
