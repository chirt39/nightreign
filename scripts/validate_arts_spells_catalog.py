"""Independently check native references, Chinese text, icons and public schemas."""
import sys
sys.dont_write_bytecode = True
from collections import defaultdict, Counter
from pathlib import Path
import argparse
import hashlib
import json
from build_weapon_catalog import Extraction, DEFAULT_PARAMDEX

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'E:\海斗\outputs\nightreign-data-20261109')
AUDIT = Path(r'E:\海斗\outputs\arts-spells-20261112')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo', type=Path, default=ROOT)
    ap.add_argument('--source-root', type=Path, default=SOURCE)
    ap.add_argument('--audit-dir', type=Path, default=AUDIT)
    ap.add_argument('--paramdex', type=Path, default=DEFAULT_PARAMDEX)
    args = ap.parse_args()
    repo = args.repo
    read = lambda name: json.loads((repo / 'public' / name).read_text(encoding='utf-8'))
    ex = Extraction(args.source_root)
    weapons = {x['id']: x for x in ex.param('EquipParamWeapon')}
    arts = {x['id']: x for x in ex.param('SwordArtsParam')}
    spells = {x['id']: x for x in ex.param('Magic')}
    art_pools, magic_pools = defaultdict(list), defaultdict(list)
    for x in ex.param('SwordArtsTableParam'):
        art_pools[x['id']].append(x)
    for x in ex.param('MagicTableParam'):
        magic_pools[x['id']].append(x)
    catalog = read('weapon-catalog.json')
    group_for = {v['id']: w['id'] for w in catalog['weapons'] for v in w['variants']}
    groups = {w['id']: w['name'] for w in catalog['weapons']}
    edges = {'fixed': defaultdict(set), 'possible': defaultdict(set)}
    used_spells = set()
    for wid, gid in group_for.items():
        w = weapons[wid]
        if int(w['swordArtsTableId']) < 0:
            edges['fixed'][w['swordArtsParamId']].add(gid)
        else:
            for option in art_pools[w['swordArtsTableId']]:
                if float(option['chanceWeight']) > 0:
                    edges['possible'][option['swordArtsId']].add(gid)
        used_spells.update(w[f] for f in ('equippedSpell_R1', 'equippedSpell_R2') if int(w[f]) >= 0)
    for custom in ex.param('EquipParamCustomWeapon'):
        gid = group_for.get(custom['targetWeaponId'])
        if gid is None:
            continue
        for option in art_pools[custom['swordArtsTableId']]:
            if float(option['chanceWeight']) > 0:
                edges['possible'][option['swordArtsId']].add(gid)
        for field in ('magicTableId_1', 'magicTableId_2'):
            used_spells.update(x['magicId'] for x in magic_pools[custom[field]] if float(x['chanceWeight']) > 0 and int(x['magicId']) >= 0)
    def text(category):
        return {key: next(iter(values)) for key, rows in ex.texts(category).items()
                if len(values := {r['text'] for r in rows}) == 1}
    an, ad, sn, sd = (text(c) for c in ('ArtsName', 'ArtsInfo', 'MagicName', 'MagicCaption'))
    expected_arts = {i for i, a in arts.items()
        if (edges['fixed'].get(i) or edges['possible'].get(i)) and a['textId'] in an
        and an[a['textId']] not in ('无战技', '？？？') and int(a['iconId']) > 0}
    expected_spells = {i for i in used_spells if i in spells and i in sn and i in sd
                       and sn[i] not in ('？？？', '-') and spells[i]['ezStateBehaviorType'] in ('0', '1')}
    art_catalog, spell_catalog = read('arts-catalog.json'), read('spells-catalog.json')
    for doc, expected in ((art_catalog, expected_arts), (spell_catalog, expected_spells)):
        assert doc['schemaVersion'] == 1
        assert len({e['id'] for e in doc['entries']}) == len(doc['entries'])
        assert {e['id'] for e in doc['entries']} == expected
        for entry in doc['entries']:
            assert isinstance(entry['id'], str) and entry['name'] and isinstance(entry['description'], str)
            assert isinstance(entry['image'], str) and entry['image'].startswith(('/skill-images/', '/arts-images/', '/spell-images/'))
            image = (repo / 'public' / entry['image'].lstrip('/')).resolve()
            assert (repo / 'public').resolve() in image.parents and image.is_file()
        for source in doc['provenance']['files']:
            path = (repo if source['scope'] == 'repo' else args.source_root) / source['path']
            raw = path.read_bytes()
            assert hashlib.sha256(raw.replace(b'\r\n', b'\n') if source['scope'] == 'repo' else raw).hexdigest() == source['sha256']
        assert hashlib.sha256((repo / 'scripts/build_arts_spells_catalog.py').read_bytes().replace(b'\r\n', b'\n')).hexdigest() == doc['provenance']['generatorSha256']
        assert hashlib.sha256((args.paramdex / 'Meta/Magic.xml').read_bytes()).hexdigest() == doc['provenance']['magicCategoryRule']['sha256']
    for e in art_catalog['entries']:
        assert e['name'] == an[arts[e['id']]['textId']]
        assert e['description'] == ad.get(arts[e['id']]['textId'], '')
        for kind in ('fixed', 'possible'):
            refs = e[kind + 'Weapons']
            assert len({r['id'] for r in refs}) == len(refs)
            assert {r['id'] for r in refs} == edges[kind][e['id']]
            assert all(groups[r['id']] == r['name'] for r in refs)
    for e in spell_catalog['entries']:
        row = spells[e['id']]
        assert e['name'] == sn[e['id']] and e['description'] == sd[e['id']]
        assert e['type'] == {'0': 'sorcery', '1': 'incantation'}[row['ezStateBehaviorType']]
        assert e['fp'] == (int(row['mp']) if int(row['mp']) >= 0 else None)
    evidence = json.loads((args.audit_dir / 'catalog-evidence.json').read_text(encoding='utf-8'))
    for image in evidence['spellImages'] + evidence['extraArtImages']:
        data = (repo / 'public' / image['src'].lstrip('/')).read_bytes()
        assert hashlib.sha256(data).hexdigest() == image['webpSha256']
    existing = {v['src']: v for v in read('skill-image-manifest.json')['images'].values()}
    for e in art_catalog['entries']:
        if e['image'] in existing:
            record = existing[e['image']]
            assert record['status'] == 'verified'
            assert hashlib.sha256((repo / 'public' / e['image'].lstrip('/')).read_bytes()).hexdigest() == record['source']['webpSha256']
    report = {'status': 'passed', 'arts': len(expected_arts), 'spells': len(expected_spells),
        'spellTypes': dict(Counter(e['type'] for e in spell_catalog['entries'])),
        'verifiedNewImageCrops': len(evidence['spellImages']) + len(evidence['extraArtImages']),
        'checks': ['exact native eligible reference sets', 'positive weights only',
            'exact fixed/possible source-group edge sets', 'exact zhocn name and description',
            'native Magic category and base mp', 'safe existing images and new image hashes', 'input provenance hashes'],
        'outputSha256': {name: hashlib.sha256((repo / 'public' / name).read_bytes()).hexdigest()
                         for name in ('arts-catalog.json', 'spells-catalog.json')}}
    args.audit_dir.mkdir(parents=True, exist_ok=True)
    (args.audit_dir / 'validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
