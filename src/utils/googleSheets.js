
export const SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
export const DATA_SHEET = '학원조회';
export const GYOSEUPSO_SHEET = '교습소조회';
export const PRIVATE_TUTOR_SHEET = '개인과외교습자조회';
export const ACADEMY_CLOSED_SHEET = '학원(폐원)';
export const PASSWORD_GID = '59615156';
// GID 사용 (sheet= 파라미터는 첫 번째 시트를 반환하는 버그 있음)
export const DATA_GID = '1863320151';         // 학원조회
export const GYOSEUPSO_GID = '1929773080';    // 교습소조회
export const PRIVATE_TUTOR_GID = '482385921'; // 개인과외교습자조회
export const ACADEMY_CLOSED_GID = '720382546'; // 학원(폐원)

// 지도점검 전용 시트 (2025년 이전 통계)
export const INSPECTION_SHEET_ID = '1xxaBOZMuLqozEm10f4lXnme_ARLfRHzGcsk5QlqoYKI';
export const INSPECTION_GID = '1438819657';

export const DATA_AS_OF = '2026.  1.  17. (토) 기준';

// 매칭용 이름 정규화 (공백 및 특수문자 모두 제거)
export const normalizeName = (name) => (name || '').toString().replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

// fetch with 15-second timeout
function fetchWithTimeout(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * 유연한 컬럼 데이터 추출기
 */
const getFlexibleVal = (row, keywords) => {
    const keys = Object.keys(row);
    for (const keyword of keywords) {
        const foundKey = keys.find(k => k.replace(/\s+/g, '').includes(keyword.replace(/\s+/g, '')));
        if (foundKey) return row[foundKey] || '';
    }
    return '';
};

export async function fetchGoogleSheetData(sheetNameOrGid) {
    // 숫자 → GID, 문자 → sheet name (fallback)
    const isGid = /^\d+$/.test(sheetNameOrGid);
    const url = isGid
        ? `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${sheetNameOrGid}`
        : `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&sheet=${encodeURIComponent(sheetNameOrGid)}`;
    try {
        const response = await fetchWithTimeout(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const txt = await response.text();
        return parseCSV(txt);
    } catch (error) {
        console.error("Error fetching Google Sheet:", error);
        throw error;
    }
}

/**
 * 폐원된 학원 시트에서 데이터 가져오기
 * 반환: { regDate, closeDate, address, category }[]
 */
export async function fetchAcademyClosureData() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${ACADEMY_CLOSED_GID}`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        const rows = parseCSV(txt);
        // 등록번호 기준 중복 제거 (교습과정별 다수 행 → 학원 1개로)
        const seen = new Set();
        return rows
            .map(row => ({
                regNum:    (row['등록번호']           || '').trim(),
                name:      (row['학원명']             || '').trim(),
                regDate:   (row['등록일']             || '').trim(),
                closeDate: (row['개원/휴원/폐원일']   || '').trim(),
                address:   (row['학원주소']            || '').trim(),
                category:  (row['학원종류']            || '').trim(),
            }))
            .filter(r => {
                if (!r.closeDate) return false;
                const key = r.regNum || `${r.regDate}|${r.address}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
    } catch (error) {
        console.error('Error fetching academy closure data:', error);
        return [];
    }
}

