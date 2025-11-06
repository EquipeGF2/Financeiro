-- Garante o schema e grants mínimos
create schema if not exists financas;

grant usage on schema financas to anon, authenticated;

-- leitura padrão (enquanto você testa; ajuste depois)
grant select on all tables in schema financas to anon, authenticated;

-- defaults para novas tabelas
alter default privileges in schema financas
  grant select on tables to anon, authenticated;

-- Habilita RLS + policy de leitura SOMENTE se a tabela existir
do $$
declare
  t text;
  -- 🔧 AJUSTE AQUI os nomes reais das suas tabelas no schema 'financas'
  alvos text[] := array['usr_usuarios','categorias','movimentacoes'];
begin
  foreach t in array alvos loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'financas' and table_name = t
    ) then
      execute format('alter table financas.%I enable row level security;', t);
      execute format('drop policy if exists public_read_%I on financas.%I;', t, t);
      execute format($fmt$
        create policy public_read_%1$I
        on financas.%1$I
        for select to anon, authenticated
        using (true);
      $fmt$, t);
    end if;
  end loop;
end $$;

-- Recarrega o cache do PostgREST (importante após criar/alterar policies)
notify pgrst, 'reload schema';
