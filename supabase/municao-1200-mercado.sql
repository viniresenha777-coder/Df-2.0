begin;

-- Aplica a capacidade nova às versões instaladas da operação de mercado.
do $migration$
declare
  operacao oid;
  definicao text;
  ajustada text;
  regra constant text := '(greatest\(value::numeric,\s*0\)|reserva|\(reserva::numeric\s*\+\s*quantidade\))\s*/\s*';
  antigas integer;
  novas integer;
  funcoes integer := 0;
begin
  for operacao in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'fm_market' and p.proname = 'operar' and p.pronargs in (7, 8)
  loop
    definicao := pg_get_functiondef(operacao);
    select count(*) into antigas from regexp_matches(definicao, regra || '500(\.0)?\)', 'g');
    select count(*) into novas from regexp_matches(definicao, regra || '1200(\.0)?\)', 'g');
    if antigas = 0 and novas = 0 then continue; end if;
    if antigas = 3 and novas = 0 then
      -- Conserva a divisão em ponto flutuante para o subtotal de um calibre.
      ajustada := regexp_replace(definicao, regra || '500(\.0)?\)', '\1 / 1200\2)', 'g');
      execute ajustada;
    elsif antigas <> 0 or novas <> 3 then
      raise exception 'A regra instalada de capacidade do Mercado Negro é diferente da esperada.';
    end if;
    funcoes := funcoes + 1;
  end loop;
  if funcoes = 0 then raise exception 'Regra de capacidade do Mercado Negro não encontrada.'; end if;
end;
$migration$;

commit;
