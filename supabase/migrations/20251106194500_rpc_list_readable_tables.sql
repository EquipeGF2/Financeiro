-- Lista as tabelas do schema informado para as quais o usuário atual tem SELECT
-- (não usa SECURITY DEFINER: respeita as permissões de quem chama)
create or replace function financas.list_readable_tables(_schema text default 'financas')
returns table (table_name text)
language sql
as $$
  select c.relname::text as table_name
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = _schema
    and c.relkind = 'r'  -- base tables
    and has_table_privilege(current_user, format('"%s"."%s"', n.nspname, c.relname), 'SELECT')
  order by 1;
$$;

-- Permitir chamada via PostgREST (RPC)
grant execute on function financas.list_readable_tables(text) to anon, authenticated;

-- Garantias básicas (só se ainda não fez)
grant usage on schema financas to anon, authenticated;

-- Força recarregar o cache do PostgREST após criar a função
notify pgrst, 'reload schema';
