# 충청남도교육청 학원업무 편람 PDF → 목차(JSON) · 쪽별 본문(JSON)
#   python scripts/build_manual_chungnam.py public/manual/chungnam-2024.pdf src/data/chungnamManual.json public/manual/chungnam-2024-text.json
# - SECTION 표지마다 있는 세부 목차 → 절(본문 16pt 제목)
# - 절 안: 가.(13pt) → 1)(12pt) → 가)(12pt)
# - SECTION Ⅵ: 가.(13pt) → 분야(14pt) 아래 질문·사례 제목 — 제목(11·12pt) 바로 다음 줄이
#   출처 '(국민신문고 …)' · '[대법원 …]' · '【질의요지】' 로 시작한다
# 필요: pip install pymupdf
import re, sys
from difflib import SequenceMatcher
import pymupdf
from manual_common import (check_outputs, clean, norm, load_pages, page_lines, guess_pdf_page, find_near,
                           node, finish, report)

SRC, OUT_TOC, OUT_TEXT = sys.argv[1:4]
check_outputs(OUT_TOC, OUT_TEXT)
doc = pymupdf.open(SRC)
pages = load_pages(doc)
N = doc.page_count
OFFSET = 6  # 인쇄 1쪽 = PDF 7쪽

# ── 인쇄 쪽번호 (아래 쪽 '… ● 21' / '22 ● 충청남도교육청 …') ──
def is_footer(ln):
    return '●' in ln['t'] and ('cne.go.kr' in ln['t'] or '충청남도교육청' in ln['t'])

labels = []
for L in pages:
    lab = None
    for ln in L:
        if is_footer(ln):
            m = re.search(r'\d+', ln['t'].replace('cne.go.kr', ''))
            if m: lab = int(m.group())
    labels.append(lab)

def is_noise(ln):
    return is_footer(ln) or ln['size'] < 9.5 or ln['t'].startswith('SECTION ') or ln['t'] == '2024 학원업무편람'

# ── SECTION 표지 → 대분류와 절 목록 ──
ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦ'
root = []
for pi in range(N):
    L = page_lines(doc[pi], split=False)
    if not any(l['t'] == 'SECTION' for l in L) or not any(l['size'] >= 37 for l in L):
        continue
    big = [l for l in L if 37 <= l['size'] < 55]
    roman = next((c for l in L if l['size'] >= 55 for c in l['t'] if c in ROMAN), '')
    part = node(big[0]['t'] if big else '', pi + 1, 0, f'SECTION {roman}')
    part['_secs'] = []
    for l in L:
        m = re.match(r'^(■|\d+\.)\s*(.+?)\s+(\d[\d ]*)$', l['t'])
        if m and 13.5 <= l['size'] <= 14.5:
            part['_secs'].append((m.group(1), m.group(2).strip(), int(m.group(3).replace(' ', ''))))
    root.append(part)

last = 0
for part in root:
    last = part['page']  # 표지 다음 쪽부터
    for pre, title, book in part.pop('_secs'):
        exp = guess_pdf_page(book, labels, OFFSET) - 1
        keys = [norm(('' if pre == '■' else pre) + title), norm(title)]
        lo = max(last, exp - 4)
        hit = find_near(pages, keys, max(exp, lo), lo, exp + 20, lambda l: l['size'] >= 14.5)
        if not hit:
            # 본문 제목은 표지 목록과 글귀가 조금 다르다('학원의 변경 등록' ↔ '학원 변경 등록',
            # '업무흐름도' ↔ '교습소 설립·운영 신고 업무흐름도') → 16pt 제목 중 글귀가 비슷한 줄
            want = norm(title)
            for pi in sorted(range(lo, min(exp + 20, N)), key=lambda p: abs(p - max(exp, lo))):
                for ln in pages[pi]:
                    got = norm(re.sub(r'^(\d+\.|■)\s*', '', ln['t']))
                    if ln['size'] >= 15.5 and got and (want in got or SequenceMatcher(None, want, got).ratio() >= 0.75):
                        hit = (pi, ln); break
                if hit:
                    break
        hit = hit or find_near(pages, keys, max(exp, lo), lo, exp + 20, lambda l: l['size'] >= 11)
        if hit:
            pg, y = hit[0] + 1, hit[1]['y']
        else:
            pg, y = max(exp + 1, last + 1), 0
        part['children'].append(node(title, pg, y - 2, '' if pre == '■' else pre))
        last = pg - 1

