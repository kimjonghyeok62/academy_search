// 마스터 스프레드시트(학원조회·교습소조회)에서 학원 한 곳의 줄만 골라 온다.
//
// 왜 서버가 읽나: 학원 회신 화면은 로그인 없이 열리는 자리라 담당자 화면의 자료 통로를 쓸 수
// 없고, 무엇보다 마스터 전체 CSV 는 몇 MB 라 휴대폰에 통째로 내려보낼 수 없다.
// 그 학원의 줄(교습과정 수만큼)만 골라 주면 화면이 게시표를 만들 수 있다.
//
// 시트 ID·GID 는 src/utils/googleSheets.js 와 같아야 한다 — api/ 는 브라우저 번들과 모듈을
// 공유하지 않아 여기 다시 적는다 (naverProbe.js 의 addressQuery 와 같은 사정).
// 한쪽을 고치면 다른 쪽도 함께 고칠 것.
const SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
const GID = { 학원: '1863320151', 교습소: '1929773080' };

// 한 번 읽은 CSV 는 잠깐 들고 있는다. 학원 한 곳이 게시표를 여닫을 때마다 몇 MB 를 다시
// 받아올 이유가 없다. 서버리스라 인스턴스가 갈리면 비므로, 오래 묵은 값을 보여줄 걱정은 없다.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map();

/** 따옴표 안의 쉼표·줄바꿈까지 지키는 CSV 파서 (src/utils/inspectionSheets.js 의 것과 같은 규칙) */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const s = String(text || '').replace(/^\uFEFF/, '');

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"' && quoted && s[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { row.push(field); field = ''; }
        else if ((ch === '\r' || ch === '\n') && !quoted) {
            // 줄 끝을 두 번(\r\n) 세지 않는다
            if (ch === '\r' && s[i + 1] === '\n') i++;
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else field += ch;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

/** 첫 줄을 머리로 삼아 [{열이름: 값}] 로 만든다 */
function toObjects(rows) {
    if (!rows.length) return [];
    const head = rows[0].map((h) => String(h).trim());
    return rows.slice(1).map((r) => {
        const o = {};
        head.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
        return o;
    });
}

async function loadSheet(category) {
    const gid = GID[category];
    if (!gid) throw new Error(`알 수 없는 구분: ${category}`);

    const hit = cache.get(gid);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.rows;

    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`마스터 시트를 읽지 못했습니다 (HTTP ${res.status})`);
    const rows = toObjects(parseCsv(await res.text()));
    cache.set(gid, { at: Date.now(), rows });
    return rows;
}

/**
 * 그 학원의 줄 전부 (교습과정 수만큼 나온다).
 * transformAcademyData 가 등록번호/신고번호 어느 쪽이든 읽으므로 여기서도 둘 다 본다.
 */
export async function academyRows(category, regNo) {
    const want = String(regNo || '').trim();
    if (!want) return [];
    const rows = await loadSheet(category);
    return rows.filter((r) => String(r['등록번호'] || r['신고번호'] || '').trim() === want);
}
