export function defaultDateRange(startDate?: string, endDate?: string): { start_date: string; end_date: string } {
  const end = endDate ?? new Date().toISOString().slice(0, 10);
  const start = startDate ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return { start_date: start, end_date: end };
}