export async function fetchInspectionData() {
    const url = `https://docs.google.com/spreadsheets/d/${INSPECTION_SHEET_ID}/export?format=csv&gid=${INSPECTION_GID}`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        const rows = parseCSV(txt);

        const inspectionMap = new Map();

        rows.forEach((row) => {
            const name = getFlexibleVal(row, ['학원(교습소)명', '명칭', '학원명', '기관명']);
            if (!name) return;

            const record = {
                date: getFlexibleVal(row, ['점검일', '점검일자', '지도점검일', '보정']).trim().replace(/-/g, '.'),
                isViolation: getFlexibleVal(row, ['위반여부']).trim().toUpperCase() === 'Y',
                violationType: getFlexibleVal(row, ['위반사항', '위반유형']).trim(),
                violationDetail: getFlexibleVal(row, ['위반내역', '위반내용']).trim(),
                note: getFlexibleVal(row, ['비고']).trim(),
                punishmentDate: getFlexibleVal(row, ['행정처분일']).trim(),
                punishmentCode: getFlexibleVal(row, ['행정처분코드', '행정처분']).trim(),
                punishmentStart: getFlexibleVal(row, ['행정처분시작일']).trim(),
                punishmentEnd: getFlexibleVal(row, ['행정처분종료일']).trim(),
                penalty: getFlexibleVal(row, ['벌점']).trim(),
                fine: getFlexibleVal(row, ['과태료', '과태료금액']).trim(),
                cancelYn: getFlexibleVal(row, ['취소여부']).trim(),
                excessFee: getFlexibleVal(row, ['수업료초과분']).trim(),
                correctionStart: getFlexibleVal(row, ['시정시작일']).trim(),
                correctionEnd: getFlexibleVal(row, ['시정종료일']).trim(),
                correctionContent: getFlexibleVal(row, ['시정내용', '시정']).trim(),
                inspectionType: getFlexibleVal(row, ['점검유형', '점검종류', '점검구분', '구분']).trim(),
                inspectionItems: getFlexibleVal(row, ['점검항목', '점검내용']).trim(),
                source: '~2025',
            };

            const key = normalizeName(name);
            if (!inspectionMap.has(key)) {
                inspectionMap.set(key, []);
            }
            inspectionMap.get(key).push(record);
        });

        // 날짜순 정렬 (최신이 위로)
        inspectionMap.forEach((records) => {
            records.sort((a, b) => {
                const toDate = (str) => {
                    if (!str) return new Date(0);
                    const d = new Date(str.replace(/\./g, '-'));
                    return isNaN(d.getTime()) ? new Date(0) : d;
                };
                return toDate(b.date) - toDate(a.date);
            });
        });

        return inspectionMap;
    } catch (error) {
        console.error("Error fetching inspection data:", error);
        return new Map();
    }
}

/**
 * 2026년 지도점검 시트에서 학원명별 점검 이력 가져오기
 * inspectionSheets.js의 fetchRecentRawRows와 동일한 헤더 자동감지 방식 사용
 */
export async function fetch2026InspectionData() {
    const RECENT_SHEET_ID = '1zSGd9TBcJRculSJzUoZ2N8bB2iENuCI0x9KBpyfXMUo';
    const RECENT_GID = '1946422008';
    const url = `https://docs.google.com/spreadsheets/d/${RECENT_SHEET_ID}/export?format=csv&gid=${RECENT_GID}`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        // raw rows로 파싱 후 헤더 행 자동감지 (시트가 3행 헤더인 경우 대응)
        const rawRows = parseCSVRaw(txt);
        if (!rawRows || rawRows.length < 2) return new Map();

        // 값이 가장 많이 채워진 행을 헤더로 사용 (시트가 3행 헤더인 경우 대응)
        let headerIdx = 0;
        let maxFilled = 0;
        for (let i = 0; i < Math.min(5, rawRows.length); i++) {
            const filled = rawRows[i].filter(c => c && c.trim()).length;
            if (filled > maxFilled) { maxFilled = filled; headerIdx = i; }
        }
        const headers = rawRows[headerIdx].map(h => h.trim());
        const bodyRows = rawRows.slice(headerIdx + 1)
            .filter(row => row.some(c => c && c.trim()))
            .map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = (row[i] || '').trim(); });
                return obj;
            });

        const inspectionMap = new Map();

        bodyRows.forEach(row => {
            const name = getFlexibleVal(row, ['학원(교습소)명', '명칭', '학원명', '기관명']);
            if (!name) return;

            // ★ 실제 시트 콜럼명: '지도내용', '위반내용'
            // '이상없음' / '없음' / '-' 는 위반 아님
            const NON_VIOL = ['', '-', '없음', '이상없음', 'none', 'n/a'];
            const violRaw = getFlexibleVal(row,['위반내용', '위반사항']);
            const guidanceRaw = getFlexibleVal(row,['지도내용', '지도사항', '현지조치', '현지지도']);
            const isViolNonEmpty = violRaw && !NON_VIOL.includes(violRaw.trim().toLowerCase());
            const isGuidanceNonEmpty = guidanceRaw && !NON_VIOL.includes(guidanceRaw.trim().toLowerCase());

            const record = {
                date: getFlexibleVal(row,['점검일', '점검일자', '지도점검일']).replace(/-/g, '.'),
                isViolation: isViolNonEmpty,
                violationType: isViolNonEmpty ? violRaw : '',
                // 지도내용은 별도 필드로 보관
                guidanceContent: isGuidanceNonEmpty ? guidanceRaw : '',
                violationDetail: '',
                note: '',
                punishmentDate: getFlexibleVal(row,['행정처분일', '처분일자', '처분일']),
                punishmentCode: getFlexibleVal(row,['행정처분', '처분종류', '행정처분종류']),
                punishmentStart: getFlexibleVal(row,['사전의견청취일', '사전청취']),
                punishmentEnd: '',
                penalty: '',
                fine: getFlexibleVal(row,['과태료', '과태료금액', '부과금액']),
                cancelYn: '',
                excessFee: '',
                correctionStart: '',
                correctionEnd: '',
                correctionContent: getFlexibleVal(row,['비고', '기타']),
                inspectionType: getFlexibleVal(row,['구분', '유형', '점검목적', '점검구분']),
                inspectionItems: '',
                source: '2026',
            };

            const key = normalizeName(name);
            if (!inspectionMap.has(key)) inspectionMap.set(key, []);
            // 날짜 + 위반내용 조합으로 진짜 중복만 제거 (같은 날 여러 위반 허용)
            const existing = inspectionMap.get(key);
            const dupKey = `${record.date}__${record.violationType}__${record.violationDetail}`;
            if (!existing.some(r => `${r.date}__${r.violationType}__${r.violationDetail}` === dupKey)) {
                existing.push(record);
            }
        });

        // 날짜 내림차순 정렬 (최신순)
        inspectionMap.forEach(records => {
            records.sort((a, b) => {
                const toDate = s => { const d = new Date((s || '').replace(/\./g, '-')); return isNaN(d) ? new Date(0) : d; };
                return toDate(b.date) - toDate(a.date);
            });
        });

        console.log(`[2026 점검] 로드 완료: ${inspectionMap.size}개 학원, 총 ${[...inspectionMap.values()].reduce((s, a) => s + a.length, 0)}건`);
        return inspectionMap;
    } catch (error) {
        console.error('Error fetching 2026 inspection data:', error);
        return new Map();
    }
}


