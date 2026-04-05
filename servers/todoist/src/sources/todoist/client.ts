export class TodoistClient {
  private baseUrl = "https://api.todoist.com/api/v1";

  constructor(private token: string) {}

  private async request<T>(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return undefined as T;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Todoist API ${res.status}: ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    return res.json() as Promise<T>;
  }

  async get<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    return this.request<T>("GET", endpoint, undefined, params);
  }

  async post<T>(endpoint: string, body?: Record<string, unknown>): Promise<T> {
    return this.request<T>("POST", endpoint, body);
  }

  async delete(endpoint: string): Promise<void> {
    return this.request<void>("DELETE", endpoint);
  }
}
