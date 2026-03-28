import * as XLSX from 'xlsx';

/**
 * 교육청 표준 엑셀(acaInstiList_*.xlsx)을 파싱하여
 * printTuitionForm / printTuitionFormExternal 이 기대하는
 * academy 객체 배열로 변환한다.
 *
 * 엑셀 구조 (0-indexed 열):
 *   0: 순번  1: 학원명  2: 연락처  3: 주소  4: 설립·운영자
 *   5: 교습계열(메인행) / 교습과정(서브1) / 교습과목(서브2)
 *   6: 정원  7: 교습기간(일)  8: 총교습시간(분)
 *   9: 교습비등(C=A+B) / 모의고사비(서브1) / 기숙사비(서브2)
 *  10: 교습비(A)       / 재료비(서브1)    / 피복비(서브2)
 *  11: 기타경비(B)     / 급식비(서브1)    / 차량비(서브2)
 *  12: 적용일(최종교습비변경일)
 *
 * 헤더 5행을 건너뛴 뒤, 매 3행이 1개 과목을 구성한다.
 */
export function parseExcelTuition(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

                // 헤더 5행 제거 후 데이터 행만 추출
                const dataRows = raw.slice(5);

                // 3행씩 묶어 course 파싱
                const academyMap = new Map(); // 학원명 → academy

                for (let i = 0; i + 2 < dataRows.length; i += 3) {
                    const main = dataRows[i];
                    const sub1 = dataRows[i + 1] || [];
                    const sub2 = dataRows[i + 2] || [];

                    const name     = str(main[1]);
                    if (!name) continue;

                    const address  = str(main[3]);
                    const founderRaw = cleanFounderName(str(main[4]));
                    const category = str(main[5]); // 교습계열
                    const period   = str(main[7]); // 교습기간(일)
                    const totalTime = str(main[8]); // 총교습시간(분)
                    const tuitionFee = str(main[10]); // 교습비(A)
                    const dateRaw  = str(main[12]); // 적용일 (e.g. "20250724")

                    const process = str(sub1[5]); // 교습과정
                    const mockExamFee   = str(sub1[9]);
                    const materialFee   = str(sub1[10]);
                    const mealFee       = str(sub1[11]);

                    const subject = str(sub2[5]); // 교습과목
                    const dormitoryFee  = str(sub2[9]);
                    const clothingFee   = str(sub2[10]);
                    const vehicleFee    = str(sub2[11]);

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

                    if (!academyMap.has(name)) {
                        academyMap.set(name, {
                            name,
                            address,
                            changeDate: formatDate(dateRaw),
                            regDate: formatDate(dateRaw),
                            category: '',
                            founder: { name: founderRaw || '' },
                            courses: [],
                        });
                    }

                    const academy = academyMap.get(name);
                    academy.courses.push(course);

                    // 적용일은 마지막 값으로 갱신(가장 최근)
                    if (dateRaw) {
                        const d = formatDate(dateRaw);
                        if (!academy.changeDate || d > academy.changeDate) {
                            academy.changeDate = d;
                            academy.regDate = d;
                        }
                    }
                }

                resolve(Array.from(academyMap.values()));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
        reader.readAsArrayBuffer(file);
    });
}

// 설립·운영자 필드 정제: 숫자만이거나 3자 미만이면 공란 처리
function cleanFounderName(v) {
    if (!v) return '';
    if (/^\d+$/.test(v)) return '';   // 순수 숫자 ("5", "12" 등)
    if (v.length < 3) return '';      // 너무 짧은 값
    return v;
}

// null/undefined → 빈 문자열, 숫자는 문자열로
function str(v) {
    if (v === null || v === undefined) return '';
    return String(v).trim();
}

// "20250724" → "2025.07.24"  (formatChangeDateKo 에서 분리 가능하도록)
function formatDate(raw) {
    if (!raw) return '';
    const s = String(raw).replace(/\D/g, '');
    if (s.length === 8) {
        return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
    }
    return raw;
}
