# 주요 법령(학원법·시행령·시행규칙·경기도 조례·조례 시행규칙) 원문 받기
# - 국가법령정보센터 OPEN API(law.go.kr/DRF)에서 현행 원문을 받아 public/law/laws.json 으로 정리
# - 실행: LAW_OC=<법제처 OPEN API 아이디> python scripts/build_laws.py
#   (GitHub Actions 가 매주 돌려 바뀐 게 있으면 커밋 → Vercel 이 다시 배포)
# - 내용이 그대로면 파일을 다시 쓰지 않는다 (받은 날짜만 바뀌는 커밋이 생기지 않게)
import json, os, re, sys, time, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

sys.stdout.reconfigure(encoding='utf-8')

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'law', 'laws.json')
BASE = 'https://www.law.go.kr'

LAWS = [
    {'key': 'act', 'short': '학원법', 'target': 'law', 'id': '000850'},
    {'key': 'decree', 'short': '시행령', 'target': 'law', 'id': '005397'},
    {'key': 'rule', 'short': '시행규칙', 'target': 'law', 'id': '008606'},
    {'key': 'ord', 'short': '경기 조례', 'target': 'ordin', 'id': '213877'},
    {'key': 'ordrule', 'short': '조례규칙', 'target': 'ordin', 'id': '213412'},
]


def fetch(target, id_):
    oc = os.environ.get('LAW_OC')
    if not oc:
        sys.exit('LAW_OC 환경변수(법제처 OPEN API 아이디)가 없습니다.')
    q = urllib.parse.urlencode({'OC': oc, 'target': target, 'ID': id_, 'type': 'JSON'})
    last = None
    for i in range(3):
        try:
            with urllib.request.urlopen(f'{BASE}/DRF/lawService.do?{q}', timeout=60) as r:
                data = json.loads(r.read().decode('utf-8'))
            if not data or ('법령' not in data and 'LawService' not in data):
                raise ValueError(f'알 수 없는 응답: {str(data)[:200]}')
            return data
        except Exception as e:  # 잠깐 끊기는 일이 잦아 두 번 더 해 본다
            last = e
            time.sleep(3 * (i + 1))
    raise SystemExit(f'{target} {id_} 받기 실패: {last}')


def as_list(v):
    if v is None:
        return []
    return v if isinstance(v, list) else [v]


def flat_text(v):  # 별표내용 등: 문자열 / [문자열] / [[문자열]]
    if isinstance(v, str):
        return [v]
    out = []
    for x in as_list(v):
        out.extend(flat_text(x))
    return out


def ymd(s):
    s = re.sub(r'\D', '', s or '')
    return f'{s[:4]}-{s[4:6]}-{s[6:8]}' if len(s) == 8 else ''


def clean(s):
    return re.sub(r'[ \t　]+', ' ', (s or '').replace('\r', '')).strip()


HEAD = re.compile(r'^\s*제\s*(\d+)\s*조(?:\s*의\s*(\d+))?\s*(?:\(([^)]*)\))?\s*')
CHAPTER = re.compile(r'^\s*제\s*\d+\s*(장|절|관|편)')


def art_id(no, sub):
    return f'{int(no)}' + (f'-{int(sub)}' if sub and int(sub) else '')


def art_label(no, sub):
    return f'제{int(no)}조' + (f'의{int(sub)}' if sub and int(sub) else '')


def split_head(text):
    """'제2조의2(학원의 종류) ① …' → (번호, 가지, 제목, 나머지)"""
    m = HEAD.match(text or '')
    if not m:
        return None, None, None, clean(text)
    return m.group(1), m.group(2), m.group(3), clean(text[m.end():])


