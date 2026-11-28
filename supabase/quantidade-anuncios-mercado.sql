begin;

-- Estende a função instalada sem restaurar uma cópia antiga das regras de mercado.
do $migration$
declare
  anterior regprocedure := to_regprocedure('fm_market.operar(text,uuid,text,integer,integer,uuid,uuid)');
  nova regprocedure := to_regprocedure('fm_market.operar(text,uuid,text,integer,integer,uuid,uuid,integer)');
  definicao text;
  assinatura constant text := 'nova_versao uuid)';
  remover_item constant text := 'if local_item = ''slots'' then';
  saldo_disponivel constant text := 'quantidade := atuais - vinculada;';
begin
  if nova is not null then return; end if;
  if anterior is null then raise exception 'Função do Mercado Negro ausente.'; end if;
  definicao := pg_get_functiondef(anterior::oid);
  if array_length(string_to_array(definicao, assinatura), 1) <> 2
     or array_length(string_to_array(definicao, remover_item), 1) <> 2
     or array_length(string_to_array(definicao, saldo_disponivel), 1) <> 2 then
    raise exception 'A função instalada usa uma estrutura diferente para os anúncios.';
  end if;

  definicao := replace(definicao, assinatura, 'nova_versao uuid, unidades integer)');
  definicao := replace(definicao, remover_item, $pack$
      if unidades is not null and (local_item not in ('pack', 'vault')
         or objeto->>'kind' not in ('mat', 'ammo', 'food', 'water', 'med', 'anti')
         or unidades < 1 or unidades > coalesce((objeto->>'qty')::integer, 0)) then
        raise exception 'Quantidade indisponível para anúncio.';
      end if;
      if unidades is not null and unidades < (objeto->>'qty')::integer then
        partida := jsonb_set(partida, path || array[posicao::text, 'qty'],
          to_jsonb((objeto->>'qty')::integer - unidades));
        objeto := jsonb_set(objeto, '{qty}', to_jsonb(unidades));
      elsif local_item = 'slots' then$pack$);
  definicao := replace(definicao, saldo_disponivel, $supply$
      quantidade := atuais - vinculada;
      if unidades is not null then
        if unidades < 1 or unidades > quantidade then
          raise exception 'Quantidade indisponível para anúncio.';
        end if;
        quantidade := unidades;
      end if;$supply$);
  execute definicao;
end;
$migration$;

create or replace function public.fm_mercado_anunciar_quantidade(
  local_item text, posicao integer, preco integer, versao uuid, nova_versao uuid, unidades integer
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  if unidades is null or unidades < 1 then raise exception 'Quantidade inválida.'; end if;
  return fm_market.operar('listar', null, local_item, posicao, preco, versao, nova_versao, unidades);
end;
$$;

revoke all on function fm_market.operar(text, uuid, text, integer, integer, uuid, uuid, integer),
  public.fm_mercado_anunciar_quantidade(text, integer, integer, uuid, uuid, integer) from public, anon;
grant execute on function fm_market.operar(text, uuid, text, integer, integer, uuid, uuid, integer),
  public.fm_mercado_anunciar_quantidade(text, integer, integer, uuid, uuid, integer) to authenticated;
notify pgrst, 'reload schema';

commit;
