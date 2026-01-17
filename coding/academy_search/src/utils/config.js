// 데이터 기준일을 저장하는 설정 파일
// 구글 시트의 메타데이터 시트에서 가져옵니다

export const METADATA_GID = '0'; // 첫 번째 시트 (메타데이터용)

export async function fetchDataAsOf(sheetId) {
    try {
        // 첫 번째 시트의 이름을 CSV 첫 행의 특정 셀에서 가져오기
        // 또는 별도의 메타데이터 셀에서 가져오기
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${METADATA_GID}&range=A1:A1`;
        const response = await fetch(url);
        if (response.ok) {
            const text = await response.text();
            // CSV의 첫 번째 셀 값이 시트 이름
            const value = text.trim().replace(/^"|"$/g, '');
            return value;
        }
        return null;
    } catch (error) {
        console.error("Error fetching data as of:", error);
        return null;
    }
}
