"""Selectively read known map packages and scene evidence from local archives.

Requires the existing read-only archive/texture helpers. Never patches the game.
"""
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import argparse,json,hashlib,re,struct
from io import BytesIO
from collections import defaultdict
from PIL import Image,ImageDraw
from xml.etree import ElementTree as ET

def sha(data): return hashlib.sha256(data).hexdigest()

TERRAINS={'m00':('0','limveld'),'m01':('1','mountaintop'),'m02':('2','crater'),
          'm03':('3','rotted'),'m04':('4','great-hollow'),'m05':('5','noklateo')}
TRANSFORM={'status':'verified-static-calibration','areaNo':60,'layer':0,'subLayer':'',
           'gridSize':256,'worldUnitsPerPixel':1,'width':1536,'height':1536,
           'pixelX':{'gridXNo':256,'posX':1,'constant':-10368},
           'pixelY':{'gridZNo':-256,'posZ':-1,'constant':10368},
           'normalizedX':'(gridXNo*256+posX-10368)/1536',
           'normalizedY':'(10368-gridZNo*256-posZ)/1536',
           'origin':'top-left','clamp':False,'runtimeVerified':False,
           'scope':'area60 surface attachment positions; not underground, building interior, or arbitrary entity coordinates'}

def calibrate(previous,evidence,images):
    """Audit explicit landmark associations; never fit a transform to every row."""
    root=previous/'strict/regulation-bin'
    def param(name):
        path=root/(name+'.param.xml');tree=ET.parse(path).getroot()
        defaults={f.attrib['name']:f.attrib.get('defaultValue','') for f in tree.find('fields')}
        return {x.attrib['id']:defaults|x.attrib for x in tree.find('rows')},sha(path.read_bytes())
    attach,attach_sha=param('SmallBaseAndSpotAttachPoint');world,world_sha=param('WorldMapPointParam')
    refpath=evidence.parent/'references/community-reference.json';ref=json.loads(refpath.read_text(encoding='utf-8'))
    assert sha(refpath.read_bytes())=='375302f473f2d7623f86ed369594be69870e9c75f57a03bbb0bc3d54dcf333fc'
    checks=[]
    for terrain,bindings in [('0',[('107','1'),('117','2'),('103','4')]),
                             ('4',[('1144','1'),('1151','5'),('1109','6'),('1150','9')])]:
        slots={x['id']:x for x in ref['coordinates']['greatHollowSlots' if terrain=='4' else 'baseSlots']}
        im=Image.open(images[terrain]).convert('RGB');draw=ImageDraw.Draw(im)
        for aid,sid in bindings:
            a=attach[aid];fields=['areaNo','gridXNo','gridZNo','posX','posY','posZ']
            matched=aid in world and all(a[k]==world[aid][k] for k in fields)
            if terrain=='0':assert matched
            x=int(a['gridXNo'])*256+float(a['posX'])-10368
            y=10368-int(a['gridZNo'])*256-float(a['posZ'])
            rx=slots[sid]['x']*1536/1000;ry=slots[sid]['y']*1536/1000
            error=((x-rx)**2+(y-ry)**2)**.5;assert error<10
            checks.append({'terrainId':terrain,'attachId':aid,'communitySlot':sid,
                           'raw':{k:a[k] for k in fields},'worldMapPointSamePosition':matched,
                           'pixel':[x,y],'normalized':[x/1536,y/1536],
                           'referencePixel':[rx,ry],'residualPixels':error,
                           'association':'manual landmark/relative-placement crosscheck on native texture; not an engine slot-ID join'})
            draw.ellipse((x-8,y-8,x+8,y+8),outline='red',width=3)
            draw.text((x+10,y),aid,fill='white',stroke_width=2,stroke_fill='black')
            draw.rectangle((rx-4,ry-4,rx+4,ry+4),outline='cyan',width=2)
        im.save(evidence/('calibration-terrain-'+terrain+'.png'))
    result={'coordinateTransform':TRANSFORM,'method':'static native-param and original-texture landmark audit; community positions are approximate reference only',
            'sources':{'SmallBaseAndSpotAttachPointXmlSha256':attach_sha,'WorldMapPointParamXmlSha256':world_sha,'communityReferenceSha256':sha(refpath.read_bytes())},
            'checks':checks,'maxCheckedResidualPixels':max(x['residualPixels'] for x in checks),
            'limitations':['No live game or engine projection was measured.',
                           'Community base slot7 is inconsistent with native attachment313 (about95 native pixels vertically); no per-point correction is invented.',
                           'Other terrain variants share unchanged 6x6 tile frame and fixed landmark placement; changed-region attachment correctness must be checked independently.']}
    (evidence/'coordinate-calibration.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return result

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--repo',type=Path,default=Path(__file__).resolve().parents[1])
    ap.add_argument('--previous',type=Path,default=Path(r'E:\海斗\outputs\nightreign-data-20261109'))
    ap.add_argument('--evidence',type=Path,default=Path(r'E:\海斗\outputs\map-nightlord-20261110\assets'))
    ap.add_argument('--scenes',action='store_true',help='Also read selected dictionary-listed MSB/event/GFX evidence')
    args=ap.parse_args();ev=args.evidence;ev.mkdir(parents=True,exist_ok=True)
    helpers=args.previous/'monster-images';sys.path.insert(0,str(helpers))
    import extract_menu_images as menu
    import decode_textures as decoder
    game=menu.GAME
    initial=json.loads((args.previous/'source-manifest.json').read_text(encoding='utf-8'))
    for name,key in [('nightreign.exe','exe_sha256'),('regulation.bin','regulation_sha256')]:
        assert sha((game/name).read_bytes())==initial[key],f'Source changed: {name}'
    dictionary=ev.parent/'references/EldenRingNightreignDictionary.txt'
    if not dictionary.exists():dictionary=ev/'references/NightreignDictionary.txt'
    names=set(dictionary.read_text(encoding='utf-8-sig').splitlines())
    map_paths={p for p in names if p.startswith('/menu/71_maptile_') and p.endswith('.tpf.dcx')}
    # The upstream map extractor identifies this exact hash; the current BHD
    # must independently contain it before any bytes are read.
    dlc_map_path='/menu/71_maptile_m04.tpf.dcx'
    assert menu.archive.path_hash(dlc_map_path)==0xA7F963AB16C713AB
    map_paths.add(dlc_map_path)
    paths=set(map_paths)
    if args.scenes:
        paths|={p for p in names if p in ['/menu/02_120_worldmap.gfx','/event/common.emevd.dcx','/event/common_func.emevd.dcx','/event/m60_00_00_99.emevd.dcx'] or any(p.startswith(prefix) for prefix in ['/map/mapstudio/m60_42_38_','/map/mapstudio/m60_45_39_','/map/mapstudio/m60_44_36_','/event/m60_42_38_','/event/m60_45_39_','/event/m60_44_36_'])}
    keys_text=(args.previous/'localized/references/ArchiveKeys.cs').read_text(encoding='utf-8-sig').split('EldenRingNightreignKeys',1)[1]
    keys={n.lower():p.encode() for n,p in re.findall(r'\["([^"]+)"\]\s*=\s*@"(-----BEGIN RSA PUBLIC KEY-----.*?-----END RSA PUBLIC KEY-----)"',keys_text,re.S)}
    wanted={menu.archive.path_hash(p):p for p in paths};found={};archives=[]
    before={p.name:(p.stat().st_size,p.stat().st_mtime_ns) for p in game.glob('*.bd[ht]')}
    for archive in ['data0','data1','data2','data3','dlc01']:
        if set(found)==paths:break
        if archive not in keys:
            archives.append({'name':archive,'status':'keyUnavailable; not inspected'})
            continue
        h=menu.archive.decrypt_header(game/(archive+'.bhd'),keys[archive]);assert h[:4]==b'BHD5'
        archives.append({'name':archive,'bhdSha256':sha((game/(archive+'.bhd')).read_bytes()),'decodedBhdSha256':sha(h)})
        n,bs=struct.unpack_from('<ii',h,16);assert 0<=n<=100000 and 0<=bs<=len(h)-n*8
        for b in range(n):
            count,off=struct.unpack_from('<ii',h,bs+b*8);assert 0<=count and 0<=off<=len(h)-count*40
            for i in range(count):
                hv,padded,size,location,so,ao=struct.unpack_from('<Qiiqqq',h,off+i*40)
                if hv not in wanted:continue
                p=wanted[hv];assert p not in found
                r={'archive':archive+'.bdt','resource':p,'pathHash':f'0x{hv:016x}','offset':location,'size':size or padded,'padded_size':padded,'aes_offset':ao}
                assert 0<=location<=(game/r['archive']).stat().st_size-padded
                data=menu.read_resource(h,r);r['sha256']=sha(data)
                dest=ev/'sources'/p.lstrip('/');dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
                r['localPath']=str(dest);found[p]=r
                print('read',p,r['size'],flush=True)
        if not args.scenes:break
    manifest={'schemaVersion':1,'images':{},'terrains':{},'resources':list(found.values()),'unresolved':[],
              'provenance':{'gameVersion':initial['executable_version'],'regulationVersion':initial['regulation_version'],
                            'exeSha256':initial['exe_sha256'],'regulationSha256':initial['regulation_sha256'],
                            'dictionarySha256':sha(dictionary.read_bytes()),'archives':archives,'scriptSha256':sha(Path(__file__).read_bytes())}}
    labels={'m00':'limveld','m01':'limveld-frost','m02':'limveld-volcanic','m03':'limveld-corruption','m04':'great-hollow','m05':'limveld-castle','m10':'roundtable-hold'}
    tile_pattern=re.compile(r'MENU_MapTile_L(\d+)_(\d+)_(\d+)(_B\d+)?$')
    evidence=[];public_images={}
    for path in sorted(map_paths):
        if path not in found:continue
        r=found[path];raw=decoder.dcx(Path(r['localPath']).read_bytes());assert raw[:4]==b'TPF\0'
        groups=defaultdict(list)
        for texture in decoder.tpf(raw):
            match=tile_pattern.fullmatch(texture['name'])
            if not match:continue
            layer,col,row,sub=match.groups();image=Image.open(BytesIO(texture['bytes'])).convert('RGBA')
            groups[(int(layer),sub or '')].append((int(col),int(row),image,{'name':texture['name'],'ddsSha256':sha(texture['bytes']),'tpfOffset':texture['offset'],'length':texture['length'],'rgbaSha256':sha(image.tobytes())}))
        package=Path(path).name.split('.')[0].rsplit('_',1)[1];terrain=labels[package]
        for (layer,sub),tiles in groups.items():
            widths={im.size for _,_,im,_ in tiles};assert len(widths)==1;tw,th=next(iter(widths))
            minx,maxx=min(t[0] for t in tiles),max(t[0] for t in tiles);miny,maxy=min(t[1] for t in tiles),max(t[1] for t in tiles)
            canvas=Image.new('RGBA',((maxx-minx+1)*tw,(maxy-miny+1)*th))
            assert len({(x,y) for x,y,_,_ in tiles})==len(tiles)
            for x,y,im,tr in tiles:canvas.paste(im,((x-minx)*tw,(maxy-y)*th))
            key=f'{terrain}-L{layer}{sub}';buf=BytesIO();canvas.save(buf,'WEBP',lossless=True,exact=True,method=4);payload=buf.getvalue();digest=sha(payload)
            filename=f'{key}-{digest[:12]}.webp'
            selected=package in TERRAINS and layer==0 and sub==''
            out=(args.repo/'public/map-assets' if selected else ev/'derived-images')/filename
            out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(payload)
            if selected:public_images[TERRAINS[package][0]]=out
            decoded=Image.open(BytesIO(payload)).convert('RGBA');assert decoded.tobytes()==canvas.tobytes()
            for x,y,im,tr in tiles:assert decoded.crop(((x-minx)*tw,(maxy-y)*th,(x-minx+1)*tw,(maxy-y+1)*th)).tobytes()==im.tobytes()
            rec={'src':'/map-assets/'+filename,'width':canvas.width,'height':canvas.height,'status':'source-verified-coordinate-pending',
                 'source':{'resource':r,'decodedTpfSha256':sha(raw),'tiles':len(tiles),'tileSize':[tw,th],'colRange':[minx,maxx],'rowRange':[miny,maxy],
                           'rgbaSha256':sha(canvas.tobytes()),'webpSha256':digest,'stitch':'x=(col-minCol)*tileWidth; y=(maxRow-row)*tileHeight; raw RGBA paste; no resample'},
                 'coordinateTransform':None,'layer':layer,'subLayer':sub,'terrainLabelStatus':'author-tool-cross-reference; local terrain identity pending'}
            manifest['images'][key]=rec
            if selected:manifest['terrains'][TERRAINS[package][0]]=dict(rec)
            evidence.append({'key':key,'tiles':[dict(t[3],column=t[0],row=t[1]) for t in tiles]})
            thumb=canvas.copy();thumb.thumbnail((1024,1024));thumb.save(ev/(key+'-preview.png'))
            print('map',key,canvas.size,len(tiles),len(payload),flush=True)
    assert len(public_images)==6
    calibration=calibrate(args.previous,ev,public_images)
    manifest['coordinateCalibration']=calibration
    manifest['unresolved']=[{'kind':'resourceNotFound','path':p} for p in sorted(paths-found.keys())]+[{'kind':'runtimeProjectionNotMeasured'},{'kind':'modeRuntimeAndSceneEntityBindingNotEstablishedByThisExtraction'}]
    assert before=={p.name:(p.stat().st_size,p.stat().st_mtime_ns) for p in game.glob('*.bd[ht]')}
    (ev/'tile-evidence.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    (ev/'extraction.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    public={'schemaVersion':1,'provenance':{k:v for k,v in manifest['provenance'].items() if k!='archives'},'terrains':{}}
    for package,(tid,name) in TERRAINS.items():
        rec=manifest['terrains'][tid];s=rec['source'];r=s['resource']
        public['terrains'][tid]={'src':rec['src'],'width':1536,'height':1536,'status':'verified',
            'name':name,'layer':0,'coordinateTransform':dict(TRANSFORM),
            'source':{'resource':r['resource'],'archive':r['archive'],'pathHash':r['pathHash'],
                      'resourceSha256':r['sha256'],'decodedTpfSha256':s['decodedTpfSha256'],
                      'rgbaSha256':s['rgbaSha256'],'webpSha256':s['webpSha256'],
                      'tiles':36,'tileSize':[256,256],'colRange':[0,5],'rowRange':[0,5],
                      'stitch':s['stitch']},
            'verification':{'pixelPreservation':'decoded WebP RGBA and all source tile crops compare equal',
                            'coordinateCalibration':'static landmarks; normal 3, Great Hollow 4; variants share tile frame',
                            'runtimeVerified':False}}
    (args.repo/'public/map-asset-manifest.json').write_text(json.dumps(public,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
