# Frontend - Sistema Financeiro

## 🎨 Visão Geral

Interface moderna e responsiva construída com Next.js 14 (App Router) e TypeScript, utilizando as cores da empresa (vermelho e branco).

---

## 🏗️ Estrutura de Pastas

```
Front_Web/
├── app/
│   ├── layout.tsx                    # Layout raiz com metadata
│   ├── page.tsx                      # Página inicial / redirect
│   │
│   ├── saldo-diario/
│   │   └── page.tsx                  # Tela principal - 4 blocos
│   │
│   ├── cadastros/
│   │   ├── areas/
│   │   │   ├── page.tsx              # Listagem de áreas
│   │   │   ├── novo/page.tsx         # Criar nova área
│   │   │   └── [id]/editar/page.tsx  # Editar área
│   │   │
│   │   ├── contas-receita/
│   │   │   ├── page.tsx
│   │   │   ├── novo/page.tsx
│   │   │   └── [id]/editar/page.tsx
│   │   │
│   │   └── bancos/
│   │       ├── page.tsx
│   │       ├── novo/page.tsx
│   │       └── [id]/editar/page.tsx
│   │
│   └── api/
│       ├── health/route.ts
│       └── user-session/route.ts     # API para gerenciar sessão
│
├── components/
│   ├── ui/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Table.tsx
│   │   ├── Modal.tsx
│   │   └── Loading.tsx
│   │
│   ├── forms/
│   │   ├── AreaForm.tsx
│   │   ├── ContaReceitaForm.tsx
│   │   ├── BancoForm.tsx
│   │   └── MathInput.tsx             # Input com calculadora
│   │
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Navigation.tsx
│   │   └── UserIdentifier.tsx
│   │
│   └── saldo-diario/
│       ├── BlocoPagamentosArea.tsx
│       ├── BlocoReceitas.tsx
│       ├── BlocoPagamentosBanco.tsx
│       └── BlocoSaldoBanco.tsx
│
├── lib/
│   ├── supabaseClient.ts             # Cliente Supabase
│   ├── userSession.ts                # Gestão de sessão sem login
│   ├── mathParser.ts                 # Parser de expressões matemáticas
│   └── utils.ts                      # Funções utilitárias
│
├── styles/
│   └── globals.css                   # Estilos globais + design system
│
├── types/
│   └── database.types.ts             # Tipos gerados do Supabase
│
└── public/
    └── logo.png                      # Logo da empresa
```

---

## 🎨 Design System

### Paleta de Cores

```css
/* globals.css */
:root {
  /* Vermelho da Empresa - Primária */
  --color-primary-600: #DC2626;
  --color-primary-500: #EF4444;
  --color-primary-400: #F87171;
  --color-primary-300: #FCA5A5;

  /* Branco e Cinzas - Secundária */
  --color-white: #FFFFFF;
  --color-gray-50: #F9FAFB;
  --color-gray-100: #F3F4F6;
  --color-gray-200: #E5E7EB;
  --color-gray-300: #D1D5DB;
  --color-gray-500: #6B7280;
  --color-gray-700: #374151;
  --color-gray-900: #111827;

  /* Status */
  --color-success: #10B981;
  --color-warning: #F59E0B;
  --color-error: #EF4444;
  --color-info: #3B82F6;

  /* Sombras */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* Bordas */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Espaçamentos */
  --spacing-1: 0.25rem;   /* 4px */
  --spacing-2: 0.5rem;    /* 8px */
  --spacing-3: 0.75rem;   /* 12px */
  --spacing-4: 1rem;      /* 16px */
  --spacing-6: 1.5rem;    /* 24px */
  --spacing-8: 2rem;      /* 32px */
}
```

### Tipografia

```css
/* Fontes */
--font-primary: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Courier New', monospace;

/* Tamanhos */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
--text-3xl: 1.875rem;   /* 30px */

/* Pesos */
--font-normal: 400;
--font-medium: 500;
--font-semibold: 600;
--font-bold: 700;
```

---

## 🧩 Componentes Base

### 1. Button

```tsx
// components/ui/Button.tsx
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

// Estilos:
// primary: fundo vermelho, texto branco
// secondary: fundo cinza, texto escuro
// outline: borda vermelha, texto vermelho
// danger: fundo vermelho escuro, texto branco
```

