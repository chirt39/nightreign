"""Extract weapon icons from existing local Nightreign evidence; no full unpack.

Only this task's image assets, manifest and external evidence directory are written.
Game files and previous extraction results are read-only. No network is used.
"""
import sys
sys.dont_write_bytecode = True
import argparse
import csv
import hashlib
from io import BytesIO
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET
from PIL import Image, ImageChops, ImageStat, ImageDraw, ImageFont


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=Path(r'E:\海斗\outputs\nightreign-data-20261109'))
    parser.add_argument('--dlc-root', type=Path, default=Path(r'E:\海斗\outputs\dlc-images-20261109\extraction'))
    parser.add_argument('--evidence', type=Path, default=Path(r'E:\海斗\outputs\weapon-encyclopedia-20261110\images'))
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    evidence = args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    output = args.repo / 'public/weapon-images'
    output.mkdir(parents=True, exist_ok=True)
    helpers = args.source_root / 'monster-images'
    sys.path.insert(0, str(helpers))
    import extract_menu_images as menu
    import decode_textures as decoder
    initial = json.loads((args.source_root / 'source-manifest.json').read_text(encoding='utf-8'))
    watched = [menu.GAME / n for n in ('nightreign.exe', 'regulation.bin', 'data0.bhd', 'data0.bdt')]
    before = {str(p): (p.stat().st_size, p.stat().st_mtime_ns) for p in watched}
    for filename, key in [('nightreign.exe', 'exe_sha256'), ('regulation.bin', 'regulation_sha256')]:
        assert sha((menu.GAME / filename).read_bytes()) == initial[key], f'Source changed: {filename}'
    param_path = args.source_root / 'strict/regulation-bin/EquipParamWeapon.param.xml'
    param = ET.parse(param_path).getroot()
    defaults = {x.attrib['name']: x.attrib.get('defaultValue') for x in param.find('fields')}
    rows = [defaults | row.attrib for row in param.find('rows')]
    by_icon = {}
    for row in rows:
        by_icon.setdefault(int(row['iconId']), []).append(row['id'])
    csv_path = args.source_root / 'localized/csv/EquipParamWeapon.zh-CN.csv'
    names = {r['行ID']: r['中文名称'] for r in csv.DictReader(csv_path.open(encoding='utf-8-sig'))}
    labels = {icon: next((names.get(i) for i in ids if names.get(i)), f'武器图标 {icon}') for icon, ids in by_icon.items()}
    inventory = json.loads((helpers / 'menu-inventory.json').read_text(encoding='utf-8'))
    # Re-find the selected source resources by BHD path hash; never trust offsets alone.
    bhd, resources = menu.resource_entries()
    for old in inventory['resources']:
        assert all(resources[old['resource']][k] == old[k] for k in ('offset', 'size', 'padded_size', 'aes_offset'))
    bhf = menu.read_resource(bhd, resources['/menu/00_solo_h.tpfbhd'])
    assert sha(bhf) == inventory['header_sha256']
    entries = menu.binder_entries(bhf)
    knowledge = {}
    for entry in entries:
        match = re.fullmatch(r'MENU_Knowledge_(\d+)\.tpf\.dcx', entry['name'])
        if match:
            knowledge[int(match[1])] = entry
    dlc_manifest = json.loads((args.dlc_root / 'manifest.json').read_text(encoding='utf-8'))
    item_icons = {}
    for package, source, layout_dir in [
        ('base', helpers / 'game-source/01_common_h.tpf.dcx', helpers / 'game-source/01_common_h-sblytbnd-dcx'),
        ('dlc01', args.dlc_root / 'sources/high/21_common_dlc01_h.tpf.dcx', args.dlc_root / 'sources/high/21_common_dlc01_h-sblytbnd-dcx'),
    ]:
        dcx_bytes = source.read_bytes()
        if package == 'base':
            assert dcx_bytes == menu.read_resource(bhd, resources['/menu/01_common_h.tpf.dcx'])
        else:
            record = next(r for r in dlc_manifest['resources'] if r['resolution'] == 'high' and r['kind'] == 'texture')
            assert sha(dcx_bytes) == record['dcx_sha256']
        tpf = decoder.dcx(dcx_bytes)
        for texture in decoder.tpf(tpf):
            layout = layout_dir / (texture['name'] + '.layout')
            if 'ItemIcon' not in texture['name'] or not layout.exists():
                continue
            atlas = Image.open(BytesIO(texture['bytes'])).convert('RGBA')
            tree = ET.parse(layout).getroot()
            assert atlas.size == (int(tree.attrib['width']), int(tree.attrib['height']))
            for node in tree.findall('SubTexture'):
                a = node.attrib
                match = re.fullmatch(r'MENU_ItemIcon_(\d+)\.png', a['name'])
                if not match or int(match[1]) not in by_icon:
                    continue
                icon = int(match[1])
                x, y, w, h = [int(a[k]) for k in ('x', 'y', 'width', 'height')]
                assert min(x, y) >= 0 and x+w <= atlas.width and y+h <= atlas.height
                assert icon not in item_icons, f'Duplicate ItemIcon {icon}'
                image = atlas.crop((x, y, x+w, y+h))
                item_icons[icon] = (image, {'package': package, 'resource': '/menu/' + source.name,
                    'dcxSha256': sha(dcx_bytes), 'texture': texture['name'], 'ddsSha256': sha(texture['bytes']),
                    'layout': str(layout), 'layoutSha256': sha(layout.read_bytes()),
                    'sprite': a['name'], 'rectangle': [x, y, w, h], 'rgbaSha256': sha(image.tobytes())})
    images, review = {}, []
    comparisons = []
    for icon, (item_image, source) in sorted(item_icons.items()):
        selected = item_image
        source['parameter'] = {'table': 'EquipParamWeapon', 'field': 'iconId', 'rowIds': by_icon[icon], 'sha256': sha(param_path.read_bytes())}
        source['mappingEvidence'] = 'EquipParamWeapon.iconId equals shipped MENU_ItemIcon sprite ID in ItemIcon layout'
        if icon in knowledge:
            entry = knowledge[icon]
            assert not entry['flags'] & 1
            dcx = menu.read_resource(bhd, resources['/menu/00_solo_h.tpfbdt'], entry['offset'], entry['size'])
            textures = decoder.tpf(decoder.dcx(dcx))
            assert len(textures) == 1
            candidate = Image.open(BytesIO(textures[0]['bytes'])).convert('RGBA')
            resized = candidate.resize(item_image.size, Image.Resampling.LANCZOS)
            # Quantify content agreement with the actual ItemIcon, including alpha.
            mae = sum(ImageStat.Stat(ImageChops.difference(resized, item_image)).mean) / 4
            source['knowledgeCandidate'] = {'name': entry['name'], 'binderOffset': entry['offset'], 'length': entry['size'],
                'containerResource': '/menu/00_solo_h.tpfbdt', 'containerOffset': resources['/menu/00_solo_h.tpfbdt']['offset'],
                'dcxSha256': sha(dcx), 'ddsSha256': sha(textures[0]['bytes']), 'nativeSize': list(candidate.size),
                'itemRgbaMeanAbsoluteDifference': round(mae, 4), 'selected': mae <= 3}
            if mae <= 3:
                selected = candidate
            if icon in [10000, 10040, 10167, 10168, 10169, 10415]:
                comparisons.append((icon, item_image.copy(), candidate.copy(), mae))
        native = list(selected.size)
        selected = selected.copy()
        selected.thumbnail((320, 320), Image.Resampling.LANCZOS)
        buffer = BytesIO()
        selected.save(buffer, 'WEBP', lossless=True, method=6, exact=True)
        payload = buffer.getvalue(); digest = sha(payload)
        filename = f'{icon}-{digest[:12]}.webp'
        (output / filename).write_bytes(payload)
        decoded = Image.open(BytesIO(payload)).convert('RGBA')
        assert decoded.size == selected.size and decoded.tobytes() == selected.tobytes()
        source.update(nativeSize=native, webSize=list(selected.size), webpSha256=digest,
                      rgbaSha256Web=sha(decoded.tobytes()), transformation='full canvas; downsample only if over 320px; lossless RGBA WebP')
        images[str(icon)] = {'src': '/weapon-images/' + filename, 'alt': labels[icon], 'status': 'verified', 'source': source}
        review.append((icon, selected, labels[icon], source['package']))
        print(f'icon {icon}: {len(payload)} bytes', flush=True)
    missing = [{'iconId': icon, 'sourceIds': ids, 'names': sorted({names.get(i) for i in ids if names.get(i)}),
                'reason': 'No exact MENU_ItemIcon sprite in examined base/high and dlc01/high layouts; Knowledge name alone is insufficient'}
               for icon, ids in sorted(by_icon.items()) if str(icon) not in images]
    summary = {'parameterIconIds': len(by_icon), 'verified': len(images), 'missing': len(missing),
               'base': sum(v['source']['package']=='base' for v in images.values()),
               'dlc01': sum(v['source']['package']=='dlc01' for v in images.values()),
               'knowledgeSelected': sum(v['source'].get('knowledgeCandidate', {}).get('selected', False) for v in images.values()),
               'totalBytes': sum((output / Path(v['src']).name).stat().st_size for v in images.values())}
    manifest = {'schemaVersion': 1, 'images': images, 'summary': summary, 'missing': missing,
                'provenance': {'gameVersion': initial['executable_version'], 'regulationVersion': initial['regulation_version'],
                 'exeSha256': initial['exe_sha256'], 'regulationSha256': initial['regulation_sha256'],
                 'bhdSha256': sha((menu.GAME/'data0.bhd').read_bytes()), 'bhdDecodedSha256': sha(bhd),
                 'resources': list(resources.values()) + [r for r in dlc_manifest['resources'] if r['resolution']=='high'],
                 'extractionScriptSha256': sha(Path(__file__).read_bytes()),
                 'helperSha256': {p.name: sha(p.read_bytes()) for p in [helpers/'extract_menu_images.py',helpers/'decode_textures.py',args.source_root/'localized/extract_text.py']},
                 'dlcManifestSha256': sha((args.dlc_root/'manifest.json').read_bytes()),
                 'localExtractionOnly': True, 'aiGenerated': False,
                 'copyright': 'Original game artwork; redistribution permission not established; local preview only'}}
    (args.repo/'public/weapon-image-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n',encoding='utf-8')
    (evidence/'unmatched.json').write_text(json.dumps(missing,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    font = ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc', 15)
    for page in range((len(review)+59)//60):
        canvas = Image.new('RGB',(960,1500),'#17212b');draw=ImageDraw.Draw(canvas)
        for n,(icon,img,label,package) in enumerate(review[page*60:(page+1)*60]):
            x,y=(n%6)*160,(n//6)*150; thumb=img.copy();thumb.thumbnail((120,110))
            canvas.paste(thumb,(x+(160-thumb.width)//2,y),thumb)
            draw.text((x+4,y+110),f'{icon} {package}',font=font,fill='white');draw.text((x+4,y+130),label[:10],font=font,fill='white')
        canvas.save(evidence/f'contact-{page+1:02}.png')
    canvas=Image.new('RGB',(600,max(1,len(comparisons))*180),'#17212b');draw=ImageDraw.Draw(canvas)
    for n,(icon,item,candidate,mae) in enumerate(comparisons):
        for j,img in enumerate([item,candidate]):
            img.thumbnail((150,145));canvas.paste(img,(j*200,n*180),img)
        draw.text((5,n*180+145),f'{icon} {labels[icon]} | Item / Knowledge | MAE {mae:.3f}',font=font,fill='white')
    canvas.save(evidence/'representative-comparison.png')
    canvas=Image.new('RGB',(600,420),'#17212b');draw=ImageDraw.Draw(canvas)
    representatives=[r for r in review if r[0] in [10000,10040,10167,10168,10169,10415]]
    for n,(icon,img,label,package) in enumerate(representatives):
        x,y=(n%3)*200,(n//3)*210
        canvas.paste(img,(x+(200-img.width)//2,y),img)
        draw.text((x+5,y+165),f'{icon} {package}',font=font,fill='white')
        draw.text((x+5,y+185),label,font=font,fill='white')
    canvas.save(evidence/'representative-verified.png')
    assert before == {str(p): (p.stat().st_size, p.stat().st_mtime_ns) for p in watched}, 'Game source metadata changed'
    (evidence/'summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary),flush=True)


if __name__ == '__main__':
    main()
