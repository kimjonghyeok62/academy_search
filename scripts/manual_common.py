# 학원업무 편람 PDF 추출 공통 도구 (서울·충남 스크립트가 함께 씀)
# - 글자 위치로 줄을 다시 묶고 띄어쓰기를 되살린다
#   (한글 문서에서 만든 PDF는 띄어쓰기 글자가 빠져 있는 경우가 많다)
# - 원본 PDF는 읽기만 한다 — 결과는 넘겨받은 출력 경로에만 쓴다
import json, re, sys

sys.stdout.reconfigure(encoding='utf-8')


def check_outputs(*paths):
    for p in paths:
        assert not p.lower().endswith('.pdf'), f'출력 경로에 PDF를 줄 수 없습니다: {p}'


def clean(s):  # 사용자 정의 글머리 기호(PUA)·제어문자 지우기, 띄어쓰기 정리
    s = re.sub('[-\x00-\x1f]', ' ', s or '')
    return re.sub(r'\s+', ' ', s).strip()


def despread(s):
    """글자마다 띄운 줄('2 0 2 0 - 0 1 - 1 0', '학 원') → 붙여 쓴다. 낱말 사이 띄어쓰기는 둔다"""
    def fix(run):
        toks = run.split(' ')
        if len(toks) >= 3 and sum(len(t) == 1 for t in toks) / len(toks) >= 0.7:
            return ''.join(toks)
        return run
    # 두 칸 이상 띈 곳은 낱말 경계로 보고 그 사이 덩어리마다 따로 본다
    return re.sub(r' {2,}', ' ', '  '.join(fix(r) for r in re.split(r' {2,}', s or '')))


def norm(s):
    return re.sub(r'[^0-9A-Za-z가-힣]', '', s or '')


WORD = re.compile(r'[0-9A-Za-z가-힣]')


