create or replace function public.fm_admin_recargas(p_antes timestamptz default null, p_id uuid default null)
returns table (id uuid, nome text, valor numeric, creditos integer, status text, criado_em timestamptz, pago_em timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.fm_e_admin() then
    raise exception 'Acesso exclusivo do administrador.' using errcode = '42501';
  end if;
  return query
    select c.id, coalesce(p.nome::text, 'Sem personagem'), c.valor, c.creditos, c.status, c.criado_em, c.pago_em
    from public.fm_compras c left join public.fm_perfis p on p.jogador = c.jogador
    where p_antes is null or (c.criado_em, c.id) < (p_antes, p_id)
    order by c.criado_em desc, c.id desc limit 11;
end;
$$;
revoke all on function public.fm_admin_recargas(timestamptz, uuid) from public, anon;
grant execute on function public.fm_admin_recargas(timestamptz, uuid) to authenticated;
