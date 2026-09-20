import * as XLSX from 'xlsx';

/**
 * 교육청 표준 엑셀(acaInstiList_*.xlsx)을 파싱하여
 * printTuitionForm / printTuitionFormExternal 이 기대하는
 * academy 객체 배열로 변환한다.
 *
 * ※ 나이스 파일 형식이 두 가지 존재:
 *   - PC 버전  : 열이 13개 이상, 헤더에 "교습비세부내역" 없음
 *   - 모바일 버전: 헤더 row에 "교습비세부내역" 포함, 열 구조 상이
 */
export function parseExcelTuition(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

                // 파일 형식 감지
                // PC 버전  : row0[3] = "주소" (열 13개)
                // 모바일 버전: row0[3] = "교습과정" (열 11개)
                const headerRow = raw[0] || [];
                const isMobile = str(headerRow[3]).includes('교습과정');

                const result = isMobile ? parseMobile(raw) : parsePC(raw);
                resolve(result);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

// ─── PC 버전 파싱 ─────────────────────────────────────────────
// 열 구조: [1]학원명 [3]주소 [4]설립자 [5]분야 [7]기간 [8]총교습시간 [10]교습비 [12]날짜
//          sub1: [5]교습과정 [9]모의고사비 [10]재료비 [11]급식비
//          sub2: [5]교습과목 [9]기숙사비   [10]피복비  [11]차량비
function parsePC(raw) {
    const dataRows = raw.slice(5);
    const academyMap = new Map();

    for (let i = 0; i + 2 < dataRows.length; i += 3) {
        const main = dataRows[i];
        const sub1 = dataRows[i + 1] || [];
        const sub2 = dataRows[i + 2] || [];

        const name = str(main[1]);
        if (!name) continue;

        const address    = str(main[3]);
        const founderRaw = cleanFounderName(str(main[4]));
        const category   = str(main[5]);
        const period     = str(main[7]);
        const totalTime  = str(main[8]);
        const tuitionFee = str(main[10]);
        const dateRaw    = str(main[12]);

        const process    = str(sub1[5]);
        const mockExamFee= str(sub1[9]);
        const materialFee= str(sub1[10]);
        const mealFee    = str(sub1[11]);

        const subject      = str(sub2[5]);
        const dormitoryFee = str(sub2[9]);
        const clothingFee  = str(sub2[10]);
        const vehicleFee   = str(sub2[11]);

        const course = {
            process: [category, process].filter(Boolean).join(' '),
            subject,
            period,
            totalTime,
            tuitionFee,
            mockExamFee,
            materialFee,
            mealFee,
            dormitoryFee,
            clothingFee,
            vehicleFee,
            note: '',
        };

        _upsertAcademy(academyMap, name, address, founderRaw, dateRaw, course);
    }

    return Array.from(academyMap.values());
}

// ─── 모바일 버전 파싱 ─────────────────────────────────────────
// 열 구조: [1]학원명 [2]설립자 [3]교습과정 [5]교습기간 [6]총교습시간 [8]교습비(A) [10]날짜
//          sub1: [7]모의고사비 [8]재료비   [9]급식비
//          sub2: [7]기숙사비   [8]피복비   [9]차량비
function parseMobile(raw) {
    const dataRows = raw.slice(5);
    const academyMap = new Map();

    for (let i = 0; i + 2 < dataRows.length; i += 3) {
        const main = dataRows[i];
        const sub1 = dataRows[i + 1] || [];
        const sub2 = dataRows[i + 2] || [];

        const name = str(main[1]);
        if (!name) continue;

        const founderRaw = cleanFounderName(str(main[2]));
        const process    = str(main[3]);
        const period     = str(main[5]);
        const totalTime  = str(main[6]);
        const tuitionFee = str(main[8]);
        const dateRaw    = str(main[10]);

        const mockExamFee  = str(sub1[7]);
        const materialFee  = str(sub1[8]);
        const mealFee      = str(sub1[9]);
        const dormitoryFee = str(sub2[7]);
        const clothingFee  = str(sub2[8]);
        const vehicleFee   = str(sub2[9]);

        const course = {
            process,
            subject: '',
            period,
            totalTime,
            tuitionFee,
            mockExamFee,
            materialFee,
            mealFee,
            dormitoryFee,
            clothingFee,
            vehicleFee,
            note: '',
        };

        _upsertAcademy(academyMap, name, '', founderRaw, dateRaw, course);
    }

    return Array.from(academyMap.values());
}

// ─── 공통 헬퍼 ────────────────────────────────────────────────
function _upsertAcademy(map, name, address, founderRaw, dateRaw, course) {
    if (!map.has(name)) {
        map.set(name, {
            name,
            address,
            changeDate: formatDate(dateRaw),
            regDate: formatDate(dateRaw),
            category: '',
            founder: { name: founderRaw || '' },
            courses: [],
        });
    }

    const academy = map.get(name);
    academy.courses.push(course);

    if (dateRaw) {
        const d = formatDate(dateRaw);
        if (!academy.changeDate || d > academy.changeDate) {
            academy.changeDate = d;
            academy.regDate = d;
        }
    }
}

function cleanFounderName(v) {
    if (!v) return '';
    if (/^\d+$/.test(v)) return '';
    if (v.length < 3) return '';
    return v;
}

function str(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

function formatDate(raw) {
    if (!raw) return '';
    const s = String(raw).replace(/\D/g, '');
    if (s.length === 8) {
        return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
    }
    return raw;
}
