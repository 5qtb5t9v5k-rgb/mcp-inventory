import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { config } from "../config.js";
import { parseCurveCsv, getImportStatus } from "../sources/curve/parser.js";
import type { Transaction } from "../sources/curve/types.js";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

async function loadAll(): Promise<Transaction[]> {
  return parseCurveCsv(config.csvPath, config.startDate);
}

function dateInRange(date: string, start?: string, end?: string): boolean {
  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

function sumByKey(
  txns: Transaction[],
  keyFn: (t: Transaction) => string
): { key: string; count: number; totalAmount: number; currency: string }[] {
  const buckets = new Map<string, { count: number; total: number; currencies: Set<string> }>();
  for (const t of txns) {
    const k = keyFn(t);
    const b = buckets.get(k) ?? { count: 0, total: 0, currencies: new Set<string>() };
    b.count += 1;
    b.total += t.amount;
    if (t.currency) b.currencies.add(t.currency);
    buckets.set(k, b);
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    count: b.count,
    totalAmount: round2(b.total),
    currency: b.currencies.size === 1 ? [...b.currencies][0] : "MIXED",
  }));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function registerFinanceTools(server: McpServer): void {
  server.tool(
    "finance_csv_status",
    "Check the status of the Curve CSV file (path, age, row count, date range, cards seen). Always run this first to confirm the file is loaded and fresh.",
    {},
    async () => {
      try {
        const status = await getImportStatus(config.csvPath);
        return textResult(status);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_list_transactions",
    "List transactions with optional filters. Returns up to `limit` rows (default 50, max 500). Use date_from/date_to (YYYY-MM-DD), category, second_category, merchant_contains (case-insensitive substring), card_last4, min/max amount.",
    {
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      category: z.string().optional().describe("Finnish main category, e.g. 'Ruokakauppa'"),
      second_category: z.string().optional().describe("Finnish 2nd category"),
      merchant_contains: z.string().optional(),
      card_last4: z.number().optional(),
      min_amount: z.number().optional(),
      max_amount: z.number().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).optional(),
    },
    async (args) => {
      try {
        const txns = await loadAll();
        const merchantNeedle = args.merchant_contains?.toLowerCase();
        let filtered = txns.filter(
          (t) =>
            dateInRange(t.date, args.date_from, args.date_to) &&
            (!args.category || t.category === args.category) &&
            (!args.second_category || t.secondCategory === args.second_category) &&
            (!merchantNeedle || t.merchant.toLowerCase().includes(merchantNeedle)) &&
            (!args.card_last4 || t.cardLast4 === args.card_last4) &&
            (args.min_amount === undefined || t.amount >= args.min_amount) &&
            (args.max_amount === undefined || t.amount <= args.max_amount)
        );

        const sort = args.sort ?? "date_desc";
        filtered.sort((a, b) => {
          if (sort === "date_desc") return b.date.localeCompare(a.date) || b.time.localeCompare(a.time);
          if (sort === "date_asc") return a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
          if (sort === "amount_desc") return b.amount - a.amount;
          return a.amount - b.amount;
        });

        const limit = args.limit ?? 50;
        return textResult({
          total_matches: filtered.length,
          returned: Math.min(filtered.length, limit),
          transactions: filtered.slice(0, limit),
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_summary",
    "Total spend grouped by category, second_category, card, currency, or month for an optional date range.",
    {
      group_by: z
        .enum(["category", "second_category", "card", "currency", "month"])
        .describe("Field to aggregate by."),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async ({ group_by, date_from, date_to }) => {
      try {
        const txns = (await loadAll()).filter((t) => dateInRange(t.date, date_from, date_to));
        let keyFn: (t: Transaction) => string;
        switch (group_by) {
          case "category":
            keyFn = (t) => t.category || "(uncategorized)";
            break;
          case "second_category":
            keyFn = (t) => `${t.category} / ${t.secondCategory || "(none)"}`;
            break;
          case "card":
            keyFn = (t) => t.cardName || (t.cardLast4 ? `card-${t.cardLast4}` : "(unknown)");
            break;
          case "currency":
            keyFn = (t) => t.currency || "(none)";
            break;
          case "month":
            keyFn = (t) => t.date.slice(0, 7);
            break;
        }
        const buckets = sumByKey(txns, keyFn).sort((a, b) => b.totalAmount - a.totalAmount);
        const grandTotal = txns.reduce((a, b) => a + b.amount, 0);
        return textResult({
          period: { start: date_from ?? null, end: date_to ?? null },
          group_by,
          transaction_count: txns.length,
          grand_total: round2(grandTotal),
          buckets,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_top_merchants",
    "Top N merchants by total spend in an optional date range.",
    {
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ date_from, date_to, limit }) => {
      try {
        const txns = (await loadAll()).filter((t) => dateInRange(t.date, date_from, date_to));
        const buckets = sumByKey(txns, (t) => t.merchant.trim() || "(unknown)").sort(
          (a, b) => b.totalAmount - a.totalAmount
        );
        return textResult({
          period: { start: date_from ?? null, end: date_to ?? null },
          merchants: buckets.slice(0, limit ?? 10),
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_search",
    "Free-text search across merchant + notes (case-insensitive substring). Returns matching transactions sorted newest first.",
    {
      query: z.string().min(1),
      limit: z.number().int().min(1).max(200).optional(),
    },
    async ({ query, limit }) => {
      try {
        const needle = query.toLowerCase();
        const txns = (await loadAll())
          .filter(
            (t) => t.merchant.toLowerCase().includes(needle) || t.notes.toLowerCase().includes(needle)
          )
          .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
        return textResult({
          query,
          total_matches: txns.length,
          transactions: txns.slice(0, limit ?? 25),
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_spend_trend",
    "Time-series of spend grouped by day, week, or month. Useful for trend questions.",
    {
      bucket: z.enum(["day", "week", "month"]).optional().describe("Default: month"),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      category: z.string().optional().describe("Filter to one Finnish category"),
    },
    async ({ bucket, date_from, date_to, category }) => {
      try {
        const txns = (await loadAll()).filter(
          (t) =>
            dateInRange(t.date, date_from, date_to) && (!category || t.category === category)
        );
        const b = bucket ?? "month";
        const buckets = sumByKey(txns, (t) => {
          if (b === "day") return t.date;
          if (b === "month") return t.date.slice(0, 7);
          // week: ISO week start (Monday)
          const d = new Date(t.date + "T00:00:00Z");
          const dow = d.getUTCDay() || 7; // 1..7, Mon..Sun
          d.setUTCDate(d.getUTCDate() - (dow - 1));
          return d.toISOString().slice(0, 10);
        }).sort((a, b) => a.key.localeCompare(b.key));
        return textResult({
          bucket: b,
          category: category ?? null,
          period: { start: date_from ?? null, end: date_to ?? null },
          buckets,
        });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "finance_categories",
    "List all Finnish categories and second_categories that appear in the data, with transaction counts.",
    {
      date_from: z.string().optional(),
      date_to: z.string().optional(),
    },
    async ({ date_from, date_to }) => {
      try {
        const txns = (await loadAll()).filter((t) => dateInRange(t.date, date_from, date_to));
        const cats = new Map<string, Set<string>>();
        const counts = new Map<string, number>();
        for (const t of txns) {
          const set = cats.get(t.category) ?? new Set<string>();
          if (t.secondCategory) set.add(t.secondCategory);
          cats.set(t.category, set);
          counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
        }
        const out = [...cats.entries()]
          .map(([cat, subs]) => ({
            category: cat,
            transaction_count: counts.get(cat) ?? 0,
            second_categories: [...subs].sort(),
          }))
          .sort((a, b) => b.transaction_count - a.transaction_count);
        return textResult({ categories: out });
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );
}
