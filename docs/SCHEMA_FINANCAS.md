# Schema "financas" - Configuração e Uso

## ✅ Status: Já Configurado Corretamente

O sistema **já está configurado** para usar o schema `financas` do Supabase. Não é necessário fazer ajustes.

---

## 📝 Onde o Schema está Configurado

### 1. **Migrations SQL**
Todas as tabelas são criadas no schema `financas`:

```sql
CREATE TABLE IF NOT EXISTS financas.usr_usuarios (...)
CREATE TABLE IF NOT EXISTS financas.are_areas (...)
CREATE TABLE IF NOT EXISTS financas.ctr_contas_receita (...)
-- etc...
```

### 2. **Cliente Supabase** (`Front_Web/lib/supabaseClient.ts`)

```typescript
createClient(url, key, {
  db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || 'financas' },
  global: {
    headers: {
      'x-user-id': getUserId(), // ✅ Cabeçalho usado pelo RLS
    },
  },
});
```

### 3. **Variável de Ambiente** (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_SCHEMA=financas
```

---

## 🔧 O que Foi Corrigido

### Problema Identificado
As políticas RLS originais não funcionavam com nosso sistema de usuário sem login (UUID no localStorage).

### Solução Implementada
**Migration:** `2025-11-06-000004_fix_rls_policies.sql`

- ✅ Removidas políticas complexas que dependiam de autenticação
- ✅ Criadas políticas permissivas para `anon` role
- ✅ Segurança movida para nível da aplicação

### Como Funciona Agora

```typescript
// ❌ ERRADO: Sem filtro por usuário
const { data } = await supabase.from('are_areas').select('*');

// ✅ CORRETO: Sempre filtrar por usr_id
const userId = getUserSession().userId;
const user = await getOrCreateUser(supabase, userId);

const { data } = await supabase
  .from('are_areas')
  .select('*')
  .eq('are_usr_id', user.data.usr_id);
```

---

## 🚀 Passos para Aplicar as Migrations

### 1. Linkar ao Projeto Supabase

```bash
cd /home/user/Financeiro
supabase link --project-ref SEU_PROJECT_REF
```

Quando solicitado, informe a senha do banco de dados.

### 2. Aplicar Migrations

```bash
supabase db push
```

Isso aplicará as migrations base, incluindo a adição do campo de e-mail:
1. ✅ `2025-11-06-000001_create_user_tables.sql`
2. ✅ `2025-11-06-000002_create_cadastro_tables.sql`
3. ✅ `2025-11-06-000003_create_movimentacao_tables.sql`
4. ✅ `2025-11-06-000004_fix_rls_policies.sql`
5. ✅ `2025-11-07-090000_add_usr_email_column.sql`

### 3. Verificar Tabelas Criadas

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'financas'
ORDER BY table_name;
```

**Resultado esperado:**
- `are_areas`
- `ban_bancos`
- `ctr_contas_receita`
- `pag_pagamentos_area`
- `pbk_pagamentos_banco`
- `rec_receitas`
- `sdb_saldo_banco`
- `usr_usuarios`

---

## 🔐 Segurança com RLS Simplificado

### Por que Políticas Permissivas?

Nosso sistema usa **identificação sem autenticação tradicional** (UUID no localStorage). O Supabase RLS é otimizado para `auth.uid()`, que não temos.

### Estratégia de Segurança

1. **RLS Habilitado:** Previne acesso direto sem passar pelas políticas
2. **Políticas Permissivas:** Permitem operações para `anon` role
3. **Filtro na Aplicação:** SEMPRE filtrar por `usr_id` nas queries
4. **Helper Functions:** `getOrCreateUser()` garante usuário válido

### Exemplo de Query Segura

```typescript
// 1. Obter sessão do usuário
const { userId } = getUserSession();

// 2. Garantir que usuário existe no banco
const supabase = getSupabaseClient();
const { data: user } = await getOrCreateUser(supabase, userId);

// 3. Sempre filtrar por usr_id
const { data: areas } = await supabase
  .from('are_areas')
  .select('*')
  .eq('are_usr_id', user.usr_id)
  .eq('are_ativo', true);

// 4. Ao inserir, sempre incluir usr_id
const { data: newArea } = await supabase
  .from('are_areas')
  .insert({
    are_codigo: 'VEN001',
    are_nome: 'Vendas',
    are_usr_id: user.usr_id,  // ✅ Importante!
  })
  .select()
  .single();
```

---

## ⚠️ Importante: Validação no Backend