/**
 * 강사 명단 시트에서 데이터 가져오기
 * 반환: Map<등록번호, instructor[]>
 */
export async function fetchInstructorData() {
    const INSTRUCTOR_SHEET_ID = '19loj6qHRNUMf72TN0GywJ4xf2eMaFPgK9Tzr9Ob4vR0';
    const url = `https://docs.google.com/spreadsheets/d/${INSTRUCTOR_SHEET_ID}/export?format=csv&gid=288159772`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        const rows = parseCSV(txt);

        const instructorMap = new Map(); // key: 등록번호

        rows.forEach(row => {
            const regNum = (row['등록번호'] || '').trim();
            const name = (row['학원명'] || '').trim();
            if (!regNum && !name) return;

            const instructor = {
                name: (row['강사명'] || '').trim(),
                education: (row['학력'] || '').trim(),
                major: (row['전공'] || '').trim(),
                type: (row['강사구분'] || '').trim(),
                qualification: (row['자격구분'] || '').trim(),
                certificate: (row['자격증'] || '').trim(),
                note: (row['비고'] || '').trim(),
                subject: (row['교습과목'] || '').trim(),
                hireDate: (row['채용일'] || '').trim(),
                dismissDate: (row['해임일'] || '').trim(),
                changeReason: (row['변경사유'] || '').trim(),
                visaType: (row['외국인강사체류자격'] || '').trim(),
                academyName: name,
                regNum: regNum,
            };

            // 등록번호 기준으로 저장 (없으면 학원명 fallback)
            const key = regNum || normalizeName(name);
            if (!instructorMap.has(key)) instructorMap.set(key, []);
            instructorMap.get(key).push(instructor);
        });

        return instructorMap;
    } catch (error) {
        console.error('Error fetching instructor data:', error);
        return new Map();
    }
}

/**
 * 교습소 보조요원 시트에서 데이터 가져오기
 * 반환: Map<신고번호, assistant[]>
 */
