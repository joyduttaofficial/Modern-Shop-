import { Client } from "pg";
const client = new Client({
  user: "postgres",
  password: "Joy@398878j",
  host: "db.qwqdjdvxzljuhyczemub.supabase.co",
  port: 5432,
  database: "postgres",
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  console.log("Connected!");
  console.log("Testing banks query...");
  const t0 = Date.now();
  const res = await client.query("SELECT * FROM public.banks");
  console.log(`SELECT banks took ${Date.now() - t0}ms, count: ${res.rows.length}`);
  
  console.log("Testing insert bank...");
  const t1 = Date.now();
  await client.query("INSERT INTO public.banks (name, balance) VALUES ('Test Cash 99', 100) ON CONFLICT (name) DO NOTHING");
  console.log(`INSERT bank took ${Date.now() - t1}ms`);
  
  await client.end();
}
run();
