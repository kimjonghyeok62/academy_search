# 서울특별시교육청 학원 업무 편람 PDF → 목차(JSON) · 쪽별 본문(JSON)
#   python scripts/build_manual_seoul.py public/manual/seoul-2025.pdf src/data/seoulManual.json public/manual/seoul-2025-text.json
# - 인쇄 목차(PDF 6~7쪽): 대분류(Ⅰ~Ⅶ) → 절. 절 안 소제목은 본문의 14·16pt 줄에서 뽑는다
# - Ⅶ 질의응답: 분류(16pt·14pt) 아래 질문·사례 제목(13pt)을 한 건씩
# 필요: pip install pymupdf
import re, sys
import pymupdf
from manual_common import (check_outputs, clean, norm, load_pages, page_lines, guess_pdf_page, find_near,
                           node, finish, report)

SRC, OUT_TOC, OUT_TEXT = sys.argv[1:4]
check_outputs(OUT_TOC, OUT_TEXT)
doc = pymupdf.open(SRC)
pages = load_pages(doc)
N = doc.page_count
ROMAN = 'ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ'

# ── 인쇄 쪽번호 (아래 쪽 'www.sen.go.kr 3' / '302 서울특별시교육청') ──
def is_footer(ln):
    return ln['size'] == 12.5 and ('sen.go.kr' in ln['t'] or '서울특별시교육청' in ln['t'])

labels = []
for L in pages:
    lab = None
    for ln in L:
        if is_footer(ln):
            m = re.search(r'\d+', ln['t'].replace('sen.go.kr', ''))
            if m: lab = int(m.group())
    labels.append(lab)

# ── 인쇄 목차 ──
LEADER = r'[\s·‧∙・･\.…]*'
parts = []
for pi in (5, 6):
    for ln in page_lines(doc[pi], split=False):
        t = ln['t']
        m = re.match(rf'^([{ROMAN}])\s*\.\s*(.+)$', t)
        if m and ln['size'] >= 14:
            parts.append({'roman': m.group(1), 'title': m.group(2).strip(), 'sections': []}); continue
        m = re.match(rf'^(?:(\d+)\.|(※))\s*(.+?){LEADER}(\d[\d ]*)$', t)
        if m and parts and ln['size'] < 14:
            parts[-1]['sections'].append({'num': m.group(1), 'title': m.group(3).strip(), 'book': int(m.group(4).replace(' ', '')), 'star': bool(m.group(2))})
            continue
        m = re.match(rf'^(.*찾아보기){LEADER}(\d[\d ]*)$', t)
        if m:
            index_book = int(m.group(2).replace(' ', ''))

def is_noise(ln):
    return is_footer(ln) or ln['size'] < 9.5

# ── 대분류 표지 · 절 찾기 ──
root = []
last = 7
for p in parts:
    key = norm(p['title'])
    cover = None
    for pi in range(last, N):
        if any(ln['size'] >= 29 and norm(ln['t']) == key for ln in pages[pi]):
            cover = pi; break
    part = node(p['title'], (cover if cover is not None else last) + 1, 0, f"{p['roman']}.")
    root.append(part)
    last = (cover if cover is not None else last) + 1
    for s in p['sections']:
        exp = guess_pdf_page(s['book'], labels, 8) - 1
        keys = [norm((s['num'] or '') + s['title']), norm(s['title'])]
        lo = max(last, exp - 3)
        hit = (find_near(pages, keys, exp, lo, exp + 5, lambda l: l['size'] >= 16)
               or find_near(pages, keys, exp, lo, exp + 5, lambda l: l['size'] >= 10))
        if hit:
            pg, y = hit[0] + 1, hit[1]['y']
        else:
            pg, y = max(exp + 1, last + 1), 0
        prefix = f"{s['num']}." if s['num'] else '※'
        part['children'].append(node(s['title'], pg, y, prefix, _star=s['star']))
        last = pg - 1
root.append(node('찾아보기', guess_pdf_page(index_book, labels, 8), 0, ''))

# 절마다 범위: 다음 절(또는 다음 대분류) 시작 전까지
flat_secs = []
for part in root:
    flat_secs.extend(part['children'])
starts = sorted([(n['page'], n['y']) for n in flat_secs] + [(n['page'], 0) for n in root])

def section_end(sec):
    for st in starts:
        if st > (sec['page'], sec['y']):
            return st
    return (N + 1, 0)

