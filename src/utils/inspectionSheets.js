// 지도점검 통계 시트 (학원, 교습소, 개인과외 통합 통계)
export const STAT_SHEET_ID = '1xxaBOZMuLqozEm10f4lXnme_ARLfRHzGcsk5QlqoYKI';
export const STAT_GID = '1438819657';

// 최근 지도점검 현황 시트 (최근 지도점검 탭)
export const RECENT_SHEET_ID = '1zSGd9TBcJRculSJzUoZ2N8bB2iENuCI0x9KBpyfXMUo';
export const RECENT_GID = '1946422008';

// 점검유보 시트 (추천 목록 제외 대상)
export const DEFER_GID = '1967173055';

// 하남 학원 전체 목록 시트 (전체 학원 개수)
export const HANAM_ACADEMY_SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
export const HANAM_ACADEMY_GID = '1863320151';

// 하남 교습소 전체 목록 시트 (전체 교습소 개수)
export const HANAM_HAGWON_SHEET_ID = '1pHQNblzLHIE3Rfz9h622MXDLAAXtkyv4I06Zync2-Xk';
export const HANAM_HAGWON_GID = '2090335200';

// Google Apps Script Web App URL (구글 시트 쓰기용)
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwyW4hpzU4xdAfMPi9Rs50YHRN1lPhJQrpuj-9EggKfvtCefbQS3IMsC4WB5O5tF44/exec';

function parseCSVText(text) {
    if (!text) return [];
    const rows = [];
    let currentField = '';
    let inQuotes = false;
    let currentRow = [];

    text = text.replace(/^\uFEFF/, '');

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];
        if (char === '"' && inQuotes && nextChar === '"') {
            currentField += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (i === 0 || text[i - 1] === '\r' || text[i - 1] === '\n') {
                // 연속 줄바꿈 무시
            } else {
                currentRow.push(currentField);
                rows.push(currentRow);
                currentField = '';
                currentRow = [];
            }
        } else {
            currentField += char;
        }
    }
    if (currentRow.length > 0 || currentField) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    return rows;
}

async function fetchCSV(sheetId, gid) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
}

// 통계 시트 원본 rows 반환 (헤더 포함)
export async function fetchStatRawRows() {
    const text = await fetchCSV(STAT_SHEET_ID, STAT_GID);
    return parseCSVText(text);
}

// 최근 지도점검 현황 rows 반환
export async function fetchRecentRawRows() {
    const text = await fetchCSV(RECENT_SHEET_ID, RECENT_GID);
    const rawRows = parseCSVText(text);

    if (!rawRows || rawRows.length < 4) return { headers: [], bodyRows: [] };

    // 가장 많은 값을 가진 행을 헤더로 사용
    let headerIdx = 0;
    let maxFilled = 0;
    for (let i = 0; i < Math.min(5, rawRows.length); i++) {
        const filled = rawRows[i].filter(c => c && c.trim()).length;
        if (filled > maxFilled) { maxFilled = filled; headerIdx = i; }
    }

    const headers = rawRows[headerIdx].map(h => h.trim());
    const bodyRows = rawRows.slice(headerIdx + 1)
        .filter(row => row.some(c => c && c.trim()))  // 빈 행 제외
        .filter(row => {
            // 폐원된 기관 제외: 구분 컬럼에 '폐원' 포함 시 필터
            const typeIdx = headers.findIndex(h => h.includes('구분') || h.includes('현황'));
            if (typeIdx >= 0 && row[typeIdx]) {
                return !row[typeIdx].includes('폐원') && !row[typeIdx].includes('폐쇄');
            }
            return true;
        })
        .map(row => {
            const obj = {};
            headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
            return obj;
        });

    return { headers, bodyRows };
}

