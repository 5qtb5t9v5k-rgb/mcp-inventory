import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";

dotenvConfig();

function resolvePath(p: string): string {
  if (p.startsWith("~")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

export const config = {
  /** Path to the Curve Transactions.csv file. */
  csvPath: resolvePath(
    process.env.FINANCE_CSV_PATH ?? "~/Desktop/Transactions.csv"
  ),
  /** Optional: drop transactions before this date (YYYY-MM-DD). */
  startDate: process.env.FINANCE_START_DATE ?? "2025-01-01",
};
