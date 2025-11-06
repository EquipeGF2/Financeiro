// Front_Web/app/page.tsx
import { getSupabaseServer } from "../lib/supabaseClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page() {
  const supabase = getSupabaseServer();

  // como o client já está no schema 'financas', basta o nome simples:
  const { data, error } = await supabase
    .from('teste_ci')
    .select('*')
    .order('id', { ascending: false })
    .limit(5);

  return (
    <main>
      <h1>Financeiro — Smoke Test</h1>
      <p>Schema: <b>financas</b> | Fonte: <b>teste_ci</b></p>

      {error ? (
        <pre style={{ color: "crimson" }}>{JSON.stringify(error, null, 2)}</pre>
      ) : (
        <pre>{JSON.stringify(data, null, 2)}</pre>
      )}

      <p style={{ marginTop: 12 }}>
        Healthcheck: <code>/api/health</code>
      </p>
    </main>
  );
}
