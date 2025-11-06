// Front_Web/app/page.tsx
import { getSupabaseServer } from "../lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function parseTablesEnv(): string[] {
  const raw = process.env.NEXT_PUBLIC_FINANCAS_TABLES || "";
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // fallback inteligente
  return list.length ? list : ["usr_usuarios", "categorias", "movimentacoes"];
}

export default async function Page() {
  const supabase = getSupabaseServer();
  const tables = parseTablesEnv();

  // dispara consultas em paralelo
  const results = await Promise.all(
    tables.map(async (tname) => {
      const { data, error } = await supabase
        .from(tname)
        .select("*")
        .order("id", { ascending: false })
        .limit(5);
      return { tname, data, error };
    })
  );

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Financeiro — Smoke Test</h1>
      <p>
        Schema: <b>financas</b> | Tabelas:{" "}
        <code>{tables.join(", ") || "(nenhuma configurada)"}</code>
      </p>

      {results.map(({ tname, data, error }) => (
        <section key={tname} style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 4 }}>{tname}</h3>
          {error ? (
            <pre style={{ color: "crimson", background: "#fff5f5", padding: 12 }}>
              {JSON.stringify(error, null, 2)}
            </pre>
          ) : (
            <pre style={{ background: "#f6f8fa", padding: 12 }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </section>
      ))}

      <p style={{ marginTop: 16 }}>
        Healthcheck: <code>/api/health</code>
      </p>
    </main>
  );
}
