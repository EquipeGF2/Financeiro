# Arquitetura do Sistema Financeiro

## 📐 Visão Geral

O sistema Financeiro é uma aplicação web full-stack construída com arquitetura moderna e serverless, focada em gestão financeira com controle de pagamentos, receitas e saldos bancários.

## 🏗️ Componentes Principais

### 1. Frontend (Next.js)

**Tecnologia:** Next.js 14.2.4 com App Router + TypeScript

```
Front_Web/
├── app/
│   ├── layout.tsx              # Layout raiz com metadata
│   ├── page.tsx                # Página inicial (smoke test)
│   ├── saldo-diario/           # Tela principal operacional
│   ├── cadastros/
│   │   ├── areas/              # CRUD de áreas
│   │   ├── contas-receita/     # CRUD de contas de receita
│   │   └── bancos/             # CRUD de bancos
│   └── api/
│       └── health/             # Health check endpoint
├── components/
│   ├── ui/                     # Componentes de UI (design system)
│   ├── forms/                  # Componentes de formulários
│   └── layout/                 # Componentes de layout (nav, header)
├── lib/
│   ├── supabaseClient.ts       # Cliente Supabase
│   ├── userSession.ts          # Gestão de sessão sem login
│   └── mathParser.ts           # Parser de expressões matemáticas
└── styles/
    └── globals.css             # Estilos globais
```

**Características:**
- **Server-Side Rendering (SSR):** Para SEO e performance
- **Server Components:** Padrão do Next.js 14
- **Client Components:** Apenas onde necessário (formulários, interações)
- **API Routes:** Para operações complexas e integrações

### 2. Backend (Supabase)

**Tecnologia:** PostgreSQL 15+ via Supabase Cloud

```
Schema: financas
├── Cadastros (Tabelas Mestras)
│   ├── usr_usuarios           # Usuários (sessão sem login)
│   ├── are_areas              # Áreas de negócio
│   ├── ctr_contas_receita     # Contas de receita
│   └── ban_bancos             # Bancos e contas
│
├── Movimentações (Tabelas Transacionais)
│   ├── pag_pagamentos_area    # Pagamentos por área
│   ├── rec_receitas           # Receitas
│   ├── pbk_pagamentos_banco   # Pagamentos por banco
│   └── sdb_saldo_banco        # Saldos bancários
│
└── Views
    └── v_dashboard_resumo     # View agregada para dashboard
```

**Recursos:**
- **Row Level Security (RLS):** Segurança em nível de linha
- **Triggers:** Auditoria automática (created_at, updated_at, user_id)
- **Functions:** Lógica de negócio no banco
- **Real-time:** Subscriptions para atualização em tempo real

### 3. Deploy e CI/CD

**GitHub Actions → Supabase + Vercel**

```yaml
Fluxo de Deploy:
1. Push para branch main
2. GitHub Actions detecta mudanças
3. Supabase CLI aplica migrations
4. Geração de tipos TypeScript
5. Vercel faz build e deploy do frontend
6. Aplicação disponível em produção
```

## 🔄 Fluxo de Dados

### 1. Identificação de Usuário (Sem Login)

```
Browser → localStorage → userSession.ts → usr_id
                                          ↓
                                    Supabase RLS
                                          ↓
                                    Dados Filtrados
```

**Estratégia:**
- Gera UUID único na primeira visita
- Armazena em localStorage
- Backend usa esse UUID para RLS
- Opcional: Adicionar nome/apelido para identificação visual

### 2. Operações CRUD

```
Frontend (Client Component)
    ↓ (POST/PUT/DELETE)
API Route (Server Component)
    ↓ (Validação)
Supabase Client
    ↓ (RLS + Triggers)
PostgreSQL Database
    ↓ (Response)
Frontend (Atualização UI)
```

### 3. Tela Saldo Diário (4 Blocos)

```
Page Load
    ↓
Server Component busca dados
    ↓
[Bloco 1] Pagamentos por Área  ← SELECT FROM pag_pagamentos_area
[Bloco 2] Receitas por Conta   ← SELECT FROM rec_receitas
[Bloco 3] Pagamentos por Banco ← SELECT FROM pbk_pagamentos_banco
[Bloco 4] Saldo por Banco      ← SELECT FROM sdb_saldo_banco
    ↓
Client Components para interação (adicionar, editar)
```

