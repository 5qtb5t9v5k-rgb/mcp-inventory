/**
 * Strava API client with OAuth2 refresh token handling.
 *
 * Strava access tokens expire after 6 hours. This client automatically
 * refreshes them using the refresh_token when needed.
 */

export interface StravaCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

interface TokenState {
  accessToken: string;
  expiresAt: number; // unix seconds
}

export class StravaClient {
  private static readonly BASE_URL = "https://www.strava.com/api/v3";
  private static readonly TOKEN_URL = "https://www.strava.com/oauth/token";
  private tokenState: TokenState | null = null;

  constructor(private credentials: StravaCredentials) {}

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    // Refresh if no token or within 60s of expiry
    if (!this.tokenState || this.tokenState.expiresAt - now < 60) {
      await this.refreshAccessToken();
    }
    return this.tokenState!.accessToken;
  }

  private async refreshAccessToken(): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.credentials.clientId,
      client_secret: this.credentials.clientSecret,
      refresh_token: this.credentials.refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch(StravaClient.TOKEN_URL, {
      method: "POST",
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Strava token refresh ${res.status}: ${res.statusText}${text ? ` - ${text}` : ""}`);
    }

    const json = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };

    this.tokenState = {
      accessToken: json.access_token,
      expiresAt: json.expires_at,
    };

    // Strava may rotate the refresh token on refresh — use the new one
    if (json.refresh_token && json.refresh_token !== this.credentials.refreshToken) {
      this.credentials.refreshToken = json.refresh_token;
    }
  }

  async get<T>(endpoint: string, params?: Record<string, string | number>): Promise<T> {
    const token = await this.getAccessToken();
    const url = new URL(endpoint.replace(/^\//, ""), `${StravaClient.BASE_URL}/`);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, String(v));
      }
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Strava API ${res.status}: ${res.statusText}${text ? ` - ${text}` : ""}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Paginated fetch for list endpoints (e.g. /athlete/activities).
   * Strava uses per_page (max 200) + page (1-indexed).
   */
  async getPaginated<T>(
    endpoint: string,
    params?: Record<string, string | number>,
    maxPages = 10,
    perPage = 100
  ): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const batch = await this.get<T[]>(endpoint, {
        ...params,
        per_page: perPage,
        page,
      });
      if (!Array.isArray(batch) || batch.length === 0) break;
      all.push(...batch);
      if (batch.length < perPage) break;
    }
    return all;
  }
}
