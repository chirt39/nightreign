"""Build player-referenced arts/spells and original icons from cached NR extraction."""
import sys
sys.dont_write_bytecode = True
import argparse
from collections import defaultdict, Counter
from pathlib import Path
from io import BytesIO
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from build_weapon_catalog import Extraction, DEFAULT_PARAMDEX

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r'E:\海斗\outputs\nightreign-data-20261109')
EVIDENCE = Path(r'E:\海斗\outputs\arts-spells-20261112')
sha = lambda data: hashlib.sha256(data).hexdigest()


def repo_text_sha(path):
    return sha(path.read_bytes().replace(b'\r\n', b'\n'))


def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def unique(texts, key):
    values = {x['text'] for x in texts.get(key, [])}
    return next(iter(values)) if len(values) == 1 else None


def extract_icons(source, repo, wanted, folder, evidence):
    """Only decode existing common/DLC caches; never opens the game archives."""
    if not wanted:
        return {}, []
    from PIL import Image
    sys.path.insert(0, str(source / 'monster-images'))
    import decode_textures as decoder
    packages = [
        (source / 'monster-images/game-source/01_common_h.tpf.dcx',
         source / 'monster-images/game-source/01_common_h-sblytbnd-dcx', '/menu/01_common_h'),
        (source.parent / 'dlc-images-20261109/extraction/sources/high/21_common_dlc01_h.tpf.dcx',
         source.parent / 'dlc-images-20261109/extraction/sources/high/21_common_dlc01_h-sblytbnd-dcx', '/menu/21_common_dlc01_h'),
    ]
    images, records = {}, []
    for tpf_path, layouts, resource in packages:
        targets = {}
        for lp in sorted(layouts.glob('SB_ItemIcon*.layout')):
            tree = ET.parse(lp).getroot()
            for node in tree:
                match = re.fullmatch(r'MENU_ItemIcon_(\d+)\.png', node.attrib['name'])
                if match and int(match[1]) in wanted:
                    targets.setdefault(lp.stem, []).append((int(match[1]), lp, tree, node.attrib))
        if not targets:
            continue
        payload = tpf_path.read_bytes()
        decoded = decoder.dcx(payload)
        for texture in decoder.tpf(decoded):
            if texture['name'] not in targets:
                continue
            atlas = Image.open(BytesIO(texture['bytes'])).convert('RGBA')
            for icon, lp, tree, node in targets[texture['name']]:
                assert icon not in images, f'Ambiguous native icon {icon}'
                assert atlas.size == (int(tree.attrib['width']), int(tree.attrib['height']))
                x, y, w, h = (int(node[k]) for k in ('x', 'y', 'width', 'height'))
                assert min(x, y) >= 0 and x + w <= atlas.width and y + h <= atlas.height
                crop = atlas.crop((x, y, x + w, y + h))
                buf = BytesIO()
                crop.save(buf, 'WEBP', lossless=True, exact=True, method=4)
                data = buf.getvalue()
                assert Image.open(BytesIO(data)).convert('RGBA').tobytes() == crop.tobytes()
                filename = f'{icon}-{sha(data)[:12]}.webp'
                dest = repo / 'public' / folder / filename
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(data)
                images[icon] = f'/{folder}/{filename}'
                records.append({'iconId': icon, 'src': images[icon], 'width': w, 'height': h,
                    'resource': resource + '.tpf.dcx', 'resourceSha256': sha(payload),
                    'ddsSha256': sha(texture['bytes']), 'texture': texture['name'],
                    'layoutResource': resource + '.sblytbnd.dcx', 'layout': lp.name,
                    'layoutSha256': sha(lp.read_bytes()), 'sprite': node['name'],
                    'rectangle': [x, y, w, h], 'rgbaSha256': sha(crop.tobytes()),
                    'webpSha256': sha(data), 'resampled': False})
    return images, records


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--source-root', type=Path, default=SOURCE)
    ap.add_argument('--repo', type=Path, default=ROOT)
    ap.add_argument('--audit-dir', type=Path, default=EVIDENCE)
    ap.add_argument('--paramdex', type=Path, default=DEFAULT_PARAMDEX)
    args = ap.parse_args()
    repo, audit = args.repo, args.audit_dir
    ex = Extraction(args.source_root)
    meta_path = args.paramdex / 'Meta/Magic.xml'
    category_enum = ET.parse(meta_path).getroot().find(".//Enum[@Name='MAGIC_CATEGORY']")
    category_labels = {x.attrib['Value']: x.attrib['Name'] for x in category_enum}
    assert category_labels['0'] == 'Sorcery' and category_labels['1'] == 'Incantation'
    weapons = {r['id']: r for r in ex.param('EquipParamWeapon')}
    custom = ex.param('EquipParamCustomWeapon')
    arts = {r['id']: r for r in ex.param('SwordArtsParam')}
    magic = {r['id']: r for r in ex.param('Magic')}
    art_pools, magic_pools = defaultdict(list), defaultdict(list)
    for row in ex.param('SwordArtsTableParam'):
        art_pools[row['id']].append(row)
    for row in ex.param('MagicTableParam'):
        magic_pools[row['id']].append(row)
    names, descriptions = ex.texts('ArtsName'), ex.texts('ArtsInfo')
    spell_names, spell_descriptions = ex.texts('MagicName'), ex.texts('MagicCaption')
    weapon_path = repo / 'public/weapon-catalog.json'
    catalog = json.loads(weapon_path.read_text(encoding='utf-8'))
    group_for = {v['id']: {'id': w['id'], 'name': w['name']}
                 for w in catalog['weapons'] for v in w['variants']}
    art_refs, spell_refs, ignored = defaultdict(list), defaultdict(list), []

    def art_pool(pool_id, weapon_id, origin):
        if pool_id not in art_pools:
            ignored.append({'kind': 'missingArtPool', 'id': pool_id, 'weapon': weapon_id})
        for row in art_pools[pool_id]:
            if float(row['chanceWeight']) > 0 and int(row['swordArtsId']) >= 0:
                art_refs[row['swordArtsId']].append({'kind': 'possible', 'weaponId': weapon_id,
                    'origin': origin, 'poolId': pool_id, 'weight': float(row['chanceWeight'])})

    for wid in sorted(group_for, key=int):
        row = weapons[wid]
        if int(row['swordArtsTableId']) >= 0:
            art_pool(row['swordArtsTableId'], wid, 'EquipParamWeapon')
        elif int(row['swordArtsParamId']) >= 0:
            art_refs[row['swordArtsParamId']].append({'kind': 'fixed', 'weaponId': wid,
                'origin': 'EquipParamWeapon.swordArtsParamId'})
        for field in ('equippedSpell_R1', 'equippedSpell_R2'):
            if int(row[field]) >= 0:
                spell_refs[row[field]].append({'weaponId': wid, 'origin': field})
    for row in custom:
        wid = row['targetWeaponId']
        if wid not in group_for:
            continue
        if int(row['swordArtsTableId']) >= 0:
            art_pool(row['swordArtsTableId'], wid, 'EquipParamCustomWeapon:' + row['id'])
        for field in ('magicTableId_1', 'magicTableId_2'):
            pool_id = row[field]
            if int(pool_id) < 0:
                continue
            if pool_id not in magic_pools:
                ignored.append({'kind': 'missingMagicPool', 'id': pool_id, 'customId': row['id']})
            for option in magic_pools[pool_id]:
                if float(option['chanceWeight']) > 0 and int(option['magicId']) >= 0:
                    spell_refs[option['magicId']].append({'weaponId': wid,
                        'origin': 'EquipParamCustomWeapon:' + row['id'],
                        'poolId': pool_id, 'weight': float(option['chanceWeight'])})

    art_entries, art_evidence, excluded_arts = [], {}, []
    for aid, row in sorted(arts.items(), key=lambda x: int(x[0])):
        name, desc = unique(names, row['textId']), unique(descriptions, row['textId'])
        reasons = []
        if aid not in art_refs:
            reasons.append('no eligible weapon/default/positive-weight custom reference')
        if not name or name in ('无战技', '？？？'):
            reasons.append('missing/placeholder/conflicting Chinese name')
        if int(row['iconId']) <= 0:
            reasons.append('no native art icon')
        if reasons:
            excluded_arts.append({'id': aid, 'name': name, 'reasons': reasons})
            continue
        associated = {}
        for kind in ('fixed', 'possible'):
            groups = {group_for[r['weaponId']]['id']: group_for[r['weaponId']]
                      for r in art_refs[aid] if r['kind'] == kind}
            associated[kind] = sorted(groups.values(), key=lambda x: int(x['id']))
        art_entries.append({'id': aid, 'name': name, 'description': desc or '', 'image': None,
            'fixedWeapons': associated['fixed'], 'possibleWeapons': associated['possible']})
        art_evidence[aid] = {'textId': row['textId'], 'iconId': int(row['iconId']), 'references': art_refs[aid],
                            'descriptionStatus': 'known' if desc else 'missing-or-conflicting'}
    skill_path = repo / 'public/skill-image-manifest.json'
    skill_images = json.loads(skill_path.read_text(encoding='utf-8'))['images']
    missing_art_icons = {art_evidence[e['id']]['iconId'] for e in art_entries
                         if str(art_evidence[e['id']]['iconId']) not in skill_images}
    extra_art_images, art_image_evidence = extract_icons(args.source_root, repo, missing_art_icons, 'arts-images', audit)
    for e in art_entries:
        icon = art_evidence[e['id']]['iconId']
        record = skill_images.get(str(icon), {})
        e['image'] = record.get('src') if record.get('status') == 'verified' else extra_art_images.get(icon)

    spell_entries, spell_evidence, excluded_spells = [], {}, []
    for sid, row in sorted(magic.items(), key=lambda x: int(x[0])):
        name, desc = unique(spell_names, sid), unique(spell_descriptions, sid)
        reasons = []
        if sid not in spell_refs:
            reasons.append('no eligible weapon/default/positive-weight custom reference')
        if not name or name in ('？？？', '-') or not desc:
            reasons.append('missing/placeholder/conflicting Chinese name or description')
        if row['ezStateBehaviorType'] not in ('0', '1'):
            reasons.append('unknown native magic category')
        if reasons:
            excluded_spells.append({'id': sid, 'name': name, 'reasons': reasons})
            continue
        mp = int(row['mp'])
        spell_entries.append({'id': sid, 'name': name, 'description': desc, 'image': None,
            'type': 'sorcery' if row['ezStateBehaviorType'] == '0' else 'incantation',
            'fp': mp if mp >= 0 else None})
        spell_evidence[sid] = {'iconId': int(row['iconId']), 'mp': mp, 'mpCharge': int(row['mp_charge']),
            'consumeLoopMPForMenu': int(row['consumeLoopMP_forMenu']), 'references': spell_refs[sid],
            'nameSources': spell_names[sid], 'descriptionSources': spell_descriptions[sid]}
    spell_images, spell_image_evidence = extract_icons(args.source_root, repo,
        {spell_evidence[e['id']]['iconId'] for e in spell_entries}, 'spell-images', audit)
    for e in spell_entries:
        e['image'] = spell_images.get(spell_evidence[e['id']]['iconId'])

    source_manifest = json.loads((args.source_root / 'source-manifest.json').read_text(encoding='utf-8'))
    provenance = {'files': [{'scope': 'extracted', 'path': p.relative_to(args.source_root).as_posix(), 'sha256': sha(p.read_bytes())}
                           for p in sorted(ex.inputs)] + [
        {'scope': 'repo', 'path': p.relative_to(repo).as_posix(), 'sha256': repo_text_sha(p)}
        for p in (weapon_path, skill_path)], 'generatorSha256': repo_text_sha(Path(__file__)),
        'magicCategoryRule': {'source': 'NR/Meta/Magic.xml', 'sha256': sha(meta_path.read_bytes()),
                              'mapping': {'0': 'sorcery', '1': 'incantation'}}}
    version = {'game': source_manifest['executable_version'], 'regulation': source_manifest['regulation_version']}
    def output(name, entries):
        summary = {'entries': len(entries), 'missingImages': sum(e['image'] is None for e in entries),
                   'missingDescriptions': sum(not e['description'] for e in entries)}
        if name == 'spells':
            summary.update(Counter(e['type'] for e in entries))
        write(repo / 'public' / (name + '-catalog.json'), {'schemaVersion': 1,
            'sourceVersion': version, 'entries': entries, 'summary': summary, 'provenance': provenance})
        return summary
    art_summary, spell_summary = output('arts', art_entries), output('spells', spell_entries)
    write(audit / 'catalog-evidence.json', {'arts': art_evidence, 'spells': spell_evidence,
        'excludedArts': excluded_arts, 'excludedSpells': excluded_spells, 'unresolvedReferences': ignored,
        'extraArtImages': art_image_evidence, 'spellImages': spell_image_evidence,
        'summary': {'arts': art_summary, 'spells': spell_summary}})
    print(json.dumps({'arts': art_summary, 'spells': spell_summary, 'unresolvedReferences': len(ignored)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
