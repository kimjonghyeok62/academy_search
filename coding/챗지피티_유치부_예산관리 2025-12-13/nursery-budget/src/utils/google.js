export async function gsFetch(cfg, action, payload) {
  if (!cfg?.url) throw new Error("Apps Script URL이 비어 있습니다.");
  const token = cfg.token || "";

  // 1) 목록은 GET (프리플라이트 회피)
  if (action === "list") {
    const u = new URL(cfg.url);
    u.searchParams.set("action", "list");
    u.searchParams.set("token", token);
    const resp = await fetch(u.toString(), { method: "GET" });
    if (!resp.ok) throw new Error(`Apps Script 응답 오류: ${resp.status}`);
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // 2) 저장/업로드는 POST + text/plain (단순요청)
  const body = JSON.stringify({ action, token, ...payload });
  const resp = await fetch(cfg.url, {
    method: "POST",
    headers: { "Content-Type": "text/plain" }, // ★ 중요: application/json 금지
    body,
  });
  if (!resp.ok) throw new Error(`Apps Script 응답 오류: ${resp.status}`);
  const data = await resp.json();
  if (data.error) throw new Error(data.error);
  return data;
}
