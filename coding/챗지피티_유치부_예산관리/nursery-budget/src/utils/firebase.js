export async function loadFirebaseCompat() {
  if (window.firebase) return window.firebase;
  const appSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
  const authSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js";
  const fsSrc = "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js";
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = appSrc; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  await Promise.all([
    new Promise((res, rej) => { const s = document.createElement("script"); s.src = authSrc; s.onload = res; s.onerror = rej; document.head.appendChild(s); }),
    new Promise((res, rej) => { const s = document.createElement("script"); s.src = fsSrc;   s.onload = res; s.onerror = rej; document.head.appendChild(s); }),
  ]);
  return window.firebase;
}