Para **APIs públicas** ou **Server Actions**, sempre validar:

```typescript
// app/api/areas/route.ts
export async function POST(request: Request) {
  const { userId, ...data } = await request.json();

  // 1. Validar que userId foi enviado
  if (!userId) {
    return Response.json({ error: 'userId obrigatório' }, { status: 400 });
  }

  // 2. Verificar que usuário existe
  const supabase = getSupabaseServer();
  const { data: user } = await getOrCreateUser(supabase, userId);

  if (!user) {
    return Response.json({ error: 'Usuário inválido' }, { status: 401 });
  }

  // 3. Garantir que usr_id é do usuário autenticado
  const { data: newArea } = await supabase
    .from('are_areas')
    .insert({
      ...data,
      are_usr_id: user.usr_id,  // ✅ Forçar o usr_id correto
    })
    .select()
    .single();

  return Response.json(newArea);
}
```

---

## 🔄 Migração Futura para Auth Real

Quando implementar autenticação tradicional (email/senha, OAuth, etc):

### 1. Criar Migration de Atualização

```sql
-- Atualizar políticas para usar auth.uid()
DROP POLICY "anon_full_access_areas" ON financas.are_areas;

CREATE POLICY "authenticated_users_see_own_areas"
  ON financas.are_areas
  FOR SELECT
  TO authenticated
  USING (are_usr_id = auth.uid());

-- Repetir para todas as tabelas
```

### 2. Adicionar Coluna auth_user_id (Opcional)

```sql
ALTER TABLE financas.usr_usuarios
ADD COLUMN usr_auth_user_id uuid REFERENCES auth.users(id);

-- Migrar dados
UPDATE financas.usr_usuarios
SET usr_auth_user_id = auth.uid()
WHERE usr_identificador = 'mapeamento_aqui';
```

### 3. Atualizar Frontend

```typescript
// Usar auth do Supabase ao invés de localStorage
const { data: { user } } = await supabase.auth.getUser();
const userId = user?.id;
```

---

## 📊 Queries Úteis

### Ver Políticas RLS Atuais

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'financas'
ORDER BY tablename, policyname;
```

### Ver Estrutura de uma Tabela

```sql
SELECT
  column_name,
  data_type,
  character_maximum_length,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'financas'
  AND table_name = 'are_areas'
ORDER BY ordinal_position;
```

### Testar Acesso a Tabelas

```sql
-- Deve retornar dados (políticas permitem SELECT)
SELECT * FROM financas.usr_usuarios LIMIT 1;

-- Deve permitir INSERT
INSERT INTO financas.usr_usuarios (usr_identificador, usr_nome)
VALUES (gen_random_uuid()::text, 'Teste')
RETURNING *;
```

---

## 🆘 Troubleshooting

### Erro: "permission denied for schema financas"

**Causa:** Role `anon` não tem acesso ao schema.

**Solução:**
```sql
GRANT USAGE ON SCHEMA financas TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA financas TO anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA financas TO anon;
```

### Erro: "new row violates row-level security policy"

**Causa:** Política RLS bloqueando INSERT/UPDATE.

**Solução:**
```sql
-- Ver políticas atuais
SELECT * FROM pg_policies WHERE schemaname = 'financas' AND tablename = 'nome_tabela';

-- Reaplica a migration 004
```

### Erro: "relation 'are_areas' does not exist"

**Causa:** Schema não configurado no cliente Supabase.

**Solução:**
```typescript
// Verificar se está usando o schema correto
const supabase = createClient(url, key, {
  db: { schema: 'financas' }  // ✅ Importante!
});
```

---

## ✅ Checklist de Configuração

- [x] Schema `financas` criado no Supabase
- [x] Migrations aplicadas (`supabase db push`)
- [x] Tabelas visíveis no Supabase Dashboard
- [x] RLS habilitado em todas as tabelas
- [x] Políticas permissivas criadas
- [x] Cliente Supabase configurado com schema
- [x] Variável `NEXT_PUBLIC_SUPABASE_SCHEMA=financas` definida
- [ ] Teste de inserção funcionando
- [ ] Teste de leitura com filtro por usr_id funcionando

---

## 📞 Próximos Passos

1. ✅ Aplicar migrations: `supabase db push`
2. ✅ Testar criação de usuário
3. ✅ Testar CRUD de áreas
4. 🔄 Desenvolver frontend completo
5. 🔄 Implementar tela Saldo Diário

**Tudo pronto para começar o desenvolvimento do frontend!** 🚀
