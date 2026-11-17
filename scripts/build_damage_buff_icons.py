"""Map calculator buffs to exact native icons; reuse existing catalog assets."""
import sys
sys.dont_write_bytecode = True
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw
from build_arts_spells_catalog import extract_icons

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('E:/海斗/outputs/nightreign-data-20261109')
AUDIT = Path('E:/海斗/outputs/damage-standalone-20261117/buff-icons')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=ROOT)
    parser.add_argument('--source-root', type=Path, default=SOURCE)
    parser.add_argument('--audit-dir', type=Path, default=AUDIT)
    args = parser.parse_args()
    repo, source, audit = args.repo, args.source_root, args.audit_dir
    mappings = {}
    tables = {}
    hashes = {}
    for name in ('EquipParamGoods', 'Magic', 'SwordArtsParam', 'PermanentBuffParam'):
        path = source / 'strict/regulation-bin' / (name + '.param.xml')
        root = ET.parse(path).getroot()
        defaults = {f.get('name'): f.get('defaultValue') for f in root.find('fields')}
        tables[name] = {int(r.get('id')): defaults | r.attrib for r in root.findall('.//row')}
        hashes[name] = digest(path)
    groups = [
        ('goods', 'EquipParamGoods', [1210, 3500, 3550, 11014, 11028, 11029, 11030, 11031]),
        ('magic', 'Magic', [6050, 6600]),
        ('art', 'SwordArtsParam', [603, 1010, 1197]),
        ('reward', 'PermanentBuffParam', [8100000, 8100001, 8100500, 8100501, 8330103, 8330104, 8430000]),
        ('event', 'PermanentBuffParam', [4, 8970000]),
    ]
    for prefix, table, ids in groups:
        for row_id in ids:
            icon_id = int(tables[table][row_id]['iconId'])
            assert icon_id >= 0
            mappings[f'{prefix}:{row_id}'] = {
                'iconId': icon_id, 'sourceTable': table, 'sourceId': row_id,
                'source': f'{table}#{row_id}.iconId={icon_id}',
            }
    wanted = {r['iconId'] for r in mappings.values()}
    # Decode into external evidence first, so existing catalog icons can be
    # checked against the native crop without rewriting or duplicating them.
    native_repo = audit / 'native-preview'
    images, provenance = extract_icons(source, native_repo, wanted, 'damage-buff-icons', audit)
    assert set(images) == wanted, f'Missing native icons: {wanted - set(images)}'
    by_icon = {r['iconId']: r for r in provenance}
    existing = {}
    for filename, table in [('arts-catalog.json', 'SwordArtsParam'), ('spells-catalog.json', 'Magic')]:
        catalog = json.loads((repo / 'public' / filename).read_text(encoding='utf-8'))
        for row in catalog['entries']:
            native = tables[table].get(int(row['id']))
            if native and int(native['iconId']) in wanted and row.get('image'):
                existing[int(native['iconId'])] = row['image']
    for icon_id, image in images.items():
        native_path = native_repo / 'public' / image.lstrip('/')
        if icon_id in existing:
            image = existing[icon_id]
            current = repo / 'public' / image.lstrip('/')
            with Image.open(native_path) as a, Image.open(current) as b:
                assert a.size == b.size and a.convert('RGBA').tobytes() == b.convert('RGBA').tobytes()
        else:
            current = repo / 'public' / image.lstrip('/')
            current.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(native_path, current)
        for value in mappings.values():
            if value['iconId'] == icon_id:
                value.update(image=image, reused=icon_id in existing, sha256=digest(current))
        by_icon[icon_id].update(src=image, reused=icon_id in existing)
    effects = json.loads((repo / 'public/damage-effects.json').read_text(encoding='utf-8'))['effects']
    expected = {e['buffId'] for e in effects if e['kind'] in {'buff', 'reward', 'event'}}
    assert expected <= set(mappings), f'Unmapped choices: {expected - set(mappings)}'
    output = {'icons': mappings, 'metadata': {
        'gameVersion': '1.3.3.0', 'regulationVersion': 10350000,
        'source': 'Native parameter iconId -> MENU_ItemIcon sprite; exact lossless crop, no replacement artwork',
        'sourceParamSha256': hashes, 'provenance': [by_icon[i] for i in sorted(by_icon)],
        'license': 'Original game UI assets; rights retained by the original rights holders.',
    }}
    (repo / 'public/damage-buff-icons.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    sheet = Image.new('RGB', (720, ((len(wanted) + 3) // 4) * 195), '#142333')
    draw = ImageDraw.Draw(sheet)
    for pos, icon_id in enumerate(sorted(wanted)):
        x, y = pos % 4 * 180, pos // 4 * 195
        path = repo / 'public' / by_icon[icon_id]['src'].lstrip('/')
        with Image.open(path) as im:
            sheet.paste(im.convert('RGBA'), (x + 10, y), im.convert('RGBA'))
        draw.text((x + 10, y + 166), str(icon_id), fill='white')
    sheet.save(audit / 'contact-sheet.png')
    print(json.dumps({'choices': len(mappings), 'nativeIcons': len(wanted),
                      'reusedIcons': len(existing), 'coveredCurrentChoices': len(expected),
                      'contactSheet': str(audit / 'contact-sheet.png')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
