import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { getUserId } from "./userSession";

// ENV obrigatórias
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SCHEMA = "financas" as const;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY na Vercel."
    );
  }
}

/** Cliente para uso em Server Components / Route Handlers */
export function getSupabaseServer() {
  assertEnv();
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
  });
}

/** Cliente para uso em Client Components (browser) */
type ClientOptions = {
  /**
   * Define se o cabeçalho de sessão (x-user-id) deve ser enviado automaticamente.
   * Útil para chamadas internas que já definiram manualmente o cabeçalho.
   */
  includeSessionHeader?: boolean;
  /**
   * Cabeçalhos adicionais a serem enviados com todas as requisições.
   */
  headers?: Record<string, string | undefined>;
};

export function getSupabaseClient(options: ClientOptions = {}) {
  assertEnv();
  if (typeof window === "undefined") {
    throw new Error("getSupabaseClient() só pode ser usado no browser");
  }

  const sessionHeaders: Record<string, string> = {};

  if (options.includeSessionHeader !== false) {
    const userId = getUserId();
    if (userId) {
      sessionHeaders["x-user-id"] = userId;
    }
  }

  const extraHeaders = Object.entries(options.headers ?? {}).reduce(
    (acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }
      return acc;
    },
    {} as Record<string, string>
  );

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: SCHEMA },
    global: {
      headers: {
        ...sessionHeaders,
        ...extraHeaders,
      },
    },
  });
}

/** Helper opcional */
type AnySupabaseClient = SupabaseClient<any, any, any>;

export type UsuarioRow = {
  usr_id: string;
  usr_identificador: string;
  usr_nome: string | null;
  usr_email: string | null;
  usr_ativo: boolean;
};

function normalizeNullableString(value: string | null | undefined): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return value ?? null;
}

export async function getOrCreateUser(
  supabase: AnySupabaseClient,
  identificador: string,
  nome?: string | null,
  email?: string | null
) : Promise<{ data: UsuarioRow | null; error: PostgrestError | null }> {
  const { data: existing, error: findErr } = await supabase
    .from("usr_usuarios")
    .select("*")
    .eq("usr_identificador", identificador)
    .maybeSingle();
  if (findErr) return { data: null, error: findErr };
  const existingRow = (existing ?? null) as UsuarioRow | null;
  if (existingRow) {
    const updates: Partial<Pick<UsuarioRow, "usr_nome" | "usr_email">> = {};
    if (typeof nome !== "undefined") {
      const nomeNormalizado = normalizeNullableString(nome);
      if (nomeNormalizado !== existingRow.usr_nome) {
        updates.usr_nome = nomeNormalizado;
      }
    }
    if (typeof email !== "undefined") {
      const emailNormalizado = normalizeNullableString(email);
      if (emailNormalizado !== existingRow.usr_email) {
        updates.usr_email = emailNormalizado;
      }
    }

    if (Object.keys(updates).length > 0) {
      const { data: updated, error: updateErr } = await supabase
        .from("usr_usuarios")
        .update(updates)
        .eq("usr_id", existingRow.usr_id)
        .select()
        .single();

      if (updateErr) {
        return { data: null, error: updateErr };
      }

      return { data: (updated as UsuarioRow) ?? null, error: null };
    }

    return { data: existingRow, error: null };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("usr_usuarios")
    .insert({
      usr_identificador: identificador,
      usr_nome: normalizeNullableString(nome),
      usr_email: normalizeNullableString(email),
      usr_ativo: true,
    })
    .select()
    .single();

  return {
    data: (inserted as UsuarioRow | null) ?? null,
    error: insertErr ?? null,
  };
}
