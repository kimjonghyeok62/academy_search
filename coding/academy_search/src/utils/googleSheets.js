
export const SHEET_ID = '158ZNBb88raJ1kzBL3eFcgPZS9CGs5in0YtPtiPWfdic';
export const DATA_GID = '1863320151';
export const PASSWORD_GID = '59615156';

export async function fetchGoogleSheetData(gid) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch data: ${response.statusText}`);
        }
        const txt = await response.text();
        return parseCSV(txt);
    } catch (error) {
        console.error("Error fetching Google Sheet:", error);
        throw error;
    }
}

function parseCSV(text) {
    // Simple CSV parser handling quotas (basic implementation)
    // Assumes the first row is header.
    const rows = text.split('\n').map(row => row.trim()).filter(row => row);
    const headers = rows[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());

    const result = [];

    for (let i = 1; i < rows.length; i++) {
        // Handle commas inside quotes
        const row = rows[i];
        const values = [];
        let inQuote = false;
        let currentVal = '';

        for (let char of row) {
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                values.push(currentVal.trim());
                currentVal = '';
            } else {
                currentVal += char;
            }
        }
        values.push(currentVal.trim());

        if (values.length !== headers.length) {
            // In case of parsing mismatch, simple fallback or skip?
            // Let's try to pad or truncate.
        }

        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] ? values[index].replace(/^"|"$/g, '') : '';
        });
        result.push(obj);
    }
    return result;
}

export function transformAcademyData(rawRows) {
    const academyMap = new Map();

    rawRows.forEach(row => {
        const name = (row['학원명'] || '').trim();
        if (!name) return;

        if (!academyMap.has(name)) {
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
                isMultiUse: row['다중이용업소여부'] || '',
                isBoarding: row['기숙학원여부'] || '',
                disclosure: row['수강료 공개구분'] || '',
                ownership: row['건물소유'] || '',
                founder: {
                    name: row['설립자-성명'] || '',
                    birth: row['설립자-생년월일'] || '',
                    address: row['설립자-주소'] || '',
                    phone: row['전화번호'] || '',
                    mobile: row['핸드폰'] || ''
                },
                facilities: {
                    buildingArea: row['건물연면적'] || '',
                    totalArea: row['총면적'] || '',
                    dedicatedArea: row['전용부분면적'] || '',
                    floors: row['총건물층수'] || '',
                    builtDate: row['준공일(사용승인일)'] || '',
                    capacityTemporary: row['일시수용능력인원'] || '',
                    capacityTotal: row['정원합계'] || ''
                },
                courses: [],
                insurances: [],
                inspections: []
            });
        }

        const academy = academyMap.get(name);

        // Add course if unique in this academy
        const course = {
            process: row['교습과정'] || '',
            subject: row['교습과목(반)'] || '',
            track: row['교습계열'] || '',
            quota: row['정원'] || '',
            period: row['교습기간'] || '',
            totalFee: row['총교습비'] || '',
            feePerHour: row['총교습비(시간당)'] || ''
        };
        if (course.subject) {
            const isDuplicateCourse = academy.courses.some(c => c.subject === course.subject && c.process === course.process);
            if (!isDuplicateCourse) academy.courses.push(course);
        }

        // Add insurance if unique
        const insurance = {
            company: row['보험가입기관'] || '',
            contractor: row['계약업체명'] || '',
            policyNumber: row['계약번호'] || '',
            teachersCount: row['강사수'] || '',
            compensationPerAccident: row['사고당배상금액'] || '',
            medicalPerPerson: row['인당의료실비금액'] || '',
            compensationPerPerson: row['인당배상금액'] || '',
            startDate: row['보험시작일'] || '',
            endDate: row['보험종료일'] || ''
        };
        if (insurance.company || insurance.policyNumber) {
            const isDuplicateIns = academy.insurances.some(i => i.policyNumber === insurance.policyNumber);
            if (!isDuplicateIns) academy.insurances.push(insurance);
        }

        // Add inspection if unique
        const inspection = {
            date: row['지도점검 받은 일자'] || '',
            violation: row['위반내역'] || '',
            punishment: row['행정처분내역'] || ''
        };
        if (inspection.date) {
            const isDuplicateInsp = academy.inspections.some(i => i.date === inspection.date && i.violation === inspection.violation);
            if (!isDuplicateInsp) academy.inspections.push(inspection);
        }
    });

    return Array.from(academyMap.values());
}