export async function fetchAssistantData() {
    const ASSISTANT_SHEET_ID = '19loj6qHRNUMf72TN0GywJ4xf2eMaFPgK9Tzr9Ob4vR0';
    const url = `https://docs.google.com/spreadsheets/d/${ASSISTANT_SHEET_ID}/export?format=csv&gid=1732095678`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        const rows = parseCSV(txt);

        const assistantMap = new Map(); // key: 신고번호 or normalizeName(교습소명)

        rows.forEach(row => {
            const regNum = (row['신고번호'] || row['등록번호'] || '').trim();
            const name = (row['교습소명'] || row['학원명'] || '').trim();
            if (!regNum && !name) return;

            const assistant = {
                name: (row['보조요원명'] || row['강사명'] || '').trim(),
                education: (row['학력'] || '').trim(),
                major: (row['전공'] || '').trim(),
                type: (row['보조요원구분'] || row['강사구분'] || '').trim(),
                qualification: (row['자격구분'] || '').trim(),
                certificate: (row['자격증'] || '').trim(),
                note: (row['비고'] || '').trim(),
                subject: (row['교습과목'] || '').trim(),
                hireDate: (row['채용일'] || '').trim(),
                dismissDate: (row['해임일'] || '').trim(),
                changeReason: (row['변경사유'] || '').trim(),
                academyName: name,
                regNum: regNum,
            };

            const key = regNum || normalizeName(name);
            if (!assistantMap.has(key)) assistantMap.set(key, []);
            assistantMap.get(key).push(assistant);
        });

        return assistantMap;
    } catch (error) {
        console.error('Error fetching assistant data:', error);
        return new Map();
    }
}

export async function fetchSheetName() {

    try {
        const htmlUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
        const response = await fetchWithTimeout(htmlUrl);
        const html = await response.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
            const dateMatch = titleMatch[1].match(/\(([^)]+)\)/);
            if (dateMatch) return dateMatch[1];
        }
    } catch (e) { }
    return DATA_AS_OF;
}

/**
 * 견고한 CSV 파서 (raw: 배열의 배열 반환)
 * 데이터 내의 쉼표(,), 줄바꿈, 따옴표를 완벽하게 처리합니다.
 */
function parseCSVRaw(text) {
    if (!text) return [];

    const rows = [];
    let currentField = '';
    let inQuotes = false;
    let currentRow = [];

    // 유니코드 BOM 제거
    text = text.replace(/^\ufeff/, '');

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
                // 연속된 줄바꿈 무시
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

/**
 * 견고한 CSV 파서 (첫 번째 행을 헤더로 사용)
 */
function parseCSV(text) {
    const rows = parseCSVRaw(text);
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim().replace(/^"|"$/g, ''));

    return rows.slice(1).map(row => {
        const obj = {};
        headers.forEach((h, i) => {
            obj[h] = (row[i] || '').trim().replace(/^"|"$/g, '');
        });
        return obj;
    });
}

/**
 * "도로명 번지 건물명 동-호" 형식을 "도로명 번지, 동동 호호 (건물명)" 으로 정규화
 * e.g. "경기도 하남시 대청로 79 대명강변타운아파트 108-1101"
 *    → "경기도 하남시 대청로 79, 108동 1101호 (대명강변타운아파트)"
 */
function normalizeTutorAddress(address) {
    if (!address) return '';
    const m = address.match(/^(.+?[로길]\s+\d+(?:-\d+)?)\s+(.+?)\s+(\d{2,4})\s*-\s*(\d{3,4})$/);
    if (m) {
        const road = m[1].trim();
        const building = m[2].trim();
        const dong = parseInt(m[3]);
        const ho = parseInt(m[4]);
        return `${road}, ${dong}동 ${ho}호 (${building})`;
    }
    return address;
}

/**
 * 개인과외교습자 시트에서 데이터 가져오기
 * 반환: privateTutor[]
 */
