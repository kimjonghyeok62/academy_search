# 학원업무 편람 PDF → 목차(JSON) · 쪽별 본문(JSON)
#   python scripts/build_manual_gyeonggi.py <편람.pdf> src/data/gyeonggiManual.json public/manual/gyeonggi-2024-text.json
# - 인쇄 목차(PDF 4~10쪽)를 읽고, 각 제목이 실제 몇 번째 PDF 쪽에 있는지 본문에서 찾아 맞춘다
#   (인쇄 목차 쪽번호가 본문과 몇 쪽씩 어긋나 있어 그대로 쓰지 않는다)
# - 질의응답(11.6pt 제목), 법령해석(11.9pt 제목), 행정심판·판례(【판시사항】 다음 줄) 항목을 하나씩 뽑는다
# 필요: pip install pymupdf
import pymupdf, sys, re, json
sys.stdout.reconfigure(encoding='utf-8')
# 원본 PDF는 읽기만 한다 — 결과는 아래 두 출력 경로에만 쓴다
SRC, OUT_TOC, OUT_TEXT = sys.argv[1:4]
assert not OUT_TOC.lower().endswith('.pdf') and not OUT_TEXT.lower().endswith('.pdf'), '출력 경로에 PDF를 줄 수 없습니다'
d = pymupdf.open(SRC)
N = d.page_count

def clean(s):  # 한글 문서의 사용자 정의 글머리 기호(PUA) 지우기
    return re.sub('[\ue000-\uf8ff]', '', s or '').strip()

def norm(s):
    return re.sub(r'[^0-9A-Za-z가-힣]', '', s or '')

# ── 쪽마다 줄 (머리말·쪽번호 제외) ─────────────────────────
pages = []      # [ [ {t,size,y,lead} ] ]
labels = []     # 인쇄된 쪽번호
for i in range(N):
    out = []
    label = None
    for b in d[i].get_text('dict')['blocks']:
        for l in b.get('lines', []):
            spans = [s for s in l['spans'] if s['text'].strip()]
            if not spans: continue
            t = ''.join(s['text'] for s in l['spans'])
            size = round(max(s['size'] for s in spans), 1)
            st = t.strip()
            if re.fullmatch(r'\d{1,3}', st) and size in (10.9,) :
                label = label or int(st); continue
            if size < 9: continue  # 머리말(2024 학원업무편람 / 장 제목)
            out.append({'t': t, 'size': size, 'y': l['bbox'][1], 'lead': t[:1] == ' ' or t[:1] == '\u3000'})
    pages.append(out)
    labels.append(label)

# ── 목차 (PDF 4~10쪽) ──────────────────────────────────────
raw = []
for i in range(3, 10):
    for ln in d[i].get_text().split('\n'):
        ln = re.sub(r'[·‧∙・･\.]{3,}', ' @', ln).rstrip()
        s = ln.strip()
        if not s or re.fullmatch(r'[ivx]+', s) or s in ('Contents', '2024 학원업무편람', '목 차  Contents'): continue
        if re.fullmatch(r'\d+', s) and raw and re.search(r'@ ?\d*$', raw[-1]):
            raw[-1] += s; continue
        raw.append(s)
# 줄바꿈된 항목 합치기
merged = []
buf = ''
for s in raw:
    if re.fullmatch(r'제\d장', s) or (merged and re.fullmatch(r'제\d장', merged[-1]) ):
        if buf: merged.append(buf); buf = ''
        merged.append(s); continue
    buf = (buf + ' ' + s).strip() if buf else s
    if '@' in buf:
        merged.append(buf); buf = ''
entries = []
chapter = None
i = 0
while i < len(merged):
    s = merged[i]
    m = re.fullmatch(r'제(\d)장', s)
    if m:
        entries.append({'level': 0, 'prefix': f'제{m.group(1)}장', 'title': merged[i+1], 'toc': None})
        i += 2; continue
    t, _, p = s.rpartition('@')
    t = t.strip(); p = int(p.strip()) if p.strip().isdigit() else None
    for lv, pat in ((1, r'(\d+)\.\s*'), (2, r'([가-하])\.\s*'), (3, r'(\d+)\)\s*'), (4, r'([가-하])\)\s*')):
        m = re.match(pat, t)
        if m:
            entries.append({'level': lv, 'prefix': m.group(0).strip(), 'title': t[m.end():].strip(), 'toc': p}); break
    else:
        entries.append({'level': 1, 'prefix': '', 'title': t, 'toc': p, 'front': True})
    i += 1

