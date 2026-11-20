"""Extract the central castle and evergaol icons from existing, read-only game caches."""
import argparse
import hashlib
from io import BytesIO
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
from PIL import Image

sys.dont_write_bytecode = True


def sha(data):
    return hashlib.sha256(data).hexdigest()


def rows(path):
    tree = ET.parse(path).getroot()
    defaults = {field.attrib['name']: field.attrib.get('defaultValue', '') for field in tree.find('fields')}
    return {row.attrib['id']: defaults | row.attrib for row in tree.find('rows')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--source-root', type=Path, default=Path(r'E:\海斗\outputs\nightreign-data-20261109'))
    args = parser.parse_args()
    source = args.source_root
    helpers = source / 'monster-images'
    sys.path.insert(0, str(helpers))
    import decode_textures as decoder

    manifest_path = args.repo / 'public/map-icon-manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    icon_param = source / 'strict/regulation-bin/WorldMapPointIconParam.param.xml'
    point_param = source / 'strict/regulation-bin/WorldMapPointParam.param.xml'
    assert sha(icon_param.read_bytes()) == manifest['sourceVersion']['worldMapPointIconParamXmlSha256']
    point = rows(point_param)['64433700']
    assert point['worldMapPointIconId'] == '11'
    assert [point[key] for key in ['areaNo', 'gridXNo', 'gridZNo', 'posX', 'posZ']] == ['60', '43', '37', '55.92', '63.88']
    assert rows(icon_param)['11']['iconId'] == '42010'
    assert rows(icon_param)['7']['iconId'] == '42006', 'Small fort is a separate icon'

    tpf = helpers / 'game-source/01_common_h.tpf.dcx'
    layout = helpers / 'game-source/01_common_h-sblytbnd-dcx/SB_MenuIcon_1.layout'
    payload = tpf.read_bytes()
    known_source = manifest['icons']['buildingCategory:fort']['source']
    assert sha(payload) == known_source['resourceSha256']
    assert sha(layout.read_bytes()) == known_source['layoutSha256']
    texture = next(entry for entry in decoder.tpf(decoder.dcx(payload)) if entry['name'] == 'SB_MenuIcon_1')
    assert sha(texture['bytes']) == known_source['ddsSha256']
    atlas = Image.open(BytesIO(texture['bytes'])).convert('RGBA')
    tree = ET.parse(layout).getroot()
    assert atlas.size == (int(tree.attrib['width']), int(tree.attrib['height']))
    definition_param = source / 'strict/regulation-bin/SmallBaseAndSpotDefine.param.xml'
    definitions = rows(definition_param)
    gaol_ids = [209, 215, 2209, 2215]
    for row_id in gaol_ids:
        definition = definitions[str(row_id)]
        expected = [4650, 4660, 4670] if row_id in (209, 2209) else [4680]
        assert [int(definition[f'mapId{i}']) for i in (1, 2, 3)
                if int(definition[f'mapId{i}']) > 0] == expected
        assert definition['worldMapPointIconId1'] == '5'
    assert rows(icon_param)['5']['iconId'] == '42004'
    castle_reference = {
        'pointParam': 'WorldMapPointParam', 'pointParamRowId': 64433700,
        'pointParamXmlSha256': sha(point_param.read_bytes()),
        'pointPosition': {key: point[key] for key in ['areaNo', 'gridXNo', 'gridZNo', 'posX', 'posY', 'posZ']},
    }
    gaol_reference = {
        'definitionParam': 'SmallBaseAndSpotDefine', 'definitionRowIds': gaol_ids,
        'definitionParamXmlSha256': sha(definition_param.read_bytes()),
        'mapTemplateIds': [4650, 4660, 4670, 4680],
    }
    for key, name, point_icon, icon_id, reference, identity in [
        ('castle', '中央主城', 11, 42010, castle_reference,
         'Fixed central castle icon for atlas castle/rooftop/basement areas; not the random small fort icon 42006. Does not extend map predictor identity coverage.'),
        ('evergaol', '封印监牢', 5, 42004, gaol_reference,
         'Primary game map icon shared by all four evergaol templates.'),
    ]:
        sprite = f'MENU_MenuIcon_{icon_id}.png'
        node = next(item.attrib for item in tree if item.attrib['name'] == sprite)
        x, y, width, height = [int(node[key]) for key in ['x', 'y', 'width', 'height']]
        crop = atlas.crop((x, y, x + width, y + height))
        assert crop.getextrema()[3][0] == 0 and crop.getextrema()[3][1] > 0
        buffer = BytesIO()
        crop.save(buffer, 'PNG')
        png = buffer.getvalue()
        assert Image.open(BytesIO(png)).convert('RGBA').tobytes() == crop.tobytes()
        relative = f'/map-icons/{key}-{icon_id}-{sha(png)[:12]}.png'
        (args.repo / 'public' / relative.lstrip('/')).write_bytes(png)
        manifest['icons'][f'buildingCategory:{key}'] = {
            'src': relative, 'nameZh': name, 'width': width, 'height': height,
            'status': 'verified', 'worldMapPointIconId': point_icon, 'iconId': icon_id,
            'sha256': sha(png), 'resampled': False,
            'source': known_source | {
                'sprite': sprite, 'rectangle': [x, y, width, height],
                **reference,
            },
            'identityScope': identity,
            'rights': 'Derived from local game UI resources; original rights remain with the game rights holders. Redistribution permission not independently verified.',
        }
    manifest['coverage']['mappedAtlasOnlyBuildingIcons'] = sum(
        f'buildingCategory:{name}' in manifest['icons']
        for name in ('castle', 'eastern-underground-fort', 'western-underground-fort', 'evergaol')
    )
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')



if __name__ == '__main__':
    main()
