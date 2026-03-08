import { useState } from 'react';

export default function FineGuideAccordion() {
    const [open, setOpen] = useState(false);
    const [openSections, setOpenSections] = useState({});

    const toggleMain = () => {
        const next = !open;
        setOpen(next);
        // 열 때 모든 하위 섹션 자동 펼침
        if (next) setOpenSections({ hagwon: true, youth: true, child: true, traffic: true });
    };

    const toggleSection = (key) =>
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

    const thStyle = {
        padding: '7px 10px', backgroundColor: '#f1f5f9',
        color: 'var(--text-main)', fontWeight: '700',
        fontSize: '0.78rem', textAlign: 'left',
        borderBottom: '1px solid var(--border-color)',
        whiteSpace: 'nowrap'
    };
    const tdStyle = {
        padding: '6px 10px', fontSize: '0.78rem',
        color: 'var(--text-main)', borderBottom: '1px solid var(--border-color)',
        verticalAlign: 'top', lineHeight: '1.5'
    };
    const numTd = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };

    const SectionHeader = ({ label, sKey }) => (
        <div onClick={() => toggleSection(sKey)}
            style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', backgroundColor: '#f8fafc',
                borderRadius: '8px', cursor: 'pointer', marginBottom: '8px',
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

    return (
        <div style={{ marginTop: '8px' }}>
            <div onClick={toggleMain}
                style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', borderRadius: '12px', cursor: 'pointer',
                    backgroundColor: '#f1f5f9', border: '1px solid var(--border-color)',
                    userSelect: 'none'
                }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-main)' }}>
                    📋 과태료 부과기준
                </span>
                <span style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.25s', display: 'inline-block'
                }}>▼</span>
            </div>

            {open && (
                <div style={{ marginTop: '12px', animation: 'fadeIn 0.2s ease' }}>
                    {/* 학원법 시행령 */}
                    <SectionHeader label="📌 학원법 시행령 [별표 5]" sKey="hagwon" />
                    {openSections['hagwon'] && (
                        <div style={{ marginBottom: '16px', padding: '0 4px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.7' }}>
                                <strong style={{ color: 'var(--text-main)' }}>1. 일반기준</strong><br />
                                가. 위반횟수에 따른 가중기준은 최근 <strong>1년간</strong> 같은 위반행위로 과태료 부과처분을 받은 경우 적용<br />
                                나. 가중처분 적용 차수는 직전 부과처분 차수의 다음 차수로 함<br />
                                다. 교육감은 다음의 경우 과태료를 <strong>1/2 범위에서 감경</strong> 가능
                                <span style={{ display: 'block', paddingLeft: '12px', marginTop: '2px' }}>
                                    1) 질서위반행위규제법 시행령 제2조의2 해당자&nbsp;&nbsp;
                                    2) 위반결과 시정·해소한 경우&nbsp;&nbsp;
                                    3) 과실로 인한 경우&nbsp;&nbsp;
                                    4) 기타 감경 필요한 경우
                                </span>
                                라. 교육감은 다음의 경우 과태료를 <strong>1/2 범위에서 가중</strong> 가능 (법정 상한 초과 불가)<br />
                                <span style={{ display: 'block', paddingLeft: '12px', marginTop: '2px' }}>
                                    1) 통지 후 1개월 이상 미시정&nbsp;&nbsp;
                                    2) 위반 내용·정도가 중대하여 피해 큰 경우
                                </span>
                            </div>
                            <div style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '6px' }}>2. 개별기준</div>
                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>위반행위</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>근거 법조문</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>1회<br />(만원)</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>2회<br />(만원)</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>3회+<br />(만원)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ['가. 안전조치 미이행 (10일 이하)', '법§23①1', '30', '', ''],
                                            ['가. 안전조치 미이행 (11~20일)', '법§23①1', '60', '', ''],
                                            ['가. 안전조치 미이행 (21~30일)', '법§23①1', '90', '', ''],
                                            ['가. 안전조치 미이행 (31~60일)', '법§23①1', '120', '', ''],
                                            ['가. 안전조치 미이행 (61~90일)', '법§23①1', '150', '', ''],
                                            ['가. 안전조치 미이행 (91일 이상)', '법§23①1', '300', '', ''],
                                            ['나. 등록증명서 미게시', '법§23①1의2', '50', '100', '200'],
                                            ['다. 휴원·폐원 미신고 (1개월 이상 ~ 2개월 미만)', '법§23①2', '50', '', ''],
                                            ['다. 휴원·폐원 미신고 (2개월 이상 ~ 3개월 미만)', '법§23①2', '100', '', ''],
                                            ['다. 휴원·폐원 미신고 (3개월 이상 ~ 6개월 미만)', '법§23①2', '200', '', ''],
                                            ['다. 휴원·폐원 미신고 (6개월 이상)', '법§23①2', '300', '', ''],
                                            ['라. 강사 인적사항 미게시', '법§23①3', '50', '100', '200'],
                                            ['마. 외국인강사 검증 없이 채용', '법§23①3의2', '100', '200', '300'],
                                            ['바. 신고증명서 미게시·미제시', '법§23①4', '50', '100', '200'],
                                            ['사. 신고증명서 재발급 미신청 (1개월 이내)', '법§23①5', '50', '100', '200'],
                                            ['아. 교습소 휴소·폐소 미신고 (1개월 이상 ~ 2개월 미만)', '법§23①2', '50', '', ''],
                                            ['아. 교습소 휴소·폐소 미신고 (2개월 이상 ~ 3개월 미만)', '법§23①2', '100', '', ''],
                                            ['아. 교습소 휴소·폐소 미신고 (3개월 이상 ~ 6개월 미만)', '법§23①2', '200', '', ''],
                                            ['아. 교습소 휴소·폐소 미신고 (6개월 이상)', '법§23①2', '300', '', ''],
                                            ['자. 표지 미부착 (교습소)', '법§23①6의3', '50', '100', '200'],
                                            ['차. 영수증 미발급', '법§23①6의2', '100', '200', '300'],
                                            ['카. 교습비 표시·게시·고지 미이행', '법§23①7', '50', '100', '200'],
                                            ['타. 교습비 거짓 표시·게시·고지', '법§23①7', '100', '200', '300'],
                                            ['파. 교습비 초과 징수', '법§23①7의2', '100', '200', '300'],
                                            ['하. 교습비 조정명령 위반', '법§23①7의3', '100', '150', '300'],
                                            ['거. 장부·서류 미비치·관리', '법§23①7의4', '50', '100', '200'],
                                            ['너. 보고 미이행', '법§23①8', '50', '100', '200'],
                                            ['너. 거짓 보고', '법§23①8', '70', '150', '300'],
                                            ['더. 출입·검사 거부·방해·기피', '법§23①9', '100', '200', '300'],
                                            ['러. 교습비 반환 미이행 (일부)', '법§23①10', '50', '100', '200'],
                                            ['러. 교습비 반환 미이행 (전부)', '법§23①10', '100', '200', '300'],
                                        ].map(([act, ref, r1, r2, r3], i) => (
                                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                                <td style={tdStyle}>{act}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ref}</td>
                                                <td style={numTd}>{r1 || '-'}</td>
                                                <td style={numTd}>{r2 || '-'}</td>
                                                <td style={numTd}>{r3 || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 청소년성보호법 시행령 */}
                    <SectionHeader label="📌 아동·청소년의 성보호에 관한 법률 시행령 40조 [별표 6]" sKey="youth" />
                    {openSections['youth'] && (
                        <div style={{ marginBottom: '16px', padding: '0 4px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.7' }}>
                                <strong style={{ color: 'var(--text-main)' }}>1. 일반기준</strong><br />
                                가. 위반횟수에 따른 가중기준은 최근 <strong>2년간</strong> 같은 위반행위로 과태료 부과처분을 받은 경우 적용<br />
                                다. 감경 사유: 과실·경미한 위반·피해 경미·시정 노력 인정 등 (1/2 범위)<br />
                                라. 가중 사유: 중대 위반으로 피해 큰 경우·6개월 이상 위반 지속 등 (1/2 범위, 법정 상한 초과 불가)
                            </div>
                            <div style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '6px' }}>2. 개별기준 (단위: 만원)</div>
                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>위반행위</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>근거 법조문</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>1차</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>2차</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>3차+</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ['나. 아동·청소년대상 성범죄 발생 사실 미신고·거짓신고 (직무상)', '법§67④', '300', '300', '300'],
                                            ['다. 상담·치료프로그램 제공 정당한 이유 없이 거부', '법§67②1', '300', '600', '1,000'],
                                            ['라. 취업자 등에 대한 성범죄 경력 미확인', '법§67③', '300', '400', '500'],
                                            ['마. 해임요구 거부 또는 1개월 이내 미이행', '법§67②2', '600', '800', '1,000'],
                                        ].map(([act, ref, r1, r2, r3], i) => (
                                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                                <td style={tdStyle}>{act}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ref}</td>
                                                <td style={numTd}>{r1}</td>
                                                <td style={numTd}>{r2}</td>
                                                <td style={numTd}>{r3}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 아동복지법 시행령 */}
                    <SectionHeader label="📌 아동복지법 시행령 58조 [별표 17]" sKey="child" />
                    {openSections['child'] && (
                        <div style={{ marginBottom: '16px', padding: '0 4px' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: '1.7' }}>
                                <strong style={{ color: 'var(--text-main)' }}>1. 일반기준</strong><br />
                                가. 가중기준: 최근 <strong>1년간</strong> 동일 위반행위 과태료 부과처분 받은 경우 적용<br />
                                다. 감경: 과실·경미한 위반·시정 노력 등 (1/2 범위)<br />
                                라. 가중: 위반 정도·동기·결과 고려 (1/2 범위, 법§75 상한 초과 불가)
                            </div>
                            <div style={{ fontWeight: '700', fontSize: '0.82rem', color: 'var(--text-main)', marginBottom: '6px' }}>2. 개별기준 (단위: 만원)</div>
                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>위반행위</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>근거 법조문</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>1차</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>2차+</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ['바. 아동학대관련범죄 전력 미확인 (법§29의3⑤)', '법§75②', '250', '500'],
                                            ['사. 해임요구 거부 또는 1개월 이내 미이행 (법§29의5①)', '법§75①2', '500', '1,000'],
                                        ].map(([act, ref, r1, r2], i) => (
                                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                                <td style={tdStyle}>{act}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ref}</td>
                                                <td style={numTd}>{r1}</td>
                                                <td style={numTd}>{r2}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* 도로교통법 시행령 */}
                    <SectionHeader label="📌 도로교통법 시행령 제88조 [별표 6] (어린이통학버스)" sKey="traffic" />
                    {openSections['traffic'] && (
                        <div style={{ marginBottom: '8px', padding: '0 4px' }}>
                            <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '10px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>위반행위 및 행위자</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>근거 법조문</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>과태료</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[
                                            ['법§53⑦ 위반 — 안전운행기록 미제출 (운영자)', '도교법§160②4의5', '8만원'],
                                            ['법§53의3① 위반 — 어린이통학버스 안전교육 미이수 (운전자)', '도교법§160②4의3', '8만원'],
                                            ['법§53의3③ 위반 — 안전교육 미이수자 운전 허용 (운영자)', '도교법§160②4의4', '8만원'],
                                        ].map(([act, ref, amt], i) => (
                                            <tr key={i} style={{ backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
                                                <td style={tdStyle}>{act}</td>
                                                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{ref}</td>
                                                <td style={numTd}>{amt}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.6', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                <strong style={{ color: 'var(--text-main)' }}>▣ 근거</strong><br />
                                ◦ 도로교통법 제161조 (과태료의 부과·징수 등) 제1항 제4호<br />
                                ◦ 도로교통법 시행령 제88조: 시·도경찰청장, 시장등 또는 교육감은 과태료 부과 시 단속대장과 과태료 부과대상자 명부에 내용을 기록하여야 하며, 전자적 처리가 가능한 방법으로 작성·관리하여야 함
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