# ── 본문에서 제목 찾기 ────────────────────────────────────
def find_heading(e, start, end):
    full = norm(e['prefix'] + e['title']); bare = norm(e['title'])
    passes = [[full]] + ([[bare]] if bare else [])
    for keys in passes:
        for pi in range(start, min(end, N)):
            L = pages[pi]
            for k, ln in enumerate(L):
                n1 = norm(ln['t'])
                n2 = n1 + (norm(L[k+1]['t']) if k + 1 < len(L) else '')
                for key in keys:
                    if n1 == key or n2 == key or (len(key) >= 8 and n1.startswith(key) and len(n1) <= len(key) + 4):
                        return pi, ln['y']
    return None

offset = 10
last = 10
for e in entries:
    if e['level'] == 0:
        # 장 표지: '제N장' 큰 글씨
        for pi in range(last, N):
            if any(re.fullmatch(r'제\d장', l['t'].strip()) and l['size'] > 20 and l['t'].strip() == e['prefix'] for l in pages[pi]):
                e['page'] = pi + 1; e['y'] = 0; last = pi + 1; break
        continue
    exp = (e['toc'] + offset - 1) if e['toc'] else last
    if exp < last: exp = last
    r = find_heading(e, last, exp + 12)
    if r:
        e['page'] = r[0] + 1; e['y'] = r[1]
        if e['toc'] and abs((r[0] - e['toc']) - offset) <= 6: offset = r[0] + 1 - e['toc']
        last = r[0]
    else:
        e['page'] = max(exp + 1, last + 1); e['y'] = 0; e['guess'] = True
        last = e['page'] - 1

# ── 질의응답 · 사례 항목 ──────────────────────────────────
def section_range(idx):
    e = entries[idx]
    for j in range(idx + 1, len(entries)):
        if entries[j]['level'] <= e['level']:
            return e['page'] - 1, entries[j]['page'] - 1
    return e['page'] - 1, N

def collect_qa(a, b):
    items = []
    for pi in range(a, b):
        L = pages[pi]; k = 0
        while k < len(L):
            ln = L[k]
            if 11.5 <= ln['size'] <= 11.7 and ln['lead'] and len(ln['t'].strip()) > 1:
                t = ln['t'].strip(); k += 1
                while k < len(L) and 11.5 <= L[k]['size'] <= 11.7 and not L[k]['lead']:
                    t += ' ' + L[k]['t'].strip(); k += 1
                items.append({'title': clean(re.sub(r'\s+', ' ', t)), 'page': pi + 1, 'y': ln['y']})
                continue
            k += 1
    return items

def collect_law(a, b):  # 법제처 법령해석: 11.9pt 제목
    items = []
    for pi in range(a, b):
        L = pages[pi]; k = 0
        while k < len(L):
            ln = L[k]
            if 11.8 <= ln['size'] <= 12.0:
                t = ln['t'].strip(); y = ln['y']; k += 1
                while k < len(L) and 11.8 <= L[k]['size'] <= 12.0:
                    t += ' ' + L[k]['t'].strip(); k += 1
                note = L[k]['t'].strip() if k < len(L) and L[k]['t'].strip().startswith('[') else ''
                items.append({'title': re.sub(r'\s+', ' ', t), 'note': note.strip('[]'), 'page': pi + 1, 'y': y})
                continue
            k += 1
    return items

CASE_RE = re.compile(r'(행정심판|선고|법원|지법|고법|재결|위원회\s*\d|\d{4}\s*[가-힣]{1,2}\d+)')
def collect_cases(a, b):  # 【판시사항】 다음 줄들 = 제목, 사건번호 줄 = 비고
    items = []
    for pi in range(a, b):
        L = pages[pi]
        for k, ln in enumerate(L):
            if '판시사항' in ln['t']:
                parts = []; note = ''
                for m in range(k + 1, min(k + 12, len(L))):
                    s = L[m]['t'].strip()
                    if s.startswith('【'): break
                    if CASE_RE.search(s) and len(s) < 60 and not s.startswith('['):
                        note = s; break
                    parts.append(s)
                t = re.sub(r'\s+', ' ', ' '.join(parts)).strip()
                t = re.split(r'\s\[2\]', t)[0]
                t = re.sub(r'^\[1\]\s*', '', t).strip()
                m2 = re.search(r'\s((국민권익위원회|경기도교육청|중앙행정심판위원회).*)$', t)
                if m2 and not note: note = m2.group(1); t = t[:m2.start()].strip()
                if len(t) > 90: t = t[:88].rstrip() + '…'
                items.append({'title': t, 'note': note, 'page': pi + 1, 'y': ln['y']})
    return items

