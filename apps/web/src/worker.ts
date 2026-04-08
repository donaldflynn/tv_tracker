interface Fetcher {
  fetch(input: Request): Promise<Response>;
}

interface Env {
  API: Fetcher;
  ASSETS: Fetcher;
}

const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      const apiResponse = await env.API.fetch(request);

      const setSession = apiResponse.headers.get('X-Set-Session');
      const clearSession = apiResponse.headers.get('X-Clear-Session');

      if (!setSession && !clearSession) {
        return apiResponse;
      }

      // Rebuild the response so we can add Set-Cookie
      const headers = new Headers(apiResponse.headers);
      headers.delete('X-Set-Session');
      headers.delete('X-Clear-Session');

      if (setSession) {
        headers.append(
          'Set-Cookie',
          `session=${setSession}; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_MAX_AGE}; Path=/`,
        );
      }
      if (clearSession) {
        headers.append(
          'Set-Cookie',
          `session=; HttpOnly; SameSite=Lax; Secure; Max-Age=0; Path=/`,
        );
      }

      return new Response(apiResponse.body, {
        status: apiResponse.status,
        statusText: apiResponse.statusText,
        headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
