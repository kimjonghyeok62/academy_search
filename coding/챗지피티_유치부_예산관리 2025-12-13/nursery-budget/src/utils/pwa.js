function dataIcon(size) {
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#111"; ctx.fillRect(0,0,size,size);
  ctx.fillStyle = "#fff"; ctx.font = `${Math.floor(size*0.28)}px sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", size/2, size/2);
  return canvas.toDataURL("image/png");
}

export function canRegisterSW() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return false;
  const href = String(location.href || "");
  if (href.startsWith("blob:")) return false;
  const proto = location.protocol;
  return proto === "https:" || proto === "http:";
}

export async function setupPWA() {
  try {
    const manifest = {
      name: "유치부 예산관리",
      short_name: "유치부 예산",
      start_url: ".",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#111111",
      icons: [
        { src: dataIcon(192), sizes: "192x192", type: "image/png" },
        { src: dataIcon(512), sizes: "512x512", type: "image/png" },
      ],
    };
    const manifestBlob = new Blob([JSON.stringify(manifest)], { type: "application/json" });
    const manifestUrl = URL.createObjectURL(manifestBlob);
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) { link = document.createElement("link"); link.setAttribute("rel", "manifest"); document.head.appendChild(link); }
    link.setAttribute("href", manifestUrl);

    if (canRegisterSW()) {
      try {
        const resp = await fetch("./sw.js", { method: "HEAD" });
        if (resp.ok) {
          await navigator.serviceWorker.register("./sw.js");
        }
      } catch {}
    }
  } catch {}
}