# ── 법률·시행령·시행규칙 (조문이 항·호·목으로 나뉘어 온다) ──
def law_lines(u):
    lines = []

    def add(lv, t):
        for i, part in enumerate(str(t or '').split('\n')):
            part = clean(part)
            if part:
                lines.append([lv if i == 0 else lv + 1, part])

    def walk_ho(hos, lv):
        for h in as_list(hos):
            add(lv, h.get('호내용'))
            for mk in as_list(h.get('목')):
                for t in flat_text(mk.get('목내용')):
                    add(lv + 1, t)

    for hang in as_list(u.get('항')):
        if hang.get('항내용'):
            for t in flat_text(hang['항내용']):
                add(0, t)
        walk_ho(hang.get('호'), 1)
    return lines


def build_law(cfg, raw):
    L = raw['법령']
    info = L['기본정보']
    arts, chapters = [], []
    for u in as_list(L['조문'].get('조문단위')):
        body = clean(u.get('조문내용'))
        if u.get('조문여부') != '조문':
            if body:
                chapters.append({'before': len(arts), 'title': body})
            continue
        no, sub = u.get('조문번호'), u.get('조문가지번호')
        _, _, title, rest = split_head(body)
        title = u.get('조문제목') or title or ''
        deleted = not u.get('조문제목') and rest.startswith('삭제')
        lines = ([[0, rest]] if rest else []) + law_lines(u)
        arts.append({
            'id': art_id(no, sub), 'label': art_label(no, sub), 'title': title,
            'lines': lines, 'note': clean(u.get('조문참고자료')), 'deleted': deleted,
        })
    tables, forms = [], []
    for b in as_list((L.get('별표') or {}).get('별표단위')):
        no, sub = int(b.get('별표번호') or 0), int(b.get('별표가지번호') or 0)
        num = f'{no}' + (f'의{sub}' if sub else '')
        link = lambda k: (BASE + b[k]) if isinstance(b.get(k), str) and b[k].startswith('/') else ''
        item = {
            'id': f"{'f' if b.get('별표구분') == '서식' else 't'}{no}" + (f'-{sub}' if sub else ''),
            'label': f"{'별지 제' + num + '호서식' if b.get('별표구분') == '서식' else '별표 ' + num}",
            'title': clean(b.get('별표제목')),
            'pdf': link('별표서식PDF파일링크'), 'hwp': link('별표서식파일링크'),
        }
        if b.get('별표구분') == '서식':
            forms.append(item)
        else:
            item['text'] = [t.rstrip() for t in flat_text(b.get('별표내용'))]
            tables.append(item)
    name = info['법령명_한글']
    return {
        'key': cfg['key'], 'short': cfg['short'], 'name': name,
        'kind': info.get('법종구분', {}).get('content', ''),
        'effective': ymd(info.get('시행일자')), 'promulgated': ymd(info.get('공포일자')),
        'number': info.get('공포번호', ''), 'revision': info.get('제개정구분', ''),
        'url': f'{BASE}/법령/{name.replace(" ", "")}',
        'chapters': chapters, 'articles': arts, 'tables': tables, 'forms': forms,
    }


# ── 자치법규 (조문이 한 덩어리 글로 온다 → 항·호·목을 글자 모양으로 나눈다) ──
CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'
GANADA = '가나다라마바사아자차카타파하'
# 호 '1. ' 후보 — 앞이 숫자·'숫자.'이면 날짜('2012.5.10. ')라 뺀다
HO = re.compile(r'(?<!\d)(?<!\d\.)(\d{1,2})\.\s')
MOK = re.compile(rf'([{GANADA}])\.\s')  # '외부가. 주 출입구' 처럼 붙어 오기도 한다 — 차례 검사로 걸러 낸다


def split_seq(text, pattern, nth):
    """차례대로 이어지는 번호(1. 2. 3. / 가. 나. 다.)에서만 끊는다 — 본문 속 같은 모양 글자는 그대로"""
    cuts, want = [], 0
    for m in pattern.finditer(text):
        n = nth(m.group(1))
        if n == want + 1:
            cuts.append(m.start())
            want = n
    if not cuts:
        return [text]
    parts = [text[:cuts[0]]] if cuts[0] > 0 else []
    parts += [text[a:b] for a, b in zip(cuts, cuts[1:] + [len(text)])]
    return parts


