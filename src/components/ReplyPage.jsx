// 학원 회신 화면 — 안내 문자로 받은 주소(/r/<토큰>)를 열면 나오는 곳.
//
// 로그인이 없다. 구글 계정을 물으면 학원은 그냥 하지 않는다 (그래서 증거사진도 받지 않는다 —
// 파일 첨부에는 구글 로그인이 따라붙는다). 대신 주소에 든 토큰이 학원을 특정하므로
// 학원명·등록번호를 입력받을 일이 없고, 잘못 적힐 일도 없다.
//
// 보여주는 목록은 문자에 적어 보낸 것과 같은 함수(noticeItems)로 만든다. 두 곳이 다른 말을
// 하면 학원은 무엇을 고쳐야 하는지 알 수 없다.
//
// 이 화면은 App.css 를 쓰지 않는다 (관리자 화면 번들을 딸려오게 할 수 없다) — 색과 치수를
// 여기 직접 적는다. 휴대폰 한 손 조작이 기준이고, 글자는 16px 이상이라야 iOS 가 확대하지 않는다.
import { useEffect, useMemo, useState } from 'react';
import {
    rowToResult, noticeItems, parseChannels, assignBuckets,
    isReplied, repliedAt, replyText,
} from '../utils/snsCheck';

const CHANNEL_NAME = {
    place: '네이버플레이스', blog: '블로그', homepage: '홈페이지',
    cafe: '카페', youtube: '유튜브', instagram: '인스타그램', etc: '그 밖의 매체',
};

// 문자의 [수정 방법] 과 같은 말이어야 한다 — 문자를 닫고 들어온 학원이 여기서 다시 읽는다.
// 문자는 매체별로 한 줄에 적지만 여기서는 항목이 한 칸씩 서 있으므로 번호·교습비를 갈라 적는다
// ('등록번호' 칸에 대고 '가격 정보에 교습비를 등록하라'고 적으면 무슨 말인지 알 수 없다).
const HOWTO = {
    place: {
        번호: '플레이스 소개글에 {번호}를 적어 주세요',
        교습비: '가격 정보에 교습비를 등록하시거나 가격표 이미지를 올려 주세요',
    },
    blog: { 번호: '프로필이나 공지글에 {번호}를 적어 주세요', 교습비: '별도 게시물로 교습비를 올려 주세요' },
    homepage: { 번호: '첫 화면이나 학원 소개에 {번호}를 적어 주세요', 교습비: '교습비 안내 쪽을 만들어 주세요' },
    cafe: { 번호: '대문이나 공지글에 {번호}를 적어 주세요', 교습비: '별도 게시글로 교습비를 올려 주세요' },
    youtube: { 번호: '채널 정보(설명)에 {번호}를 적어 주세요', 교습비: '채널 설명이나 고정 게시물에 교습비를 적어 주세요' },
    instagram: { 번호: '프로필 소개글에 {번호}를 적어 주세요', 교습비: '별도 게시물로 교습비를 올려 주세요' },
    etc: { 번호: '첫 화면·소개란에 {번호}를 적어 주세요', 교습비: '첫 화면·소개란에 교습비를 적어 주세요' },
};

const ANSWERS = [
    { value: 'fixed', label: '수정했습니다', color: '#059669' },
    { value: 'not_yet', label: '아직입니다', color: '#d97706' },
    { value: 'not_mine', label: '저희 매체가 아닙니다', color: '#64748b' },
];

const NOTE_MAX = 60;

const wrap = {
    maxWidth: '560px', margin: '0 auto', padding: '20px 16px 48px',
    color: '#1e293b', fontSize: '16px', lineHeight: 1.6,
};
const card = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
    padding: '16px', marginBottom: '12px',
};
const muted = { color: '#64748b', fontSize: '14px' };

const fmtDay = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
};

/** 매체별 주소 — 어디를 말하는 것인지 학원이 바로 열어 볼 수 있어야 한다 */
function bucketUrls(result) {
    const out = {};
    const place = String(result?.플레이스URL || '').replace(/\/home$/, '');
    if (place) out.place = place;
    const chs = parseChannels(result);
    const at = assignBuckets(chs);
    chs.forEach((c, i) => { if (c.url && !out[at[i]]) out[at[i]] = c.url; });
    return out;
}