## 🎨 Design System

### Paleta de Cores

```css
/* Cores Primárias (Vermelho da Empresa) */
--red-600: #DC2626;
--red-500: #EF4444;
--red-400: #F87171;

/* Cores Secundárias (Branco e Cinzas) */
--white: #FFFFFF;
--gray-50: #F9FAFB;
--gray-100: #F3F4F6;
--gray-200: #E5E7EB;
--gray-300: #D1D5DB;
--gray-400: #9CA3AF;
--gray-500: #6B7280;
--gray-600: #4B5563;
--gray-700: #374151;
--gray-800: #1F2937;
--gray-900: #111827;

/* Cores de Status */
--green-500: #10B981;   /* Sucesso */
--yellow-500: #F59E0B;  /* Atenção */
--red-500: #EF4444;     /* Erro */
--blue-500: #3B82F6;    /* Info */
```

### Componentes Base

- **Button:** Vermelho primário, branco secundário
- **Input:** Borda cinza, foco vermelho
- **Card:** Fundo branco, sombra sutil
- **Table:** Linhas alternadas, hover vermelho claro

## 🔐 Segurança

### 1. Row Level Security (RLS)

Todas as tabelas possuem RLS habilitado com políticas baseadas em `usr_id`:

```sql
-- Exemplo: Usuário só vê seus próprios registros
CREATE POLICY "usuarios_veem_apenas_seus_dados"
ON financas.pag_pagamentos_area
FOR SELECT
USING (pag_usr_id = current_setting('app.current_user_id')::uuid);
```

### 2. Validação de Dados

- **Frontend:** Validação básica (required, tipos)
- **API Routes:** Validação completa (Zod schemas)
- **Database:** Constraints e triggers

### 3. Auditoria

Todos os registros possuem:
- `created_at`: Timestamp de criação
- `created_by`: UUID do usuário criador
- `updated_at`: Timestamp da última modificação
- `updated_by`: UUID do último usuário que modificou

## 📊 Performance

### Otimizações

1. **Server Components:** Renderização no servidor
2. **Static Generation:** Páginas de cadastro podem ser ISR
3. **Indexes:** Todas as FKs e campos de busca indexados
4. **Caching:** Cache de queries frequentes (1 minuto)
5. **Lazy Loading:** Componentes carregados sob demanda

### Métricas Alvo

- **LCP (Largest Contentful Paint):** < 2.5s
- **FID (First Input Delay):** < 100ms
- **CLS (Cumulative Layout Shift):** < 0.1
- **Time to Interactive:** < 3.5s

## 🧪 Testes

### Estratégia de Testes

```
1. Unit Tests (Jest)
   - Funções utilitárias
   - Componentes isolados
   - mathParser.ts

2. Integration Tests (Playwright)
   - Fluxos de cadastro
   - Tela Saldo Diário
   - CRUD completo

3. E2E Tests (Playwright)
   - Jornada completa do usuário
   - Smoke tests em produção
```

## 🚀 Deployment

### Ambientes

1. **Development:** `localhost:3000`
2. **Preview:** Vercel preview deployments (PRs)
3. **Production:** `https://financeiro-germani.vercel.app`

### Variáveis de Ambiente

Ver [SETUP.md](./SETUP.md) para configuração completa.

## 📈 Escalabilidade

### Limites Atuais

- **Supabase Free Tier:**
  - 500 MB database
  - 1 GB file storage
  - 2 GB bandwidth/month
  - 50,000 monthly active users

### Plano de Crescimento

1. **Fase 1 (Atual):** MVP com usuários limitados
2. **Fase 2:** Upgrade Supabase Pro ($25/mês)
3. **Fase 3:** Otimizações de queries e caching
4. **Fase 4:** Migração para infraestrutura própria (se necessário)

## 🔄 Manutenção

### Migrations

```bash
# Criar nova migration
supabase migration new nome_da_migration

# Aplicar migrations localmente
supabase db reset

# Deploy migrations (via CI/CD)
git push origin main
```

### Monitoramento

- **Supabase Dashboard:** Queries lentas, errors
- **Vercel Analytics:** Performance, Web Vitals
- **Sentry (futuro):** Error tracking e monitoring

## 📚 Referências

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