def ord_lines(rest):
    lines = []
    for hang in re.split(rf'(?=[{CIRCLED}])', rest):
        for i, ho in enumerate(split_seq(hang, HO, int)):
            for j, mok in enumerate(split_seq(ho, MOK, lambda c: GANADA.index(c) + 1)):
                t = clean(mok)
                if not t:
                    continue
                lv = 2 if MOK.match(t) and j else 1 if HO.match(t) and i else 0
                lines.append([lv, t])
    return lines


def build_ordin(cfg, raw):
    L = raw['LawService']
    info = L['자치법규기본정보']
    arts, chapters = [], []
    for u in as_list((L.get('조문') or {}).get('조')):
        body = clean(u.get('조내용'))
        no, sub, title, rest = split_head(body)
        if u.get('조문여부') != 'Y' or no is None:
            if body and CHAPTER.match(body):
                chapters.append({'before': len(arts), 'title': body})
            continue
        deleted = rest.startswith('삭제')
        arts.append({
            'id': art_id(no, sub), 'label': art_label(no, sub), 'title': clean(u.get('조제목')) or title or '',
            'lines': ord_lines(rest), 'note': '', 'deleted': deleted,
        })
    tables, forms = [], []
    for b in as_list(L.get('별표단위')):
        no = int(b.get('별표번호') or 0)
        f = b.get('별표첨부파일명') or ''
        form = b.get('별표구분') == '서식'
        item = {
            'id': f"{'f' if form else 't'}{no}",
            'label': f'별지 제{no}호서식' if form else (f'별표 {no}' if no else '별표'),
            'title': clean(b.get('별표제목')),
            'pdf': '', 'hwp': f.replace('http://', 'https://') if f.startswith('http') else '',
        }
        if form:
            forms.append(item)
        else:
            # 자치법규 별표는 표가 칸 조각으로만 와서 표로 보여 줄 수 없다 → 검색에만 쓴다
            item['text'] = None
            item['search'] = ' '.join(clean(t) for t in flat_text(b.get('별표내용')) if clean(t))
            tables.append(item)
    name = info['자치법규명']
    return {
        'key': cfg['key'], 'short': cfg['short'], 'name': name,
        'kind': '조례' if info.get('자치법규종류') == 'C0001' else '규칙',
        'effective': ymd(info.get('시행일자')), 'promulgated': ymd(info.get('공포일자')),
        'number': info.get('공포번호', ''), 'revision': info.get('제개정정보', ''),
        'url': f'{BASE}/자치법규/{name.replace(" ", "")}',
        'chapters': chapters, 'articles': arts, 'tables': tables, 'forms': forms,
    }


def main():
    laws = []
    for cfg in LAWS:
        raw = fetch(cfg['target'], cfg['id'])
        law = build_law(cfg, raw) if cfg['target'] == 'law' else build_ordin(cfg, raw)
        if len(law['articles']) < 5:
            raise SystemExit(f"{cfg['short']}: 조문이 {len(law['articles'])}개뿐 — 응답이 이상합니다. 저장하지 않습니다.")
        print(f"{law['short']}: 시행 {law['effective']} · 조문 {len(law['articles'])} · 별표 {len(law['tables'])} · 서식 {len(law['forms'])}")
        laws.append(law)

    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding='utf-8') as f:
            old = json.load(f)
    if old and old.get('laws') == laws:
        print('바뀐 내용 없음 — 파일을 그대로 둡니다.')
        return
    today = datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        json.dump({'updated': today, 'laws': laws}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'저장: {os.path.normpath(OUT)} ({os.path.getsize(OUT) // 1024}KB)')


if __name__ == '__main__':
    main()
