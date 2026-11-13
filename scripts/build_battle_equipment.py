"""Build battle equipment labels and original item-menu sprites from the local NR extraction."""
import json
from pathlib import Path
from build_weapon_catalog import Extraction, DEFAULT_SOURCE
from build_arts_spells_catalog import extract_icons, unique


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'


def existing(name):
    return json.loads((PUBLIC / f'{name}.json').read_text(encoding='utf-8-sig'))


def build():
    source = Extraction(DEFAULT_SOURCE)
    art_text = source.texts('ArtsName')
    art_names = {r['id']: name for r in source.param('SwordArtsParam')
                 if (name := unique(art_text, r['textId']))}
    spells = {x['id']: x['name'] for x in existing('spells-catalog')['entries']}
    weapon_images = existing('weapon-image-manifest')['images']
    weapon_labels = source.texts('WeaponName')
    weapons = {}
    reinforces = {int(x['id']) for x in source.param('ReinforceParamWeapon')}
    for row in source.param('EquipParamWeapon'):
        name = unique(weapon_labels, row['id'])
        if not name:
            continue
        icon = weapon_images.get(row['iconId'], {}).get('src')
        levels = [lvl for lvl in range(1, 100) if int(row['reinforceTypeId']) + lvl in reinforces
                  and (int(row['reinforceTypeId']) + lvl) // 100 == int(row['reinforceTypeId']) // 100]
        weapons[row['id']] = [name, icon, max(levels, default=0)]

    items = existing('items_data')['items']
    local_relics = existing('relic_catalog_zh')['items']
    tables = {}
    for key, param, text_group in [('talismans', 'EquipParamAccessory', 'Accessory'),
                                    ('relics', 'EquipParamAntique', 'Antique')]:
        names = source.texts(text_group + 'Name')
        tips = source.texts('AccessoryInfo') if key == 'talismans' else {}
        rows = {}
        for row in source.param(param):
            item_id = row['id']
            local = local_relics.get(items.get(item_id, {}).get('key'), {}) if key == 'relics' else {}
            name = unique(names, item_id) or local.get('name_zh')
            if name:
                rows[item_id] = [name, int(row['iconId']), unique(tips, item_id)]
        tables[key] = rows

    icons = {v[1] for table in tables.values() for v in table.values() if v[1] > 0}
    images, _ = extract_icons(DEFAULT_SOURCE, ROOT, icons, 'battle-item-icons', None)
    effects = {}
    labels = source.texts('AttachEffectName')
    info = source.texts('AttachEffectInfo')
    for row in source.param('AttachEffectParam'):
        name = unique(labels, row['attachTextId']) or unique(info, row['attachTextId'])
        if name:
            value = int(row['displayedModifierValue'])
            if row['isNumericEffect'] == '1' and value:
                name += f' {value:+d}' + ('%' if row['displayPercentageSymbol'] == '1' else '')
            effects[row['id']] = name
    result = {
        'source': 'NR 1.3.3.0, EquipParamWeapon/Accessory/Antique, AttachEffectParam, 简中 FMG、SB_ItemIcon',
        'weapons': weapons, 'arts': art_names, 'spells': spells, 'effects': effects,
        **tables, 'icons': images,
    }
    (PUBLIC / 'battle-equipment-catalog.json').write_text(
        json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')


if __name__ == '__main__':
    build()
