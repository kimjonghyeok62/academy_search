// 교습비 게시표 예시 화면 — 안내 문자로 받은 주소(/g/<토큰>)를 열면 나오는 곳.
//
// 학원에 '교습비를 게시하라' 고만 하면 무엇을 어떤 모양으로 붙여야 하는지 모른다.
// 신고된 내용으로 만든 게시표를 보여 주면, 그대로 인쇄해 붙이거나 보고 따라 만들 수 있다.
// 담당자가 쓰던 것과 같은 함수(buildTuitionFormHtml)로 만든다 — 두 곳이 다른 양식을 내면
// 학원이 붙인 것을 나중에 담당자가 보고 '이건 우리 양식이 아닌데' 하게 된다.
//
// 회신 화면(ReplyPage)과 같은 토큰을 쓰고, 마찬가지로 App.css 를 쓰지 않는다.
import { useEffect, useMemo, useState } from 'react';
import { transformAcademyData } from '../utils/googleSheets';
import { buildTuitionFormHtml, buildTuitionFormExternalHtml } from '../utils/generateTuitionPDF';
import { downloadFormDocx, downloadFormJpg, formFileName, stripPrintBar } from '../utils/tuitionFormFiles';

const KINDS = [
    { key: 'inner', label: '내부용', hint: '학원 안, 학습자가 보기 쉬운 곳에 붙이는 것' },
    { key: 'outer', label: '외부용', hint: '건물 밖에서 보이는 곳에 붙이는 옥외가격표시' },
];

const wrap = {
    maxWidth: '760px', margin: '0 auto', padding: '20px 16px 48px',
    color: '#1e293b', fontSize: '16px', lineHeight: 1.6,
};
const card = {
    background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px',
    padding: '16px', marginBottom: '12px',
};
const muted = { color: '#64748b', fontSize: '14px' };

// 파일 단추 — 인쇄가 으뜸이라 채워 두고, 나머지 둘은 테두리만 둔다
const fileBtn = (color, filled = false) => ({
    flex: '1 1 30%', minWidth: '110px', minHeight: '52px',
    fontSize: '16px', fontWeight: 700, borderRadius: '12px', cursor: 'pointer',
    border: `1.5px solid ${color}`,
    background: filled ? color : '#fff',
    color: filled ? '#fff' : color,
});

