
export const SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
export const DATA_GID = '1863320151';
export const PASSWORD_GID = '59615156';

// 지도점검 전용 시트 (2025년 이전 통계)
export const INSPECTION_SHEET_ID = '1xxaBOZMuLqozEm10f4lXnme_ARLfRHzGcsk5QlqoYKI';
export const INSPECTION_GID = '1438819657';

export const DATA_AS_OF = '2026.  1.  17. (토) 기준';

// 매칭용 이름 정규화 (공백 및 특수문자 모두 제거)
const normalizeName = (name) => (name || '').toString().replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

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

export async function fetchGoogleSheetData(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    try {
        const response = await fetch(url);
        const txt = await response.text();
        return parseCSV(txt);
    } catch (error) {
        console.error("Error fetching Google Sheet:", error);
        throw error;
    }
}

export async function fetchInspectionData() {
    const url = `https://docs.google.com/spreadsheets/d/${INSPECTION_SHEET_ID}/export?format=csv&gid=${INSPECTION_GID}`;
    try {
        const response = await fetch(url);
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
        const response = await fetch(url);
        const txt = await response.text().then(t => t.replace(/^\uFEFF/, '')); // BOM 제거

        // ── 원시 행 파싱 (inspectionSheets.js의 parseCSVText와 동일) ──
        const rawRows = [];
        let currentField = '';
        let inQuotes = false;
        let currentRow = [];
        for (let i = 0; i < txt.length; i++) {
            const char = txt[i];
            const nextChar = txt[i + 1];
            if (char === '"' && inQuotes && nextChar === '"') { currentField += '"'; i++; }
            else if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { currentRow.push(currentField); currentField = ''; }
            else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (i === 0 || txt[i - 1] === '\r' || txt[i - 1] === '\n') {
                    // 연속 줄바꿈 무시
                } else {
                    currentRow.push(currentField);
                    rawRows.push(currentRow);
                    currentField = '';
                    currentRow = [];
                }
            } else { currentField += char; }
        }
        if (currentRow.length > 0 || currentField) {
            currentRow.push(currentField);
            rawRows.push(currentRow);
        }

        if (!rawRows || rawRows.length < 2) return new Map();

        // ── 가장 많은 값을 가진 행을 헤더로 자동 감지 (fetchRecentRawRows와 동일) ──
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

        // ── colVal 스타일로 유연하게 컬럼 값 추출 ──
        const cv = (rowObj, keys) => {
            for (const k of keys) {
                const found = Object.keys(rowObj).find(rk =>
                    rk.replace(/\s+/g, '') === k.replace(/\s+/g, '') ||
                    rk.replace(/\s+/g, '').includes(k.replace(/\s+/g, ''))
                );
                if (found && rowObj[found] !== undefined && String(rowObj[found]).trim() !== '') {
                    return String(rowObj[found]).trim();
                }
            }
            return '';
        };

        const inspectionMap = new Map();

        bodyRows.forEach(row => {
            const name = cv(row, ['학원(교습소)명', '명칭', '학원명', '기관명']);
            if (!name) return;

            // ★ 실제 시트 콜럼명: '지도내용', '위반내용'
            // '이상없음' / '없음' / '-' 는 위반 아님
            const NON_VIOL = ['', '-', '없음', '이상없음', 'none', 'n/a'];
            const violRaw = cv(row, ['위반내용', '위반사항']);
            const guidanceRaw = cv(row, ['지도내용', '지도사항', '현지조치', '현지지도']);
            const isViolNonEmpty = violRaw && !NON_VIOL.includes(violRaw.trim().toLowerCase());
            const isGuidanceNonEmpty = guidanceRaw && !NON_VIOL.includes(guidanceRaw.trim().toLowerCase());

            const record = {
                date: cv(row, ['점검일', '점검일자', '지도점검일']).replace(/-/g, '.'),
                isViolation: isViolNonEmpty,
                violationType: isViolNonEmpty ? violRaw : '',
                // 지도내용은 별도 필드로 보관
                guidanceContent: isGuidanceNonEmpty ? guidanceRaw : '',
                violationDetail: '',
                note: '',
                punishmentDate: cv(row, ['행정처분일', '처분일자', '처분일']),
                punishmentCode: cv(row, ['행정처분', '처분종류', '행정처분종류']),
                punishmentStart: cv(row, ['사전의견청취일', '사전청취']),
                punishmentEnd: '',
                penalty: '',
                fine: cv(row, ['과태료', '과태료금액', '부과금액']),
                cancelYn: '',
                excessFee: '',
                correctionStart: '',
                correctionEnd: '',
                correctionContent: cv(row, ['비고', '기타']),
                inspectionType: cv(row, ['구분', '유형', '점검목적', '점검구분']),
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
    const url = `https://docs.google.com/spreadsheets/d/${INSTRUCTOR_SHEET_ID}/export?format=csv&gid=0`;
    try {
        const response = await fetch(url);
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

export async function fetchSheetName() {

    try {
        const htmlUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
        const response = await fetch(htmlUrl);
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
 * 견고한 CSV 파서
 * 데이터 내의 쉼표(,), 줄바꿈, 따옴표를 완벽하게 처리합니다.
 */
function parseCSV(text) {
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

export function transformAcademyData(rawRows, inspectionMap = new Map()) {
    const academyMap = new Map();

    rawRows.forEach(row => {
        const name = (row['학원명'] || '').trim();
        if (!name) return;

        if (!academyMap.has(name)) {
            const normName = normalizeName(name);
            academyMap.set(name, {
                id: row['등록번호'] || '',
                name: name,
                category: row['학원종류'] || '',
                field: row['분야구분'] || '',
                address: row['학원주소'] || '',
                zip: row['우편번호'] || '',
                regDate: row['등록일'] || '',
                status: row['등록상태'] || '',
                statusDate: row['개원/휴원/폐원일'] || '',
                founder: {
                    name: row['설립자-성명'] || '',
                    phone: row['전화번호'] || '',
                    mobile: row['핸드폰'] || '',
                    birth: row['설립자-생년월일'] || '',
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
        }

        const academy = academyMap.get(name);

        // 교습과정 중복 방지 로직 개선
        const course = {
            process: row['교습과정'] || '',
            subject: row['교습과목(반)'] || '',
            track: row['교습계열'] || '',
            quota: row['정원'] || '',
            totalFee: row['총교습비'] || '',
            period: row['교습기간'] || '',
            feePerHour: row['총교습비(시간당)'] || ''
        };
        if (course.subject && !academy.courses.some(c => c.subject === course.subject && c.process === course.process)) {
            academy.courses.push(course);
        }

        const insurance = {
            company: row['보험가입기관'] || '',
            contractor: row['계약업체명'] || '',
            policyNumber: row['계약번호'] || '',
            teachersCount: row['강사수'] || '',
            startDate: row['보험시작일'] || '',
            endDate: row['보험종료일'] || '',
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