def lines_between(a, b):
    """(쪽, y) a 이상 b 미만의 줄들 → (쪽, 줄)"""
    for pi in range(a[0] - 1, min(b[0], N)):
        for ln in pages[pi]:
            pos = (pi + 1, ln['y'])
            if pos <= (a[0], a[1] + 1) or pos >= b:
                continue
            if is_noise(ln):
                continue
            yield pi + 1, ln

# ── 절 안 소제목 (Ⅰ~Ⅵ, 서식·예시문 제외) ──
SKIP_START = ('(', '※', '-', '•', '❍', '￭', '☞', '‧', '·', '*', '○', '◦', '▶', '<')
for part in root[:-1]:
    if part['title'] == '질의응답':
        continue
    for sec in part['children']:
        if sec.pop('_star', False):
            continue
        end = section_end(sec)
        seen = set()
        for pg, ln in lines_between((sec['page'], sec['y']), end):
            t = ln['t']
            if ln['size'] not in (14.0, 16.0, 18.0) or ln['x'] > 140:
                continue
            if not (2 <= len(t) <= 60) or t.startswith(SKIP_START) or norm(t) in ('참고', '예시', norm(sec['title'])):
                continue
            # 표 안 번호 줄(예: '4. 원칙 △ 준영구')·숫자만 있는 줄은 소제목이 아니다
            if re.match(r'^\d+\s*[.)]\s', t) or '△' in t or re.fullmatch(r'[\d\s.,~]+', t) or norm(t) in seen:
                continue
            seen.add(norm(t))
            sec['children'].append(node(re.sub(r'\s*☞.*$', '', t), pg, ln['y'] - 2, ''))

# ── Ⅶ 질의응답 ──
qa_part = next(p for p in root if p['title'] == '질의응답')
for sec in qa_part['children']:
    sec.pop('_star', None)
    t = sec['title']
    sec['kind'] = 'law' if '법령해석' in norm(t) else 'case' if '행정심판' in t else 'qa'
    if sec['kind'] == 'case':
        sec['itemLabel'] = '재결'
    end = section_end(sec)
    cat = sec
    cur = None  # 지금 모으는 제목 {node, y, page, size}
    for pg, ln in lines_between((sec['page'], sec['y']), end):
        size = ln['size']
        if sec['kind'] == 'qa' and size == 16.0:
            cat = node(ln['t'], pg, ln['y'] - 2, ''); sec['children'].append(cat); cur = None; continue
        if sec['kind'] == 'case' and size == 14.0 and '판례' in ln['t']:
            cat = node(ln['t'], pg, ln['y'] - 2, '', itemLabel='판례'); sec['children'].append(cat); cur = None; continue
        if size == 13.0:
            if cur and cur['page'] == pg and 0 < ln['y'] - cur['y'] < 13 * 1.9:
                cur['node']['title'] = clean(cur['node']['title'] + ' ' + ln['t'])
                cur['y'] = ln['y']; continue
            it = node(ln['t'], pg, ln['y'] - 2, '', isItem=True)
            cat['children'].append(it)
            cur = {'node': it, 'y': ln['y'], 'page': pg}
            continue
        cur = None

# '판례 1'처럼 번호뿐인 제목 → 【판시사항】 첫 문장을 제목으로, 사건명·사건번호는 비고로
def rename_numbered_cases(nodes):
    for n in nodes:
        rename_numbered_cases(n['children'])
        if not (n.get('isItem') and re.fullmatch(r'판례\s*\d+', n['title'])):
            continue
        L = pages[n['page'] - 1]
        k = next(i for i, ln in enumerate(L) if ln['y'] >= n['y'] + 1 and ln['size'] < 13)
        notes, held, grab = [], [], False
        for ln in L[k:k + 14]:
            t = ln['t']
            if ln['size'] >= 13:
                break
            if not grab and len(notes) < 2 and not t.startswith('【'):
                notes.append(t); continue
            if t.startswith('【판시사항】'):
                grab = True; t = t[len('【판시사항】'):]
            elif t.startswith('【'):
                if grab: break
                continue
            if grab and t.strip():
                held.append(t)
        title = re.sub(r'^(가\.|\[1\]|1\.)\s*', '', clean(' '.join(held)))
        title = re.split(r'\s(?:나\.|\[2\]|2\.)\s?', title)[0]
        if len(title) > 90:
            title = title[:88].rstrip() + '…'
        if title:
            n['title'] = title
        n['note'] = clean(' '.join(notes))

rename_numbered_cases(root)

walked = finish(root, '2025 서울특별시교육청 학원 업무 편람', doc, labels, OUT_TOC, pages, OUT_TEXT)
report(root, labels)
