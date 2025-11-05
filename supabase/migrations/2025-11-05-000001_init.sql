create table if not exists teste_ci (
  id bigserial primary key,
  criado_em timestamptz default now()
);