export async function fetchPrivateTutorData() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${PRIVATE_TUTOR_GID}`;
    try {
        const response = await fetchWithTimeout(url);
        const txt = await response.text();
        const rows = parseCSV(txt);

        const tutorMap = new Map();

        rows.forEach(row => {
            const id = (row['신고번호'] || '').trim();
            const name = (row['개인과외교습자명'] || '').trim();
            if (!id && !name) return;

            const key = id || name;
            if (!tutorMap.has(key)) {
                tutorMap.set(key, {
                    id,
                    name,
                    phone: (row['전화번호'] || '').trim(),
                    mobile: (row['휴대폰'] || '').trim(),
                    address: normalizeTutorAddress((row['주소'] || '').trim()),
                    reportDate: (row['신고일'] || '').trim(),
                    status: (row['신고상태'] || '신고').trim(),
                    education: (row['학력'] || '').trim(),
                    region: (row['행정구역'] || '').trim(),
                    teachingPlaces: [], // 교습장소 배열 (여러 곳 가능)
                    email: (row['이메일'] || '').trim(),
                    category: '과외',
                    type: 'privateTutor',
                    founder: { name: '' }, // 검색 호환성
                    subjects: [],
                });
            }

            const tutor = tutorMap.get(key);

            // 교습장소 중복 없이 추가
            const tp = (row['교습장소'] || '').trim();
            const tpt = (row['교습장소구분'] || '').trim();
            if (tp && !tutor.teachingPlaces.some(p => p.place === tp)) {
                tutor.teachingPlaces.push({ place: tp, type: tpt });
            }

            const subject = (row['교습과목'] || '').trim();
            const course = (row['교습과정'] || '').trim();

            if (subject || course) {
                const entry = {
                    field: (row['분야구분'] || '').trim(),
                    series: (row['교습계열'] || '').trim(),
                    course,
                    schoolLevel: (row['초중고구분'] || '').trim(),
                    subject,
                    capacity: (row['수강인원'] || '').trim(),
                    fee: (row['수강료'] || '').trim(),
                    changeDate: (row['변경일'] || '').trim(),
                };
                if (!tutor.subjects.some(s => s.subject === entry.subject && s.course === entry.course)) {
                    tutor.subjects.push(entry);
                }
            }
        });

        return Array.from(tutorMap.values());
    } catch (error) {
        console.error('Error fetching private tutor data:', error);
        return [];
    }
}

/**
 * 교습계열/과정/과목 기반 표준 분당단가 계산 (원/분)
 */
function isIpsiCourse(gwajung, gwamok) {
    const combined = (gwajung + gwamok).toLowerCase();
    if (combined.includes('입시')) return true;
    if (combined.includes('유') || combined.includes('초') ||
        combined.includes('중') || combined.includes('고')) return false;
    return true;
}

export function lookupStandardRate(gyeol, gwajung, gwamok) {
    const g  = (gyeol  || '').toLowerCase();
    const gj = (gwajung || '').toLowerCase();
    const gm = (gwamok  || '').toLowerCase();

    if (g.includes('외국어') || g.includes('어학') || gj.includes('어학')) return 259;
    if (g.includes('진학')) return 234;

    if (g.includes('음악') || gj.includes('음악')) return isIpsiCourse(gj, gm) ? 336 : 224;
    if (g.includes('미술') || gj.includes('미술')) return isIpsiCourse(gj, gm) ? 255 : 212;
    if (g.includes('무용') || gj.includes('무용')) return isIpsiCourse(gj, gm) ? 255 : 212;

    if (g.includes('보통교과') || g.includes('보습') || gj.includes('보습')) {
        const combined = gm + gj;
        if (combined.includes('고등') || combined.includes('고')) return 234;
        if (combined.includes('중등') || combined.includes('중')) return 222;
        if (combined.includes('초등') || combined.includes('초')) return 210;
        return 222;
    }

    if (g.includes('정보') || gj.includes('정보')) return 230;
    if (g.includes('기타') || gj.includes('기타')) return 230;

    return '';
}

export function transformAcademyData(rawRows, inspectionMap = new Map()) {
    const academyMap = new Map();

    rawRows.forEach(row => {
        const name = (row['학원명'] || row['교습소명'] || '').trim();
        if (!name) return;

        const rowId = row['등록번호'] || row['신고번호'] || '';
        const rowStatus = row['등록상태'] || '';
        const ACTIVE = ['개원', '신고'];

        if (!academyMap.has(name)) {
            const normName = normalizeName(name);
            academyMap.set(name, {
                id: rowId,
                name: name,
                category: row['학원종류'] || '교습소',
                field: row['분야구분'] || '',
                address: row['학원주소'] || row['교습소주소'] || '',
                zip: row['우편번호'] || '',
                regDate: row['등록일'] || '',
                status: rowStatus,
                statusDate: row['개원/휴원/폐원일'] || row['개소/휴소/폐소일'] || '',
                changeDate: row['변경일'] || '',
                founder: {
                    name: row['설립자-성명'] || row['교습자-성명'] || '',
                    phone: row['전화번호'] || '',
                    mobile: row['핸드폰'] || '',
                    birth: row['설립자-생년월일'] || row['교습자-생년월일'] || '',
                    address: row['설립자-주소'] || ''
                },
                facilities: {
                    totalArea: row['총면적'] || '',
                    dedicatedArea: row['전용부분면적'] || '',
                    capacityTotal: row['정원합계'] || '',
                    buildingArea: row['건물연면적'] || '',
                    floors: row['총건물층수'] || '',
                    builtDate: row['준공일(사용승인일)'] || '',
                    capacityTemporary: row['일시수용능력인원'] || ''
                },
                courses: [],
                insurances: [],
                inspections: inspectionMap.get(normName) || []
            });
        } else {
            // 같은 이름으로 재신고(재등록)한 경우: 새 항목이 활성 상태이고 기존이 비활성이면 메인 정보를 교체
            const existing = academyMap.get(name);
            if (rowId !== existing.id && ACTIVE.includes(rowStatus) && !ACTIVE.includes(existing.status)) {
                const normName = normalizeName(name);
                Object.assign(existing, {
                    id: rowId,
                    category: row['학원종류'] || existing.category,
                    field: row['분야구분'] || existing.field,
                    address: row['학원주소'] || row['교습소주소'] || existing.address,
                    zip: row['우편번호'] || existing.zip,
                    regDate: row['등록일'] || existing.regDate,
                    status: rowStatus,
                    statusDate: row['개원/휴원/폐원일'] || row['개소/휴소/폐소일'] || existing.statusDate,
                    changeDate: row['변경일'] || existing.changeDate,
                    founder: {
                        name: row['설립자-성명'] || row['교습자-성명'] || existing.founder.name,
                        phone: row['전화번호'] || existing.founder.phone,
                        mobile: row['핸드폰'] || existing.founder.mobile,
                        birth: row['설립자-생년월일'] || row['교습자-생년월일'] || existing.founder.birth,
                        address: row['설립자-주소'] || existing.founder.address
                    },
                    facilities: {
                        totalArea: row['총면적'] || existing.facilities.totalArea,
                        dedicatedArea: row['전용부분면적'] || existing.facilities.dedicatedArea,
                        capacityTotal: row['정원합계'] || existing.facilities.capacityTotal,
                        buildingArea: row['건물연면적'] || existing.facilities.buildingArea,
                        floors: row['총건물층수'] || existing.facilities.floors,
                        builtDate: row['준공일(사용승인일)'] || existing.facilities.builtDate,
                        capacityTemporary: row['일시수용능력인원'] || existing.facilities.capacityTemporary
                    },
                    courses: [],
                    inspections: inspectionMap.get(normName) || existing.inspections
                });
            }
        }

        const academy = academyMap.get(name);

        // 교습과정 중복 방지 로직 개선
        const course = {
            process: row['교습과정'] || '',
            subject: row['교습과목(반)'] || '',
            track: row['교습계열'] || '',
            quota: row['정원'] || '',
            tuitionFee: row['교습비'] || '',          // AL열: 순수 교습비
            totalFee: row['총교습비'] || '',           // AO열: 교습비+재료비 등 합계
            period: row['교습기간'] || row['교습기간(개월)'] || '',
            feePerHour: row['총교습비(시간당)'] || '',
            totalTime: row['총교습시간(분)'] || row['총교습기간(분)'] || '',
            unitPrice: (() => {
                const fee = parseFloat((row['교습비'] || '').toString().replace(/,/g, ''));
                const min = parseFloat((row['총교습시간(분)'] || row['총교습기간(분)'] || '').toString().replace(/,/g, ''));
                return (!isNaN(fee) && fee > 0 && !isNaN(min) && min > 0)
                    ? Math.round(fee / min * 10) / 10
                    : '';
            })(),
            standardUnitPrice: lookupStandardRate(
                row['교습계열'] || '',
                row['교습과정'] || '',
                row['교습과목(반)'] || ''
            ),
            mockExamFee: row['모의고사비'] || '',
            materialFee: row['재료비'] || '',
            clothingFee: row['피복비'] || '',
            mealFee: row['급식비'] || '',
            dormitoryFee: row['기숙사비'] || '',
            vehicleFee: row['차량비'] || '',
            otherFeeTotal: row['기타경비합계'] || '',
            note: row['비고(교습과정)'] || ''
        };
        if (course.subject && !academy.courses.some(c => c.subject === course.subject && c.process === course.process)) {
            academy.courses.push(course);
        }

        const insurance = {
            company: row['보험가입기관'] || '',
            contractor: row['계약업체명'] || '',
            policyNumber: row['계약번호'] || '',
            teachersCount: row['강사수'] || '',
            startDate: row['보험시작일'] || row['보험시작일자'] || '',
            endDate: row['보험종료일'] || row['보험종료일자'] || '',
            compensationPerAccident: row['사고당배상금액'] || '',
            medicalPerPerson: row['인당의료실비금액'] || '',
            compensationPerPerson: row['인당배상금액'] || ''
        };
        if (insurance.policyNumber && !academy.insurances.some(i => i.policyNumber === insurance.policyNumber)) {
            academy.insurances.push(insurance);
        }
    });

    return Array.from(academyMap.values());
}
