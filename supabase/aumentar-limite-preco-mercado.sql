begin;

-- Atualiza a instalação existente sem substituir outras regras da função em uso.
do $$
declare
  descricao_limite text;
  definicao_operar text := pg_get_functiondef(
    'fm_market.operar(text,uuid,text,integer,integer,uuid,uuid)'::regprocedure
  );
  regra_anterior constant text := 'preco[[:space:]]+not[[:space:]]+between[[:space:]]+1[[:space:]]+and[[:space:]]+1000000\M';
  regra_nova constant text := 'preco[[:space:]]+not[[:space:]]+between[[:space:]]+1[[:space:]]+and[[:space:]]+999999999\M';
begin
  select regexp_replace(lower(pg_get_constraintdef(oid)), '[[:space:]()]', '', 'g')
    into descricao_limite
    from pg_constraint
    where conrelid = 'fm_market.listings'::regclass
      and conname = 'listings_price_check'
      and contype = 'c';

  if descricao_limite = 'checkprice>=1andprice<=1000000' then
    alter table fm_market.listings drop constraint listings_price_check;
    alter table fm_market.listings add constraint listings_price_check check (price between 1 and 999999999);
  elsif descricao_limite is distinct from 'checkprice>=1andprice<=999999999' then
    raise exception 'Restrição de preço do Mercado Negro diferente da esperada.';
  end if;

  if definicao_operar ~* regra_anterior then
    execute regexp_replace(definicao_operar, regra_anterior, 'preco not between 1 and 999999999', 'i');
  elsif definicao_operar !~* regra_nova then
    raise exception 'Validação de preço do Mercado Negro diferente da esperada.';
  end if;
end;
$$;

commit;
