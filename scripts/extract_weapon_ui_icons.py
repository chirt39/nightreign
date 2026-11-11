"""Crop approved weapon navigation and displayed skill icons from existing assets.

No network, full archive unpacking, game writes, catalogue writes, or UI edits.
Only owned icon paths and the external evidence directory are written.
"""
import sys
sys.dont_write_bytecode = True
import argparse
from collections import defaultdict
import hashlib
from io import BytesIO
import json
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFont


def digest(data):
    return hashlib.sha256(data).hexdigest()


def param_rows(path):
    tree = ET.parse(path).getroot()
    defaults = {f.attrib['name']: f.attrib.get('defaultValue') for f in tree.find('fields')}
    return [defaults | r.attrib for r in tree.find('rows')]


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo', type=Path, default=Path(__file__).resolve().parents[1])
    ap.add_argument('--source-root', type=Path, default=Path(r'E:\海斗\outputs\nightreign-data-20261109'))
    ap.add_argument('--evidence', type=Path, default=Path(r'E:\海斗\outputs\weapon-encyclopedia-20261110\icons'))
    args = ap.parse_args()
    repo, previous, evidence = args.repo, args.source_root, args.evidence
    evidence.mkdir(parents=True, exist_ok=True)
    helpers = previous / 'monster-images'
    sys.path.insert(0, str(helpers))
    import decode_textures as decoder
    initial = json.loads((previous/'source-manifest.json').read_text(encoding='utf-8'))
    game = Path(r'E:\SteamLibrary\steamapps\common\ELDEN RING NIGHTREIGN\Game')
    watched = [game/n for n in ('nightreign.exe','regulation.bin','data0.bhd','data0.bdt')]
    stats = {str(p): (p.stat().st_size,p.stat().st_mtime_ns) for p in watched}
    for name, key in [('nightreign.exe','exe_sha256'),('regulation.bin','regulation_sha256')]:
        assert digest((game/name).read_bytes()) == initial[key], f'Source changed: {name}'
    protected = list((repo/'public/weapon-images').glob('*')) + [p for p in (repo/'public/nav-icons').glob('*') if p.name != 'weapons.webp']
    protected_hashes = {str(p): digest(p.read_bytes()) for p in protected if p.is_file()}
    param_dir = previous/'strict/regulation-bin'
    arts_path, tables_path = [param_dir/(n+'.param.xml') for n in ('SwordArtsParam','SwordArtsTableParam')]
    arts = {r['id']: r for r in param_rows(arts_path)}
    tables = defaultdict(list)
    for r in param_rows(tables_path):
        tables[r['id']].append(r)
    texts = defaultdict(set)
    text_hashes = {}
    for p in sorted((previous/'localized/text-bundles').rglob('ArtsName*.fmg.xml')):
        if 'zhocn' not in p.parts or p.name not in {'ArtsName.fmg.xml','ArtsName_dlc01.fmg.xml'}:
            continue
        text_hashes[str(p)] = digest(p.read_bytes())
        for node in ET.parse(p).getroot().findall('entries/text'):
            if node.text and node.text != '%null%':
                texts[node.attrib['id']].add(node.text)
    def art_name(art_id):
        values = texts[arts[art_id]['textId']]
        assert len(values)==1, f'Ambiguous/missing text: {art_id}'
        return next(iter(values))
    catalog_bytes = (repo/'public/weapon-catalog.json').read_bytes()
    catalog = json.loads(catalog_bytes)
    displayed, defaults, contexts = set(), set(), 0
    for weapon in catalog['weapons']:
        for variant in weapon['variants']:
            skill = variant['skill']
            defaults.add(skill['default']['id'])
            if skill['kind']=='pool':
                candidates = {r['swordArtsId'] for r in tables[skill['tableId']] if float(r['chanceWeight'])>0 and int(r['swordArtsId'])>=0}
            elif skill['kind']=='fixed':
                candidates = {skill['default']['id']}
            else:
                candidates = set()
            for name in skill['names']:
                matched = {i for i in candidates if art_name(i)==name}
                assert len(matched)==1, f'Context mapping conflict: {variant["id"]} {name}'
                displayed.update(matched)
                contexts += 1
    assert len(displayed)==182, 'Approved displayed scope changed; review before extraction'
    assert not ({'125','1056'} & displayed), 'Hidden defaults entered displayed scope'
    by_icon = defaultdict(list)
    by_name = defaultdict(list)
    for art_id in sorted(displayed, key=int):
        row=arts[art_id]; icon=int(row['iconId'])
        by_icon[icon].append(art_id); by_name[art_name(art_id)].append(art_id)
    assert len(by_icon)==182 and 0 not in by_icon
    if 'skillDefinitions' in catalog:
        assert set(catalog['skillDefinitions']) == displayed
        for art_id in displayed:
            definition=catalog['skillDefinitions'][art_id]
            assert definition['name']==art_name(art_id) and int(definition['iconId'])==int(arts[art_id]['iconId'])
    # Reuse source bytes already tied to data0 BHD/AES extraction; do not unpack the archive again.
    weapon_manifest=json.loads((repo/'public/weapon-image-manifest.json').read_text(encoding='utf-8'))
    expected_dcx={r['source']['dcxSha256'] for r in weapon_manifest['images'].values() if r['source']['package']=='base'}
    dcx_path=helpers/'game-source/01_common_h.tpf.dcx'
    dcx_bytes=dcx_path.read_bytes();assert digest(dcx_bytes) in expected_dcx
    tpf=decoder.dcx(dcx_bytes)
    layouts_dir=helpers/'game-source/01_common_h-sblytbnd-dcx'
    layouts={}; targets={}
    for p in layouts_dir.glob('SB_ItemIcon*.layout'):
        root=ET.parse(p).getroot();layouts[p.stem]=(p,root)
        for node in root.findall('SubTexture'):
            name=node.attrib['name']
            if name.startswith('MENU_ItemIcon_') and name.endswith('.png'):
                icon=int(name.removeprefix('MENU_ItemIcon_').removesuffix('.png'))
                if icon in by_icon:
                    assert icon not in targets
                    targets[icon]=(p.stem,node.attrib)
    nav_layout=layouts_dir/'SB_MenuIcon_0.layout'
    nav_tree=ET.parse(nav_layout).getroot();layouts[nav_layout.stem]=(nav_layout,nav_tree)
    nav_node=next(n.attrib for n in nav_tree.findall('SubTexture') if n.attrib['name']=='MENU_MenuIcon_40051.png')
    assert [int(nav_node[k]) for k in ('x','y','width','height')]==[1364,2036,172,172]
    needed={t[0] for t in targets.values()}|{nav_layout.stem}
    atlases={}
    dds_hashes={}
    for texture in decoder.tpf(tpf):
        if texture['name'] in needed:
            atlas=Image.open(BytesIO(texture['bytes'])).convert('RGBA');p,tree=layouts[texture['name']]
            assert atlas.size==(int(tree.attrib['width']),int(tree.attrib['height']))
            atlases[texture['name']]=atlas;dds_hashes[texture['name']]=digest(texture['bytes'])
    assert set(targets)==set(by_icon) and set(atlases)==needed
    images={}; cropped={}
    resource=next(r for r in weapon_manifest['provenance']['resources'] if r['resource']=='/menu/01_common_h.tpf.dcx')
    def crop_record(atlas_name,node,relative,alt,art_ids=None):
        atlas=atlases[atlas_name];x,y,w,h=[int(node[k]) for k in ('x','y','width','height')]
        assert min(x,y)>=0 and x+w<=atlas.width and y+h<=atlas.height
        crop=atlas.crop((x,y,x+w,y+h));buffer=BytesIO();crop.save(buffer,'WEBP',lossless=True,exact=True,method=6)
        webp=buffer.getvalue();web_sha=digest(webp);relative=relative.replace('<hash>',web_sha[:12])
        output=repo/'public'/relative;output.parent.mkdir(parents=True,exist_ok=True);output.write_bytes(webp)
        decoded=Image.open(BytesIO(webp)).convert('RGBA')
        assert decoded.size==crop.size and decoded.tobytes()==crop.tobytes()
        source={'resource':resource,'localDcxPath':str(dcx_path),'dcxSha256':digest(dcx_bytes),'decodedTpfSha256':digest(tpf),
                'atlas':atlas_name,'ddsSha256':dds_hashes[atlas_name],'layout':str(layouts[atlas_name][0]),
                'layoutSha256':digest(layouts[atlas_name][0].read_bytes()),'sprite':node['name'],'rectangle':[x,y,w,h],
                'width':w,'height':h,'rgbaSha256':digest(crop.tobytes()),'webpSha256':web_sha,'bytes':len(webp),
                'processing':'native full rectangle; lossless RGBA WebP; no resize/redraw', 'parameterIds':art_ids or []}
        if art_ids:
            source['parameterReferences']=[{'table':'SwordArtsParam','id':i,'textId':arts[i]['textId'],'iconId':int(arts[i]['iconId'])} for i in art_ids]
        return {'src':'/'+relative,'alt':alt,'name':alt,'status':'verified','source':source},crop
    for icon in sorted(targets):
        atlas,node=targets[icon];names={art_name(i) for i in by_icon[icon]};assert len(names)==1
        images[str(icon)],cropped[icon]=crop_record(atlas,node,f'skill-images/{icon}-<hash>.webp',next(iter(names)),by_icon[icon])
    navigation,nav_crop=crop_record(nav_layout.stem,nav_node,'nav-icons/weapons.webp','武器图鉴')
    collisions={n:ids for n,ids in by_name.items() if len({arts[i]['iconId'] for i in ids})>1}
    summary={'displayedSkillIds':len(displayed),'displayContexts':contexts,'verifiedIcons':len(images),'missing':[],
             'hiddenDefaultIdsNotExtracted':sorted(defaults-displayed,key=int),'sameNameDifferentIconGroups':len(collisions),
             'totalSkillBytes':sum(r['source']['bytes'] for r in images.values()),'navigationBytes':navigation['source']['bytes']}
    provenance={'gameVersion':initial['executable_version'],'regulationVersion':initial['regulation_version'],
                'exeSha256':initial['exe_sha256'],'regulationSha256':initial['regulation_sha256'],
                'catalogSha256AtExtraction':digest(catalog_bytes),'swordArtsParamSha256':digest(arts_path.read_bytes()),
                'swordArtsTableParamSha256':digest(tables_path.read_bytes()),'artsNameFiles':text_hashes,
                'scriptSha256':digest(Path(__file__).read_bytes()),'sourceWeaponManifestSha256':digest((repo/'public/weapon-image-manifest.json').read_bytes()),
                'decoderSha256':digest((helpers/'decode_textures.py').read_bytes()),'oodleSha256':digest(decoder.DLL.read_bytes()),
                'runtimeVerified':False,'scope':'approved local preview only; original game art; public redistribution permission unconfirmed'}
    manifest={'schemaVersion':1,'images':images,'navigation':{'weapons':navigation},'summary':summary,'provenance':provenance}
    (repo/'public/skill-image-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    font=ImageFont.truetype(r'C:\Windows\Fonts\msyh.ttc',15)
    icon_ids=sorted(cropped)
    for page in range((len(icon_ids)+47)//48):
        canvas=Image.new('RGB',(960,1440),'#17212b');draw=ImageDraw.Draw(canvas)
        for n,icon in enumerate(icon_ids[page*48:(page+1)*48]):
            im=cropped[icon].copy();im.thumbnail((124,124));x,y=(n%6)*160,(n//6)*180
            canvas.paste(im,(x+(160-im.width)//2,y),im)
            draw.text((x+4,y+128),f'{icon} / {by_icon[icon][0]}',font=font,fill='white')
            draw.text((x+4,y+150),images[str(icon)]['alt'][:10],font=font,fill='white')
        canvas.save(evidence/f'skills-contact-{page+1:02}.png')
    canvas=Image.new('RGB',(600,len(collisions)*200),'#17212b');draw=ImageDraw.Draw(canvas)
    for row,(name,ids) in enumerate(sorted(collisions.items())):
        for col,art_id in enumerate(ids):
            icon=int(arts[art_id]['iconId']);im=cropped[icon];canvas.paste(im,(col*300+60,row*200),im)
            draw.text((col*300+5,row*200+162),f'{name}  ID {art_id} / {icon}',font=font,fill='white')
    canvas.save(evidence/'same-name-different-icons.png');nav_crop.save(evidence/'navigation-native.png')
    assert protected_hashes=={p:digest(Path(p).read_bytes()) for p in protected_hashes},'Existing assets changed'
    assert stats=={str(p):(p.stat().st_size,p.stat().st_mtime_ns) for p in watched},'Game source metadata changed'
    validation={'summary':summary,'manifestSha256':digest((repo/'public/skill-image-manifest.json').read_bytes()),
                'sameNameDifferentIcons':{n:[{'id':i,'iconId':int(arts[i]['iconId'])} for i in ids] for n,ids in collisions.items()},
                'allWebpRgbaEqualNativeCrop':True,'gameMetadataUnchanged':True,'oldAssetHashesUnchanged':True,
                'protectedAssetCount':len(protected_hashes),'provenance':provenance}
    (evidence/'validation.json').write_text(json.dumps(validation,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))


if __name__=='__main__':
    main()
