-- Garante o schema
create schema if not exists financas;

-- Tabela de prova (apenas para validar criação no schema certo)
create table if not exists financas.teste_ci (
  id   uuid primary key default gen_random_uuid(),
  name text
);

-- Permissões mínimas (opcional)
grant usage on schema financas to anon, authenticated;
