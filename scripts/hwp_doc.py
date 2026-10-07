# 한글 파일(HWP·HWPX) → 글 문단과 표 목록 (자치법규 별표를 화면에 표로 보여 주려고)
# - HWP(옛 형식): OLE 파일 안 레코드를 직접 읽는다 (pip install olefile)
# - HWPX(새 형식): zip 안의 Contents/section*.xml 을 바로 읽는다
# 결과: [{'p': '글'} | {'table': [[{'t': '칸 글', 'cs': 칸 합침, 'rs': 줄 합침}, …], …]}, …]
import io, re, struct, zipfile, zlib
import xml.etree.ElementTree as ET

HWPX = {'table': 'tbl', 'row': 'tr', 'cell': 'tc', 'para': 'p', 'text': 't'}


def local(tag):
    return tag.rsplit('}', 1)[-1]


def clean(s):
    return re.sub(r'[ \t　\xa0]+', ' ', (s or '').replace('\r', '')).strip()


def para_text(p, T):
    """문단 글 — 문단 안에 든 표의 글은 빼고"""
    out = []

    def walk(el):
        for c in el:
            n = local(c.tag)
            if n == T['table']:
                continue
            if n == T['text']:
                # <hp:t>설립<hp:fwSpace/>ㆍ</hp:t> — 안에 든 빈칸 표시 뒤 글(tail)까지
                out.append(c.text or '')
                for ch in c:
                    if local(ch.tag) in ('tab', 'fwSpace', 'hwSpace', 'nbSpace'):
                        out.append(' ')
                    out.append(ch.tail or '')
                continue
            walk(c)
    walk(p)
    return clean(''.join(out))


def cell_span(c, T):
    addr = next((x for x in c.iter() if local(x.tag) == 'cellAddr'), None)
    span = next((x for x in c.iter() if local(x.tag) == 'cellSpan'), None)
    g = lambda el, k, d: int(el.get(k)) if el is not None and el.get(k) else d
    return g(addr, 'rowAddr', 0), g(addr, 'colAddr', 0), g(span, 'rowSpan', 1), g(span, 'colSpan', 1)


def cell_text(c, T):
    """칸 글 — 칸 안 문단은 줄바꿈으로, 칸 안에 또 표가 있으면 그 글도 줄로 이어 붙인다"""
    lines = []

    def walk(el):
        for x in el:
            n = local(x.tag)
            if n == T['para']:
                t = para_text(x, T)
                if t:
                    lines.append(t)
                walk_tables(x)
            elif n != T['cell']:
                walk(x)

    def walk_tables(el):
        for x in el.iter():
            if local(x.tag) == T['table'] and x is not el:
                for cc in x.iter():
                    if local(cc.tag) == T['cell']:
                        t = cell_text(cc, T)
                        if t:
                            lines.append(t)
                return
    walk(c)
    return '\n'.join(lines)


def read_table(tbl, T):
    cells = []
    for row in iter_own(tbl, T):  # 이 표의 줄만 (칸 안에 든 다른 표의 줄은 건너뜀)
        for c in row:
            if local(c.tag) == T['cell']:
                r, col, rs, cs = cell_span(c, T)
                cells.append((r, col, {'t': cell_text(c, T), 'cs': cs, 'rs': rs}))
    rows = {}
    for r, col, cell in cells:
        rows.setdefault(r, []).append((col, cell))
    return [[cell for _, cell in sorted(rows[r], key=lambda x: x[0])] for r in sorted(rows)]


def iter_own(tbl, T):
    """표의 줄 — 칸 안에 든 다른 표는 내려가지 않는다"""
    def walk(el):
        for x in el:
            n = local(x.tag)
            if n == T['row']:
                yield x
            elif n not in (T['table'], T['cell']):
                yield from walk(x)
    yield from walk(tbl)


def blocks_of(root, T):
    out = []

    def walk(el):
        for x in el:
            n = local(x.tag)
            if n == T['table']:
                rows = read_table(x, T)
                if rows:
                    out.append({'table': rows})
            elif n == T['para']:
                t = para_text(x, T)
                if t:
                    out.append({'p': t})
                walk(x)  # 문단에 붙은 표
            else:
                walk(x)
    walk(root)
    return out


def hwp_blocks(data):
    if data[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(data))
        names = sorted((n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n)),
                       key=lambda n: int(re.search(r'\d+', n.rsplit('/', 1)[1]).group()))
        out = []
        for n in names:
            out += blocks_of(ET.fromstring(z.read(n)), HWPX)
        return out
    return hwp5_blocks(data)


