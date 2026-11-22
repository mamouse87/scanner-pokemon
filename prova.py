"""Scarica Price Guide e catalogo prodotti Pokémon di Cardmarket e scrive un riepilogo (nessun dato salvato oltre al riepilogo)."""
import json, re, time, urllib.request, collections
URLS = {
    'price_guide': 'https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json',
    'products': 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json',
}
R = {'quando': time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}
data = {}
for k, u in URLS.items():
    t0 = time.time()
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'prova-gestionale'})
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = r.read()
            R[k] = {'stato': r.status, 'byte': len(raw), 'secondi': round(time.time() - t0, 1),
                    'last_modified': r.headers.get('Last-Modified'), 'tipo': r.headers.get('Content-Type')}
        d = json.loads(raw)
        data[k] = d
        R[k]['chiavi'] = list(d.keys()) if isinstance(d, dict) else type(d).__name__
        for kk in ('version', 'createdAt'):
            if isinstance(d, dict) and kk in d: R[k][kk] = d[kk]
    except Exception as e:
        R[k] = {'errore': repr(e), 'secondi': round(time.time() - t0, 1)}

exp_names = {int(i): n for n, i in re.findall(r"\['(.*?)',\s*(\d+)\]", open('cm_expansions.ts', encoding='utf8').read().replace("\\'", "’"))}
ids = json.load(open('ids.json'))
if 'products' in data:
    P = data['products'].get('products', [])
    R['products']['numero'] = len(P)
    R['products']['esempio'] = P[:2]
    by = {str(p['idProduct']): p for p in P}
    pg = {str(p['idProduct']): p for p in data.get('price_guide', {}).get('priceGuides', [])}
    if 'price_guide' in data: R['price_guide']['numero'] = len(pg)
    # espansione principale di ogni set (dai prodotti base)
    main = {}
    for sid, bl in ids['base'].items():
        ex = [by[str(b)]['idExpansion'] for b in bl if str(b) in by]
        main[sid] = collections.Counter(ex).most_common(1)[0][0] if ex else None
    R['set_principale'] = {sid: [e, exp_names.get(e)] for sid, e in main.items()}
    # dove stanno le varianti speciali e rare
    dove = collections.defaultdict(collections.Counter)
    esempi = collections.defaultdict(list)
    manca = []
    for pid, (sid, num, kind) in ids['vx'].items():
        p = by.get(pid)
        if not p: manca.append([pid, sid, num, kind]); continue
        e = p['idExpansion']
        where = 'set principale' if e == main.get(sid) else (exp_names.get(e) or 'Edizione %s' % e)
        dove[kind][where] += 1
        if len(esempi[kind]) < 4: esempi[kind].append([sid, num, pid, p.get('name'), e, exp_names.get(e), pid in pg])
    R['varianti_per_edizione'] = {k: dict(v) for k, v in dove.items()}
    R['varianti_esempi'] = esempi
    R['varianti_senza_prodotto'] = manca[:50]
    R['varianti_con_prezzo'] = sum(1 for pid in ids['vx'] if pid in pg)
    R['varianti_totali'] = len(ids['vx'])
    # Oddish di Erika (Ascesa Eroica): come Cardmarket chiama V1 e V2
    R['oddish'] = [by.get(x) for x in ('869612', '870135', '870136')]
    # Scarlatto e Violetto base (TCGdex non ha i numeri Cardmarket)
    sv = [p for p in P if p['idExpansion'] == 5223]
    R['scarlatto_violetto_base'] = {'prodotti': len(sv), 'con_prezzo': sum(1 for p in sv if str(p['idProduct']) in pg), 'esempi': sv[:5]}
    if pg: R['price_guide']['esempio'] = pg.get('870135') or next(iter(pg.values()))
json.dump(R, open('risultato.json', 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: R[k] for k in ('price_guide', 'products') if k in R}, ensure_ascii=False)[:2000])
