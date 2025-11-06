create schema if not exists financas;

-- Permite que os papéis padrão acessem o schema
grant usage on schema financas to anon, authenticated;

-- Defaults: qualquer tabela nova em financas herda esses grants
alter default privileges in schema financas
  grant select, insert, update, delete on tables to authenticated;

-- Exemplo de RLS
-- MOVIMENTAÇÕES (cada user só vê/edita as suas)
alter table financas.movimentacoes enable row level security;

create policy "owner_can_all"
on financas.movimentacoes
for all
to authenticated
using (auth.uid() = usuario_id)
with check (auth.uid() = usuario_id);

-- Trigger: se usuario_id vier nulo, define como auth.uid()
create or replace function financas.set_usuario_id()
returns trigger language plpgsql as $$
begin
  if new.usuario_id is null then
    new.usuario_id := auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists trg_set_usuario_id on financas.movimentacoes;
create trigger trg_set_usuario_id
before insert on financas.movimentacoes
for each row execute function financas.set_usuario_id();

-- CATEGORIAS (leitura pública; ajuste se quiser)
alter table financas.categorias enable row level security;
drop policy if exists "public_read" on financas.categorias;
create policy "public_read"
on financas.categorias
for select
to anon, authenticated
using (true);