starts = sorted([(s['page'], s['y']) for p in root for s in p['children']] + [(p['page'], 0) for p in root])

def section_end(sec):
    for st in starts:
        if st > (sec['page'], sec['y']):
            return st
    return (N + 1, 0)

def lines_between(a, b):
    for pi in range(a[0] - 1, min(b[0], N)):
        for ln in pages[pi]:
            pos = (pi + 1, ln['y'])
            if pos <= (a[0], a[1] + 3) or pos >= b or is_noise(ln):
                continue
            yield pi + 1, ln

# ── 절 안 소제목 (Ⅵ 질의응답 제외) ──
for part in root:
    if '질의응답' in part['title']:
        continue
    manual_part = '통합시스템' in part['title']
    for sec in part['children']:
        l2 = l3 = None
        forms = '서식' in sec['title']  # 서식·기안문 안의 '1) 목적: ○○' 같은 줄은 빼고 가.만
        for pg, ln in lines_between((sec['page'], sec['y']), section_end(sec)):
            t, size, x = ln['t'], ln['size'], ln['x']
            if len(t) > 70 or x > 62 or '○' in t:
                continue
            if forms and size == 12.0:
                continue
            if (size == 13.0 and re.match(r'^[가-하]\.\s', t)) or (manual_part and size == 18.0 and re.match(r'^\d+\.\s', t)):
                m = re.match(r'^([가-하]\.|\d+\.)\s*(.+)$', t)
                l2 = node(m.group(2), pg, ln['y'] - 2, m.group(1)); l3 = None
                sec['children'].append(l2)
            elif size == 12.0 and re.match(r'^\d+\)\s', t):
                m = re.match(r'^(\d+\))\s*(.+)$', t)
                l3 = node(m.group(2), pg, ln['y'] - 2, m.group(1))
                (l2 or sec)['children'].append(l3)
            elif size == 12.0 and re.match(r'^[가-하]\)\s', t) and l3 is not None:
                m = re.match(r'^([가-하]\))\s*(.+)$', t)
                l3['children'].append(node(m.group(2), pg, ln['y'] - 2, m.group(1)))

# ── Ⅵ 질의응답·사례 ──
qa_part = next(p for p in root if '질의응답' in p['title'])
SOURCE = ('(', '[', '【')
for sec in qa_part['children']:
    t = sec['title']
    if '질의' in t:
        sec['kind'] = 'qa'
    elif '법령' in t or '법제처' in t:
        sec['kind'] = 'law'
    else:
        sec['kind'] = 'case'
        sec['itemLabel'] = '판례' if ('판례' in t or '판결' in t) else '재결'
    l2 = None
    cat = sec
    buf = []  # 제목 줄 모으기
    for pg, ln in lines_between((sec['page'], sec['y']), section_end(sec)):
        text, size = ln['t'], ln['size']
        if size == 13.0 and re.match(r'^[가-하]\.\s', text) and ln['x'] <= 62:
            m = re.match(r'^([가-하]\.)\s*(.+)$', text)
            l2 = node(m.group(2), pg, ln['y'] - 2, m.group(1)); sec['children'].append(l2); cat = l2; buf = []; continue
        if size == 14.0:
            cat = node(text, pg, ln['y'] - 2, ''); (l2 or sec)['children'].append(cat); buf = []; continue
        if size in (11.0, 12.0):
            # 출처 줄: 질의응답은 '(국민신문고 …)', 법령해석·사례는 '[법제처 …]'·'【질의요지】'
            # (법령해석 제목 안에는 '(…관련)' 줄이 끼어 있어 '('로는 끊지 않는다)
            ends = SOURCE if sec['kind'] == 'qa' else ('[', '【')
            if not text.startswith(ends):
                if buf and (buf[-1][0] != pg or ln['y'] - buf[-1][1]['y'] > size * 2.2):
                    buf = []
                buf.append((pg, ln)); continue
            if buf:
                title = clean(' '.join(b[1]['t'] for b in buf))
                note = '' if text.startswith('【') else text.strip('()[] ')
                cat['children'].append(node(title, buf[0][0], buf[0][1]['y'] - 2, '', isItem=True, note=note))
            buf = []
            continue
        buf = []

finish(root, '2024 충청남도교육청 학원업무 편람', doc, labels, OUT_TOC, pages, OUT_TEXT)
report(root, labels)