# ── HWP 5.0 (OLE 복합 문서 안 BodyText/Section* 의 레코드) ──
# 한글 문서 파일 형식 5.0 공개 문서 기준: 레코드 머리 32비트 = 태그 10 · 깊이 10 · 크기 12
PARA_HEADER, PARA_TEXT, CTRL_HEADER, LIST_HEADER = 66, 67, 71, 72


def hwp5_records(raw):
    out, i = [], 0
    while i + 4 <= len(raw):
        h = struct.unpack_from('<I', raw, i)[0]
        tag, level, size = h & 0x3FF, (h >> 10) & 0x3FF, h >> 20
        i += 4
        if size == 0xFFF:
            size = struct.unpack_from('<I', raw, i)[0]
            i += 4
        out.append((tag, level, raw[i:i + size]))
        i += size
    return out


def hwp5_text(b):
    """PARA_TEXT → 글. 0~31 은 조절 문자: 1칸짜리(줄바꿈 등)와 8칸짜리(표·그림 자리 등)가 있다"""
    buf, i, n = bytearray(), 0, len(b) // 2
    while i < n:
        c = struct.unpack_from('<H', b, i * 2)[0]
        if c >= 32:
            buf += b[i * 2:i * 2 + 2]
            i += 1
        elif c in (0, 10, 13, 24, 25, 26, 27, 28, 29, 30, 31):
            if c == 10:
                buf += chr(10).encode('utf-16le')
            i += 1
        else:
            if c == 9:
                buf += chr(32).encode('utf-16le')
            i += 8
    # 짝 없는 서로게이트 등 깨진 글자는 버린다
    return bytes(buf).decode('utf-16le', 'replace').replace('�', '').replace('Fffd', '')


def hwp5_blocks(data):
    import olefile
    ole = olefile.OleFileIO(io.BytesIO(data))
    compressed = struct.unpack_from('<I', ole.openstream('FileHeader').read(), 36)[0] & 1
    sections = sorted((e for e in ole.listdir() if e[0] == 'BodyText'), key=lambda e: int(re.sub(r'\D', '', e[1]) or 0))
    out = []
    for e in sections:
        raw = ole.openstream(e).read()
        if compressed:
            raw = zlib.decompress(raw, -15)
        recs = hwp5_records(raw)
        pos = 0
        while pos < len(recs):
            pos = read_para(recs, pos, out)
    ole.close()
    return out


def read_para(recs, pos, out, lines=None):
    """문단 하나(PARA_HEADER 와 그 아래 레코드) 읽기 → 글은 out 에 {'p'} 로, 표는 {'table'} 로.
    lines 를 주면(표 칸 안) 글과 칸 안 표의 글을 모두 lines 에 줄로 넣는다"""
    tag, level, _ = recs[pos]
    if tag != PARA_HEADER:
        return pos + 1
    text = ''
    tables = []
    i = pos + 1
    while i < len(recs) and recs[i][1] > level:
        t, lv, body = recs[i]
        if t == PARA_TEXT and lv == level + 1:
            text = hwp5_text(body)
        if t == CTRL_HEADER and lv == level + 1 and body[:4] == b' lbt':  # 'tbl ' (거꾸로 저장)
            rows, i = hwp5_table(recs, i + 1, lv)
            tables.append(rows)
            continue
        i += 1
    t = clean(text)
    if lines is not None:
        if t:
            lines.append(t)
        for rows in tables:
            lines.extend(c['t'] for r in rows for c in r if c['t'])
    else:
        if t:
            out.append({'p': t})
        out.extend({'table': rows} for rows in tables if rows)
    return i


def hwp5_table(recs, i, ctrl_level):
    cells = []
    while i < len(recs) and recs[i][1] > ctrl_level:
        t, lv, body = recs[i]
        if t == LIST_HEADER and lv == ctrl_level + 1 and len(body) >= 16:
            n = struct.unpack_from('<H', body, 0)[0]
            col, row, cs, rs = struct.unpack_from('<4H', body, 8)
            i += 1
            lines = []
            for _ in range(n):
                while i < len(recs) and recs[i][0] != PARA_HEADER and recs[i][1] > ctrl_level:
                    i += 1
                if i >= len(recs) or recs[i][1] <= ctrl_level:
                    break
                i = read_para(recs, i, None, lines)
            cells.append((row, col, {'t': '\n'.join(lines), 'cs': cs or 1, 'rs': rs or 1}))
            continue
        i += 1
    rows = {}
    for r, c, cell in cells:
        rows.setdefault(r, []).append((c, cell))
    return [[cell for _, cell in sorted(rows[r], key=lambda x: x[0])] for r in sorted(rows)], i
