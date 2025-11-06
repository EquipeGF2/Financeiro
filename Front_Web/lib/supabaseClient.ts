import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Cria cliente Supabase para uso no servidor (Server Components)
 */
export function getSupabaseServer(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "financas" } }
  );
}

/**
 * Cria cliente Supabase para uso no cliente (Client Components)
 * Usa variáveis NEXT_PUBLIC_* que são expostas ao browser
 */
export function getSupabaseClient(): SupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error('getSupabaseClient() só pode ser usado em Client Components');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { db: { schema: process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "financas" } }
  );
}

/**
 * Helper para buscar usuário por identificador (UUID do localStorage)
 * Cria o usuário se não existir
 */
export async function getOrCreateUser(
  supabase: SupabaseClient,
  identificador: string,
  nome?: string
) {
  // Busca usuário existente
  const { data: existing, error: searchError } = await supabase
    .from('usr_usuarios')
    .select('*')
    .eq('usr_identificador', identificador)
    .single();

  if (existing) {
    return { data: existing, error: null };
  }

  // Se não existe, cria novo
  const { data: newUser, error: createError } = await supabase
    .from('usr_usuarios')
    .insert({
      usr_identificador: identificador,
      usr_nome: nome || null,
      usr_ativo: true,
    })
    .select()
    .single();

  if (createError) {
    return { data: null, error: createError };
  }

  return { data: newUser, error: null };
}
