import { useState } from 'react';

export default function AdminSanctionAccordion() {
    const [open, setOpen] = useState(false);
    const [openSections, setOpenSections] = useState({});

    const toggleMain = () => {
        const next = !open;
        setOpen(next);
        // 열 때 모든 하위 섹션 자동 펼침
        if (next) setOpenSections({ hagwon: true, gyosu: true, private: true, cases: true });
    };

    const toggleSection = (key) =>
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

    const thStyle = {
        padding: '7px 10px', backgroundColor: '#f1f5f9', color: 'var(--text-main)',
        fontWeight: '700', fontSize: '0.78rem', textAlign: 'left',
        borderBottom: '1px solid var(--border-color)', whiteSpace: 'nowrap'
    };
    const tdStyle = {
        padding: '6px 10px', fontSize: '0.78rem', color: 'var(--text-main)',
        borderBottom: '1px solid var(--border-color)', verticalAlign: 'top', lineHeight: '1.5'
    };
    const catTd = { ...tdStyle, backgroundColor: '#f1f5f9', fontWeight: '700', color: '#374151', fontSize: '0.75rem' };
    const sanctionTd = { ...tdStyle, textAlign: 'center', whiteSpace: 'nowrap', fontSize: '0.76rem' };
    const taxTd = { ...tdStyle, textAlign: 'center', fontSize: '0.85rem' };

    const SectionHeader = ({ label, sKey, color = '#f8fafc' }) => (
        <div onClick={() => toggleSection(sKey)}
            style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', backgroundColor: color, borderRadius: '8px',
                cursor: 'pointer', marginBottom: '8px',
                border: '1px solid var(--border-color)', userSelect: 'none'
            }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-main)' }}>{label}</span>
            <span style={{
                fontSize: '0.7rem', color: 'var(--text-muted)',
                transform: openSections[sKey] ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s', display: 'inline-block'
            }}>▼</span>
        </div>
    );

    const SanctionTable = ({ rows }) => (
        <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                    <tr>
                        <th style={thStyle}>위반사항</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>과태료<br />대상</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>1차</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>2차</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>3차</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) =>
                        row.isCat ? (
                            <tr key={i}><td colSpan={5} style={catTd}>▪ {row.label}</td></tr>
                        ) : (
                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                <td style={tdStyle}>{row.act}</td>
                                <td style={taxTd}>{row.tax || ''}</td>
                                <td style={sanctionTd}>{row.r1 || ''}</td>
                                <td style={sanctionTd}>{row.r2 || ''}</td>
                                <td style={sanctionTd}>{row.r3 || ''}</td>
                            </tr>
                        )
                    )}
                </tbody>
            </table>
        </div>
    );

    const hagwonRows = [
        { isCat: true, label: '시설' },
        { act: '시설기준 미달(축소운영)', r1: '정지', r2: '말소' },
        { act: '무단확장·무단위치변경', r1: '정지', r2: '말소' },
        { act: '시설 임의 변경', r1: '시정명령', r2: '정지' },
        { act: '등록된 시설 전부를 타용도로 무단 전용', r1: '말소' },
        { isCat: true, label: '설립·운영자' },
        { act: '설립·운영자 무단변경', r1: '정지', r2: '말소' },
        { isCat: true, label: '교습비등' },
        { act: '교습비등 초과 징수', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 미게시(학원 내·외부)', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 반환기준 미게시', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '학습자 모집 광고 시 교습비등 표시사항 미표시', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 영수증 미교부', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 미반환', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 변경 미등록', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습비등 허위 표시·게시(학원 내·외부)', tax: '○', r1: '정지', r2: '말소' },
        { act: '학습자 모집 광고 시 교습비등 허위 표시', tax: '○', r1: '정지', r2: '말소' },
        { isCat: true, label: '강사 등' },
        { act: '무자격 강사·영양사 및 생활지도 담당인력 채용', r1: '정지', r2: '말소' },
        { act: '강사 변경 미등록 및 채용·해임 미통보', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '학원강사 인적사항 허위게시 또는 미게시', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '성범죄 경력·아동학대전력 조회 미실시 (아동·청소년 대상)', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '성범죄자·아동학대범죄 전력자 채용 (아동·청소년 대상)', tax: '○', r1: '말소' },
        { act: '마약·대마 또는 향정신성의약품 중독자 채용', r1: '정지', r2: '말소' },
        { isCat: true, label: '교습과정' },
        { act: '등록 외 교습과정 운영', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '교습과목 위반', r1: '시정명령', r2: '정지', r3: '말소' },
        { isCat: true, label: '운영' },
        { act: '허위·부정 등록', r1: '말소' },
        { act: '개원예정일로부터 2월 경과 시까지 무단 미개원', r1: '말소' },
        { act: '행정처분 게시문 훼손', r1: '말소' },
        { act: '보호자 동승 없이 통학버스 운행 중 어린이 사망·중상해', r1: '말소' },
        { act: '아동학대 행위', r1: '말소' },
        { act: '2월 이상 무단 휴원', tax: '○', r1: '정지1월', r2: '말소' },
        { act: '정지명령 불이행', r1: '정지1월', r2: '말소' },
        { act: '허위증명 발급', r1: '정지', r2: '말소' },
        { act: '숙박시설 갖춘 학원 등록기준 미달', r1: '정지', r2: '말소' },
        { act: '학원의 무단 기숙시설 운영', r1: '정지', r2: '말소' },
        { act: '행정명령 미이행(지도·감독 거부, 방해 등)', tax: '○', r1: '정지', r2: '말소' },
        { act: '교습비등 조정명령 불이행', tax: '○', r1: '정지', r2: '말소' },
        { act: '교습시간 위반 / 허위과대광고 / 생활지도 불철저 부조리 등', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '보험 또는 공제사업 미가입', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '장부(서류) 미비치', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '학원설립·운영등록증명서 미게시', tax: '○', r1: '시정명령', r2: '정지', r3: '말소' },
        { act: '장부(서류) 미기록·부실기재', tax: '○', r1: '시정명령', r2: '정지' },
    ];

    const gyosusoRows = [
        { isCat: true, label: '시설' },
        { act: '무단확장·무단위치변경', r1: '정지', r2: '폐지' },
        { act: '시설 임의변경', r1: '시정명령', r2: '정지' },
        { isCat: true, label: '교습자' },
        { act: '교습자 무단변경', r1: '정지', r2: '폐지' },
        { isCat: true, label: '강사 등' },
        { act: '강사채용 또는 보조요원 교습행위', r1: '정지', r2: '폐지' },
        { act: '성범죄 경력·아동학대전력 조회 미실시 (아동·청소년 대상)', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '임시 교습자·보조원 채용·해임 미신고', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '성범죄자·아동학대범죄 전력자 채용 (아동·청소년 대상)', r1: '폐지' },
        { isCat: true, label: '교습비등' },
        { act: '교습비등 초과 징수 / 미게시 / 반환기준 미게시 / 영수증 미교부 / 미반환', tax: '○', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '교습비등 변경 미신고', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '교습비등 허위 표시·게시 / 광고 허위 표시', tax: '○', r1: '정지', r2: '폐지' },
        { isCat: true, label: '교습과정' },
        { act: '신고 외 교습과목 교습', r1: '정지', r2: '폐지' },
        { isCat: true, label: '운영' },
        { act: '허위·부정신고 / 행정처분 게시문 훼손 / 아동학대 행위', r1: '폐지' },
        { act: '2월 이상 무단 휴소', tax: '○', r1: '정지1월', r2: '폐지' },
        { act: '정지명령 불이행', r1: '정지1월', r2: '폐지' },
        { act: '행정명령 미이행 / 교습비등 조정명령 불이행', tax: '○', r1: '정지', r2: '폐지' },
        { act: '생활지도 불철저 부조리 / 인원 초과 / 명칭위반 / 교습시간 위반 / 허위과대광고', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '신고증명서 미게시 / 보험 미가입 / 장부(서류) 미비치', tax: '○', r1: '시정명령', r2: '정지', r3: '폐지' },
        { act: '장부(서류) 미기록·부실기재', tax: '○', r1: '시정명령', r2: '정지' },
    ];

    const privateRows = [
        { isCat: true, label: '교습비등' },
        { act: '교습비등 초과 징수 / 미게시 / 반환기준 미게시 / 영수증 미교부 / 미반환', tax: '○', r1: '시정명령', r2: '정지', r3: '중지' },
        { act: '교습비등 변경 미신고', r1: '시정명령', r2: '정지', r3: '중지' },
        { act: '교습비등 허위 표시·게시 / 광고 허위 표시', tax: '○', r1: '정지', r2: '중지' },
        { isCat: true, label: '운영' },
        { act: '허위·부정신고 / 아동학대 행위', r1: '중지' },
        { act: '교습비등 조정명령 불이행 / 행정명령 미이행(거부, 방해 등)', tax: '○', r1: '정지', r2: '중지' },
        { act: '교습과목 임의변경 / 허위과대광고 / 교습장소 변경 미신고 / 교습시간 위반', r1: '시정명령', r2: '정지', r3: '중지' },
        { act: '장부 미비치 / 신고증명서 미게시 / 장소 표지 미부착 / 장부 부실기재', tax: '○', r1: '시정명령', r2: '정지', r3: '중지' },
        { isCat: true, label: '강사' },
        { act: '강사 채용', r1: '중지' },
    ];

    const cases = [
        { title: '시설기준 미달(축소운영)', ref: '법§6①·§14, 령§7·§14', sanction: '1차 정지 → 2차 말소', detail: '강의실을 사무실로 전용하여 기준 미달 / 시설 임의변경으로 등록기준 미달 / 유휴시설·창고 전용', action: '시설면적 확보' },
        { title: '무단 위치 확장·변경', ref: '법§6①·§14, 령§7·§14', sanction: '1차 정지 → 2차 말소', detail: '교육지원청에 변경등록 없이 무단 위치 변경 또는 확장', action: '변경된 장소로 학원 변경등록' },
        { title: '등록(신고) 시설 임의 변경', ref: '령§7·§14, 조례§2~§4', sanction: '1차 시정명령 → 2차 정지', detail: '변경등록 없이 시설 임의변경 / 강의실과 사무실을 서로 변경 사용', action: '시설 변경등록' },
        { title: '교습비등 초과 징수', ref: '법§15④', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '100~300만원', detail: '등록 교습비 초과 징수 (예: 7만원 등록 후 8만원 실 징수)', action: '교습비 변경등록 또는 등록된 교습비 징수' },
        { title: '교습비등 (변경) 미등록', ref: '법§6·§14·§14의2', sanction: '1차 시정명령 → 2차 정지 → 3차 말소·폐지·중지', detail: '교습비 변경 결정 후 미등록 / 등록 후 교습비 미등록 운영', action: '교습비등 변경등록' },
        { title: '교습비등 미게시·미표시·미고지', ref: '법§15③, 규칙§8의2②', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '50~200만원', detail: '서류철·책상서랍 보관(게시 X) / 내·외부 눈에 띄는 곳 미게시 / 학부모 서면고지 요청에 불응', action: '학습자가 보기 쉬운 장소에 게시' },
        { title: '교습비등 거짓 표시·게시', ref: '법§15④', sanction: '1차 정지 → 2차 말소', fine: '100~300만원', detail: '등록 교습비가 아닌 금액을 학원 내·외부에 거짓 표시·게시', action: '등록된 교습비등 표시 및 게시' },
        { title: '교습비등 영수증 미교부', ref: '법§15①', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '100~300만원', detail: '영수증 미교부 / 봉투형 인장만 날인 (신용카드 매출전표에 성명·과목·기간 표시 시 인정)', action: '교습비등 영수증 교부' },
        { title: '교습비등 미반환', ref: '법§18, 령§18', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '일부 50~200만원 / 전부 100~300만원', detail: '반환기준 해당 사유 발생 시 미환불 / 학원 귀책 교습 중단 시 잔여일수 일할 미환불', action: '교습비등 환불' },
        { title: '성범죄경력·아동학대전력 미조회', ref: '청소년성보호법§56·§67, 아동복지법§29의3', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '성범죄 300~500만원 / 아동학대 250~500만원', detail: '채용 전 조회 없이 강사·직원 채용 / "교육청 등록 시 조회" 오해 / 여성 직원·청소부 제외 실수', action: '아동·청소년 성범죄 경력 및 아동학대 전력 조회' },
        { title: '무자격 강사 채용', ref: '법§13·§13의2, 령§12, 규칙§10의2', sanction: '1차 정지 → 2차 말소', fine: '외국인강사 미검증 채용 시 100~300만원', detail: '자격 없는 강사·외국인 채용 / 대학 1학년 재학생 채용 / 원장 무자격 직강사 / 무자격자 보조강사 실교습', action: '강사 자격기준 충족, 외국인 강사 채용 전 검증' },
        { title: '강사 등 인적사항 거짓 게시·미게시', ref: '법§13', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '50~200만원(미게시만)', detail: '강사 인적사항 미게시 / 이름·학력·과목만 기재하고 자격·생년월일 누락 / 서류철·책상서랍 보관', action: '강사 게시표 게시' },
        { title: '강사 등 채용·해임 미등록', ref: '법§6①', sanction: '1차 시정명령 → 2차 정지 → 3차 등록말소', detail: '채용·해임일 15일 이내 변경등록 않은 경우 / 시간제 강사 미등록 / 원장 무등록 직강사', action: '강사 등 채용·해임 등록' },
        { title: '등록(신고) 외 교습과정·과목 운영', ref: '법§6①·§14①', sanction: '학원: 1차 시정→2차 정지→3차 말소 / 교습소: 1차 정지→2차 폐지', detail: '입시학원에서 영어회화 교습 / 어학원에서 보통교과 교습 / 피아노 교습소에서 미신고 바이올린 교습', action: '등록된 교습과정(목) 운영 / 변경등록 후 운영' },
        { title: '허위증명 발급', sanction: '1차 정지 → 2차 말소', detail: '채용계약서 없이 미등재자에게 경력증명서 거짓 발급 / 허위 실습과정 이수증명서 발급', action: '교육지원청에서 경력증명서 발급' },
        { title: '지도·감독 거부 또는 방해', ref: '법§16③', sanction: '1차 정지 → 2차 말소', fine: '100~300만원', detail: '민원 확인 현장 방문 시 지도점검 거부', action: '지도점검 협조 및 재발방지 확인서 제출' },
        { title: '어린이통학버스 안전교육 미이수', ref: '도교법§53의3, §160의2', fine: '8만원', detail: '설립·운영자 변경 후 안전교육 미이수 / 차기 교육기간 경과 후 미이수', action: '운영자·운전자·동승보호자 안전교육 이수' },
        { title: '어린이통학버스 안전운행기록 의무 위반', ref: '도교법§53의3', fine: '8만원', detail: '운영자가 안전운행기록 작성·보관하지 않은 경우 / 매 분기 소관 교육지원청에 미제출', action: '안전운행기록 작성·보관 및 교육지원청 제출' },
        { title: '보험 또는 공제사업 미가입', ref: '법§4③, 조례§12', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', fine: '30~300만원', detail: '신규 설립 7일 이상 경과 후 미가입 / 가입기간 만료 후 재가입 지연 / 보상금액 기준 미달', action: '기준 금액으로 정해진 기간에 가입' },
        { title: '교습시간 제한 위반', ref: '법§16②, 조례§14', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', detail: '학교교과 교습학원·교습소에서 조례 정한 제한시간 초과 교습', action: '교습시간 준수' },
        { title: '거짓·과대광고', ref: '법§17①9, 표시광고법§3①1, 공교육정상화법§8④', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', detail: '"100% 합격보장" 문구 / 비지정인데 "교육부 지정" 표기 / 계열학원 합격자를 본원 합격자로 광고 / 과도한 선행학습 유발', action: '정확한 자료 사용, 오인성 없을 것' },
        { title: '명칭사용 위반', ref: '법§15의2, 유아교육법§28의2', sanction: '1차 시정명령 → 2차 정지 → 3차 말소', detail: '음악학원 설립 후 "뮤직 아카데미" 간판 / 학교 혼동 명칭 / 유치원 유사명칭 사용', action: '등록(신고)한 학원(교습소) 명칭 사용' },
        { title: '장부(서류) 부실기재', ref: '법§15의3, 규칙§16', sanction: '1차 시정명령 → 2차 정지', fine: '50~200만원', detail: '직원 명부와 강사등록 현황 불일치', action: '비치 의무 있는 장부 작성' },
        { title: '임시교습자 관련사항 위반', ref: '령§15②', sanction: '1차 시정명령 → 2차 정지 → 3차 폐지', detail: '교습소 교습자 출산·질병 시 사전 신고 없이 임시교습자 교습', action: '진단서 등 증빙자료 갖추어 임시교습자 채용 승인 통보' },
        { title: '교습소의 강사 채용·운영', ref: '령§15②', sanction: '1차 정지 → 2차 폐지', detail: '교습소는 교습자 외 강사를 둘 수 없으나 강사 채용 운영', action: '채용한 강사 해임' },
        { title: '주거지 개인과외교습자 표지 의무 위반', ref: '법§14의2⑩, 규칙§14의5', sanction: '1차 시정명령 → 2차 정지 → 3차 중지', fine: '50~200만원', detail: '개인과외 교습장소임을 알 수 있는 표지 미부착', action: '개인과외 표지 부착' },
    ];

    return (
        <div style={{ marginTop: '8px' }}>
            {/* 메인 토글 */}
            <div onClick={toggleMain}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                    backgroundColor: '#f1f5f9', border: '1px solid var(--border-color)', userSelect: 'none'
                }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>⚖️ 행정처분 기준</span>
                <span style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s', display: 'inline-block'
                }}>▼</span>
            </div>

            {open && (
                <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease' }}>
                    {/* 처분기간 안내 */}
                    <div style={{
                        fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px',
                        padding: '8px 12px', backgroundColor: '#fffbeb',
                        borderRadius: '8px', border: '1px solid #fde68a', lineHeight: '1.7'
                    }}>
                        <strong style={{ color: '#92400e' }}>📌 처분기간 안내</strong><br />
                        · 정지처분: <strong>7일</strong> (단, 정지명령 불이행의 정지처분은 <strong>1월(30일)</strong>)<br />
                        · 개인과외교습자 중지처분 기간: <strong>1년</strong>
                    </div>

                    {/* 학원 */}
                    <SectionHeader label="🏫 1. 학원" sKey="hagwon" color="#eff6ff" />
                    {openSections['hagwon'] && <SanctionTable rows={hagwonRows} />}

                    {/* 교습소 */}
                    <SectionHeader label="🏠 2. 교습소" sKey="gyosu" color="#f0fdf4" />
                    {openSections['gyosu'] && <SanctionTable rows={gyosusoRows} />}

                    {/* 개인과외교습자 */}
                    <SectionHeader label="👤 3. 개인과외교습자" sKey="private" color="#fdf4ff" />
                    {openSections['private'] && <SanctionTable rows={privateRows} />}

                    {/* 주요 위반사례 상세 */}
                    <SectionHeader label="📋 주요 위반사례 상세" sKey="cases" />
                    {openSections['cases'] && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                            {cases.map((c, i) => (
                                <div key={i} style={{ borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                                    <div style={{ padding: '8px 12px', backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-color)' }}>
                                        <span style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--text-main)' }}>▪ {c.title}</span>
                                        {c.ref && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '8px' }}>{c.ref}</span>}
                                    </div>
                                    <div style={{ padding: '8px 12px', fontSize: '0.78rem', lineHeight: '1.8', color: 'var(--text-main)' }}>
                                        {c.sanction && <div><span style={{ color: '#dc2626', fontWeight: '700' }}>처분: </span>{c.sanction}</div>}
                                        {c.fine && <div><span style={{ color: '#d97706', fontWeight: '700' }}>과태료: </span>{c.fine}</div>}
                                        <div><span style={{ color: '#6b7280', fontWeight: '700' }}>사례: </span>{c.detail}</div>
                                        <div><span style={{ color: '#059669', fontWeight: '700' }}>조치: </span>{c.action}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* 장부·서류 안내 */}
                    <div style={{
                        marginTop: '8px', padding: '10px 14px', backgroundColor: '#f8fafc',
                        borderRadius: '8px', border: '1px solid var(--border-color)',
                        fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.8'
                    }}>
                        <strong style={{ color: 'var(--text-main)' }}>📂 학원 장부·서류 비치 의무 [학원법 시행규칙 별표2]</strong><br />
                        원칙(준영구) · 등록증명서(준영구) · 신고증명서(준영구) · 개인과외신고증명서(준영구)<br />
                        수입·지출 장부(5년) · 교습비 영수증 원부(5년) · 수강생 대장(3년) · 직원명부(계속)<br />
                        <span style={{ fontSize: '0.72rem' }}>※ 현금출납부·수강생대장·직원명부는 전자문서 관리 가능</span>
                    </div>
                </div>
            )}
        </div>
    );
}
