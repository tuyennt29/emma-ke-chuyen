// Nhận mã từ GitHub, đổi lấy token rồi gửi về trang Admin (giao thức của Decap CMS).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookie = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)ekc_oauth_state=([^;]+)/);
  if (!code || !state || !cookie || cookie[1] !== state) return reply("error", { message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Bạn thử đăng nhập lại." });
  try {
    const res = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "emma-ke-chuyen-admin" },
      body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code, redirect_uri: `${url.origin}/api/callback` })
    });
    const data = await res.json();
    if (!data.access_token) return reply("error", { message: data.error_description || "GitHub không cấp quyền đăng nhập." });
    return reply("success", { token: data.access_token, provider: "github" });
  } catch (e) {
    return reply("error", { message: "Không kết nối được GitHub. Bạn thử lại sau ít phút." });
  }
}

function reply(status, content) {
  const msg = JSON.stringify(`authorization:github:${status}:${JSON.stringify(content)}`);
  const html = `<!doctype html><html lang="vi"><meta charset="utf-8"><title>Đăng nhập…</title><body><p>Đang đăng nhập…</p><script>
(function () {
  function receive(e) {
    if (e.origin !== window.location.origin) return;
    window.opener.postMessage(${msg}, e.origin);
    window.removeEventListener("message", receive, false);
  }
  window.addEventListener("message", receive, false);
  window.opener && window.opener.postMessage("authorizing:github", window.location.origin);
})();
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": "ekc_oauth_state=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    }
  });
}
