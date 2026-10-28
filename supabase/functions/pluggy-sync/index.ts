// Edge Function "pluggy-sync" — traz as transações dos bancos e cartões (Open Finance via
// MeuPluggy/Pluggy) para o app Orçamento 2026.
//
// Segredos (Supabase › Edge Functions › Secrets): PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET.
// SUPABASE_URL e SUPABASE_ANON_KEY já existem em toda Edge Function.
//
// Regras para não contar gasto em dobro:
//  • Cartão de crédito: cada compra entra em "Cartões"; o pagamento da fatura é ignorado.
//  • Conta corrente: o débito do pagamento de fatura e as transferências entre contas suas são ignorados.
//  • Só entram transações lançadas (POSTED), a partir da data escolhida no app.
//  • Uma transação nunca entra duas vezes (o id do banco vira o id do lançamento).
import { createClient } from "npm:@supabase/supabase-js@2.100.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const PLUGGY = "https://api.pluggy.ai";

type Tx = {
  id: string; date: string; description: string; amount: number; type: "DEBIT" | "CREDIT";
  status?: string; category?: string | null; operationType?: string | null;
  creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } | null;
};

// Data local de São Paulo (UTC−3) no formato YYYY-MM-DD
const dataLocal = (iso: string) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

function categoriaDe(t: Tx): string {
  const s = `${t.category ?? ""} ${t.description ?? ""}`.toLowerCase();
  if (/luz|energia|enel|eletropaulo|vivo|telefon|internet|condom|aluguel|sabesp|g[aá]s\b/.test(s)) return "casa";
  if (/combust|posto|shell|ipiranga|ipva|seguro auto|ve[ií]cul|byd|estacion|ped[aá]gio|sem parar|uber|99app|\b99\b/.test(s)) return "carros";
  if (/farm[aá]c|drogari|drogasil|raia|sa[uú]de|hospital|cl[ií]nic|laborat|care plus|unimed|amil|odonto/.test(s)) return "saude";
  if (/fies|escola|col[eé]gio|curso|faculdade|universidad|educa/.test(s)) return "educacao";
  if (/empr[eé]st|consign|portoseg|parcela.*(empr|cr[eé]d)|juros|iof|financiam/.test(s)) return "emprestimos";
  return "outros";
}

const ehPagamentoFatura = (t: Tx) =>
  t.operationType === "PAGAMENTO_FATURA" || /pagamento.*fatura|pgto.*fatura|pag.*cart[aã]o|fatura cart/i.test(t.description ?? "");
const ehMesmaTitularidade = (t: Tx) =>
  t.operationType === "TRANSFERENCIA_MESMA_INSTITUICAO" || /mesma titularidade|entre contas|transf.*pr[oó]pria/i.test(t.description ?? "");

async function pluggy(path: string, apiKey: string) {
  const r = await fetch(PLUGGY + path, { headers: { "X-API-KEY": apiKey } });
  if (!r.ok) throw new Error(`Pluggy ${path.split("?")[0]} respondeu ${r.status}`);
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ erro: "Entre no app para sincronizar." }, 401);

    const clientId = Deno.env.get("PLUGGY_CLIENT_ID"), clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ erro: "Faltam as chaves da Pluggy nos segredos da função." }, 500);

    // Configuração salva pelo app: { itens: ["item-id", ...], desde: "YYYY-MM-DD" }
    const { data: cfgRow } = await sb.from("docs").select("dados").eq("colecao", "config").eq("doc_id", "bancos").maybeSingle();
    const cfg = (cfgRow?.dados ?? {}) as { itens?: string[]; desde?: string };
    const itens = (cfg.itens ?? []).map((s) => s.trim()).filter(Boolean);
    if (!itens.length) return json({ erro: "Nenhum banco conectado ainda (cole os Item IDs no app)." }, 400);
    const desde = cfg.desde || new Date().toISOString().slice(0, 8) + "01";

    const a = await fetch(PLUGGY + "/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    if (!a.ok) return json({ erro: `A Pluggy recusou as chaves (${a.status}).` }, 502);
    const { apiKey } = await a.json();

    const novos: Record<string, unknown>[] = [];
    const contas: { nome: string; tipo: string; lidas: number; entram: number }[] = [];
    const agora = Date.now();

    for (const itemId of itens) {
      const { results: accs } = await pluggy(`/accounts?itemId=${encodeURIComponent(itemId)}`, apiKey);
      for (const acc of accs ?? []) {
        const nomeConta = acc.marketingName || acc.name || (acc.type === "CREDIT" ? "Cartão" : "Conta");
        let page = 1, totalPages = 1, lidas = 0, entram = 0;
        do {
          const r = await pluggy(`/transactions?accountId=${acc.id}&from=${desde}&pageSize=500&page=${page}`, apiKey);
          totalPages = r.totalPages ?? 1;
          for (const t of (r.results ?? []) as Tx[]) {
            lidas++;
            if (t.status && t.status !== "POSTED") continue;
            let tipo: "despesa" | "receita", categoria: string | null;
            if (acc.type === "CREDIT") {
              if (t.amount <= 0 || ehPagamentoFatura(t)) continue; // pagamento/estorno da fatura
              tipo = "despesa"; categoria = "cartoes";
            } else {
              if (ehPagamentoFatura(t) || ehMesmaTitularidade(t)) continue;
              tipo = t.type === "CREDIT" ? "receita" : "despesa";
              categoria = tipo === "receita" ? null : categoriaDe(t);
            }
            const parc = t.creditCardMetadata?.totalInstallments && t.creditCardMetadata.totalInstallments > 1
              ? ` (${t.creditCardMetadata.installmentNumber}/${t.creditCardMetadata.totalInstallments})` : "";
            novos.push({
              user_id: user.id, colecao: "lancamentos", doc_id: "pg-" + t.id,
              dados: {
                data: dataLocal(t.date), descricao: (t.description || "Sem descrição").trim() + parc,
                valor: Math.round(Math.abs(t.amount) * 100), tipo, categoria,
                origem: "banco", conta: nomeConta, criadoEm: agora,
              },
            });
            entram++;
          }
          page++;
        } while (page <= totalPages);
        contas.push({ nome: nomeConta, tipo: acc.type, lidas, entram });
      }
    }

    // Só insere o que ainda não existe: edições e exclusões feitas no app são respeitadas.
    let inseridos = 0;
    for (let i = 0; i < novos.length; i += 500) {
      const lote = novos.slice(i, i + 500);
      const { data, error } = await sb.from("docs").upsert(lote, { onConflict: "user_id,colecao,doc_id", ignoreDuplicates: true }).select("doc_id");
      if (error) throw new Error(error.message);
      inseridos += data?.length ?? 0;
    }

    await sb.from("docs").upsert({
      user_id: user.id, colecao: "config", doc_id: "bancos",
      dados: { ...cfg, ultimaSync: new Date().toISOString(), ultimoResumo: { contas, inseridos } },
    });

    return json({ ok: true, desde, inseridos, contas });
  } catch (e) {
    return json({ erro: String((e as Error).message ?? e) }, 500);
  }
});