// 하남 전체 학원 개수 가져오기
export async function fetchHanamAcademyCount() {
    try {
        const text = await fetchCSV(HANAM_ACADEMY_SHEET_ID, HANAM_ACADEMY_GID);
        const rows = parseCSVText(text);
        // 헤더 제외한 데이터 행 개수 (폐원 제외)
        if (!rows || rows.length < 2) return 0;
        // 헤더행 찾기
        let headerIdx = 0;
        let maxFilled = 0;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            const filled = rows[i].filter(c => c && c.trim()).length;
            if (filled > maxFilled) { maxFilled = filled; headerIdx = i; }
        }
        const headers = rows[headerIdx].map(h => h.trim());
        const dataRows = rows.slice(headerIdx + 1).filter(row => row.some(c => c && c.trim()));

        // 상태 컬럼 찾기 (개원 상태인 것만)
        const statusIdx = headers.findIndex(h =>
            h.includes('현황') || h.includes('상태') || h.includes('운영') || h.includes('구분')
        );
        if (statusIdx >= 0) {
            return dataRows.filter(row => {
                const status = (row[statusIdx] || '').trim();
                return status.includes('개원') || status === '' || (!status.includes('폐원') && !status.includes('폐쇄'));
            }).length;
        }
        return dataRows.length;
    } catch {
        return 0;
    }
}

// 하남 전체 교습소 개수 가져오기
export async function fetchHanamHagwonCount() {
    try {
        const text = await fetchCSV(HANAM_HAGWON_SHEET_ID, HANAM_HAGWON_GID);
        const rows = parseCSVText(text);
        if (!rows || rows.length < 2) return 0;
        let headerIdx = 0;
        let maxFilled = 0;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
            const filled = rows[i].filter(c => c && c.trim()).length;
            if (filled > maxFilled) { maxFilled = filled; headerIdx = i; }
        }
        const headers = rows[headerIdx].map(h => h.trim());
        const dataRows = rows.slice(headerIdx + 1).filter(row => row.some(c => c && c.trim()));

        const statusIdx = headers.findIndex(h =>
            h.includes('현황') || h.includes('상태') || h.includes('운영') || h.includes('구분')
        );
        if (statusIdx >= 0) {
            return dataRows.filter(row => {
                const status = (row[statusIdx] || '').trim();
                return status.includes('개원') || status === '' || (!status.includes('폐원') && !status.includes('폐쇄'));
            }).length;
        }
        return dataRows.length;
    } catch {
        return 0;
    }
}

// 하남 전체 학원 상세 rows (연도별 개수 계산용)
export async function fetchHanamAcademyRawRows() {
    const text = await fetchCSV(HANAM_ACADEMY_SHEET_ID, HANAM_ACADEMY_GID);
    return parseCSVText(text);
}

// 하남 전체 교습소 상세 rows (연도별 개수 계산용)
export async function fetchHanamHagwonRawRows() {
    const text = await fetchCSV(HANAM_HAGWON_SHEET_ID, HANAM_HAGWON_GID);
    return parseCSVText(text);
}

// 나이스 통합 시트 (학원/교습소/과외 전체 조회용)
export const NICE_SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
export const NICE_ACADEMY_GID = '1863320151';
export const NICE_HAGWON_GID  = '1929773080';
export const NICE_PRIVATE_GID = '482385921';

// 나이스 학원조회 전체 rows
export async function fetchNiceAcademyRawRows() {
    const text = await fetchCSV(NICE_SHEET_ID, NICE_ACADEMY_GID);
    return parseCSVText(text);
}

// 나이스 교습소조회 전체 rows
export async function fetchNiceHagwonRawRows() {
    const text = await fetchCSV(NICE_SHEET_ID, NICE_HAGWON_GID);
    return parseCSVText(text);
}

// 나이스 개인과외교습자조회 전체 rows
export async function fetchNicePrivateRawRows() {
    const text = await fetchCSV(NICE_SHEET_ID, NICE_PRIVATE_GID);
    return parseCSVText(text);
}

// 점검유보 시트 rows (추천 목록 제외용)
export async function fetchInspectionDeferRawRows() {
    const text = await fetchCSV(RECENT_SHEET_ID, DEFER_GID);
    return parseCSVText(text);
}

