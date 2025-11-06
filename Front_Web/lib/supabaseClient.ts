import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** ⚙️ ENV obrigatórias (Vercel → Project → Settings → Environment Variables) */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Schema padrão do app */
const SCHEMA = "financas" as const;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Env faltando: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
}

/** Cliente para uso no servidor (Server Components/Route Handlers) */
export function getSupabaseServer(): SupabaseClient {
  assertEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
  });
}

/** Cliente para uso no browser (Client Components) */
export function getSupabaseClient(): SupabaseClient {
  assertEnv();
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser usado no browser");
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
  });
}

/**
 * Helper: busca usuário por identificador; cria se não existir.
 * Tabela esperada: financas.usr_usuarios (como o client já está em 'financas',
 * usamos somente o nome simples da tabela).
 */
export async function getOrCreateUser(
  supabase: SupabaseClient,
  identificador: string,
  nome?: string
) {
  // tenta achar; maybeSingle() evita erro quando não há linhas (retorna null)
  const { data: existing, error: findErr } = await supabase
    .from("usr_usuarios")
    .select("*")
    .eq("usr_identificador", identificador)
    .maybeSingle();

  if (findErr) return { data: null, error: findErr };
  if (existing) return { data: existing, error: null };

  // cria se não existir
  const { data: inserted, error: insertErr } = await supabase
    .from("usr_usuarios")
    .insert({
      usr_identificador: identificador,
      usr_nome: nome ?? null,
      usr_ativo: true,
    })
    .select()
    .single();

  return { data: inserted ?? null, error: insertErr ?? null };
}
