// 점검표의 행 하나.
//
// 따로 떼어 React.memo 로 감싼 이유: 칸 하나를 눌렀을 때 750행이 통째로 다시 그려지면서
// 마우스가 버벅였다. 이제 값이 바뀐 행만 다시 그려진다. 그러려면 여기로 넘어오는 props 가
// 부모가 다시 그려져도 같은 참조여야 한다 (SnsCheckTab 의 useCallback·structVer 참고).
import { memo, useCallback, useState } from 'react';
import {
    parseChannels, assignBuckets, rowCells, snsRemark, isDone, doneAt,
    isNoPlace, noPlaceAt, memoText, MEMO_MAX,
    placeSearchUrl, blogSearchUrl, mapSearchUrl, pinnedPlaceId, hasPlaceCandidate,
    currentPlaceUrl, placeSource, parsePlaceId, shortAddress, BUCKET_LABEL,
} from '../utils/snsCheck';
import { insuranceStatus } from '../utils/insurance';
import {
    W_NUM, BG_STRIPE, BG_ROW, DONE_COLOR, doneTint, stickyTd, linkStyle, CENTER,
    CELL_PAD, CHECK_PAD, INS_OK_COLOR, INS_BAD_COLOR,
} from '../utils/snsTableLayout';
import { openTuitionCompare } from '../utils/tuitionCompareWindow';
import { buildNoticeSms, copyNoticeSms, noticeItems, smsBytes, LMS_LIMIT } from '../utils/snsNoticeText';
import OxBadge from './SnsOxBadge';

const Td = ({ children, style, onClick, title }) => (
    <td onClick={onClick} title={title} style={{
        padding: '10px', fontSize: '0.86rem', lineHeight: 1.5, color: 'var(--text-main)',
        borderTop: '1px solid var(--border-color)', ...style,
    }}>{children}</td>
);

const CYCLE_HINT = '눌러서 직접 확인한 값으로 바꿉니다 (자동값 → O → △ → X → 없음 → 자동값). △ = 올렸으나 신고 내용과 다름';
const LOCKED_HINT = '마감된 행입니다 — 고치려면 확인 열의 ✓ 확인완료 를 눌러 해제하세요';

const fmtDay = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