def page_lines(page, split=True):
    """쪽 → [{t, y(줄 윗변), size, x}] — 세로 가운데가 같은 글자끼리 한 줄로
    split: 멀리 떨어진 글자 덩어리를 다른 줄로 나눔 (목차 쪽은 False — 제목과 쪽번호가 멀다)"""
    chars = []
    for b in page.get_text('rawdict')['blocks']:
        for l in b.get('lines', []):
            for s in l['spans']:
                for c in s['chars']:
                    ch = c['c']
                    if not ch.strip() and ch != ' ':
                        continue
                    x0, y0, x1, y1 = c['bbox']
                    chars.append(((y0 + y1) / 2, x0, x1, ch, round(s['size'], 1), y0))
    chars.sort(key=lambda t: (round(t[0]), t[1]))
    rows = []
    for ch in chars:
        if rows and abs(rows[-1]['cy'] - ch[0]) <= max(2, ch[4] * 0.35):
            rows[-1]['c'].append(ch)
        else:
            rows.append({'cy': ch[0], 'c': [ch]})
    out = []
    for r in rows:
        cs = sorted(r['c'], key=lambda t: t[1])
        # 멀리 떨어진 글자 덩어리(표의 옆 칸 등)는 다른 줄로 나눈다
        segs = [[cs[0]]]
        for a, b in zip(cs, cs[1:]):
            if split and b[1] - a[2] > b[4] * 2.5:
                segs.append([])
            segs[-1].append(b)
        for seg in segs:
            # 글자 사이 간격은 줄마다 다르다(자간을 좁힌 줄은 글자끼리 겹친다)
            # → 그 줄의 보통 간격보다 눈에 띄게 넓으면 띄어쓰기로 본다
            # (점선 같은 기호 사이 간격은 빼고, 글자·숫자 사이 간격만 본다)
            gaps = sorted(b[1] - a[2] for a, b in zip(seg, seg[1:]) if WORD.match(a[3]) and WORD.match(b[3]))
            base = min(gaps[len(gaps) * 3 // 10], 0.5) if len(gaps) >= 3 else 0
            txt, prev = '', None
            for ch in seg:
                if prev is not None and ch[3] != ' ' and prev[3] != ' ':
                    if ch[1] - prev[2] > base + ch[4] * 0.15:
                        txt += ' '
                txt += ch[3]
                prev = ch
            t = clean(txt)
            if not t:
                continue
            out.append({'t': t, 'y': min(c[5] for c in seg), 'size': max(c[4] for c in seg), 'x': seg[0][1]})
    out.sort(key=lambda l: (l['y'], l['x']))
    return out


def load_pages(doc):
    return [page_lines(doc[i]) for i in range(doc.page_count)]


def guess_pdf_page(book, labels, offset_hint):
    """인쇄 쪽번호 → PDF 쪽. 같은 번호가 여럿이면(앞쪽 머리말 등) 예상 위치에 가까운 것"""
    hits = [i + 1 for i, lab in enumerate(labels) if lab == book]
    if hits:
        return min(hits, key=lambda p: abs(p - (book + offset_hint)))
    return book + offset_hint


def find_line(pages, keys, start, end, accept=None):
    """start~end-1 쪽(0부터)에서 정규화한 글이 keys 중 하나와 같은 줄 → (쪽 index, 줄)"""
    keys = [k for k in keys if k]
    for pi in range(max(0, start), min(end, len(pages))):
        L = pages[pi]
        for k, ln in enumerate(L):
            if accept and not accept(ln):
                continue
            n1 = norm(ln['t'])
            n2 = n1 + (norm(L[k + 1]['t']) if k + 1 < len(L) else '')
            if n1 in keys or n2 in keys:
                return pi, ln
    return None


def find_near(pages, keys, exp, lo, hi, accept=None):
    """예상 쪽(exp, 0부터)에서 가까운 쪽부터 찾는다. lo~hi-1 쪽 안에서만."""
    order = [exp]
    for d in range(1, max(exp - lo, hi - exp) + 1):
        order += [exp + d, exp - d]
    for pi in order:
        if lo <= pi < min(hi, len(pages)):
            r = find_line(pages, keys, pi, pi + 1, accept)
            if r:
                return r
    return None


def node(title, page, y=0, prefix='', **kw):
    n = {'title': clean(title), 'prefix': prefix, 'page': page, 'y': round(max(0, y))}
    n.update(kw)
    n['children'] = []
    return n


def finish(root, title, doc, labels, out_toc, pages, out_text):
    """번호(id) 붙이기, 빈 children 지우기, 두 JSON 쓰기"""
    def assign(nodes, pid):
        count = 0
        for n in nodes:
            if n.get('isItem'):
                continue
            count += 1
            n['id'] = f'{pid}.{count}' if pid else str(count)
            assign(n['children'], n['id'])

    assign(root, '')

    def walk(nodes):
        for n in nodes:
            yield n
            yield from walk(n.get('children', []))

    # 항목(질의응답 등)은 'qa'·'law'·'case' 구역 번호 + 세 자리
    for sec in [n for n in walk(root) if n.get('kind')]:
        items = [n for n in walk(sec['children']) if n.get('isItem')]
        for q, it in enumerate(items, 1):
            it['no'] = q
            it['id'] = f"{sec['id']}.{q:03d}"
        sec['count'] = len(items)

    for n in list(walk(root)):
        n['title'] = despread(n['title'])
        if n.get('note'):
            n['note'] = despread(n['note'])
        if not n.get('children'):
            n.pop('children', None)

    N = doc.page_count
    sizes = [(round(doc[i].rect.width), round(doc[i].rect.height)) for i in range(N)]
    base = max(set(sizes), key=sizes.count)
    # 1pt 안팎 차이는 같은 크기로 본다
    odd = {i + 1: z for i, z in enumerate(sizes) if abs(z[0] - base[0]) > 2 or abs(z[1] - base[1]) > 2}
    json.dump({'title': title, 'pages': N, 'size': base, 'oddSizes': odd, 'labels': labels, 'toc': root},
              open(out_toc, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    texts = [' '.join(l['t'] for l in L) for L in pages]
    json.dump(texts, open(out_text, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    return list(walk(root))


def report(root, labels):
    def show(nodes, dep=0):
        for n in nodes:
            lab = labels[n['page'] - 1]
            if not n.get('isItem') or n['no'] <= 2:
                cnt = f" ({n['count']})" if 'count' in n else ''
                note = f" | {n['note']}" if n.get('note') else ''
                print('  ' * dep + f"[{n['id']}] {n.get('prefix', '')} {n['title'][:70]}  pdf{n['page']} p{lab}{cnt}{note}")
            show(n.get('children', []), dep + 1)
    show(root)
