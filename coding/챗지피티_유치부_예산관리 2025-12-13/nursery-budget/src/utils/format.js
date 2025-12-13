export function formatKRW(n) {
  if (typeof n !== "number" || isNaN(n)) return "—";
  return n.toLocaleString("ko-KR") + "원";
}

export function parseAmount(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(String(value).replace(/[^0-9.-]/g, "")) || 0;
}

export function monthKey(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}
