import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { OuraClient } from "../sources/oura/client.js";
import type {
  DailySleep,
  SleepPeriod,
  DailyActivity,
  DailyReadiness,
  HeartRate,
  DailySpO2,
  DailyStress,
  PersonalInfo,
} from "../sources/oura/types.js";
import { config } from "../config.js";
import { defaultDateRange } from "../utils/dates.js";

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function noTokenError() {
  return textResult(
    { error: "OURA_ACCESS_TOKEN is not configured. Set it in your environment or .env file." },
    true
  );
}

export function registerOuraTools(server: McpServer): void {
  if (!config.ouraToken) {
    // Register tools that return helpful error messages
    const toolNames = [
      "oura_daily_sleep",
      "oura_sleep_periods",
      "oura_daily_activity",
      "oura_daily_readiness",
      "oura_heart_rate",
      "oura_spo2",
      "oura_body_temperature",
      "oura_daily_stress",
      "oura_personal_info",
    ];
    for (const name of toolNames) {
      server.tool(name, `Oura Ring: ${name} (token not configured)`, {}, async () => noTokenError());
    }
    return;
  }

  const client = new OuraClient(config.ouraToken, config.ouraBaseUrl);

  const dateRangeSchema = {
    start_date: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 7 days ago."),
    end_date: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
  };

  async function ouraQuery<T>(endpoint: string, startDate?: string, endDate?: string): Promise<typeof textResult extends (...args: any[]) => infer R ? R : never> {
    try {
      const { start_date, end_date } = defaultDateRange(startDate, endDate);
      const data = await client.getAll<T>(endpoint, { start_date, end_date });
      return textResult(data);
    } catch (err) {
      return textResult({ error: String(err) }, true);
    }
  }

  server.tool(
    "oura_daily_sleep",
    "Get daily sleep summaries from Oura Ring (score, duration, contributors)",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<DailySleep>("/v2/usercollection/daily_sleep", start_date, end_date)
  );

  server.tool(
    "oura_sleep_periods",
    "Get detailed sleep period data (stages, timing, HR, HRV)",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<SleepPeriod>("/v2/usercollection/sleep", start_date, end_date)
  );

  server.tool(
    "oura_daily_activity",
    "Get daily activity summaries (steps, calories, movement times)",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<DailyActivity>("/v2/usercollection/daily_activity", start_date, end_date)
  );

  server.tool(
    "oura_daily_readiness",
    "Get daily readiness scores and contributing factors",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<DailyReadiness>("/v2/usercollection/daily_readiness", start_date, end_date)
  );

  server.tool(
    "oura_heart_rate",
    "Get heart rate samples from Oura Ring",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<HeartRate>("/v2/usercollection/heartrate", start_date, end_date)
  );

  server.tool(
    "oura_spo2",
    "Get blood oxygen (SpO2) readings from Oura Ring",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<DailySpO2>("/v2/usercollection/daily_spo2", start_date, end_date)
  );

  server.tool(
    "oura_body_temperature",
    "Get body temperature deviation data from Oura Ring",
    dateRangeSchema,
    async ({ start_date, end_date }) => {
      try {
        const { start_date: s, end_date: e } = defaultDateRange(start_date, end_date);
        const data = await client.getAll<Record<string, unknown>>("/v2/usercollection/daily_readiness", { start_date: s, end_date: e });
        const tempData = data.map((d) => ({
          day: d.day,
          temperature_deviation: d.temperature_deviation,
          temperature_trend_deviation: d.temperature_trend_deviation,
        }));
        return textResult(tempData);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );

  server.tool(
    "oura_daily_stress",
    "Get daily stress and recovery data from Oura Ring",
    dateRangeSchema,
    async ({ start_date, end_date }) => ouraQuery<DailyStress>("/v2/usercollection/daily_stress", start_date, end_date)
  );

  server.tool(
    "oura_personal_info",
    "Get Oura user profile info (age, weight, height)",
    {},
    async () => {
      try {
        const data = await client.get<PersonalInfo>("/v2/usercollection/personal_info");
        return textResult(data);
      } catch (err) {
        return textResult({ error: String(err) }, true);
      }
    }
  );
}
