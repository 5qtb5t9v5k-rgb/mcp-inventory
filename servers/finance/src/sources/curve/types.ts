/**
 * One transaction parsed from Curve CSV after cleaning + categorization.
 * Fields are normalized: ISO date, numbers as numbers, Finnish categories.
 */
export interface Transaction {
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** HH:MM:SS */
  time: string;
  merchant: string;
  /** Amount in funding-card currency, positive = spend */
  amount: number;
  currency: string;
  foreignAmount: number;
  foreignCurrency: string;
  cardLast4: number | null;
  cardName: string;
  /** Curve "Type" field — usually empty, "REFUNDED" rows are filtered out */
  type: string;
  /** English category as exported by Curve */
  rawCategory: string;
  /** Finnish translated main category */
  category: string;
  /** Finnish 2nd category derived from notes + rules */
  secondCategory: string;
  notes: string;
}

/** Aggregation bucket result. */
export interface AggregateBucket {
  key: string;
  count: number;
  totalAmount: number;
  /** ISO 4217 currency, or "MIXED" if multiple currencies in bucket */
  currency: string;
}

export interface ImportStatus {
  csvPath: string;
  exists: boolean;
  fileMtime?: string;
  fileSize?: number;
  rowCount?: number;
  cleanedCount?: number;
  earliestDate?: string;
  latestDate?: string;
  cards?: { last4: number; name: string; transactionCount: number }[];
  currencies?: string[];
}
