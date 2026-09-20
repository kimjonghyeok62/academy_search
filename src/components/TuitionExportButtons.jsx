// 교습비등 게시표를 네 가지 꼴로 내보내는 단추들 (내부용 / 외부용).
//
// 담당자가 학원에 무엇을 건네느냐에 따라 필요한 것이 다르다:
//   PDF  — 그 자리에서 인쇄해 붙인다 (브라우저 인쇄창)
//   JPG  — 문자·카카오톡으로 보내거나 블로그에 올린다
//   HWPX — 학원이 받아서 자기 사정에 맞게 고쳐 쓴다
//   TEXT — 네이버 플레이스 소개글에 붙여넣는다 (표가 깨지는 자리라 줄글로)
//
// 만드는 재료는 모두 같은 게시표 하나다 (generateTuitionPDF.js). 꼴만 달라진다.
import { useState } from 'react';
import {
    printTuitionForm, printTuitionFormExternal,
    buildTuitionFormHtml, buildTuitionFormExternalHtml,
} from '../utils/generateTuitionPDF';
import { downloadFormJpgFromHtml } from '../utils/tuitionFormFiles';
import { downloadTuitionInternalHWPX, downloadTuitionExternalHWPX } from '../utils/generateTuitionHWPX';
import { buildTuitionPlaceText } from '../utils/generateTuitionText';
import TuitionTextModal from './TuitionTextModal';

const KINDS = [
    {
        key: 'inner',
        label: '내부용',
        hint: '학원 안에 붙이는 것',
        print: printTuitionForm,
        html: buildTuitionFormHtml,
        hwpx: downloadTuitionInternalHWPX,
    },
    {
        key: 'outer',
        label: '외부용',
        hint: '건물 밖에서 보이는 옥외가격표시',
        print: printTuitionFormExternal,
        html: buildTuitionFormExternalHtml,
        hwpx: downloadTuitionExternalHWPX,
    },
];

export default function TuitionExportButtons({ academy }) {
    // 만드는 데 몇 초 걸린다 — 어느 단추가 일하는 중인지 보여 주고, 그동안은 모두 잠근다
    // (두 번 눌러 같은 파일이 두 벌 내려오는 일을 막는다)
    const [busy, setBusy] = useState('');
    const [placeText, setPlaceText] = useState(null);

    async function run(key, fn) {
        if (busy) return;
        setBusy(key);
        try {
            await fn();
        } catch (e) {
            alert(`파일을 만들지 못했습니다: ${e.message}`);
        } finally {
            setBusy('');
        }
    }

    return (
        <div className="tuition-export">
            {KINDS.map(kind => (
                <div key={kind.key} className={`tuition-export__card tuition-export__card--${kind.key}`}>
                    <div className="tuition-export__head">
                        <span className="tuition-export__title">교습비등 게시표</span>
                        <span className="tuition-export__badge">{kind.label}</span>
                        <span className="tuition-export__hint">{kind.hint}</span>
                    </div>
                    <div className="tuition-export__grid">
                        <button
                            className="tuition-export__btn tuition-export__btn--pdf"
                            onClick={() => kind.print(academy)}
                            disabled={!!busy}
                        >
                            🖨️ PDF 출력<span className="tuition-export__sub">인쇄용</span>
                        </button>
                        <button
                            className="tuition-export__btn tuition-export__btn--jpg"
                            onClick={() => run(`${kind.key}-jpg`, () =>
                                downloadFormJpgFromHtml(kind.html(academy), academy.name, kind.label))}
                            disabled={!!busy}
                        >
                            {busy === `${kind.key}-jpg` ? '⏳ 만드는 중…' : '🖼️ JPG 저장'}
                            <span className="tuition-export__sub">문자·블로그용</span>
                        </button>
                        <button
                            className="tuition-export__btn tuition-export__btn--hwpx"
                            onClick={() => run(`${kind.key}-hwpx`, () => kind.hwpx(academy))}
                            disabled={!!busy}
                        >
                            {busy === `${kind.key}-hwpx` ? '⏳ 만드는 중…' : '📄 HWPX 저장'}
                            <span className="tuition-export__sub">한글 편집용</span>
                        </button>
                        <button
                            className="tuition-export__btn tuition-export__btn--text"
                            onClick={() => setPlaceText(buildTuitionPlaceText(academy))}
                            disabled={!!busy}
                        >
                            📋 TEXT 복사<span className="tuition-export__sub">네이버 플레이스용</span>
                        </button>
                    </div>
                </div>
            ))}

            {placeText !== null && (
                <TuitionTextModal
                    text={placeText}
                    academyName={academy.name}
                    onClose={() => setPlaceText(null)}
                />
            )}
        </div>
    );
}