# ── 나무 만들기 ──────────────────────────────────────────
root = []
stack = []
front = {'id': '0', 'title': '총괄', 'prefix': '', 'page': entries[0]['page'], 'children': []}
root.append(front)
cnt = {}
for idx, e in enumerate(entries):
    node = {'title': e['title'], 'prefix': e['prefix'], 'page': e['page'], 'y': e.get('y', 0), 'children': []}
    if e.get('guess'): node['guess'] = True
    if e.get('front'):
        front['children'].append(node); continue
    while stack and stack[-1][0] >= e['level']: stack.pop()
    parent = stack[-1][1] if stack else None
    (parent['children'] if parent else root).append(node)
    stack.append((e['level'], node, idx))

    # 질의응답 / 제5장 사례 → 항목 붙이기
    title = e['title']
    kind = None
    if e['level'] == 1 and '질의응답' in title: kind = 'qa'
    elif e['level'] == 1 and '법령해석' in title: kind = 'law'
    elif e['level'] == 1 and ('행정심판' in title or '판례' in title): kind = 'case'
    if kind:
        node['kind'] = kind
        node['_range'] = section_range(idx)

def assign(nodes, pid):
    for k, n in enumerate(nodes, 1):
        n['id'] = f"{pid}.{k}" if pid else n['id'] if 'id' in n else n['prefix'][1]
        assign(n['children'], n['id'])
assign(root, '')

def walk(nodes):
    for n in nodes:
        yield n
        yield from walk(n.get('children', []))

for n in list(walk(root)):
    if 'kind' not in n: continue
    a, b = n.pop('_range')
    items = collect_qa(a, b) if n['kind'] == 'qa' else collect_law(a, b) if n['kind'] == 'law' else collect_cases(a, b)
    subs = list(n['children'])  # 가. 나. … (질의응답 하위 분류) — 복사본: 붙인 항목이 하위 분류로 잡히지 않게
    for q, it in enumerate(items, 1):
        it['no'] = q
        it['isItem'] = True
        it['id'] = f"{n['id']}.{q:03d}"
        it['children'] = []
        target = n
        for s in subs:
            if (s['page'], s['y']) <= (it['page'], it['y']): target = s
        target['children'].append(it)
    n['count'] = len(items)

for n in list(walk(root)):
    n['y'] = round(n.get('y') or 0)
    if not n['children']: n.pop('children')

# 앞쪽 인쇄 쪽번호
sizes = [(round(d[i].rect.width), round(d[i].rect.height)) for i in range(N)]
base = max(set(sizes), key=sizes.count)
odd = {i + 1: z for i, z in enumerate(sizes) if z != base}
json.dump({'title': '2024 경기도교육청 학원업무 편람', 'pages': N, 'size': base, 'oddSizes': odd, 'labels': labels, 'toc': root},
          open(OUT_TOC, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ── 본문 검색용 쪽별 글 ───────────────────────────────────
texts = []
for L in pages:
    t = ' '.join(l['t'].strip() for l in L)
    texts.append(re.sub(r'\s+', ' ', t))
json.dump(texts, open(OUT_TEXT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# 점검 출력
def show(nodes, dep=0):
    for n in nodes:
        lab = labels[n['page'] - 1]
        if not n.get('isItem') or n['no'] <= 3 or dep < 0:
            print('  ' * dep + f"[{n['id']}] {n.get('prefix','')} {n['title'][:60]}  pdf{n['page']} p{lab}{' ?' if n.get('guess') else ''}{' ('+str(n['count'])+')' if 'count' in n else ''}{' | '+n['note'] if n.get('note') else ''}")
        show(n.get('children', []), dep + 1)
show(root)