function Notice({ children, tone = 'info' }) {
    const color = tone === 'bad' ? '#b91c1c' : tone === 'good' ? '#047857' : '#334155';
    const bg = tone === 'bad' ? '#fef2f2' : tone === 'good' ? '#ecfdf5' : '#f1f5f9';
    return (
        <div style={{ ...card, background: bg, borderColor: bg, color, textAlign: 'center' }}>
            {children}
        </div>
    );
}

export default function ReplyPage() {
    const token = useMemo(
        () => decodeURIComponent(window.location.pathname.replace(/^\/r\/?/, '')).trim(), []);

    const [state, setState] = useState({ status: 'loading' });
    const [picked, setPicked] = useState({});
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [sent, setSent] = useState(null);

    useEffect(() => {
        let alive = true;
        fetch(`/api/reply?t=${encodeURIComponent(token)}`)
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                if (!json.ok) return setState({ status: 'error', error: json.error || '자료를 읽지 못했습니다' });
                return setState({ status: 'ok', ...json });
            })
            .catch(() => { if (alive) setState({ status: 'error', error: '연결하지 못했습니다. 잠시 뒤 다시 열어 주세요.' }); });
        return () => { alive = false; };
    }, [token]);

    const result = state.status === 'ok' && state.row ? rowToResult(state.row) : null;
    const items = useMemo(() => noticeItems(result), [result]);
    const urls = useMemo(() => bucketUrls(result), [result]);

    const isHagwonso = String(state.category || '').includes('교습소');
    const numberLabel = isHagwonso ? '신고번호' : '등록번호';
    const regLabel = `${isHagwonso ? '신고' : '등록'} 제${state.regNo}호`;

    const answered = items.filter((it) => picked[`${it.bucket}|${it.field}`]);

    const submit = async () => {
        setSending(true);
        setSendError('');
        try {
            const res = await fetch('/api/reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    t: token,
                    answers: answered.map((it) => ({
                        bucket: it.bucket, field: it.field, value: picked[`${it.bucket}|${it.field}`],
                    })),
                    note,
                }),
            });
            const json = await res.json().catch(() => ({ ok: false }));
            if (!json.ok) throw new Error(json.error || '보내지 못했습니다');
            setSent(json);
        } catch (err) {
            setSendError(err.message);
        } finally {
            setSending(false);
        }
    };

    if (state.status === 'loading') {
        return <div style={wrap}><p style={muted}>불러오는 중입니다…</p></div>;
    }
    if (state.status === 'error') {
        return (
            <div style={wrap}>
                <Notice tone="bad">{state.error}</Notice>
                <p style={muted}>문자에 적힌 문의 전화로 알려 주시면 확인해 드립니다.</p>
            </div>
        );
    }

    const head = (
        <>
            <h1 style={{ fontSize: '20px', lineHeight: 1.4, margin: '0 0 4px' }}>
                {state.row?.학원명 || ''}
            </h1>
            <p style={{ ...muted, margin: '0 0 16px' }}>{regLabel}</p>
        </>
    );

    if (sent) {
        return (
            <div style={wrap}>
                {head}
                <Notice tone="good">
                    <b>알려 주셔서 감사합니다.</b>
                    <div style={{ fontSize: '14px', marginTop: '6px' }}>담당자가 확인한 뒤 마감합니다.</div>
                </Notice>
                <div style={card}>
                    <div style={{ ...muted, marginBottom: '6px' }}>보내신 내용</div>
                    <div>{sent.text}</div>
                </div>
                <p style={muted}>잘못 표시하셨다면 이 화면을 새로 고쳐 다시 보내실 수 있습니다.</p>
            </div>
        );
    }

    if (!state.row) {
        return (
            <div style={wrap}>
                {head}
                <Notice>아직 점검 자료가 없습니다. 문자에 적힌 문의 전화로 알려 주세요.</Notice>
            </div>
        );
    }

    if (!items.length) {
        return (
            <div style={wrap}>
                {head}
                <Notice tone="good">
                    <b>지금은 고치실 것으로 확인된 항목이 없습니다.</b>
                    <div style={{ fontSize: '14px', marginTop: '6px' }}>
                        담당자가 이미 확인했을 수 있습니다. 궁금하시면 문의 전화로 알려 주세요.
                    </div>
                </Notice>
            </div>
        );
    }

    return (
        <div style={wrap}>
            {head}

            {isReplied(result) && (
                <div style={{ ...card, background: '#f8fafc' }}>
                    <div style={{ ...muted, marginBottom: '4px' }}>
                        {fmtDay(repliedAt(result))}에 이렇게 알려 주셨습니다
                    </div>
                    <div style={{ fontSize: '15px' }}>{replyText(result) || '(내용 없음)'}</div>
                    <div style={{ ...muted, marginTop: '8px' }}>다시 보내시면 이 내용을 대신합니다.</div>
                </div>
            )}

            <p style={{ margin: '0 0 14px' }}>
                아래는 저희가 확인하지 못했거나 신고하신 내용과 달랐던 것입니다.
                <b> 고치신 것만 눌러 주시면 됩니다.</b>
            </p>

            {items.map((it) => {
                const key = `${it.bucket}|${it.field}`;
                const what = it.field === '번호' ? numberLabel : '교습비';
                const url = urls[it.bucket];
                return (
                    <div key={key} style={card}>
                        <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                            {CHANNEL_NAME[it.bucket]} · {what}
                        </div>
                        <div style={{ ...muted, marginBottom: '10px' }}>
                            {it.differs
                                ? `올려 두셨으나 신고하신 ${what}와 다릅니다`
                                : HOWTO[it.bucket][it.field].split('{번호}').join(numberLabel)}
                        </div>
                        {url && (
                            <a href={url} target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-block', marginBottom: '10px', fontSize: '14px', color: '#2563eb', wordBreak: 'break-all' }}>
                                저희가 본 곳 열어 보기 ↗
                            </a>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {ANSWERS.map((a) => {
                                const on = picked[key] === a.value;
                                return (
                                    <button key={a.value} type="button"
                                        onClick={() => setPicked((p) => ({
                                            ...p, [key]: p[key] === a.value ? undefined : a.value,
                                        }))}
                                        style={{
                                            flex: '1 1 auto', minHeight: '44px', padding: '10px 12px',
                                            fontSize: '15px', fontWeight: on ? 700 : 500,
                                            borderRadius: '10px', cursor: 'pointer',
                                            border: `1.5px solid ${on ? a.color : '#cbd5e1'}`,
                                            background: on ? a.color : '#fff',
                                            color: on ? '#fff' : '#334155',
                                        }}>
                                        {a.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            <div style={card}>
                <label htmlFor="note" style={{ ...muted, display: 'block', marginBottom: '6px' }}>
                    남기실 말씀 (선택, {NOTE_MAX}자)
                </label>
                <input id="note" value={note} maxLength={NOTE_MAX}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="예) 다음 주에 올리겠습니다"
                    style={{
                        width: '100%', boxSizing: 'border-box', minHeight: '44px', padding: '10px 12px',
                        fontSize: '16px', borderRadius: '10px', border: '1.5px solid #cbd5e1',
                    }} />
            </div>

            {sendError && <Notice tone="bad">{sendError}</Notice>}

            <button type="button" onClick={submit} disabled={!answered.length || sending}
                style={{
                    width: '100%', minHeight: '52px', marginTop: '4px',
                    fontSize: '17px', fontWeight: 700, borderRadius: '12px', border: 'none',
                    cursor: answered.length && !sending ? 'pointer' : 'default',
                    background: answered.length && !sending ? '#4f46e5' : '#cbd5e1',
                    color: '#fff',
                }}>
                {sending ? '보내는 중…' : `보내기 (${answered.length}건)`}
            </button>
            <p style={{ ...muted, marginTop: '10px', textAlign: 'center' }}>
                보내 주시면 담당자가 확인한 뒤 마감합니다. 로그인은 필요하지 않습니다.
            </p>
        </div>
    );
}
