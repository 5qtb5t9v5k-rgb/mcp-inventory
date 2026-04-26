import { readFile, stat } from "node:fs/promises";
import {
  CARD_MAPPING,
  CATEGORY_MAPPING,
  CATEGORY_EN_TO_FI,
  SUBCATEGORY_EN_TO_FI,
  EMPTY_2ND_CATEGORY_RULES,
  GENERAL_2ND_CATEGORIES,
  DEFAULT_START_DATE,
  EXCLUDE_TYPES,
  EXCLUDE_NOTE_FRAGMENTS,
  EXCLUDE_CURRENCIES,
  EXCLUDE_CARD_LAST4,
} from "./categorizer-config.js";
import type { Transaction, ImportStatus } from "./types.js";

/**
 * Minimal CSV row parser that handles double-quoted fields with embedded commas.
 * Curve exports use very simple CSV — no escaped quotes inside quoted fields,
 * so this is sufficient.
 */
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') inQuotes = false;
      else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Translate raw English category → Finnish, with title-case normalization
 * (matches Python's `str.strip().title()`).
 */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function translateCategory(raw: string): string {
  const key = titleCase(raw.trim());
  return CATEGORY_EN_TO_FI[key] ?? key;
}

function deriveSecondCategoryEnglish(rawCategory: string, notes: string): string {
  const note = notes.trim();
  const main = titleCase(rawCategory.trim());
  const subs = CATEGORY_MAPPING[main];
  if (subs && note in subs) return subs[note];
  return "";
}

function translateSubcategory(s: string): string {
  return SUBCATEGORY_EN_TO_FI[s.trim()] ?? s;
}

/**
 * Apply the Python pipeline's "fill empty 2nd category" rules + special cases.
 * Returns the final 2nd category string (Finnish).
 */
function applySecondCategoryRules(
  finnishCategory: string,
  finnishSubcategory: string
): string {
  let sub = finnishSubcategory.trim();

  // Special: Shopping + Kids -> Perhe
  if (finnishCategory === "Ostokset" && sub === "Lapset") {
    sub = "Perhe";
  }

  if (!sub) {
    if (EMPTY_2ND_CATEGORY_RULES[finnishCategory]) {
      sub = EMPTY_2ND_CATEGORY_RULES[finnishCategory];
    } else if (GENERAL_2ND_CATEGORIES.includes(finnishCategory)) {
      sub = "Yleinen";
    }
  }

  // Customize names with category prefix (port of customize_general_subcategory_names)
  const exclude = "Autoilu & Liikkuminen";

  if (finnishCategory === "Harrastukset" && sub === "Yleinen") return "Harrastukset: Yleinen";
  if (finnishCategory === "Ruokakauppa" && sub === "Yleinen") return "Ruokakauppa: Yleinen";
  if (finnishCategory === "Striimaus & Palvelut" && sub === "Yleinen")
    return "Striimaus & Palvelut: Yleinen";
  if (finnishCategory === "Koulutus, Kirjallisuus & Kehittäminen" && sub === "Yleinen")
    return "Koul.,Kirj.&Keh:Yleinen";

  if (finnishCategory === "Ostokset" && sub && !sub.startsWith("Ostokset: ")) {
    return "Ostokset: " + sub;
  }

  if (finnishCategory !== exclude && finnishCategory !== "Ostokset") {
    if (sub === "Perhe") return finnishCategory + ": Perhe";
    if (sub === "Henkilökohtainen") return finnishCategory + ": Henkilökohtainen";
  }

  return sub;
}

function shouldExcludeRow(
  type: string,
  notes: string,
  currency: string,
  cardLast4: number | null,
  date: string,
  startDate: string
): boolean {
  if (EXCLUDE_TYPES.includes(type.trim().toUpperCase() as (typeof EXCLUDE_TYPES)[number])) return true;
  for (const frag of EXCLUDE_NOTE_FRAGMENTS) {
    if (notes.includes(frag)) return true;
  }
  for (const c of EXCLUDE_CURRENCIES) {
    if (currency.trim() === c.trim()) return true;
  }
  if (cardLast4 !== null && EXCLUDE_CARD_LAST4.includes(cardLast4)) return true;
  if (date < startDate) return true;
  return false;
}

/**
 * Parse + clean + categorize a Curve CSV file.
 *
 * Curve CSV header (with leading-space quirks preserved by our trim()):
 *   "Export Format, Date (YYYY-MM-DD as UTC), Time (HH:MM:SS), Merchant,
 *    Txn Amount (Funding Card), Txn Currency (Funding Card),
 *    Txn Amount (Foreign Spend), Txn Currency (Foreign Spend),
 *    Card Name, Card Last 4 Digits, Type, Category, Notes"
 */
export async function parseCurveCsv(
  csvPath: string,
  startDate = DEFAULT_START_DATE
): Promise<Transaction[]> {
  const raw = await readFile(csvPath, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Skip header
  const out: Transaction[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvRow(lines[i]);
    if (cells.length < 13) continue;

    // Cells per Curve format
    // 0: Export Format, 1: Date, 2: Time, 3: Merchant,
    // 4: Txn Amount (Funding), 5: Txn Currency (Funding),
    // 6: Txn Amount (Foreign), 7: Txn Currency (Foreign),
    // 8: Card Name, 9: Card Last 4 Digits, 10: Type, 11: Category, 12: Notes
    const date = cells[1];
    const time = cells[2];
    const merchant = cells[3];
    const amount = parseFloat(cells[4]) || 0;
    const currency = cells[5];
    const foreignAmount = parseFloat(cells[6]) || 0;
    const foreignCurrency = cells[7];
    const cardNameRaw = cells[8];
    const last4Raw = cells[9].trim();
    const cardLast4 = last4Raw ? parseInt(last4Raw, 10) : NaN;
    const type = cells[10];
    const rawCategory = cells[11];
    const notes = cells[12] ?? "";

    const last4Num = Number.isFinite(cardLast4) ? cardLast4 : null;

    if (shouldExcludeRow(type, notes, currency, last4Num, date, startDate)) continue;

    const cardName =
      last4Num !== null && CARD_MAPPING[last4Num] ? CARD_MAPPING[last4Num] : cardNameRaw || "";

    const finnishCategory = translateCategory(rawCategory);
    const englishSub = deriveSecondCategoryEnglish(rawCategory, notes);
    const finnishSubRaw = translateSubcategory(englishSub);
    const finnishSub = applySecondCategoryRules(finnishCategory, finnishSubRaw);

    out.push({
      date,
      time,
      merchant,
      amount,
      currency,
      foreignAmount,
      foreignCurrency,
      cardLast4: last4Num,
      cardName,
      type,
      rawCategory: titleCase(rawCategory.trim()),
      category: finnishCategory,
      secondCategory: finnishSub,
      notes,
    });
  }
  return out;
}

/** Lightweight inspection of the CSV file without fully parsing it. */
export async function getImportStatus(csvPath: string): Promise<ImportStatus> {
  let info: { mtime: Date; size: number } | null = null;
  try {
    const s = await stat(csvPath);
    info = { mtime: s.mtime, size: s.size };
  } catch {
    return { csvPath, exists: false };
  }

  let txns: Transaction[] = [];
  let rowCount = 0;
  try {
    const raw = await readFile(csvPath, "utf-8");
    rowCount = Math.max(0, raw.split(/\r?\n/).filter((l) => l.trim()).length - 1);
    txns = await parseCurveCsv(csvPath);
  } catch {
    // ignore — return basic file info
  }

  const dates = txns.map((t) => t.date).sort();
  const cardCounts = new Map<number, number>();
  const currencies = new Set<string>();
  for (const t of txns) {
    if (t.cardLast4 !== null) {
      cardCounts.set(t.cardLast4, (cardCounts.get(t.cardLast4) ?? 0) + 1);
    }
    if (t.currency) currencies.add(t.currency);
  }

  return {
    csvPath,
    exists: true,
    fileMtime: info.mtime.toISOString(),
    fileSize: info.size,
    rowCount,
    cleanedCount: txns.length,
    earliestDate: dates[0],
    latestDate: dates[dates.length - 1],
    cards: [...cardCounts.entries()].map(([last4, count]) => ({
      last4,
      name: CARD_MAPPING[last4] ?? "",
      transactionCount: count,
    })),
    currencies: [...currencies].sort(),
  };
}