### 2. Input

```tsx
// components/ui/Input.tsx
interface InputProps {
  label?: string;
  error?: string;
  type?: 'text' | 'number' | 'date' | 'email';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}

// Features:
// - Label flutuante
// - Mensagem de erro em vermelho
// - Borda vermelha ao focar
// - Ícone de erro/sucesso
```

### 3. MathInput (Calculadora Integrada)

```tsx
// components/forms/MathInput.tsx
interface MathInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onCalculate?: (result: number) => void;
}

// Features:
// - Aceita expressões: "10+5", "100/2", "50*3", "200-50"
// - Mostra resultado em tempo real
// - Ao pressionar Enter ou blur, substitui pela resultado
// - Validação de expressão matemática
// - Suporte a parênteses: "(10+5)*2"

// Exemplo de uso:
// Input: "100+50*2"
// Display: "100+50*2 = 200"
// Ao salvar: value = "200"
```

### 4. Card

```tsx
// components/ui/Card.tsx
interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'primary' | 'danger';
}

// Estilos:
// - Fundo branco
// - Sombra sutil
// - Borda arredondada
// - Padding interno
// - Variantes com borda colorida
```

### 5. Table

```tsx
// components/ui/Table.tsx
interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

// Features:
// - Linhas alternadas (zebra)
// - Hover vermelho claro
// - Ordenação por coluna
// - Paginação
// - Loading skeleton
```

---

## 📱 Telas Principais

### 1. Tela Saldo Diário (Principal)

```
┌─────────────────────────────────────────────────────┐
│  SALDO DIÁRIO - 06/11/2025                          │
├─────────────────────┬───────────────────────────────┤
│                     │                               │
│  PAGAMENTOS POR     │  RECEITAS POR CONTA          │
│  ÁREA               │                               │
│                     │                               │
│  [Lista + Adicionar]│  [Lista + Adicionar]          │
│                     │                               │
├─────────────────────┼───────────────────────────────┤
│                     │                               │
│  PAGAMENTOS POR     │  SALDO POR BANCO             │
│  BANCO              │                               │
│                     │                               │
│  [Lista + Adicionar]│  [Lista + Saldo Total]        │
│                     │                               │
└─────────────────────┴───────────────────────────────┘
```

**Funcionalidades:**
- 4 blocos (cards) lado a lado (grid 2x2)
- Cada bloco:
  - Título e total do dia
  - Lista de registros (últimos 5)
  - Botão "+" para adicionar
  - Modal para inserção rápida
- Input com calculadora integrada
- Atualização em tempo real
- Totalizadores no topo de cada bloco

### 2. Telas de Cadastro (Áreas, Contas, Bancos)

```
┌─────────────────────────────────────────────────────┐
│  ← ÁREAS                                   [+ Novo]  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [Buscar...]                          [Filtros ▼]   │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Código │ Nome           │ Ativo │ Ações       │ │
│  ├────────┼────────────────┼───────┼─────────────┤ │
│  │ VEN001 │ Vendas         │  ✓    │ [✏️] [🗑️]  │ │
│  │ MKT001 │ Marketing      │  ✓    │ [✏️] [🗑️]  │ │
│  │ TI001  │ TI             │  ✓    │ [✏️] [🗑️]  │ │
│  └────────┴────────────────┴───────┴─────────────┘ │
│                                                      │
│  Mostrando 3 de 3 registros              [1] 2 3 >  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Listagem em tabela
- Busca em tempo real
- Filtros (ativo/inativo)
- Ações: Editar, Excluir (soft delete)
- Paginação
- Ordenação por coluna
- Modal de confirmação para exclusão

### 3. Formulários (Novo/Editar)

```
┌─────────────────────────────────────────────────────┐
│  ← NOVA ÁREA                                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Código *                                            │
│  [VEN001________________]                            │
│                                                      │
│  Nome *                                              │
│  [Vendas________________]                            │
│                                                      │
│  Descrição                                           │
│  [________________________]                          │
│  [________________________]                          │
│  [________________________]                          │
│                                                      │
│  [ ] Ativo                                           │
│                                                      │
│              [Cancelar]  [Salvar]                    │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**Funcionalidades:**
- Validação em tempo real
- Campos obrigatórios marcados com *
- Mensagens de erro claras
- Auto-foco no primeiro campo
- Atalhos de teclado (Esc = cancelar, Ctrl+S = salvar)

