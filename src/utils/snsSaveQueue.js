// 직접 고친 값(O/X·마감)을 시트에 저장하는 큐.
//
// 칸을 누를 때마다 곧바로 fetch 를 날리면 연달아 고칠 때 요청이 겹쳐 나가고,
// 실패하면 화면 값이 소리 없이 되돌아가 '고쳤다고 착각' 하게 된다.
// 그래서 (1) 같은 행의 연속 수정은 마지막 값 하나로 합치고 (2) 순차로 보내고
// (3) 실패하면 자동으로 다시 시도한다. 화면 값은 되돌리지 않는다 —
// 30초 전에 고친 값이 말없이 사라지는 편이 더 나쁘다. 대신 상태를 화면에 내보인다.

import { saveSnsChecks } from './snsCheck';

const DEBOUNCE_MS = 500;
// 자동 재시도 간격. 여기까지 실패하면 손을 떼고 '다시 저장' 버튼을 기다린다.
const RETRY_MS = [2000, 5000, 10000];

/**
 * @param onState 상태가 바뀔 때마다 호출된다
 *   { status: 'idle'|'pending'|'saving'|'saved'|'retrying'|'failed', pending, error, savedAt }
 */
export function createSaveQueue(onState) {
    const pending = new Map();   // 행키 → 보낼 레코드 (같은 행은 마지막 것만 남는다)
    let timer = null;
    let sending = false;
    let attempt = 0;
    let state = { status: 'idle', pending: 0, error: '', savedAt: '' };

    const emit = (patch) => {
        state = { ...state, ...patch, pending: pending.size + (sending ? 1 : 0) };
        onState?.(state);
    };

    const schedule = (ms) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; flush(); }, ms);
    };

    async function flush() {
        if (sending || !pending.size) return;
        const inflight = new Map(pending);
        pending.clear();
        sending = true;
        emit({ status: 'saving', error: '' });

        try {
            await saveSnsChecks([...inflight.values()]);
            sending = false;
            attempt = 0;
            emit({ status: pending.size ? 'pending' : 'saved', error: '', savedAt: new Date().toISOString() });
            if (pending.size) schedule(0);
        } catch (err) {
            sending = false;
            // 보내다 실패한 것을 되돌려 넣는다. 보내는 사이에 같은 행을 또 고쳤다면
            // 그쪽이 더 새 값이므로 덮지 않는다.
            inflight.forEach((rec, key) => { if (!pending.has(key)) pending.set(key, rec); });
            if (attempt < RETRY_MS.length) {
                const wait = RETRY_MS[attempt];
                attempt++;
                emit({ status: 'retrying', error: err.message });
                schedule(wait);
            } else {
                emit({ status: 'failed', error: err.message });
            }
        }
    }

    return {
        /** 이 행의 저장을 예약한다 (같은 행을 다시 부르면 마지막 값으로 덮는다) */
        push(rowKey, record) {
            pending.set(rowKey, record);
            if (state.status !== 'retrying' && state.status !== 'failed') emit({ status: 'pending' });
            else emit({});
            if (state.status !== 'retrying') schedule(DEBOUNCE_MS);
        },
        /** 여러 행을 한꺼번에 (공동운영 전파처럼) */
        pushMany(entries) {
            entries.forEach(([rowKey, record]) => pending.set(rowKey, record));
            if (state.status !== 'retrying' && state.status !== 'failed') emit({ status: 'pending' });
            else emit({});
            if (state.status !== 'retrying') schedule(DEBOUNCE_MS);
        },
        /** '다시 저장' — 포기한 뒤 손으로 누를 때 */
        retry() {
            attempt = 0;
            schedule(0);
        },
        hasPending: () => pending.size > 0 || sending,
        stop() { if (timer) { clearTimeout(timer); timer = null; } },
    };
}
