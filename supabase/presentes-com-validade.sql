alter table public.fm_presentes
  add column validade_dias integer not null default 0,
  add column expira_em timestamptz,
  add constraint fm_presente_validade check (
    validade_dias = 0 or (validade_dias between 1 and 36500 and quantidade = 1 and transferivel is false
    and (tipo in ('arma','colete','implante') or (tipo='material' and item_id in ('trindade_eterna','token_loja'))))
  );
create function public.fm_ativar_presente(p_presente uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare prazo timestamptz;
begin
  update public.fm_presentes set expira_em=coalesce(expira_em,now()+validade_dias*interval '24 hours')
  where id=p_presente and destinatario=auth.uid() and validade_dias>0 and reivindicar_em is null
  returning expira_em into prazo;
  if prazo is null then raise exception 'Presente indisponível'; end if;
  return prazo;
end $$;
revoke all on function public.fm_ativar_presente(uuid) from public,anon;
grant execute on function public.fm_ativar_presente(uuid) to authenticated;
alter table fm_market.listings add constraint fm_market_presente_vinculado
  check (not (item ? 'validadeDias') or state <> 'open');