---

## ⚙️ Funcionalidades Especiais

### 1. Sistema de Usuário Sem Login

```tsx
// lib/userSession.ts
export function getUserId(): string {
  const stored = localStorage.getItem('financeiro_user_id');
  if (stored) return stored;

  const newId = crypto.randomUUID();
  localStorage.setItem('financeiro_user_id', newId);
  return newId;
}

export function getUserName(): string | null {
  return localStorage.getItem('financeiro_user_name');
}

export function setUserName(name: string) {
  localStorage.setItem('financeiro_user_name', name);
}
```

**Uso:**
- Primeira visita: gera UUID
- Armazena no localStorage
- Header mostra: "Olá, [Nome]" ou "Usuário Anônimo"
- Possibilidade de definir nome/apelido

### 2. Calculadora Integrada

```tsx
// lib/mathParser.ts
export function evaluateMath(expression: string): number | null {
  try {
    // Remove espaços
    const clean = expression.replace(/\s/g, '');

    // Valida caracteres permitidos
    if (!/^[0-9+\-*/(). ]+$/.test(clean)) {
      return null;
    }

    // Avalia expressão (usar biblioteca math.js ou Function)
    const result = new Function(`return ${clean}`)();

    return typeof result === 'number' && !isNaN(result) ? result : null;
  } catch {
    return null;
  }
}

// Uso no MathInput
const handleBlur = () => {
  const result = evaluateMath(value);
  if (result !== null) {
    onChange(result.toString());
  }
};
```

### 3. Atualização em Tempo Real

```tsx
// Hook para subscription Supabase
export function useRealtimeTable(table: string, userId: string) {
  const [data, setData] = useState([]);

  useEffect(() => {
    const supabase = getSupabaseClient();

    // Busca inicial
    fetchData();

    // Subscription
    const subscription = supabase
      .channel(`public:${table}`)
      .on('postgres_changes',
        { event: '*', schema: 'financas', table },
        (payload) => {
          // Atualiza data baseado no payload
          handleRealtimeUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [table, userId]);

  return data;
}
```

---

## 🎯 Boas Práticas

### 1. Server vs Client Components

```tsx
// ✅ Server Component (padrão)
export default async function AreasPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase.from('are_areas').select('*');

  return <AreasList areas={data} />;
}

// ✅ Client Component (apenas quando necessário)
'use client';
export function AreaForm({ onSubmit }) {
  const [nome, setNome] = useState('');
  // ... interatividade
}
```

### 2. Loading States

```tsx
// Usar Suspense + loading.tsx
// app/cadastros/areas/loading.tsx
export default function Loading() {
  return <SkeletonTable rows={5} />;
}

// Ou loading states manuais
{loading ? <Spinner /> : <Table data={data} />}
```

### 3. Error Handling

```tsx
// app/cadastros/areas/error.tsx
'use client';
export default function Error({ error, reset }) {
  return (
    <div className="error-container">
      <h2>Algo deu errado</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Tentar novamente</button>
    </div>
  );
}
```

### 4. Otimizações

- Usar `React.memo` para componentes pesados
- Lazy load de modais e componentes grandes
- Debounce em inputs de busca
- Virtual scrolling para listas grandes
- Image optimization com `next/image`

---

## 📦 Dependências Adicionais

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "next": "14.2.4",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "mathjs": "^12.0.0",              // Parser matemático
    "date-fns": "^3.0.0",             // Manipulação de datas
    "clsx": "^2.0.0",                 // Conditional classes
    "react-hot-toast": "^2.4.0"       // Notificações
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/react": "^18.2.45",
    "@types/react-dom": "^18.2.18",
    "@types/node": "^20.11.0",
    "tailwindcss": "^3.4.0",          // CSS utility (opcional)
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

---

## 🚀 Performance

### Métricas Alvo

- **First Contentful Paint:** < 1.5s
- **Largest Contentful Paint:** < 2.5s
- **Time to Interactive:** < 3.5s
- **Cumulative Layout Shift:** < 0.1

### Estratégias

1. Server Components por padrão
2. Code splitting automático do Next.js
3. Lazy loading de componentes pesados
4. Otimização de imagens
5. Caching de queries Supabase
6. Minimização de JavaScript
