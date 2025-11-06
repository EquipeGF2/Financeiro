-- Garante schema
create schema if not exists financas;

-- Grants base do schema
grant usage on schema financas to anon, authenticated;

-- Defaults para tabelas futuras
alter default privileges in schema financas
  grant select on tables to anon, authenticated;

-- Função: sincroniza grants, RLS e uma policy de leitura
create or replace function financas.sync_rls_policies(_schema text default 'financas')
returns void
language plpgsql
as $$
declare
  r record;
  polname text;
begin
  -- percorre apenas TABELAS base do schema
  for r in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = _schema
      and c.relkind = 'r'  -- base table
    order by c.relname
  loop
    -- grants de leitura (não dá erro se já existir)
    execute format('grant select on %I.%I to anon, authenticated;', _schema, r.table_name);

    -- habilita RLS (se já estiver habilitado, não quebra)
    execute format('alter table %I.%I enable row level security;', _schema, r.table_name);

    -- cria/atualiza policy de leitura "pública" (apenas para smoke/teste)
    polname := format('public_read_%s', r.table_name);
    execute format('drop policy if exists %I on %I.%I;', polname, _schema, r.table_name);
    execute format($fmt$
      create policy %1$I
      on %2$I.%3$I
      for select
      to anon, authenticated
      using (true)
    $fmt$, polname, _schema, r.table_name);
  end loop;
end
$$;

-- Para ser chamada via RPC? (opcional, normalmente só via migration/CLI)
-- grant execute on function financas.sync_rls_policies(text) to postgres;

-- Recarrega o cache do PostgREST quando a função é criada/alterada
notify pgrst, 'reload schema';
