import type { OuraResponse } from "./types.js";

export class OuraClient {
  constructor(
    private token: string,
    private baseUrl: string
  ) {}

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Oura API ${res.status}: ${res.statusText}${body ? ` - ${body}` : ""}`);
    }
    return res.json() as Promise<T>;
  }

  async getAll<T>(endpoint: string, params?: Record<string, string>): Promise<T[]> {
    const allData: T[] = [];
    let nextToken: string | undefined;
    const maxPages = 20;
    let page = 0;

    do {
      const queryParams = { ...params };
      if (nextToken) queryParams.next_token = nextToken;

      const response = await this.get<OuraResponse<T>>(endpoint, queryParams);
      allData.push(...response.data);
      nextToken = response.next_token;
      page++;
    } while (nextToken && page < maxPages);

    return allData;
  }
}
