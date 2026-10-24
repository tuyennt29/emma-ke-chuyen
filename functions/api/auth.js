// Đăng nhập Admin qua GitHub khi web chạy trên Cloudflare Pages.
// Cần 2 biến môi trường trong Cloudflare Pages: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
export async function onRequestGet({ request, env }) {
  if (!env.GITHUB_CLIENT_ID) return new Response("Thiếu GITHUB_CLIENT_ID trong cài đặt Cloudflare Pages.", { status: 500 });
  const origin = new URL(request.url).origin;
  const state = crypto.randomUUID();
  const gh = new URL("https://github.com/login/oauth/authorize");
  gh.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  gh.searchParams.set("redirect_uri", `${origin}/api/callback`);
  gh.searchParams.set("scope", "repo,user");
  gh.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: gh.toString(),
      "Set-Cookie": `ekc_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "Cache-Control": "no-store"
    }
  });
}
