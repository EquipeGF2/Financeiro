import { getSupabaseServer } from "@/lib/supabaseClient";

export default async function Page() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.from("teste_ci").select("*").limit(5);

  return (
    <main>
      <h1>Financeiro — Smoke Test</h1>
      <p>Schema: <b>{process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public"}</b></p>
      {error ? <pre style={{color:"crimson"}}>{JSON.stringify(error, null, 2)}</pre>
             : <pre>{JSON.stringify(data, null, 2)}</pre>}
    </main>
  );
}