function SnsCheckRow({
    index, rowKey, target, result, academy, group, dup,
    academyByKey, region, isNarrow, running, highlight,
    pinOpen, pinInput, pinError, memoOpen, memoInput,
    onSelectAcademy, onCycle, onToggleDone, onToggleNoPlace, onRefresh, onJump,
    onPinOpen, onPinChange, onPinSave, onPinCancel, onPinClear, onPinConfirm,
    onMemoOpen, onMemoChange, onMemoSave, onMemoCancel,
    registerRow,
}) {
    const setRef = useCallback((el) => registerRow(rowKey, el), [registerRow, rowKey]);

    const channels = parseChannels(result);
    const at = assignBuckets(channels);
    const cells = rowCells(result);
    const remark = snsRemark(result, dup);
    const addr = shortAddress(target.address);
    const mapUrl = mapSearchUrl(target.address);
    const done = isDone(result);
    const ins = insuranceStatus(academy);
    const memo = memoText(result);
    // 마감한 행은 O/X 가 아예 눌리지 않는다 — 잘못 눌러 값이 바뀌는 일을 원천적으로 막는다
    const canEdit = !!result && !done;

    // 이 학원에서 빠진 칸의 수 — 문자를 보낼 것이 있는지, 몇 가지인지.
    // rowCells 가 WeakMap 에 캐시돼 있어 행을 그릴 때마다 세도 값이 싸다.
    const noticeCount = noticeItems(result).length;
    const [flash, setFlash] = useState(null);

    // 문구 자체는 누를 때·마우스를 올릴 때만 만든다. 그리는 김에 750개를 만들어 두면
    // 표가 멎는다 (openTuitionCompare 와 같은 이유로 prop 도 늘리지 않는다 —
    // 문의 전화·기한은 snsNoticeText 가 localStorage 에서 직접 읽는다).
    const previewSms = (e) => { e.currentTarget.title = buildNoticeSms(target, result, academy); };

    const copySms = () => {
        const text = buildNoticeSms(target, result, academy);
        if (!text) return;
        const n = smsBytes(text);
        const show = (v) => { setFlash(v); setTimeout(() => setFlash(null), 2200); };
        copyNoticeSms(text).then(
            // 바이트 수를 함께 보여준다 — LMS 한도를 넘으면 문자마당이 받아 주지 않는데,
            // 붙여넣고 보내기를 누른 뒤에 알면 그 학원은 통째로 다시 해야 한다.
            () => show({ text: `✓ ${n.toLocaleString('ko-KR')}B`, warn: n > LMS_LIMIT }),
            () => show({ text: '복사 실패', warn: true }));
    };

    // 공동운영에서 눌러 찾아온 행 — 어디로 왔는지 잠깐 보여준다
    const base = highlight ? '#ede9fe' : index % 2 === 1 ? BG_ROW : BG_STRIPE;
    const rowBg = done && !highlight ? doneTint(base) : base;

    // 같은 플레이스·블로그를 쓰는 다른 학원 (이름 + 이동할 학원 객체)
    // (members 와 names 는 buildGroups 에서 같은 순서로 쌓인다)
    const siblings = (group?.members || [])
        .map((m, mi) => ({ key: m, name: group.names[mi] || m.split('|')[1], academy: academyByKey.get(m) }))
        .filter((x) => x.key !== rowKey);

    const pinned = pinnedPlaceId(result);
    // 사람이 '플레이스 없음'을 확인해 준 행 — 물고 온 후보는 남의 업체이므로 더는 보여주지 않는다
    const noPlace = isNoPlace(result);
    // 플레이스를 물고 오긴 했는데 상호가 달라 자동 확정을 못 한 행 —
    // 주소를 찾아 붙여넣을 것 없이 '맞다'만 눌러 주면 된다
    const unconfirmedPlace = !!result && !noPlace && result.matchStatus !== 'matched'
        && hasPlaceCandidate(result) && !pinned;
    // 지금 이 학원의 플레이스로 쓰는 주소 — 상세화면·구글시트와 같은 값이다
    const curUrl = result && !noPlace ? currentPlaceUrl(result) : '';

    return (
        <tr ref={setRef} style={{ background: rowBg }}>
            <Td style={{
                ...(isNarrow ? { background: rowBg } : stickyTd(0, rowBg)),
                // 마감한 행 왼쪽에 초록 선 — 옅은 배경색만으로는 다크 테마에서 잘 안 보인다
                ...(done ? { boxShadow: `inset 3px 0 0 ${DONE_COLOR}` } : null),
                color: 'var(--text-muted)', fontSize: '0.78rem', textAlign: 'center',
            }}>{index}</Td>
            <Td style={{ ...(isNarrow ? { background: rowBg } : stickyTd(W_NUM, rowBg)), wordBreak: 'keep-all' }}>
                {academy && onSelectAcademy ? (
                    <span onClick={() => onSelectAcademy(academy)}
                        style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                        {target.name}
                    </span>
                ) : (
                    <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>{target.name}</span>
                )}
                {/* 플레이스에 뜬 주소가 이 학원의 주소가 맞는지 링크를 열기 전에 눈으로 맞춰 본다.
                    시·도와 뒤의 (법정동, 건물명) 은 떼고 도로명·번지·호수만 남긴다 — 두 주소를 가르는 부분이다.
                    누르면 네이버지도가 열린다 — 거기 '이 주소의 장소' 를 펼치면 그 건물 업체가 다 보여
                    이름이 달라 자동으로 못 찾은 플레이스를 눈으로 찾아 지정할 수 있다. */}
                {addr && (
                    <a href={mapUrl} target="_blank" rel="noreferrer"
                        title={`${target.address}
눌러서 네이버지도에서 열기 — ‘이 주소의 장소’ 로 이 건물 업체를 볼 수 있습니다`}
                        style={{
                            display: 'block', marginTop: '2px', fontSize: '0.72rem',
                            color: 'var(--text-muted)', textDecoration: 'underline dotted',
                            textUnderlineOffset: '2px', cursor: 'pointer',
                        }}>
                        {addr}
                    </a>
                )}
                {result?.플레이스명 && result.플레이스명 !== target.name && (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>→ {result.플레이스명}</div>
                )}
                {/* 전화번호를 따로 열로 두면 표가 화면을 넘어간다. 미이행 학원에 전화를 걸 때
                    어차피 이름과 함께 보게 되는 값이라 이 칸에 붙여 둔다. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    {target.contact
                        ? <a href={`tel:${target.contact}`} style={{ ...linkStyle, fontSize: '0.78rem' }}>☎ {target.contact}</a>
                        : <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>☎ –</span>}
                    {/* 학원마다 빠진 것이 달라 일괄 문구를 쓸 수 없다 — 이 학원의 X 칸만 넣어
                        만든 문구를 클립보드에 담는다. 문자마당 창에 붙여넣으면 끝난다. */}
                    {noticeCount > 0 && (
                        <button
                            onClick={target.contact ? copySms : undefined}
                            onMouseEnter={target.contact ? previewSms : undefined}
                            disabled={!target.contact}
                            title={target.contact
                                ? '빠진 것만 넣은 안내 문자를 복사합니다 — 마우스를 올리면 문구가 보입니다'
                                : '연락처가 없어 문자를 보낼 수 없습니다'}
                            style={{
                                background: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                                border: '1px solid', borderRadius: '999px', padding: '1px 7px',
                                fontSize: '0.72rem', fontWeight: '700',
                                borderColor: flash?.warn ? '#ef4444' : 'var(--border-color)',
                                color: !target.contact ? 'var(--border-color)'
                                    : flash ? (flash.warn ? '#ef4444' : DONE_COLOR) : '#7c3aed',
                                cursor: target.contact ? 'pointer' : 'default',
                            }}>
                            {flash ? flash.text : `✉ 문자 ${noticeCount}`}
                        </button>
                    )}
                </div>
            </Td>
            <Td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{target.regNo}</Td>

            {cells.map((c) => (
                <Td key={c.key}
                    style={{ ...CENTER, padding: CELL_PAD, cursor: canEdit ? 'pointer' : 'default', userSelect: 'none' }}
                    onClick={canEdit ? () => onCycle(result, c.key) : undefined}
                    title={!result ? undefined : done ? LOCKED_HINT : CYCLE_HINT}>
                    <OxBadge value={c.value} manual={c.manual !== undefined} />
                </Td>
            ))}

            <Td>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.8rem' }}>
                    {/* 신고한 교습비를 새 창에 띄운다 — 표는 '올렸는가'(O/X)만 보여주지만
                        담당자가 알고 싶은 것은 '올린 금액이 신고액과 같은가'다.
                        openTuitionCompare 는 리액트 상태와 무관한 함수라 새 prop 이 필요 없다 (React.memo 유지) */}
                    <button onClick={() => openTuitionCompare(academy, result, { region })}
                        disabled={!academy}
                        title={academy
                            ? '신고한 교습비를 새 창에 띄웁니다 — 네이버 창과 나란히 놓고 금액이 같은지 확인하세요'
                            : '마스터 자료에 없는 학원이라 신고 교습비를 찾을 수 없습니다'}
                        style={{
                            ...linkStyle, background: 'none', border: 'none', padding: 0,
                            fontSize: '0.8rem', fontFamily: 'inherit',
                            color: academy ? '#0d9488' : 'var(--text-muted)',
                            cursor: academy ? 'pointer' : 'default',
                        }}>💰 교습비</button>
                    <a href={result?.플레이스URL || placeSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>
                        {result?.플레이스URL ? '플레이스' : '플레이스검색'}
                    </a>
                    {/* 플레이스 홈에 걸린 링크들 — 실제로 조사한 대상이다 */}
                    {channels.map((c, ci) => (
                        <a key={`${c.url}-${ci}`} href={c.url} target="_blank" rel="noreferrer" style={linkStyle}>
                            {BUCKET_LABEL[at[ci]]}
                        </a>
                    ))}
                    {!result && <a href={blogSearchUrl(target.name, region)} target="_blank" rel="noreferrer" style={linkStyle}>블로그검색</a>}
                </div>
            </Td>
            <Td style={{ fontSize: '0.8rem', color: '#ef4444', wordBreak: 'keep-all' }}>
                {/* 공동 운영(플레이스·블로그를 함께 쓰는 곳) — 어느 학원인지 이름을 다 보여주고
                    누르면 이 표의 그 학원 행으로 옮겨 간다 (상세화면으로 나가지 않는다).
                    학원명 칸은 좁아 이름이 잘려 보이지 않았다. */}
                {siblings.length > 0 && (
                    <div style={{ color: '#7c3aed', fontWeight: '600', marginBottom: '4px' }}>
                        🔗 공동운영: {siblings.map((sib, si) => (
                            <span key={sib.key}>
                                {si > 0 && ' · '}
                                {sib.academy
                                    ? <span onClick={() => onJump(sib.key)}
                                        title={`이 표의 ${sib.name} 행으로 이동합니다`}
                                        style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: '2px' }}>{sib.name}</span>
                                    : sib.name}
                            </span>
                        ))}
                    </div>
                )}
                {remark}
                {dup && result && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        함께 운영하는 곳이 아니라면 아래 <b>플레이스 지정</b> 으로 바로잡아 주세요
                    </div>
                )}
                {/* 이름으로 못 찾거나 엉뚱한 곳을 잡았을 때 — 주소를 여기서 바로 넣는다.
                    값은 시트 '플레이스지정'(AB열)에 남아 다시 조사해도 유지된다. */}
                <div style={{ marginTop: remark ? '5px' : 0 }}>
                    {/* 지금 무엇으로 조사하고 있는지 — 이 값이 곧 상세화면·시트의 '플레이스지정' 이다 */}
                    {curUrl && (
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '3px' }}>
                            📍 조사에 쓰는 플레이스{' '}
                            {/* 비고 칸이 좁아 주소를 통째로 두면 번호 한가운데서 줄이 잘린다.
                                전체 주소는 툴팁과, '플레이스 지정'을 눌렀을 때 입력칸에 그대로 들어 있다. */}
                            <a href={curUrl} target="_blank" rel="noreferrer" title={curUrl} style={linkStyle}>
                                #{parsePlaceId(curUrl)}
                            </a>{' '}
                            <span style={{ color: pinned ? '#2563eb' : 'var(--text-muted)' }}>({placeSource(result)})</span>
                        </div>
                    )}
                    {pinOpen ? (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input autoFocus value={pinInput}
                                onChange={(e) => onPinChange(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') onPinSave(target);
                                    if (e.key === 'Escape') onPinCancel();
                                }}
                                placeholder="플레이스 주소 (place/숫자) 또는 naver.me 공유주소"
                                style={{
                                    flex: '1 1 150px', minWidth: 0, padding: '5px 8px', fontSize: '0.78rem',
                                    border: '1px solid var(--border-color)', borderRadius: '7px',
                                    background: 'var(--bg-card)', color: 'var(--text-main)',
                                }} />
                            <button onClick={() => onPinSave(target)} disabled={running} style={{
                                padding: '5px 10px', borderRadius: '7px', border: 'none',
                                background: running ? 'var(--border-color)' : 'var(--primary)',
                                color: 'white', fontSize: '0.76rem', fontWeight: '700',
                                cursor: running ? 'default' : 'pointer', whiteSpace: 'nowrap',
                            }}>지정</button>
                            <button onClick={onPinCancel} style={{
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                fontSize: '0.76rem', cursor: 'pointer',
                            }}>취소</button>
                            {/* 주소가 잘못됐을 때 — 조작부(표 한참 위)가 아니라 누른 자리 바로 밑에 띄운다.
                                위에만 뜨면 아래쪽 행에서 누른 사람은 아무 일도 안 일어난 줄 안다. */}
                            {pinError && (
                                <div style={{
                                    flexBasis: '100%', marginTop: '4px', padding: '6px 8px',
                                    background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '7px',
                                    color: '#b91c1c', fontSize: '0.74rem', lineHeight: 1.6,
                                }}>
                                    ⚠ {pinError.message}
                                    {pinError.query && (
                                        <> <a href={placeSearchUrl(pinError.query, region)} target="_blank" rel="noreferrer"
                                            style={{ ...linkStyle, fontSize: '0.74rem' }}>
                                            ‘{pinError.query}’ 네이버에서 열기 ↗
                                        </a></>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : noPlace ? (
                        // 없다고 확인해 준 곳 — 지정할 대상 자체가 없으므로 지정 UI 를 치우고
                        // 되돌릴 길만 남긴다 (잘못 눌렀을 수 있다)
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                🚫 네이버플레이스 없음{noPlaceAt(result) ? ` · ${fmtDay(noPlaceAt(result))} 확인` : ''}
                            </span>
                            <button onClick={() => onToggleNoPlace(result)} style={{
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                fontSize: '0.74rem', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline',
                            }}>되돌리기</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {unconfirmedPlace && (
                                <button onClick={() => onPinConfirm(target, result.플레이스ID)} disabled={running}
                                    title={`검색된 업체: ${result.플레이스명 || result.플레이스ID} — 이 학원이 맞으면 눌러 확정하세요 (확정해야 판정이 나옵니다)`}
                                    style={{
                                        background: 'none', border: '1px solid #10b981', borderRadius: '6px',
                                        padding: '3px 7px', color: '#10b981', fontSize: '0.74rem',
                                        fontWeight: '700', cursor: running ? 'default' : 'pointer', whiteSpace: 'nowrap',
                                    }}>✔ 이 플레이스 맞음</button>
                            )}
                            <button onClick={() => onPinOpen(rowKey, curUrl)}
                                title="네이버플레이스 주소(또는 지도앱 공유주소)를 넣으면 그 플레이스로 조사합니다"
                                style={{
                                    background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                    padding: '3px 7px', color: '#3b82f6', fontSize: '0.74rem',
                                    fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
                                }}>📍 {pinned ? '플레이스 바꾸기' : '플레이스 지정'}</button>
                            {pinned && (
                                <button onClick={() => onPinClear(target, result)} disabled={running} style={{
                                    background: 'none', border: 'none', color: 'var(--text-muted)',
                                    fontSize: '0.74rem', fontWeight: '600',
                                    cursor: running ? 'default' : 'pointer', textDecoration: 'underline',
                                }}>지정 해제</button>
                            )}
                            {/* 찾아봤더니 이 학원은 플레이스를 아예 안 만든 경우 — 지정할 대상이 없다.
                                눌러 두면 판정이 '해당없음'으로 빠지고 다시 조사하지 않는다. */}
                            {result && (
                                <button onClick={() => onToggleNoPlace(result)}
                                    title="찾아봤는데 이 학원은 네이버플레이스가 아예 없을 때 누르세요 — 판정에서 빠지고 다시 조사하지 않습니다"
                                    style={{
                                        background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                                        padding: '3px 7px', color: 'var(--text-muted)', fontSize: '0.74rem',
                                        fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}>🚫 플레이스 없음</button>
                            )}
                        </div>
                    )}
                </div>
            </Td>
            {/* 보험 — 마스터 자료에서 계산한 값이라 이 화면에서는 고칠 수 없다.
                점검하러 가기 전에 보험이 끊긴 곳인지 함께 보라고 여기 둔다 (검토 탭과 같은 기준) */}
            <Td title={ins.title} style={{
                ...CENTER, whiteSpace: 'nowrap', fontSize: '0.78rem', fontWeight: '700',
                color: ins.unknown ? 'var(--border-color)' : ins.expired || ins.missing ? INS_BAD_COLOR : INS_OK_COLOR,
            }}>
                {/* 색만으로 알리지 않는다 — 만료·미가입에는 표시를 붙인다 */}
                {ins.expired || ins.missing ? `⚠ ${ins.label}` : ins.label}
            </Td>

            {/* 적요 — 담당자가 진행사항을 적는 칸. 마감한 행에서도 고칠 수 있다
                (마감은 O/X 만 잠근다. '다음 주에 올린다더라' 같은 것은 마감 뒤에도 적을 일이 생긴다) */}
            <Td style={{ fontSize: '0.78rem', lineHeight: 1.45, wordBreak: 'keep-all' }}>
                {memoOpen ? (
                    <div>
                        <input autoFocus value={memoInput} maxLength={MEMO_MAX}
                            onChange={(e) => onMemoChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') onMemoSave(result);
                                if (e.key === 'Escape') onMemoCancel();
                            }}
                            placeholder="진행사항·특이사항"
                            style={{
                                width: '100%', boxSizing: 'border-box', padding: '4px 6px', fontSize: '0.76rem',
                                border: '1px solid var(--border-color)', borderRadius: '6px',
                                background: 'var(--bg-card)', color: 'var(--text-main)',
                            }} />
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                            <button onClick={() => onMemoSave(result)} style={{
                                padding: '3px 8px', borderRadius: '6px', border: 'none',
                                background: 'var(--primary)', color: 'white',
                                fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer',
                            }}>저장</button>
                            <button onClick={onMemoCancel} style={{
                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                fontSize: '0.72rem', cursor: 'pointer',
                            }}>취소</button>
                            <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                                {memoInput.length}/{MEMO_MAX}
                            </span>
                        </div>
                    </div>
                ) : memo ? (
                    <span onClick={() => result && onMemoOpen(rowKey, memo)} title={`${memo}

눌러서 고칩니다`}
                        style={{ cursor: result ? 'pointer' : 'default', color: '#2563eb', fontWeight: '600' }}>
                        {memo}
                    </span>
                ) : (
                    <button onClick={() => onMemoOpen(rowKey, '')} disabled={!result}
                        title={result ? `진행사항을 ${MEMO_MAX}자까지 적어 둡니다 (시트 '적요' 열에 남습니다)`
                            : '아직 조사하지 않은 학원입니다 — 먼저 조사해야 적을 수 있습니다'}
                        style={{
                            background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
                            color: result ? 'var(--text-muted)' : 'var(--border-color)',
                            fontSize: '0.76rem', cursor: result ? 'pointer' : 'default',
                        }}>＋ 적요</button>
                )}
            </Td>

            {/* 확인 열 — 다 본 학원을 마감해 굳히고(오조작 방지), 필요하면 여기서 다시 조사한다 */}
            <Td style={{ ...CENTER, padding: CHECK_PAD }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                    <button onClick={() => onToggleDone(result)} disabled={!result}
                        title={!result ? '아직 조사하지 않은 학원입니다 — 먼저 새로고침으로 조사하세요'
                            : done ? '확인 완료로 마감돼 있습니다 — 눌러서 해제하면 다시 고칠 수 있습니다'
                                : '이 학원을 다 확인했다면 눌러 마감하세요 (O/X 가 잠깁니다)'}
                        style={{
                            borderRadius: '6px', padding: '5px 6px', fontSize: '0.76rem', fontWeight: '700',
                            whiteSpace: 'nowrap', cursor: result ? 'pointer' : 'default',
                            border: done ? 'none' : '1px solid var(--border-color)',
                            background: done ? DONE_COLOR : 'none',
                            color: done ? 'white' : result ? 'var(--text-muted)' : 'var(--border-color)',
                        }}>{done ? '✓ 완료' : '마감'}</button>
                    {/* '눌러 해제' 는 위 단추의 툴팁이 이미 말한다 — 좁은 열에 두 번 적지 않는다 */}
                    {done && (
                        <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                            {fmtDay(doneAt(result))}
                        </div>
                    )}
                    <button onClick={() => onRefresh(target)} disabled={running}
                        title="이 학원만 다시 조사합니다"
                        style={{
                            background: 'none', border: '1px solid var(--border-color)', borderRadius: '6px',
                            padding: '4px 6px', color: running ? 'var(--text-muted)' : '#0ea5e9',
                            fontSize: '0.8rem', fontWeight: '700', whiteSpace: 'nowrap',
                            cursor: running ? 'default' : 'pointer',
                        }}>↻</button>
                </div>
            </Td>
        </tr>
    );
}

export default memo(SnsCheckRow);