export default function TuitionFormPage() {
    const token = useMemo(
        () => decodeURIComponent(window.location.pathname.replace(/^\/g\/?/, '')).trim(), []);

    const [state, setState] = useState({ status: 'loading' });
    const [kind, setKind] = useState('inner');
    // 파일을 만드는 동안(무거운 것을 그때 불러온다) 무엇이 도는지 알려 준다
    const [busy, setBusy] = useState('');
    const [fileError, setFileError] = useState('');

    useEffect(() => {
        let alive = true;
        fetch(`/api/reply-form?t=${encodeURIComponent(token)}`)
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                if (!json.ok) return setState({ status: 'error', error: json.error || '자료를 읽지 못했습니다' });
                return setState({ status: 'ok', ...json });
            })
            .catch(() => { if (alive) setState({ status: 'error', error: '연결하지 못했습니다. 잠시 뒤 다시 열어 주세요.' }); });
        return () => { alive = false; };
    }, [token]);

    // 담당자 화면과 같은 변환을 쓴다 — 마스터의 한 줄이 교습과정 하나다
    const academy = useMemo(() => {
        if (state.status !== 'ok') return null;
        return transformAcademyData(state.rows || [])[0] || null;
    }, [state]);

    const html = useMemo(() => {
        if (!academy) return '';
        const built = kind === 'outer' ? buildTuitionFormExternalHtml(academy) : buildTuitionFormHtml(academy);
        // 새 창용 단추 줄은 걷어낸다 — 여기서는 화면 안에 끼워 보여주므로 '✕ 닫기' 는 아무
        // 일도 하지 않고, 인쇄는 아래 큰 단추가 맡는다. 워드로 뽑을 때도 이 HTML 을 그대로
        // 쓰므로 여기서 한 번만 걷어내면 세 가지 파일이 모두 깨끗해진다.
        return stripPrintBar(built);
    }, [academy, kind]);

    // 게시표는 A4 한 장을 그대로 그린다 — 페이지 스타일이 섞이지 않게 iframe 안에 둔다.
    // PDF 는 브라우저 인쇄가 맡는다 ('대상'을 PDF 로 저장하면 된다)
    const print = () => {
        const f = document.getElementById('form-frame');
        if (!f) return;
        f.contentWindow.focus();
        f.contentWindow.print();
    };

    const kindLabel = KINDS.find((k) => k.key === kind).label;

    const run = async (what, job) => {
        setBusy(what);
        setFileError('');
        try { await job(); }
        catch (err) { setFileError(`${what} 파일을 만들지 못했습니다 — ${err.message}`); }
        finally { setBusy(''); }
    };

    const saveDocx = () => run('워드', () =>
        downloadFormDocx(html, formFileName(academy.name, kindLabel, 'docx')));

    const saveJpg = () => run('그림', () =>
        downloadFormJpg(document.getElementById('form-frame'), academy.name, kindLabel));

    if (state.status === 'loading') {
        return <div style={wrap}><p style={muted}>불러오는 중입니다…</p></div>;
    }
    if (state.status === 'error') {
        return (
            <div style={wrap}>
                <div style={{ ...card, background: '#fef2f2', borderColor: '#fef2f2', color: '#b91c1c', textAlign: 'center' }}>
                    {state.error}
                </div>
                <p style={muted}>문자에 적힌 문의 전화로 알려 주시면 확인해 드립니다.</p>
            </div>
        );
    }

    if (!academy) {
        return (
            <div style={wrap}>
                <div style={{ ...card, textAlign: 'center' }}>
                    신고된 교습과정이 없어 게시표를 만들 수 없습니다.
                    <div style={{ ...muted, marginTop: '6px' }}>문의 전화로 알려 주시면 확인해 드립니다.</div>
                </div>
            </div>
        );
    }

    const isHagwonso = String(state.category || '').includes('교습소');

    return (
        <div style={wrap}>
            <h1 style={{ fontSize: '20px', lineHeight: 1.4, margin: '0 0 4px' }}>{academy.name}</h1>
            <p style={{ ...muted, margin: '0 0 4px' }}>
                {isHagwonso ? '신고' : '등록'} 제{state.regNo}호 · 교습비 게시표 예시
            </p>
            <p style={{ margin: '0 0 16px' }}>
                <b>하남교육지원센터에 신고하신 내용</b>으로 만든 것입니다. 그대로 인쇄해 붙이셔도 되고,
                보고 따라 만드셔도 됩니다.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                {KINDS.map((k) => {
                    const on = kind === k.key;
                    return (
                        <button key={k.key} type="button" onClick={() => setKind(k.key)}
                            title={k.hint}
                            style={{
                                flex: 1, minHeight: '48px', fontSize: '16px', fontWeight: on ? 700 : 500,
                                borderRadius: '10px', cursor: 'pointer',
                                border: `1.5px solid ${on ? '#4f46e5' : '#cbd5e1'}`,
                                background: on ? '#4f46e5' : '#fff', color: on ? '#fff' : '#334155',
                            }}>
                            {k.label}
                        </button>
                    );
                })}
            </div>
            <p style={{ ...muted, marginTop: 0, marginBottom: '12px' }}>
                {KINDS.find((k) => k.key === kind).hint}
            </p>

            {/* 세 가지를 함께 둔다. 붙일 것은 인쇄(PDF), 고쳐 쓸 것은 워드,
                문자·카카오톡으로 보내거나 블로그에 올릴 것은 그림이다. */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                <button type="button" onClick={print} style={fileBtn('#0d9488', true)}>
                    인쇄 · PDF 저장
                </button>
                <button type="button" onClick={saveDocx} disabled={!!busy} style={fileBtn('#2563eb')}>
                    {busy === '워드' ? '만드는 중…' : '워드(DOCX)'}
                </button>
                <button type="button" onClick={saveJpg} disabled={!!busy} style={fileBtn('#7c3aed')}>
                    {busy === '그림' ? '만드는 중…' : '그림(JPG)'}
                </button>
            </div>
            {fileError && (
                <p style={{ ...muted, color: '#b91c1c', marginTop: 0 }}>{fileError}</p>
            )}
            <p style={{ ...muted, marginTop: 0, marginBottom: '12px' }}>
                PDF 는 인쇄 창에서 <b>대상을 &lsquo;PDF로 저장&rsquo;</b> 으로 바꾸시면 됩니다.
                그림은 문자·블로그에 올리실 때 쓰세요.
                <br />워드 파일은 <b>고쳐 쓰시라고</b> 드리는 것입니다 — 워드가 표 높이를 다시 잡아
                쪽이 나뉠 수 있으니, 그대로 붙이실 것은 PDF 나 그림을 쓰세요.
            </p>

            <div style={{ ...card, padding: '8px', overflow: 'auto' }}>
                <iframe id="form-frame" title="교습비 게시표" srcDoc={html}
                    style={{ width: '100%', minWidth: '700px', height: '900px', border: 'none', background: '#fff' }} />
            </div>

            <p style={muted}>
                신고하신 내용이 실제와 다르면 게시하기 전에 먼저 변경신고를 해 주세요 —
                게시된 금액과 신고된 금액이 다르면 그 자체가 시정 대상입니다.
            </p>
        </div>
    );
}
