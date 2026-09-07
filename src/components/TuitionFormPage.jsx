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

export default function TuitionFormPage() {
    const token = useMemo(
        () => decodeURIComponent(window.location.pathname.replace(/^\/g\/?/, '')).trim(), []);

    const [state, setState] = useState({ status: 'loading' });
    const [kind, setKind] = useState('inner');

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
        // 게시표 HTML 에는 새 창용 단추 줄(.print-bar)이 붙어 있다. 여기서는 화면 안에 끼워
        // 보여주므로 '✕ 닫기' 는 아무 일도 하지 않고, 인쇄는 아래 큰 단추가 맡는다 — 가린다.
        // (만드는 함수는 담당자 화면과 함께 쓰므로 손대지 않는다)
        return built.replace('</head>', '<style>.print-bar{display:none!important}</style></head>');
    }, [academy, kind]);

    // 게시표는 A4 한 장을 그대로 그린다 — 페이지 스타일이 섞이지 않게 iframe 안에 둔다
    const print = () => {
        const f = document.getElementById('form-frame');
        if (!f) return;
        f.contentWindow.focus();
        f.contentWindow.print();
    };

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

            <button type="button" onClick={print}
                style={{
                    width: '100%', minHeight: '52px', marginBottom: '12px',
                    fontSize: '17px', fontWeight: 700, borderRadius: '12px', border: 'none',
                    background: '#0d9488', color: '#fff', cursor: 'pointer',
                }}>
                인쇄 · PDF 로 저장
            </button>

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
