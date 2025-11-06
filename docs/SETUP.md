# Setup e Instalação - Sistema Financeiro

## 📋 Pré-requisitos

- **Node.js:** >= 18.17.0 (recomendado: 20.x)
- **npm:** >= 9.0.0 ou **pnpm** >= 8.0.0
- **Git:** >= 2.30.0
- **Conta Supabase:** [https://supabase.com](https://supabase.com)
- **Conta Vercel:** [https://vercel.com](https://vercel.com) (para deploy)

---

## 🚀 Instalação Local

### 1. Clone o Repositório

```bash
git clone https://github.com/EquipeGF2/Financeiro.git
cd Financeiro
```

### 2. Configure o Supabase

#### 2.1. Criar Projeto no Supabase

1. Acesse [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Clique em "New project"
3. Preencha:
   - **Name:** Financeiro
   - **Database Password:** [escolha uma senha forte]
   - **Region:** South America (São Paulo) ou mais próxima
4. Clique em "Create new project"
5. Aguarde a criação (1-2 minutos)

#### 2.2. Obter Credenciais

Na página do projeto, vá em **Settings → API**:

- **Project URL:** `https://xxxxxxxx.supabase.co`
- **Project API Key (anon, public):** `eyJhbGciOiJIUzI1Ni...`
- **Project Reference ID:** `xxxxxxxx` (nas configurações do projeto)

#### 2.3. Aplicar Migrations

```bash
# Instalar Supabase CLI
npm install -g supabase

# Fazer login no Supabase
supabase login

# Linkar ao projeto
supabase link --project-ref [SEU_PROJECT_REFERENCE_ID]
# Quando solicitado, informe a senha do banco de dados

# Aplicar migrations
supabase db push

# Verificar se as tabelas foram criadas
supabase db diff
```

### 3. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp docs/.env.example Front_Web/.env.local

# Editar o arquivo com suas credenciais
nano Front_Web/.env.local
# ou
code Front_Web/.env.local
```

**Preencha com os valores obtidos no passo 2.2:**

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1Ni...
NEXT_PUBLIC_SUPABASE_SCHEMA=financas
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Instalar Dependências

```bash
cd Front_Web
npm install
```

### 5. Rodar o Servidor de Desenvolvimento

```bash
npm run dev
```

Acesse: [http://localhost:3000](http://localhost:3000)

---

## 🗄️ Setup do Banco de Dados (Manual)

Se preferir aplicar as migrations manualmente via SQL:

### 1. Acessar SQL Editor

No dashboard do Supabase, vá em **SQL Editor**.

### 2. Executar Migrations na Ordem

Execute os arquivos SQL em ordem:

1. `supabase/migrations/2025-11-05-000001_init.sql`
2. `supabase/migrations/2025-11-05-000002_move_public_to_financas.sql`
3. `supabase/migrations/2025-11-05-000004_public_bridge_views.sql`
4. `supabase/migrations/2025-11-06-000001_create_user_tables.sql`
5. `supabase/migrations/2025-11-06-000002_create_cadastro_tables.sql`
6. `supabase/migrations/2025-11-06-000003_create_movimentacao_tables.sql`

### 3. Verificar Criação das Tabelas

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'financas'
ORDER BY table_name;
```

Resultado esperado:
- `are_areas`
- `ban_bancos`
- `ctr_contas_receita`
- `pag_pagamentos_area`
- `pbk_pagamentos_banco`
- `rec_receitas`
- `sdb_saldo_banco`
- `usr_usuarios`

---

## 🔐 Configurar GitHub Secrets (CI/CD)

Para que o GitHub Actions funcione, configure os seguintes secrets:

### 1. Acessar Settings do Repositório

1. Vá em **Settings → Secrets and variables → Actions**
2. Clique em **New repository secret**

### 2. Adicionar Secrets

| Nome | Valor | Onde encontrar |
|------|-------|----------------|
| `SUPABASE_ACCESS_TOKEN` | Token de acesso | Supabase Dashboard → Account → Access Tokens |
| `SUPABASE_DB_PASSWORD` | Senha do banco | A senha definida ao criar o projeto |
| `SUPABASE_PROJECT_REF` | ID do projeto | Supabase Dashboard → Settings → General → Reference ID |

### 3. Testar CI/CD

```bash
# Fazer uma alteração em uma migration
git add supabase/migrations/
git commit -m "test: CI/CD"
git push origin main

# Verificar execução em:
# https://github.com/EquipeGF2/Financeiro/actions
```

---

## 🚀 Deploy na Vercel

### 1. Conectar Repositório

1. Acesse [https://vercel.com/new](https://vercel.com/new)
2. Importe o repositório: `EquipeGF2/Financeiro`
3. Configure:
   - **Framework Preset:** Next.js
   - **Root Directory:** `Front_Web`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

### 2. Configurar Variáveis de Ambiente

Na seção **Environment Variables**, adicione:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1Ni...` |
| `NEXT_PUBLIC_SUPABASE_SCHEMA` | `financas` |
| `NEXT_PUBLIC_SITE_URL` | `https://seu-app.vercel.app` |

### 3. Deploy

1. Clique em **Deploy**
2. Aguarde o build (1-3 minutos)
3. Acesse a URL fornecida

### 4. Configurar Domínio (Opcional)

1. Vá em **Settings → Domains**
2. Adicione seu domínio customizado
3. Configure DNS conforme instruções

---

## 🧪 Testar a Instalação

### 1. Health Check

```bash
curl http://localhost:3000/api/health
```

Resposta esperada:
```json
{
  "ok": true,
  "ts": "2025-11-06T12:34:56.789Z"
}
```

### 2. Testar Conexão com Supabase

Acesse: [http://localhost:3000](http://localhost:3000)

Deve exibir:
- Título: "Financeiro — Smoke Test"
- Schema: `financas`
- Lista de registros da tabela `teste_ci` (vazia ou com dados)

### 3. Testar Cadastro de Área

1. Acesse: [http://localhost:3000/cadastros/areas](http://localhost:3000/cadastros/areas)
2. Clique em "Novo"
3. Preencha:
   - Código: `VEN001`
   - Nome: `Vendas`
4. Salve
5. Verifique se aparece na listagem

---

## 🐛 Troubleshooting

### Erro: "Invalid API Key"

**Causa:** Variável `NEXT_PUBLIC_SUPABASE_ANON_KEY` incorreta.

**Solução:**
1. Verifique a chave em Supabase Dashboard → Settings → API
2. Certifique-se de copiar a chave **anon/public** (não a service_role)
3. Reinicie o servidor: `npm run dev`

### Erro: "relation 'financas.are_areas' does not exist"

**Causa:** Migrations não foram aplicadas.

**Solução:**
```bash
supabase db push
# ou aplique manualmente via SQL Editor
```

### Erro: "localStorage is not defined"

**Causa:** Tentativa de usar localStorage em Server Component.

**Solução:**
- Use `'use client'` no componente que usa localStorage
- Ou mova a lógica para um Client Component

### Erro ao fazer push no GitHub: "403 Forbidden"

**Causa:** Nome do branch não segue o padrão `claude/*`.

**Solução:**
```bash
# Criar branch com nome correto
git checkout -b claude/sua-feature-nome
git push -u origin claude/sua-feature-nome
```

### Portal Supabase não carrega

**Causa:** Possível problema de rede ou bloqueio.

**Solução:**
1. Verifique conexão com internet
2. Tente em outra rede
3. Desabilite VPN/proxy temporariamente

---

## 📊 Dados de Teste (Seed)

Para popular o banco com dados de exemplo:

```sql
-- Criar usuário de teste
INSERT INTO financas.usr_usuarios (usr_identificador, usr_nome)
VALUES ('12345678-1234-1234-1234-123456789012', 'Usuário Teste');

-- Criar áreas
INSERT INTO financas.are_areas (are_codigo, are_nome, are_usr_id)
VALUES
  ('VEN001', 'Vendas', (SELECT usr_id FROM financas.usr_usuarios LIMIT 1)),
  ('MKT001', 'Marketing', (SELECT usr_id FROM financas.usr_usuarios LIMIT 1)),
  ('TI001', 'TI', (SELECT usr_id FROM financas.usr_usuarios LIMIT 1));

-- Criar contas de receita
INSERT INTO financas.ctr_contas_receita (ctr_codigo, ctr_nome, ctr_usr_id)
VALUES
  ('REC001', 'Vendas Produto A', (SELECT usr_id FROM financas.usr_usuarios LIMIT 1)),
  ('REC002', 'Serviços', (SELECT usr_id FROM financas.usr_usuarios LIMIT 1));

-- Criar bancos
INSERT INTO financas.ban_bancos (ban_codigo, ban_nome, ban_numero_conta, ban_saldo_inicial, ban_usr_id)
VALUES
  ('BB001', 'Banco do Brasil', '12345-6', 10000.00, (SELECT usr_id FROM financas.usr_usuarios LIMIT 1)),
  ('CEF001', 'Caixa Econômica', '67890-1', 5000.00, (SELECT usr_id FROM financas.usr_usuarios LIMIT 1));
```

Execute no **SQL Editor** do Supabase.

---

## 🔄 Atualizar o Projeto

### Pull das Últimas Mudanças

```bash
git pull origin main
cd Front_Web
npm install  # Instalar novas dependências
npm run dev
```

### Aplicar Novas Migrations

```bash
supabase db push
```

---

## 📚 Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # Servidor de desenvolvimento
npm run build        # Build para produção
npm run start        # Servidor de produção
npm run lint         # Linter

# Supabase
supabase status      # Status do projeto local
supabase db reset    # Reset do banco local
supabase db diff     # Ver diferenças de schema
supabase gen types typescript --local > types/database.types.ts  # Gerar tipos

# Git
git status           # Ver mudanças
git add .            # Adicionar todos os arquivos
git commit -m "msg"  # Commit com mensagem
git push             # Push para remoto
```

---

## 💡 Próximos Passos

Após setup completo:

1. ✅ Testar todos os CRUDs
2. ✅ Adicionar dados de teste
3. ✅ Verificar funcionamento da calculadora
4. ✅ Testar tela Saldo Diário
5. ✅ Configurar monitoring (opcional)

---

## 📞 Suporte

- **Documentação:** [docs/](./docs/)
- **Issues:** [GitHub Issues](https://github.com/EquipeGF2/Financeiro/issues)
- **Email:** [contato@equipegf2.com](mailto:contato@equipegf2.com)
