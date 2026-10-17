/* 渡夜图鉴：浏览器本地存档、图鉴与遗物组合界面。 */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (v) => v == null || v === '' ? '未收录' : typeof v === 'number' ? new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(v) : String(v);
const state = {enemyData:null,enemyImages:{},enemyMeta:new Map(),items:null,effects:null,zh:null,wikiZh:null,vessels:null,relicCatalog:null,relicRuleEffects:null,save:null,saveEditor:null,saveFileName:null,enemyFiltered:[],enemyGroups:[],enemyPage:1,enemyPageSize:36,enemySelected:null,rules:[],ruleProfiles:[],activeRuleProfileId:null,relicFiltered:[],relicPage:1,poolPage:1,selectedEffects:new Map(),worker:null,equipped:{normal:[null,null,null],deep:[null,null,null]},selectedRelicIndex:null,buildResults:[],activeSlot:{group:'normal',index:0},slotFilterActive:false};
const typeLabel = {Relic:'普通',DeepRelic:'深夜',UniqueRelic:'独特'};
const RELIC_PAGE_SIZE=36,POOL_PAGE_SIZE=12;
const characterZh = {'追跡者':'追踪者','守護者':'守护者','鉄の目':'铁之眼','レディ':'女爵','無頼漢':'无赖','復讐者':'复仇者','隠者':'隐士','執行者':'执行者','学者':'学者','葬儀屋':'送葬者'};
const characterImage = {'追跡者':'wylder','守護者':'guardian','鉄の目':'iron-eye','レディ':'duchess','無頼漢':'raider','復讐者':'revenant','隠者':'recluse','執行者':'executor','学者':'scholar','葬儀屋':'undertaker'};
const vesselZh = {urn:'器皿',goblet:'杯盅',chalice:'高脚杯',sootCoveredUrn:'熏黑的器皿',sealedUrn:'封印的器皿',decrepitGoblet:'破旧的杯盅',forgottenGoblet:'被遗忘的杯盅',sacredErdtreeGrail:'黄金树圣杯',spiritTreeGrail:'灵魂树圣杯',giantTreeGrail:'巨人树圣杯',scadutreeGrail:'幽影树圣杯'};
const colorZh = {Red:'红',Blue:'蓝',Yellow:'黄',Green:'绿',Any:'任意'};
// Enemy portraits map by the NPC parameter ID shared with the source wiki.
const enemyPortraits = [];
function enemyPortraitInfo(name,id){const imageId=String(id||'').replace(/[a-z]$/i,'');const src=state.enemyImages?.[imageId];return src?[null,src]:enemyPortraits.find(([pattern])=>pattern.test(String(name||'')))||null}
function enemyPortrait(name,large=false,id=''){
  const item=enemyPortraitInfo(name,id),src=item?.[1]||'';
  return `<span class="enemy-portrait ${large?'large':''} ${item?'has-image':''}" aria-hidden="true">${item?`<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}<span>⚔</span></span>`;
}
function attachEnemyPortraitFallbacks(root){root.querySelectorAll('.enemy-portrait img').forEach(img=>img.addEventListener('error',()=>img.parentElement.classList.remove('has-image'),{once:true}))}
function vesselName(key,character){
  if((state.vessels?.universalVessels||[]).some(v=>v.key===key))return vesselZh[key]||key;
  const name=characterZh[character]||character||'渡夜者';
  if(key==='sootCoveredUrn')return `熏黑的${name}器皿`;
  if(key==='sealedUrn')return `封印的${name}器皿`;
  if(key==='decrepitGoblet')return `破旧的${name}杯盅`;
  if(key==='forgottenGoblet')return `被遗忘的${name}杯盅`;
  return `${name}${vesselZh[key]||key}`;
}

function navigate(view){
  if(view==='builds'&&state.save){$('#build-empty').hidden=true;$('#build-workspace').hidden=false;renderBuildWorkspace()}
  window.dispatchEvent(new CustomEvent('nightreign:navigate',{detail:{view}}));
}
window.navigateTo=navigate;

async function loadCatalogs(){
  try{
    const [enemy,items,effects,zh,wikiZh,vessels,relicCatalog,relicRuleEffects,enemyImages]=await Promise.all(['enemy-data.json','items_data.json','effects_data.json','quickref_effects_zh.json','effect_names_zh.json','vessels_data.json','relic_catalog_zh.json','relic_rule_effects.json','enemy-image-map.json'].map(async name=>{const url='./'+name+(name==='enemy-image-map.json'?'?v=20261017-monster-names':'');const r=await fetch(url);if(!r.ok)throw new Error(name+' 读取失败');return r.json()}));
    Object.assign(state,{enemyData:enemy,enemyImages,items,effects,zh,wikiZh,vessels,relicCatalog,relicRuleEffects});
    buildEffectCategoryIndex();
    $('#nav-enemy-count').textContent=enemy.rows.length.toLocaleString('zh-CN');
    buildEnemyMetadata();
    setupEnemyFilters();
    restoreEnemyUrlState();
    filterEnemies(false);
    setupCharacters();
    restoreRules();
    $('#save-status').textContent='资料已就绪，可选择存档。';
    restoreSave();
  }catch(err){$('#enemy-count').textContent='资料载入失败';$('#save-status').textContent='资料载入失败：'+err.message;$('#save-status').classList.add('error')}
}

const bossRe=/boss|首领|夜王|夜之王|夜王者/i;
const enemyCategoryLabels={'夜王':'夜王','夜晚Boss':'夜晚首领','强敌boss':'强敌首领','中boss':'中型首领','小boss':'小型首领','boss':'Boss','封印监牢':'封印监牢','古代封印监牢':'古代封印监牢','特殊':'特殊敌人'};
const enemyFilterOptions=[['all','全部敌人'],['boss','全部首领'],['nightlord','夜王'],['nightboss','夜晚首领'],['fieldboss','野外首领'],['sealed','封印监牢'],['ancient','古代封印监牢'],['special','特殊敌人'],['otherboss','未细分首领'],['other','其他敌人']];
const fieldBossCategories=new Set(['强敌boss','boss','小boss','中boss']);
function enemyName(r){return String(r[0]||'未知敌人')}
function isBoss(r){return bossRe.test(enemyName(r))}
function enemyGroupName(r){return enemyName(r)}
function buildEnemyMetadata(){
  const map=new Map();
  for(const row of state.enemyData.scale?.rows||[]){
    const key=normalizeName(row[0]);if(!key)continue;
    if(!map.has(key))map.set(key,{categories:new Set(),locations:new Set()});
    const item=map.get(key);if(row[2])item.categories.add(String(row[2]));if(row[1])item.locations.add(String(row[1]));
  }
  state.enemyMeta=map;
}
function enemyMetaFor(row){return state.enemyMeta.get(normalizeName(enemyName(row)))||{categories:new Set(),locations:new Set()}}
function matchesEnemyCategory(row,filter){
  if(filter==='all')return true;
  const categories=enemyMetaFor(row).categories;
  if(filter==='boss')return isBoss(row)||[...categories].some(x=>fieldBossCategories.has(x)||x==='夜王'||x==='夜晚Boss');
  if(filter==='nightlord')return categories.has('夜王');
  if(filter==='nightboss')return categories.has('夜晚Boss');
  if(filter==='fieldboss')return [...categories].some(x=>fieldBossCategories.has(x));
  if(filter==='sealed')return categories.has('封印监牢');
  if(filter==='ancient')return categories.has('古代封印监牢');
  if(filter==='special')return categories.has('特殊');
  if(filter==='otherboss')return isBoss(row)&&categories.size===0;
  if(filter==='other')return !isBoss(row)&&categories.size===0;
  return false;
}
function matchesEnemyArea(row,area){return area==='all'||enemyMetaFor(row).locations.has(area)}
function enemyCategoryLabel(row){
  const categories=enemyMetaFor(row).categories;
  for(const key of ['夜王','夜晚Boss','古代封印监牢','封印监牢','强敌boss','中boss','小boss','特殊','boss'])if(categories.has(key))return enemyCategoryLabels[key];
  return isBoss(row)?'未细分首领':'其他敌人';
}
function setupEnemyFilters(){
  const rows=state.enemyData.rows;
  $('#enemy-filter').innerHTML=enemyFilterOptions.map(([key,label])=>{const count=key==='all'?rows.length:rows.filter(row=>matchesEnemyCategory(row,key)).length;return `<option value="${key}">${label} · ${count.toLocaleString('zh-CN')}</option>`}).join('');
  const areas=[...new Set([...state.enemyMeta.values()].flatMap(item=>[...item.locations]))];
  $('#enemy-area').innerHTML='<option value="all">全部区域 / 遭遇</option>'+areas.map(area=>`<option value="${esc(area)}">${esc(area)}</option>`).join('');
}
function restoreEnemyUrlState(){
  const params=new URL(location.href).searchParams;
  $('#enemy-search').value=params.get('enemyQ')||'';
  $('#enemy-filter').value=enemyFilterOptions.some(([key])=>key===params.get('enemyType'))?params.get('enemyType'):'all';
  $('#enemy-area').value=[...$('#enemy-area').options].some(option=>option.value===params.get('enemyArea'))?params.get('enemyArea'):'all';
  state.enemyPage=Math.max(1,Number(params.get('enemyPage'))||1);
  state.enemyUrlId=params.get('enemyId')||'';
}
function syncEnemyUrl(){
  const url=new URL(location.href),params=url.searchParams;
  const q=$('#enemy-search').value.trim(),type=$('#enemy-filter').value,area=$('#enemy-area').value;
  q?params.set('enemyQ',q):params.delete('enemyQ');
  type==='all'?params.delete('enemyType'):params.set('enemyType',type);
  area==='all'?params.delete('enemyArea'):params.set('enemyArea',area);
  state.enemyPage>1?params.set('enemyPage',String(state.enemyPage)):params.delete('enemyPage');
  state.enemySelected?params.set('enemyId',String(state.enemySelected[1])):params.delete('enemyId');
  url.search=params.toString();history.replaceState(null,'',url);
}
function filterEnemies(resetPage=true){
  if(!state.enemyData)return;
  const q=$('#enemy-search').value.trim().toLocaleLowerCase(),filter=$('#enemy-filter').value,area=$('#enemy-area').value;
  const rows=state.enemyData.rows.map((row,index)=>({row,index})).filter(({row})=>(!q||(enemyName(row)+' '+row[1]+' '+enemyCategoryLabel(row)+' '+[...enemyMetaFor(row).locations].join(' ')).toLocaleLowerCase().includes(q))&&matchesEnemyCategory(row,filter)&&matchesEnemyArea(row,area));
  state.enemyFiltered=rows;
  const groups=new Map();
  rows.forEach(item=>{const name=enemyGroupName(item.row);if(!groups.has(name))groups.set(name,{name,rows:[]});groups.get(name).rows.push(item)});
  state.enemyGroups=[...groups.values()];
  if(state.enemyUrlId){const match=rows.find(({row})=>String(row[1])===state.enemyUrlId);if(match)state.enemySelected=match.row;state.enemyUrlId=''}
  if(state.enemySelected&&!rows.some(({row})=>row===state.enemySelected))state.enemySelected=null;
  if(resetPage)state.enemyPage=1;renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl();
}
function renderEnemies(){
  const total=state.enemyGroups.length,pages=Math.max(1,Math.ceil(total/state.enemyPageSize));
  state.enemyPage=Math.min(Math.max(state.enemyPage,1),pages);
  const start=(state.enemyPage-1)*state.enemyPageSize,groups=state.enemyGroups.slice(start,start+state.enemyPageSize);
  const variants=(group)=>group.rows.map(({row,index},variantIndex)=>`<button type="button" class="enemy-variant ${state.enemySelected===row?'active':''}" data-enemy-index="${index}"><span>${esc(enemyName(row))===esc(group.name)?`记录 ${variantIndex+1}`:esc(enemyName(row))}</span><small>ID <span class="enemy-number">${esc(row[1])}</span> · 第一天 HP <span class="enemy-number">${esc(fmt(row[2]))}</span></small></button>`).join('');
  $('#enemy-count').textContent=total?`第 ${start+1}–${start+groups.length} 组 / 共 ${total.toLocaleString('zh-CN')} 组 · ${state.enemyFiltered.length.toLocaleString('zh-CN')} 条记录`:`0 组 · 0 条记录`;
  $('#enemy-list').innerHTML=groups.length?groups.map(group=>{
    const selected=group.rows.some(({row})=>row===state.enemySelected);
    const row=group.rows[0].row,badge=enemyCategoryLabel(row);
    if(group.rows.length===1){const {index}=group.rows[0];return `<button type="button" class="enemy-row ${state.enemySelected===row?'active':''}" data-enemy-index="${index}">${enemyPortrait(enemyName(row),false,row[1])}<span class="enemy-row-copy"><strong>${esc(enemyName(row))}</strong><small>ID <span class="enemy-number">${esc(row[1])}</span> · 第一天 HP <span class="enemy-number">${esc(fmt(row[2]))}</span></small></span><span class="badge ${isBoss(row)?'':'muted'}">${esc(badge)}</span></button>`}
    return `<details class="enemy-group" ${selected?'open':''}><summary class="enemy-row enemy-group-title">${enemyPortrait(group.name,false,row[1])}<span class="enemy-row-copy"><strong>${esc(group.name)}</strong><small>${group.rows.length} 条同名记录</small></span><span class="badge ${isBoss(row)?'':'muted'}">${esc(badge)}</span></summary><div class="enemy-variants">${variants(group)}</div></details>`;
  }).join(''):'<div class="empty-state"><h3>没有找到记录</h3><p>试试其他名称或 ID。</p></div>';
  attachEnemyPortraitFallbacks($('#enemy-list'));
  renderPagination('enemy-pagination',total,state.enemyPageSize,state.enemyPage);
}
function normalizeName(s){return String(s||'').replace(/[「」『』“”‘’\s]/g,'').replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/g,'').toLowerCase()}
function locationFor(row){
  const n=normalizeName(row[0]); if(!n)return [];
  const scale=state.enemyData.scale?.rows||[];
  const found=scale.filter(r=>{const x=normalizeName(r[0]);return x===n || (n.length>5&&x.length>5&&(x.includes(n)||n.includes(x)))}).map(r=>r[1]).filter(Boolean);
  return [...new Set(found)].slice(0,8);
}
// 敌人表的伤害列存的是减伤百分比；图鉴使用玩家实际造成伤害的倍率。
function enemyDamageMultiplier(value){
  const reduction=Number(value);
  return value==null||value===''||!Number.isFinite(reduction)?null:Math.round((1-reduction/100)*1000)/1000;
}
function enemyDamageText(value){const multiplier=enemyDamageMultiplier(value);return multiplier==null?'未收录':`×${fmt(multiplier)}`}
function enemyElementSummary(row){
  const elements=[[9,'魔'],[10,'火'],[11,'雷'],[12,'圣']].map(([index,name])=>({name,value:enemyDamageMultiplier(row[index])})).filter(item=>item.value!=null);
  if(!elements.length)return '<div class="enemy-element-empty">四属性倍率未收录</div>';
  const highest=Math.max(...elements.map(item=>item.value)),lowest=Math.min(...elements.map(item=>item.value));
  if(highest===lowest)return `<div class="enemy-element-card neutral"><span>魔 / 火 / 雷 / 圣</span><strong>均为 ×${fmt(highest)}</strong></div>`;
  const card=(kind,value,label)=>`<div class="enemy-element-card ${kind}"><span>${label} · ${elements.filter(item=>item.value===value).map(item=>item.name).join(' / ')}</span><strong>×${fmt(value)}</strong></div>`;
  return card('high',highest,'最高倍率')+card('low',lowest,'最低倍率');
}
function renderEnemyDetail(r){
  if(!r){$('#enemy-detail').innerHTML='<div class="empty-state"><span>⚔</span><h3>选择一名敌人</h3><p>属性、抗性和可核对的出现位置会显示在这里。</p></div>';return}
  const c=state.enemyData.columns;
  const section=(title,indexes,open=false,extra='')=>`<details class="detail-section" ${open?'open':''}><summary><span>${title}</span><small>${indexes.length} 项</small></summary>${extra}<div class="${indexes.length>8?'resist-grid':'kv-grid'}">${indexes.map(i=>{const damage=i>=5&&i<=12,multiplier=damage?enemyDamageMultiplier(r[i]):null,tone=damage&&multiplier!=null?(multiplier>1?'damage-high':multiplier<1?'damage-low':'damage-neutral'):'';return `<div class="${indexes.length>8?'resist':'kv'} ${tone}"><span>${esc(c[i].label)}</span><strong>${esc(damage?enemyDamageText(r[i]):fmt(r[i]))}</strong></div>`}).join('')}</div>${title==='伤害倍率'?'<p class="enemy-damage-note">数值为实际受伤倍率：大于 ×1 伤害更高，小于 ×1 伤害更低。</p>':''}</details>`;
  const locations=locationFor(r);
  const sameName=state.enemyData.rows.map((row,index)=>({row,index})).filter(({row})=>enemyGroupName(row)===enemyGroupName(r));
  const recordPicker=sameName.length>1?`<label class="enemy-record-picker">同名数据<select id="enemy-record-select" aria-label="选择同名怪物数据">${sameName.map(({row,index})=>`<option value="${index}" ${row===r?'selected':''}>ID ${esc(row[1])} · HP ${esc(fmt(row[2]))}${enemyName(row)!==enemyGroupName(r)?' · '+esc(enemyName(row)):''}</option>`).join('')}</select></label>`:'';
  $('#enemy-detail').innerHTML=`<div class="detail-top"><div class="enemy-detail-title">${enemyPortrait(enemyName(r),true,r[1])}<div><span class="card-kicker">${esc(enemyCategoryLabel(r))} / 怪物分类</span><h2>${esc(enemyName(r))}</h2><small>内部 ID <span class="enemy-number">${esc(r[1])}</span></small></div></div><span class="badge ${isBoss(r)?'':'muted'}">${esc(enemyCategoryLabel(r))}</span></div>${recordPicker}${section('核心属性',[2,3,4,24,25,26,27],true,`<div class="enemy-element-summary"><div class="enemy-element-heading">魔 / 火 / 雷 / 圣 · 最高与最低伤害倍率</div><div class="enemy-element-cards">${enemyElementSummary(r)}</div></div>`)}${section('伤害倍率',[5,6,7,8,9,10,11,12])}${section('异常状态抗性',[13,14,15,16,17,18,19,20,21,22,23])}${section('种族特攻',[38,39,40,41])}${section('属性削韧',[42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57])}<section class="detail-section location-section"><h3>出现位置</h3><p class="detail-note">${locations.length?esc(locations.join('、'))+'（同名 Boss 表可核对的遭遇分类）':'未收录可核对的具体位置'}</p></section>`;
  attachEnemyPortraitFallbacks($('#enemy-detail'));
}
$('#enemy-search').addEventListener('input',filterEnemies);$('#enemy-filter').addEventListener('change',filterEnemies);$('#enemy-area').addEventListener('change',filterEnemies);
$('#enemy-list').addEventListener('click',e=>{const btn=e.target.closest('[data-enemy-index]');if(!btn)return;state.enemySelected=state.enemyData.rows[Number(btn.dataset.enemyIndex)];renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl()});
$('#enemy-list').addEventListener('toggle',e=>{if(e.target.matches('details.enemy-group')&&e.target.open)e.target.scrollIntoView({block:'nearest'})},true);
$('#enemy-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.enemyPage+=Number(step.dataset.step);renderEnemies();syncEnemyUrl();$('#enemy-list').scrollTop=0});
$('#enemy-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.enemyPage=Number(e.target.value);renderEnemies();syncEnemyUrl();$('#enemy-list').scrollTop=0});
$('#enemy-detail').addEventListener('change',e=>{if(e.target.id!=='enemy-record-select')return;state.enemySelected=state.enemyData.rows[Number(e.target.value)];renderEnemies();renderEnemyDetail(state.enemySelected);syncEnemyUrl()});

function effectName(e){const id=String(e.id);const info=state.relicRuleEffects?.definitions?.[id]||state.wikiZh?.[id]||state.zh?.mappings?.[id];return info?.name||info?.name_zh||e.name_en||e.name_ja||e.key||`未知效果 #${e.id}`}
function isOutOfGameRelicEffect(e){return !!state.relicRuleEffects?.definitions?.[String(e.id??'')]}
function ruleEffectName(e){return state.relicRuleEffects?.definitions?.[String(e.id??'')]?.name||effectName(e)}
function ruleEffectCategory(e){return state.relicRuleEffects?.definitions?.[String(e.id??'')]?.type||'其他'}
function effectGroups(relic){return (relic.effects||[]).flat().filter(Boolean)}
function normalizedEffectName(name){return String(name||'').normalize('NFKC').replace(/\s+/g,'').replace(/\+\d+$/,'')}
function buildEffectCategoryIndex(){
  const keys=new Map(),names=new Map();
  for(const [id,entry] of Object.entries(state.zh?.mappings||{})){
    const category=entry.category_zh;if(!category)continue;
    const key=state.effects?.effects?.[id]?.key;
    if(key){if(!keys.has(key))keys.set(key,new Set());keys.get(key).add(category)}
    const name=normalizedEffectName(entry.name_zh);
    if(name){if(!names.has(name))names.set(name,new Set());names.get(name).add(category)}
  }
  state.categoryByKey=new Map([...keys].filter(([,categories])=>categories.size===1).map(([key,categories])=>[key,[...categories][0]]));
  state.categoryByName=new Map([...names].filter(([,categories])=>categories.size===1).map(([name,categories])=>[name,[...categories][0]]));
}
function effectCategory(e,isNegative=false){
  const id=String(e.id),exact=state.zh?.mappings?.[id]?.category_zh;
  if(exact)return exact;
  const byKey=state.categoryByKey?.get(e.key);if(byKey)return byKey;
  const name=effectName(e),byName=state.categoryByName?.get(normalizedEffectName(name));if(byName)return byName;
  const wiki=state.wikiZh?.[id]?.category_zh;
  if(wiki==='能力值')return '能力值';
  if(wiki==='绝招技艺')return '技艺/绝招';
  if(isNegative){
    if(/减伤率|受到.*伤害/.test(name))return '减益(减伤率)';
    if(/血量|生命力|专注值|集中力|精力|耐力|力气|灵巧|智力|信仰|感应/.test(name))return '减益(能力值)';
    if(/恢复|回复/.test(name))return '减益(恢复)';
    return '减益(行动)';
  }
  if(/【[^】]+】/.test(name))return '仅限特定角色';
  if(/技艺|绝招|量表/.test(name))return '技艺/绝招';
  if(/攻击力|造成的伤害|攻击伤害/.test(name))return '攻击力';
  if(/血量上限|专注值上限|精力上限|生命力|集中力|耐力|力气|灵巧|智力|信仰|感应/.test(name))return '能力值';
  if(/减伤率/.test(name))return '减伤率';
  if(/抵抗力|耐受/.test(name))return '对异常状态的抵抗力';
  if(/恢复|回复/.test(name))return '恢复';
  if(/附加.*(中毒|出血|催眠|腐败|冻伤|发狂)/.test(name))return '附加异常状态';
  if(/武器变为.*属性/.test(name))return '武器属性';
  if(/出击时|结晶露滴/.test(name))return '出击时的道具';
  if(/行动|冲刺|跳跃|回避/.test(name))return '行动';
  if(/强化/.test(name))return '强化';
  return '其他／未分类';
}
function relicEffectCategories(relic){return new Set(pairedEffects(relic).flatMap(group=>group.map((effect,index)=>effectCategory(effect,index>0))))}
function renderRelicCategoryOptions(){
  const counts=new Map();for(const relic of state.save?.relics||[])for(const category of relicEffectCategories(relic))counts.set(category,(counts.get(category)||0)+1);
  const order=[...new Set(Object.values(state.zh?.mappings||{}).map(entry=>entry.category_zh).filter(Boolean))];
  const categories=[...counts.keys()].sort((a,b)=>{const ai=order.indexOf(a),bi=order.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)||a.localeCompare(b,'zh-CN')});
  for(const id of ['relic-category','pool-category']){
    const select=$('#'+id),previous=select.value;
    select.innerHTML='<option value="all">全部词条类型</option>'+categories.map(category=>`<option value="${esc(category)}">${esc(category)}（${counts.get(category)}）</option>`).join('');
    select.value=categories.includes(previous)?previous:'all';
  }
}
function pairedEffects(relic){
  const groups=[];
  for(const raw of relic.effects||[]){
    if(Array.isArray(raw)){const group=raw.filter(Boolean);if(group.length)groups.push(group)}
    else if(raw){if(raw.isDebuff&&groups.length)groups[groups.length-1].push(raw);else groups.push([raw])}
  }
  return groups;
}
function renderEffectRows(relic,showId=false){
  const groups=pairedEffects(relic);
  return groups.length?groups.map(group=>`<div class="game-effect-row"><span class="game-effect-icon" aria-hidden="true">✧</span><div class="game-effect-copy"><span>${esc(effectName(group[0]))}${showId?`<em>#${esc(group[0].id)}</em>`:''}</span>${group.slice(1).map(e=>`<span class="game-effect-negative">${esc(effectName(e))}${showId?`<em>#${esc(e.id)}</em>`:''}</span>`).join('')}</div></div>`).join(''):'<div class="game-effect-row empty">此遗物无已识别词条</div>';
}
function relicType(r){return r.itemType||'Relic'}
function relicEntry(r){return state.relicCatalog?.items?.[r.itemKey]||null}
function relicName(r){return relicEntry(r)?.name_zh||r.itemNameEn||r.itemNameJa||r.itemKey||`遗物 #${r.itemId}`}
function relicCategory(r){return relicEntry(r)?.category||'未匹配图鉴'}
function relicImage(r){const entry=relicEntry(r);return entry?.image?`<img class="relic-thumb" src="${esc(entry.image)}" alt="${esc(entry.name_zh)}图标" loading="lazy" draggable="false" width="58" height="58">`:'<span class="relic-thumb relic-thumb-fallback" aria-hidden="true">◇</span>'}
function setSaveStatus(s,error=false){$('#save-status').textContent=s;$('#save-status').classList.toggle('error',error)}
function renderBattleRecords(){
  const records=state.save?.battleRecords;
  $('#records-empty').hidden=!!state.save;
  $('#records-panel').hidden=!state.save;
  if(!state.save)return;
  const labels={
    specialTerrain:'前往特异地形的次数',ambushEvents:'突袭事件的完成次数',endingsReached:'抵达结局的人数',
    runesEarned:'卢恩获得量',runesSpent:'卢恩花费量',runesLost:'失去的卢恩量',darksignsEarned:'暗痕获得量',lordProofs:'为王之证获得数',
    weapons:'获得的武器数量',effectsAndBlessings:'获得附加效果、庇佑的次数',specialEffects:'获得特殊效果的次数',
    enemiesDefeated:'打败敌人的次数',strongEnemiesDefeated:'打败强敌的次数',variantEnemiesDefeated:'打败敌人的次数（变异个体）',
    chestsOpened:'开启宝箱的次数',rescues:'救援成功的次数',strongestAttack:'最强力的攻击'
  };
  const valueText=value=>value==null?'待核对':typeof value==='number'?value.toLocaleString('zh-CN'):String(value);
  const renderRows=(target,rows)=>{const el=$('#'+target);if(el)el.innerHTML=rows.map(([label,value])=>`<div class="record-line"><span>${esc(label)}</span><strong>${esc(valueText(value))}</strong></div>`).join('')};
  const metricRows=obj=>Object.entries(obj||{}).map(([key,value])=>[labels[key]||key,value]);
  renderRows('record-overview',[['游玩时间',records?.playTime],['出击时间',records?.sortieTime],['总出击次数',records?.sorties],['胜利次数',records?.wins],['连续胜利次数',records?.winStreak],['连续胜利次数（深层区域）',records?.deepWinStreak]]);
  renderRows('record-characters',(records?.characterUsage||[]).map(x=>[x.name,x.count]));
  renderRows('record-nightlords',(records?.nightlordDefeats||[]).map(x=>[x.name,x.count]));
  renderRows('record-total',metricRows(records?.total));renderRows('record-peak',metricRows(records?.peak));
  renderRows('record-deep-total',metricRows(records?.deepTotal));renderRows('record-deep-peak',metricRows(records?.deepPeak).filter(([label])=>label!=='deepestDepth'));
  $('#record-method').textContent=records?.layoutStatus==='unmapped'
    ? '此存档的战绩表位置尚未识别，游玩时间以外的字段显示“待核对”。存档仅在浏览器本地解析。'
    : '存档在浏览器本地解析，未上传或修改原文件。战绩按存档中的记录字段读取。';
}
async function readSave(file){
  if(!file)return;
  if(!/\.sl2$/i.test(file.name)){setSaveStatus('请选择 .sl2 存档文件。',true);return}
  if(!state.items||!state.effects){setSaveStatus('资料尚未载入，请稍后再试。',true);return}
  try{
    setSaveStatus(`正在本地解析 ${file.name}…`);
    const buffer=await file.arrayBuffer();
    const parsed=parseSaveFile(buffer,state.items,state.effects);
    try{state.saveEditor=createSaveEditor(buffer);state.saveFileName=file.name}catch(editError){state.saveEditor=null;state.saveFileName=null;console.info('此存档暂不支持编辑：',editError.message)}
    invalidateBuildResults();
    showSave(parsed);
    try{sessionStorage.setItem('nightreign-parsed-save-v2',JSON.stringify(parsed))}catch(_){/* 存储不可用时仍保留本页数据 */}
    state.equipped={normal:[null,null,null],deep:[null,null,null]};state.selectedRelicIndex=null;renderBuildWorkspace();
    setSaveStatus(`已读取 ${parsed.relics.length} 件遗物${parsed.characterName?' · '+parsed.characterName:''}。原文件未修改，也未发送到服务器。${state.saveEditor?'可在下方编辑并导出副本。':'此存档版式暂不支持编辑。'}`);
  }catch(err){setSaveStatus('无法解析此存档：'+(err.message||String(err)),true)}
}
function showSave(parsed){
  if(!parsed||!Array.isArray(parsed.relics))throw new Error('遗物数据格式错误');
  state.save=parsed;const all=parsed.relics;
  if(typeof renderSaveEditorUi==='function')renderSaveEditorUi();
  state.relicPage=1;state.poolPage=1;state.activeSlot={group:'normal',index:0};state.slotFilterActive=false;
  $('#relic-dashboard').hidden=false;$('#build-empty').hidden=true;$('#build-workspace').hidden=false;
  $('#relic-total').textContent=all.length;
  $('#relic-normal').textContent=all.filter(r=>relicType(r)==='Relic').length;
  $('#relic-deep').textContent=all.filter(r=>relicType(r)==='DeepRelic').length;
  $('#relic-unique').textContent=all.filter(r=>relicType(r)==='UniqueRelic').length;
  $('#build-save-count').textContent=`已载入 ${all.length} 件遗物${parsed.characterName?' · '+parsed.characterName:''}`;
  renderBattleRecords();
  renderRelicCategoryOptions();filterRelics();renderEffectOptions();renderSelectedEffects();renderBuildWorkspace();
}
function restoreSave(){
    try{const raw=sessionStorage.getItem('nightreign-parsed-save-v2');if(!raw)return;const parsed=JSON.parse(raw);state.saveEditor=null;state.saveFileName=null;showSave(parsed);setSaveStatus(`已恢复本页解析结果 · ${parsed.relics.length} 件遗物。`)}
  catch(_){try{sessionStorage.removeItem('nightreign-parsed-save-v2')}catch(e){}}
}
$('#save-file').addEventListener('change',e=>readSave(e.target.files[0]));
const zone=$('#drop-zone');
['dragenter','dragover'].forEach(x=>zone.addEventListener(x,e=>{e.preventDefault();zone.classList.add('drag')}));
['dragleave','drop'].forEach(x=>zone.addEventListener(x,e=>{e.preventDefault();zone.classList.remove('drag')}));
zone.addEventListener('drop',e=>readSave(e.dataTransfer.files[0]));
function filterRelics(){
  if(!state.save)return;
  const q=$('#relic-search').value.trim().toLocaleLowerCase(),category=$('#relic-category').value,type=$('#relic-type').value,color=$('#relic-color').value;
  state.relicFiltered=state.save.relics.filter(r=>{
    return (type==='all'||(type==='normal'&&relicType(r)!=='DeepRelic')||(type==='deep'&&relicType(r)==='DeepRelic'))
      &&(category==='all'||relicEffectCategories(r).has(category))
      &&(color==='all'||r.itemColor===color)
      &&(!q||(relicName(r)+' '+(r.itemNameEn||'')+' '+relicCategory(r)+' '+r.id+' '+r.itemId+' '+effectGroups(r).map(e=>effectName(e)+' '+e.name_en+' '+e.id).join(' ')).toLocaleLowerCase().includes(q));
  });
  state.relicPage=1;renderRelics();
}
function renderPagination(id,total,pageSize,page,alwaysVisible=false){
  const root=$('#'+id),pages=Math.max(1,Math.ceil(total/pageSize));
  root.hidden=pages<=1&&!alwaysVisible;
  root.innerHTML=root.hidden?'':`<button type="button" data-step="-1" ${page<=1?'disabled':''}>上一页</button><label>第 <select aria-label="选择页数">${Array.from({length:pages},(_,i)=>`<option value="${i+1}" ${i+1===page?'selected':''}>${i+1}</option>`).join('')}</select> 页 / 共 ${pages} 页</label><button type="button" data-step="1" ${page>=pages?'disabled':''}>下一页</button>`;
}
function renderRelics(){
  const total=state.relicFiltered.length,pages=Math.max(1,Math.ceil(total/RELIC_PAGE_SIZE));
  state.relicPage=Math.min(Math.max(state.relicPage,1),pages);
  const start=(state.relicPage-1)*RELIC_PAGE_SIZE,rows=state.relicFiltered.slice(start,start+RELIC_PAGE_SIZE);
  $('#relic-count').textContent=total?`第 ${start+1}–${start+rows.length} 件 / 共 ${total} 件`:'0 件';
  $('#relic-list').innerHTML=rows.map(r=>{const type=relicType(r),entry=relicEntry(r),title=`<h3>${esc(relicName(r))}</h3>`;return `<article class="relic-card ${type==='DeepRelic'?'deep':type==='UniqueRelic'?'unique':''}"><header><div class="relic-identity">${relicImage(r)}<div>${entry?.source_page?`<a href="${esc(entry.source_page)}" target="_blank" rel="noopener noreferrer" title="查看中文图鉴来源">${title}</a>`:title}<small>${esc(relicCategory(r))} · ${esc(colorZh[r.itemColor]||r.itemColor)}色<br>实例 #${esc(r.id)} · 道具 #${esc(r.itemId)}</small></div></div><span class="badge ${type==='Relic'?'muted':''}">${esc(typeLabel[type]||type)}</span></header><div class="effect-list game-effect-list">${renderEffectRows(r,true)}</div></article>`}).join('')||'<div class="empty-state"><h3>没有匹配的遗物</h3><p>请调整搜索或类型筛选。</p></div>';
  if(typeof decorateRelicEditorCards==='function')decorateRelicEditorCards(rows);
  renderPagination('relic-pagination',total,RELIC_PAGE_SIZE,state.relicPage);
}
$('#relic-search').addEventListener('input',filterRelics);
for(const id of ['relic-category','relic-type','relic-color'])$('#'+id).addEventListener('change',filterRelics);
$('#relic-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.relicPage+=Number(step.dataset.step);renderRelics();$('#relic-list').scrollIntoView({block:'start'})});
$('#relic-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.relicPage=Number(e.target.value);renderRelics();$('#relic-list').scrollIntoView({block:'start'})});

function setupCharacters(){
  const chars=state.vessels.characters||{};
  $('#character-select').innerHTML=Object.entries(chars).map(([key,v])=>`<option value="${esc(key)}">${esc(characterZh[key]||key)} · ${esc(v.nameEn)}</option>`).join('');
  renderCharacterPicker();
  updateVessels();
}
function portrait(key){return `<img class="character-portrait" src="./character-images/${esc(characterImage[key]||'wylder')}.png" alt="" loading="lazy">`}
function vesselColors(vessel){
  return `<span class="vessel-combos"><span><small>普通</small>${(vessel?.normalSlots||[]).map(c=>`<i class="color-dot color-${esc(c.toLowerCase())}" title="${esc(colorZh[c]||c)}色"></i>`).join('')}</span><span><small>深夜</small>${(vessel?.deepSlots||[]).map(c=>`<i class="color-dot color-${esc(c.toLowerCase())}" title="${esc(colorZh[c]||c)}色"></i>`).join('')}</span></span>`;
}
function renderCharacterPicker(){
  const key=$('#character-select').value,chars=state.vessels?.characters||{};
  $('#character-trigger').innerHTML=`${portrait(key)}<span><strong>${esc(characterZh[key]||key)}</strong><small>${esc(chars[key]?.nameEn||'')}</small></span><b aria-hidden="true">⌄</b>`;
  $('#character-menu').innerHTML=Object.entries(chars).map(([name,data])=>`<button type="button" role="option" aria-selected="${name===key}" data-character="${esc(name)}">${portrait(name)}<span><strong>${esc(characterZh[name]||name)}</strong><small>${esc(data.nameEn||'')}</small></span></button>`).join('');
}
function renderVesselPicker(){
  const character=$('#character-select').value,key=$('#vessel-select').value,v=currentVessel();
  if(!v)return;
  $('#vessel-trigger').innerHTML=`<span class="vessel-trigger-name">${esc(vesselName(key,character))}</span>${vesselColors(v)}<b aria-hidden="true">⌄</b>`;
  $('#vessel-menu').innerHTML=[...$('#vessel-select').options].map(option=>{const data=state.vessels.characters?.[character]?.vessels?.[option.value]||(state.vessels.universalVessels||[]).find(x=>x.key===option.value);return `<button type="button" role="option" aria-selected="${option.value===key}" data-vessel="${esc(option.value)}"><strong>${esc(vesselName(option.value,character))}</strong>${vesselColors(data)}</button>`}).join('');
}
function closePickers(){for(const name of ['character','vessel']){$('#'+name+'-menu').hidden=true;$('#'+name+'-trigger').setAttribute('aria-expanded','false')}}
for(const name of ['character','vessel']){
  $('#'+name+'-trigger').addEventListener('click',()=>{const menu=$('#'+name+'-menu'),opening=menu.hidden;closePickers();menu.hidden=!opening;$('#'+name+'-trigger').setAttribute('aria-expanded',String(opening));if(opening)menu.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'})});
  $('#'+name+'-menu').addEventListener('click',e=>{const option=e.target.closest('button[data-'+name+']');if(!option)return;$('#'+name+'-select').value=option.dataset[name];$('#'+name+'-select').dispatchEvent(new Event('change'));closePickers();$('#'+name+'-trigger').focus()});
  $('#'+name+'-trigger').addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();const menu=$('#'+name+'-menu');menu.hidden=false;$('#'+name+'-trigger').setAttribute('aria-expanded','true');const options=[...menu.querySelectorAll('button')],selected=options.findIndex(x=>x.getAttribute('aria-selected')==='true');options[(selected+(e.key==='ArrowDown'?1:options.length-1))%options.length]?.focus()}else if(e.key==='Escape')closePickers()});
  $('#'+name+'-menu').addEventListener('keydown',e=>{const options=[...e.currentTarget.querySelectorAll('button')],index=options.indexOf(document.activeElement);if(e.key==='Escape'){closePickers();$('#'+name+'-trigger').focus()}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();options[(index+(e.key==='ArrowDown'?1:options.length-1))%options.length]?.focus()}});
}
document.addEventListener('click',e=>{if(!e.target.closest('.visual-picker'))closePickers()});
function updateVessels(){
  if(!state.vessels)return;
  const ch=state.vessels.characters[$('#character-select').value];
  const entries=Object.keys(ch?.vessels||{});
  const all=[...entries,...(state.vessels.universalVessels||[]).map(x=>x.key)];
  $('#vessel-select').innerHTML=all.map(key=>`<option value="${esc(key)}">${esc(vesselName(key,$('#character-select').value))}</option>`).join('');
  renderCharacterPicker();renderVesselPicker();
  renderBuildWorkspace();
}
function invalidateBuildResults(){if(state.worker){state.worker.terminate();state.worker=null}$('#run-build').disabled=false;state.buildResults=[];$('#build-results').innerHTML='';$('#build-status').textContent='选择目标词条后可计算推荐组合。'}
$('#character-select').addEventListener('change',()=>{invalidateBuildResults();state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;updateVessels();saveActiveRuleProfile()});
$('#vessel-select').addEventListener('change',()=>{invalidateBuildResults();state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;renderVesselPicker();renderBuildWorkspace()});
$('#build-mode').addEventListener('change',()=>{invalidateBuildResults();state.slotFilterActive=false;renderBuildWorkspace()});

function currentVessel(){
  const key=$('#vessel-select').value,character=$('#character-select').value;
  return state.vessels?.characters?.[character]?.vessels?.[key]||(state.vessels?.universalVessels||[]).find(v=>v.key===key)||null;
}
function slotColor(group,index){return currentVessel()?.[group==='deep'?'deepSlots':'normalSlots']?.[index]||'Any'}
function equippedIndexes(){return [...state.equipped.normal,...state.equipped.deep].filter(i=>i!==null)}
function canEquip(index,group,slot){
  const r=state.save?.relics?.[index];if(!r)return false;
  if(group==='deep'&&relicType(r)!=='DeepRelic')return false;
  if(group==='normal'&&!['Relic','UniqueRelic'].includes(relicType(r)))return false;
  const color=slotColor(group,slot);return color==='Any'||r.itemColor===color;
}
function equipRelic(index,group,slot){
  if(!canEquip(index,group,slot)){$('#equip-status').textContent='这件遗物的类型或颜色与该槽位不符。';return}
  for(const key of ['normal','deep'])state.equipped[key]=state.equipped[key].map(i=>i===index?null:i);
  state.equipped[group][slot]=index;state.selectedRelicIndex=null;state.activeSlot={group,index:slot};state.slotFilterActive=true;
  $('#equip-status').textContent=`已装配 ${relicName(state.save.relics[index])}。`;renderBuildWorkspace();
}
function activateSlot(group,index){
  state.activeSlot={group,index};state.slotFilterActive=true;state.poolPage=1;
  $('#pool-search').value='';for(const id of ['pool-category','pool-type','pool-color'])$('#'+id).value='all';
}
function renderBuildWorkspace(){
  if(!state.vessels||!$('#loadout-slots'))return;
  const vessel=currentVessel();if(!vessel)return;
  const combined=$('#build-mode').value==='combined';
  renderVesselPicker();
  $('#loadout-slots').innerHTML=['normal',...(combined?['deep']:[])].map(group=>`<div class="slot-group"><h3>${group==='normal'?'普通遗物':'深夜遗物'}</h3><div class="slot-row">${(vessel[group==='deep'?'deepSlots':'normalSlots']||[]).map((color,i)=>{const index=state.equipped[group][i],r=index===null?null:state.save?.relics?.[index],active=state.slotFilterActive&&state.activeSlot.group===group&&state.activeSlot.index===i;return `<div class="loadout-slot color-${esc(color.toLowerCase())} ${active?'active':''}" data-group="${group}" data-slot="${i}" ${r?'draggable="true"':''} tabindex="0" role="button" aria-label="${group==='normal'?'普通':'深夜'}第 ${i+1} 槽，${esc(colorZh[color]||color)}色${r?'，已装配'+esc(relicName(r)):''}"><span class="slot-color">${esc(colorZh[color]||color)} · ${i+1}</span>${r?`<div class="slot-relic">${relicImage(r)}</div><button type="button" class="slot-remove" aria-label="卸下${esc(relicName(r))}">×</button>`:'<span class="slot-placeholder">＋</span>'}</div>`}).join('')}</div></div>`).join('');
  renderLoadoutSummary();renderPool();
}
function renderLoadoutSummary(){
  const combined=$('#build-mode').value==='combined',indices=[...state.equipped.normal,...(combined?state.equipped.deep:[])].filter(i=>i!==null);
  const counts=new Map();for(const group of ['normal',...(combined?['deep']:[])])for(const index of state.equipped[group])if(index!==null)for(const e of effectGroups(state.save?.relics?.[index]||{})){const key=e.key+'@@'+group;counts.set(key,(counts.get(key)||0)+1)}
  const {group:activeGroup,index:activeSlot}=state.activeSlot,details=[];
  for(const group of ['normal',...(combined?['deep']:[])])state.equipped[group].forEach((relicIndex,index)=>{if(relicIndex===null)return;details.push({group,index,relic:state.save?.relics?.[relicIndex],active:group===activeGroup&&index===activeSlot})});
  const detailRoot=$('#loadout-effects'),validDetails=details.filter(item=>item.relic);detailRoot.dataset.count=String(validDetails.length);
  detailRoot.innerHTML=validDetails.length?validDetails.map(({group,index,relic,active})=>`<section class="game-relic-detail ${active?'active':''}" data-detail-group="${group}" data-detail-slot="${index}"><header>${relicImage(relic)}<div><small>${group==='normal'?'普通':'深夜'} · ${esc(colorZh[relic.itemColor]||relic.itemColor)}色 · 第 ${index+1} 槽</small><strong>${esc(relicName(relic))}</strong></div></header><div class="game-effect-list">${renderEffectRows(relic)}</div></section>`).join(''):'<div class="game-relic-empty">已装配的遗物详情会显示在这里。</div>';
  if(!state.selectedEffects.size){$('#loadout-score').textContent=`已装配 ${indices.length} / ${combined?6:3} 件 · 选择目标词条后显示匹配分`;return}
  let score=0,matched=0,missing=0;
  for(const rule of state.rules){const count=rule.scope==='any'?(counts.get(rule.key+'@@normal')||0)+(counts.get(rule.key+'@@deep')||0):(counts.get(rule.key+'@@'+rule.scope)||0);if(count){score+=(rule.priority==='exclude'?-1:1)*rule.weight*Math.min(count,rule.cap);matched++}else if(rule.priority==='required')missing++}
  $('#loadout-score').textContent=`当前目标匹配分 ${score} · 命中 ${matched} 项${missing?' · 缺少 '+missing+' 项必选':''}`;
}
function renderPool(){
  if(!state.save)return;
  const pool=$('#build-relic-pool'),pagination=$('#pool-pagination');pool.before(pagination);
  const q=$('#pool-search').value.trim().toLocaleLowerCase(),category=$('#pool-category').value,type=$('#pool-type').value,color=$('#pool-color').value,used=new Set(equippedIndexes());
  const activeEquipped=state.slotFilterActive?state.equipped[state.activeSlot.group][state.activeSlot.index]:null;
  const rows=state.save.relics.map((r,index)=>({r,index})).filter(({r,index})=>(!used.has(index)||index===activeEquipped)&&['Relic','UniqueRelic','DeepRelic'].includes(relicType(r))&&(!state.slotFilterActive||canEquip(index,state.activeSlot.group,state.activeSlot.index))&&(type==='all'||(type==='deep')===(relicType(r)==='DeepRelic'))&&(category==='all'||relicEffectCategories(r).has(category))&&(color==='all'||r.itemColor===color)&&(!q||(relicName(r)+' '+(colorZh[r.itemColor]||'')+' '+r.itemColor+' '+effectGroups(r).map(effectName).join(' ')).toLocaleLowerCase().includes(q)));
  if(activeEquipped!==null)rows.sort((a,b)=>Number(b.index===activeEquipped)-Number(a.index===activeEquipped));
  const pages=Math.max(1,Math.ceil(rows.length/POOL_PAGE_SIZE));state.poolPage=Math.min(Math.max(state.poolPage,1),pages);
  const start=(state.poolPage-1)*POOL_PAGE_SIZE,shown=rows.slice(start,start+POOL_PAGE_SIZE);
  $('#pool-count').textContent=rows.length?`第 ${start+1}–${start+shown.length} 件 / 共 ${rows.length} 件`:'0 件';
  $('#pool-slot-filter').hidden=!state.slotFilterActive;
  if(state.slotFilterActive){const {group,index}=state.activeSlot,slot=slotColor(group,index);$('#pool-slot-filter-label').textContent=`当前槽位：${group==='normal'?'普通':'深夜'}第 ${index+1} 槽 · ${colorZh[slot]||slot}色`;}
  $('#build-relic-pool').innerHTML=shown.map(({r,index})=>`<button type="button" draggable="true" class="pool-relic ${state.selectedRelicIndex===index?'selected':''} ${index===activeEquipped?'currently-equipped':''}" data-relic-index="${index}" aria-label="选择${esc(relicName(r))}，${esc(colorZh[r.itemColor]||r.itemColor)}色">${relicImage(r)}<span><strong>${esc(relicName(r))}${index===activeEquipped?' · 当前已装配':''}</strong><small>${esc(typeLabel[relicType(r)])} · ${esc(colorZh[r.itemColor]||r.itemColor)}色 · #${esc(r.id)}</small><span class="pool-effects">${pairedEffects(r).map(group=>`<span>${esc(effectName(group[0]))}${group.slice(1).map(e=>`<em>${esc(effectName(e))}</em>`).join('')}</span>`).join('')||'无已识别词条'}</span></span></button>`).join('')||'<span class="detail-note">没有匹配的可装备遗物。</span>';
  renderPagination('pool-pagination',rows.length,POOL_PAGE_SIZE,state.poolPage,true);
}
$('#pool-search').addEventListener('input',()=>{state.poolPage=1;renderPool()});for(const id of ['pool-category','pool-type','pool-color'])$('#'+id).addEventListener('change',()=>{state.poolPage=1;renderPool()});
$('#pool-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.poolPage+=Number(step.dataset.step);renderPool();$('#build-relic-pool').scrollTop=0});
$('#pool-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.poolPage=Number(e.target.value);renderPool();$('#build-relic-pool').scrollTop=0});
$('#pool-clear-slot').addEventListener('click',()=>{state.slotFilterActive=false;state.poolPage=1;state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent='已显示全部遗物；点击槽位可只看能装入的遗物。'});
$('#build-relic-pool').addEventListener('click',e=>{const item=e.target.closest('[data-relic-index]');if(!item)return;const index=Number(item.dataset.relicIndex);if(state.slotFilterActive){equipRelic(index,state.activeSlot.group,state.activeSlot.index);return}state.selectedRelicIndex=index;$('#equip-status').textContent=`已选择 ${relicName(state.save.relics[index])}，请点击一个匹配颜色的槽位。`;renderPool()});
$('#build-relic-pool').addEventListener('dragstart',e=>{const item=e.target.closest('[data-relic-index]');if(!item)return;state.dragRelicIndex=Number(item.dataset.relicIndex);e.dataTransfer.setData('text/plain',item.dataset.relicIndex);e.dataTransfer.effectAllowed='move'});
$('#loadout-slots').addEventListener('dragstart',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;const index=state.equipped[slot.dataset.group][Number(slot.dataset.slot)];if(index!==null){state.dragRelicIndex=index;e.dataTransfer.setData('text/plain',String(index))}});
$('#loadout-slots').addEventListener('dragover',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;e.preventDefault();const index=state.dragRelicIndex;if(Number.isInteger(index)&&canEquip(index,slot.dataset.group,Number(slot.dataset.slot)))slot.classList.add('drag-over');else slot.classList.remove('drag-over')});
$('#loadout-slots').addEventListener('dragleave',e=>e.target.closest('.loadout-slot')?.classList.remove('drag-over'));
$('#loadout-slots').addEventListener('drop',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;e.preventDefault();slot.classList.remove('drag-over');const index=state.dragRelicIndex;state.dragRelicIndex=null;if(Number.isInteger(index))equipRelic(index,slot.dataset.group,Number(slot.dataset.slot))});
document.addEventListener('dragend',()=>{state.dragRelicIndex=null;$$('.loadout-slot.drag-over').forEach(x=>x.classList.remove('drag-over'))});
$('#loadout-slots').addEventListener('click',e=>{const slot=e.target.closest('.loadout-slot');if(!slot)return;const group=slot.dataset.group,index=Number(slot.dataset.slot),pending=state.selectedRelicIndex;activateSlot(group,index);if(e.target.closest('.slot-remove')){state.equipped[group][index]=null;state.selectedRelicIndex=null;renderBuildWorkspace();return}if(pending!==null&&canEquip(pending,group,index))equipRelic(pending,group,index);else{state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent=`右侧显示能放入${group==='normal'?'普通':'深夜'}第 ${index+1} 槽的遗物，点击即可装配。`}});
$('#loadout-slots').addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' '||e.target.closest('.slot-remove'))return;const slot=e.target.closest('.loadout-slot');if(slot){e.preventDefault();slot.click()}});
$('#clear-save').addEventListener('click',()=>{try{sessionStorage.removeItem('nightreign-parsed-save-v2')}catch(_){}invalidateBuildResults();state.save=null;state.saveEditor=null;state.saveFileName=null;state.equipped={normal:[null,null,null],deep:[null,null,null]};state.slotFilterActive=false;$('#relic-dashboard').hidden=true;$('#build-workspace').hidden=true;$('#build-empty').hidden=false;renderBattleRecords();if(typeof renderSaveEditorUi==='function')renderSaveEditorUi();$('#save-file').value='';setSaveStatus('已清除本页解析结果，可重新选择存档。')});
function ownedEffects(){
  const map=new Map();
  for(const r of state.save?.relics||[])for(const e of effectGroups(r)){
    if(!map.has(e.key))map.set(e.key,{...e,count:0});map.get(e.key).count++;
  }
  return [...map.values()].sort((a,b)=>b.count-a.count);
}
function renderEffectOptions(){
  const q=$('#effect-search').value.trim().toLocaleLowerCase();
  const category=$('#effect-category')?.value||'all',relicMode=$('#effect-relic-mode')?.value||'all',ownedOnly=$('#effect-owned-only')?.checked||false;
  const owned=new Map(ownedEffects().map(e=>[e.key,e.count]));
  const catalog=new Map(Object.entries(state.effects?.effects||{}).filter(([id,e])=>isOutOfGameRelicEffect({...e,id})).map(([id,e])=>[e.key,{...e,id}]));
  const categoryPicker=$('#effect-category');
  if(categoryPicker&&categoryPicker.options.length===1){const categories=[...new Set([...catalog.values()].map(ruleEffectCategory))].sort((a,b)=>a.localeCompare(b,'zh-CN'));categoryPicker.insertAdjacentHTML('beforeend',categories.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join(''))}
  const list=[...catalog.values()].filter(e=>e.key&&!state.rules.some(r=>r.key===e.key)&&(!q||(ruleEffectName(e)+' '+ruleEffectCategory(e)+' '+state.relicRuleEffects.definitions[e.id].explanation+' '+e.name_en+' '+e.key).toLocaleLowerCase().includes(q))&&(category==='all'||ruleEffectCategory(e)===category)&&(relicMode==='all'||state.relicRuleEffects.definitions[e.id].modes.includes(relicMode==='normal'?'普通':'深夜'))&&(!ownedOnly||(owned.get(e.key)||0)>0)).sort((a,b)=>(owned.get(b.key)||0)-(owned.get(a.key)||0)||ruleEffectName(a).localeCompare(ruleEffectName(b),'zh-CN'));
  const pageSize=18,pages=Math.max(1,Math.ceil(list.length/pageSize));state.effectPage=Math.min(Math.max(state.effectPage||1,1),pages);
  const start=(state.effectPage-1)*pageSize,rows=list.slice(start,start+pageSize);
  $('#effect-result-count').textContent=list.length?`第 ${start+1}–${start+rows.length} 项 / 共 ${list.length} 项`:'0 项匹配';
  $('#effect-options').innerHTML=rows.map(e=>{const entry=state.relicRuleEffects.definitions[e.id];return `<button class="effect-option" data-effect="${esc(e.key)}" title="${esc(ruleEffectName(e))}"><span>${esc(ruleEffectName(e))}</span><small>${esc(entry.modes.map(mode=>mode+'遗物').join(' / '))} · ${esc(ruleEffectCategory(e))} · ${owned.get(e.key)||0} 件已拥有 · 添加 +</small></button>`}).join('')||'<div class="empty-state" style="padding:18px"><p>没有更多匹配词条</p></div>';
  renderPagination('effect-pagination',list.length,pageSize,state.effectPage);
  $$('#effect-options [data-effect]').forEach(b=>b.addEventListener('click',()=>addRule(b.dataset.effect)));
}
function renderSelectedEffects(){
  const catalog=new Map(Object.entries(state.effects?.effects||{}).filter(([id,e])=>isOutOfGameRelicEffect({...e,id})).map(([id,e])=>[e.key,{...e,id}]));
  $('#selected-count').textContent=state.rules.length+' 项规则';
  const option=(value,label,current)=>`<option value="${value}" ${current===value?'selected':''}>${label}</option>`;
  const ruleQuery=$('#selected-rule-search')?.value.trim().toLocaleLowerCase()||'';
  const shown=state.rules.map((rule,i)=>({rule,i})).filter(({rule})=>!ruleQuery||(ruleEffectName(catalog.get(rule.key)||{key:rule.key})+' '+rule.key+' '+(rule.note||'')).toLocaleLowerCase().includes(ruleQuery));
  $('#selected-effects').innerHTML=shown.map(({rule,i})=>{const modes=effectModesForKey(rule.key),allowed=modes.map(mode=>mode==='普通'?'normal':'deep');if(allowed.length>1)allowed.push('any');const scopes=allowed.length?allowed:['normal','deep','any'];return `<div class="rule-row" data-rule-index="${i}"><div class="rule-name"><strong>${esc(ruleEffectName(catalog.get(rule.key)||{key:rule.key}))}</strong><small>${esc(rule.key)}</small></div><label>条件<select data-field="priority">${option('required','必选',rule.priority)}${option('preferred','偏好',rule.priority)}${option('nice_to_have','加分',rule.priority)}${option('exclude','排除',rule.priority)}</select></label><label>生效位置<select data-field="scope">${scopes.map(scope=>option(scope,scope==='normal'?'普通':scope==='deep'?'深夜':'任意',rule.scope)).join('')}</select></label><label>权重<input data-field="weight" type="number" min="1" max="10000" step="1" value="${esc(rule.weight)}"></label><label>有效次数<input data-field="cap" type="number" min="1" max="6" step="1" value="${esc(rule.cap)}"></label><label class="rule-note">备注<input data-field="note" type="text" maxlength="160" value="${esc(rule.note||'')}" placeholder="为什么选择此词条"></label><button type="button" data-remove-rule="${i}" aria-label="删除此规则">×</button></div>`}).join('')||(ruleQuery?'<p class="hint">当前流派没有匹配的规则。</p>':'<p class="hint">搜索词条并点击添加。</p>');
  $$('#selected-effects [data-field]').forEach(x=>x.addEventListener('change',()=>{const rule=state.rules[Number(x.closest('[data-rule-index]').dataset.ruleIndex)],field=x.dataset.field;rule[field]=field==='weight'||field==='cap'?Math.max(1,Math.min(field==='cap'?6:10000,Number(x.value)||1)):x.value;syncRules();renderSelectedEffects()}));
  $$('#selected-effects [data-remove-rule]').forEach(x=>x.addEventListener('click',()=>{state.rules.splice(Number(x.dataset.removeRule),1);syncRules();renderSelectedEffects();renderEffectOptions()}));
  if($('#loadout-effects'))renderLoadoutSummary();
}
$('#effect-search').addEventListener('input',()=>{state.effectPage=1;renderEffectOptions()});
const RULE_STORAGE_KEY='nightreign-build-profiles-v2';
const LEGACY_RULE_STORAGE_KEY='nightreign-build-rules-v1';
const BEAST_CLAW_TEMPLATE=[
  {key:'changesCompatibleArmamentsIncantationToBeastClawAtStartOfExpedition',priority:'required',scope:'normal',weight:1000,cap:1,note:'兽爪蜗核心；出击武器祷告必须改为兽爪'},
  {key:'attackPowerPermanentlyIncreasedForEachEvergaolPrisonerDefeated',priority:'preferred',scope:'normal',weight:80,cap:1,note:'击败封印监牢囚犯后永久增攻；不可叠加'},
  {key:'attackPowerUpAfterDefeatingANightInvader',priority:'preferred',scope:'normal',weight:60,cap:1,note:'击败黑夜入侵者后增攻；不可叠加'}
];
function validRule(raw){
  if(!raw||typeof raw.key!=='string'||!Object.entries(state.effects?.effects||{}).some(([id,e])=>e.key===raw.key&&isOutOfGameRelicEffect({...e,id})))return null;
  const priority=['required','preferred','nice_to_have','exclude'].includes(raw.priority)?raw.priority:'preferred';
  const scope=['normal','deep','any'].includes(raw.scope)?raw.scope:'any';
  return {key:raw.key,priority,scope,weight:Math.max(1,Math.min(10000,Math.round(Number(raw.weight)||10))),cap:Math.max(1,Math.min(6,Math.round(Number(raw.cap)||1))),note:String(raw.note||'').slice(0,160)};
}
function isWeaponConversionRule(key){return typeof key==='string'&&key.startsWith('changesCompatibleArmaments')&&key.endsWith('AtStartOfExpedition')}
function effectModesForKey(key){const row=Object.entries(state.effects?.effects||{}).find(([,effect])=>effect.key===key);return row?state.relicRuleEffects?.definitions?.[row[0]]?.modes||[]:[]}
function normalizeRuleScope(key,scope){
  const modes=effectModesForKey(key),allowed=modes.map(mode=>mode==='普通'?'normal':'deep');
  if(allowed.length===1)return allowed[0];
  if(allowed.length>1)return [...allowed,'any'].includes(scope)?scope:'any';
  return ['normal','deep','any'].includes(scope)?scope:'any';
}
function syncRules(){
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));
  saveActiveRuleProfile();invalidateBuildResults();renderLoadoutSummary();
}
function profileId(){return `flow-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}
function normalizeProfile(raw,index=0){
  if(!raw||typeof raw!=='object')return null;
  const characters=[...$('#character-select').options].map(o=>o.value),candidate=String(raw.character||characters[0]||'追跡者');
  const rules=Array.isArray(raw.rules)?raw.rules.map(validRule).filter(Boolean):[];
  const normalizedRules=[...new Map(rules.map(r=>[r.key,r])).values()].map(rule=>({...rule,scope:normalizeRuleScope(rule.key,rule.scope)}));
  return {id:String(raw.id||profileId()+`-${index}`),name:String(raw.name||'未命名流派').slice(0,60),character:characters.includes(candidate)?candidate:(characters[0]||'追跡者'),rules:normalizedRules};
}
function saveRuleProfiles(){try{localStorage.setItem(RULE_STORAGE_KEY,JSON.stringify({version:2,profiles:state.ruleProfiles,activeProfileId:state.activeRuleProfileId}));return true}catch(_){return false}}
function saveActiveRuleProfile(){
  if(!state.ruleProfiles.length)return;
  const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);if(!p)return;
  p.character=$('#character-select').value;p.rules=state.rules.map(r=>({...r}));saveRuleProfiles();
}
function renderRuleProfiles(){
  const select=$('#rule-profile-select');if(!select)return;
  const query=$('#rule-profile-search')?.value.trim().toLocaleLowerCase()||'';
  const visible=state.ruleProfiles.filter(p=>p.id===state.activeRuleProfileId||!query||(p.name+' '+(characterZh[p.character]||p.character)).toLocaleLowerCase().includes(query));
  select.innerHTML=visible.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');select.value=state.activeRuleProfileId||'';
  $('#rule-profile-delete').textContent=state.ruleProfiles.length<=1?'清空规则':'删除';
  const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);$('#rule-profile-name').value=p?.name||'';
}
function activateRuleProfile(id){
  saveActiveRuleProfile();const p=state.ruleProfiles.find(x=>x.id===id);if(!p)return;
  state.activeRuleProfileId=p.id;state.rules=p.rules.map(r=>({...r}));$('#character-select').value=p.character;updateVessels();
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));state.equipped={normal:[null,null,null],deep:[null,null,null]};invalidateBuildResults();renderRuleProfiles();renderSelectedEffects();renderEffectOptions();saveRuleProfiles();
}
function restoreRules(){
  let data=null;try{data=JSON.parse(localStorage.getItem(RULE_STORAGE_KEY)||'null')}catch(_){}
  if(data?.version===2&&Array.isArray(data.profiles)){
    state.ruleProfiles=data.profiles.map(normalizeProfile).filter(Boolean);state.activeRuleProfileId=state.ruleProfiles.some(p=>p.id===data.activeProfileId)?data.activeProfileId:state.ruleProfiles[0]?.id||null;
  }
  if(!state.ruleProfiles.length){
    let old=null;try{old=JSON.parse(localStorage.getItem(LEGACY_RULE_STORAGE_KEY)||'null')}catch(_){}
    const profile=old&&Array.isArray(old.rules)?normalizeProfile({id:profileId(),name:'默认流派',character:old.character,rules:old.rules}):normalizeProfile({id:profileId(),name:'复仇者·兽爪蜗',character:'復讐者',rules:BEAST_CLAW_TEMPLATE});
    state.ruleProfiles=[profile];state.activeRuleProfileId=profile.id;
  }
  const active=state.ruleProfiles.find(p=>p.id===state.activeRuleProfileId);state.rules=(active?.rules||[]).map(r=>({...r}));$('#character-select').value=active?.character||'追跡者';updateVessels();
  state.selectedEffects=new Map(state.rules.map(r=>[r.key,r.priority]));renderRuleProfiles();saveRuleProfiles();renderSelectedEffects();renderEffectOptions();
}
function addRule(key){const row=Object.entries(state.effects?.effects||{}).find(([,e])=>e.key===key);if(!row||!isOutOfGameRelicEffect({...row[1],id:row[0]})||state.rules.some(r=>r.key===key))return;if(isWeaponConversionRule(key)&&state.rules.some(rule=>isWeaponConversionRule(rule.key))){$('#rule-io-status').textContent='出击时的武器转换词条只保留第一条；已保留当前规则。';return}const e=row[1],modes=state.relicRuleEffects.definitions[row[0]].modes,relicMode=$('#effect-relic-mode').value;const scope=modes.length===1?(modes[0]==='普通'?'normal':'deep'):relicMode==='normal'?'normal':relicMode==='deep'?'deep':'any';state.rules.push({key,priority:'preferred',scope,weight:10,cap:e.stackable===true?3:1,note:''});syncRules();renderSelectedEffects();renderEffectOptions()}
function effectiveRules(){let conversionUsed=false;return state.rules.filter(rule=>{if(!isWeaponConversionRule(rule.key))return true;if(conversionUsed)return false;conversionUsed=true;return true})}
function buildSpecs(){return effectiveRules().map((r,rank)=>({key:r.key,priority:r.priority==='exclude'?'required':r.priority,exclude:r.priority==='exclude',scope:normalizeRuleScope(r.key,r.scope),weight:r.weight,cap:r.cap,rank}))}
const ruleTools=document.createElement('div');ruleTools.className='rule-tools';ruleTools.innerHTML='<div class="rule-tools-heading"><strong>流派规则表</strong><p class="hint">候选区只列 <a href="https://github.com/xxiixi/NightreignQuickRef/tree/main/src/data/zh-CN" target="_blank" rel="noopener">NightreignQuickRef</a> 的局外遗物词条，可按普通／深夜遗物和词条类型筛选；局内词条不加载、不展示。出击时武器转换只按首条生效，推荐尽量命中更多有效词条。</p></div><div class="profile-controls"><label>当前流派<select id="rule-profile-select" aria-label="当前流派"></select></label><label class="profile-name">流派名称<input id="rule-profile-name" maxlength="60" placeholder="例如：复仇者·兽爪蜗"></label><button type="button" id="rule-profile-new" class="button ghost">新建</button><button type="button" id="rule-profile-duplicate" class="button ghost">复制</button><button type="button" id="rule-profile-delete" class="button ghost">删除</button></div><div class="rule-tool-buttons"><button type="button" id="rule-clear" class="button ghost">清空当前规则</button><button type="button" id="rule-import" class="button ghost">导入 JSON</button><button type="button" id="rule-export" class="button ghost">导出全部流派</button><input id="rule-file" type="file" accept=".json,application/json" hidden></div><p id="rule-io-status" role="status" aria-live="polite"></p>';
ruleTools.querySelector('.profile-controls').insertAdjacentHTML('afterbegin','<label class="profile-filter">查找流派<input id="rule-profile-search" type="search" placeholder="名称或渡夜者"></label>');
ruleTools.querySelector('.profile-controls').insertAdjacentHTML('beforeend','<button type="button" id="rule-profile-save" class="button primary">保存当前流派</button>');
$('.effect-header').after(ruleTools);
$('.effect-header .card-kicker').textContent='配装工作区';$('.effect-header h3').textContent='规则与推荐';
const aiRelicAdvisor=document.createElement('section');
aiRelicAdvisor.className='ai-relic-advisor';
aiRelicAdvisor.innerHTML='<div class="ai-advisor-heading"><div><span class="card-kicker">DEEPSEEK / BUILD ASSISTANT</span><h3>AI 遗物搭配助手</h3></div><span class="ai-scope-badge">仅限配装咨询</span></div><p class="hint">描述你的角色、武器或战斗需求。每次限 240 字，每分钟最多 5 次；仅发送遗物摘要和本次问题，不会上传原始存档或保存聊天记录。</p><form id="ai-relic-form"><label>你的问题<textarea id="ai-relic-question" maxlength="240" minlength="8" required placeholder="例如：复仇者使用兽爪，希望提高近战输出，同时保留一定生存能力。问题需围绕角色、武器、遗物、词条或战斗配装。"></textarea></label><div class="ai-advisor-actions"><span id="ai-question-count">0 / 240 字</span><button id="ai-relic-submit" type="submit" class="button primary">生成配装建议</button></div></form><p id="ai-relic-status" class="hint" role="status" aria-live="polite">请先读取存档，AI 才能从你拥有的遗物中搭配。</p><div id="ai-relic-result" hidden></div><button id="ai-relic-apply" type="button" class="button primary" hidden>应用方案到装配槽</button>';
ruleTools.insertAdjacentElement('afterend',aiRelicAdvisor);
$('#effect-search').closest('.search-field').insertAdjacentHTML('beforebegin','<div class="effect-selection-heading"><strong>词条选择</strong><span>先筛选普通或深夜词条，再添加到流派规则表</span></div>');
$('#effect-search').closest('.search-field').insertAdjacentHTML('afterend','<div class="effect-filter-bar"><label>遗物种类<select id="effect-relic-mode"><option value="normal">普通遗物</option><option value="deep">深夜遗物</option><option value="all">全部局外遗物</option></select></label><label>词条类型<select id="effect-category"><option value="all">全部类型</option></select></label><label class="effect-owned-filter"><input id="effect-owned-only" type="checkbox"> 只看存档持有</label><span id="effect-result-count" role="status"></span></div>');
$('#effect-options').insertAdjacentHTML('afterend','<div id="effect-pagination" class="pagination" aria-label="候选词条页数" hidden></div><label class="selected-rule-filter">筛选已选规则<input id="selected-rule-search" type="search" placeholder="搜索词条或备注"></label>');
$('#selected-effects').insertAdjacentHTML('beforebegin','<div class="rule-columns" aria-hidden="true"><span>目标词条</span><span>条件</span><span>生效位置</span><span>权重</span><span>有效次数</span><span>备注</span><span></span></div>');
$('.scoring-details > div').innerHTML='<p>必选是硬条件，缺少任意必选词条的组合不会被推荐；偏好和加分按权重计分。普通、深夜、任意决定词条在哪类遗物上生效；排除词条出现时组合不合格。</p><p>有效次数限制该词条参与评分的次数；不可叠加效果设为 1。每个流派可以指定不同角色和规则。评分根据规则匹配、有效次数与槽位可装配情况计算。</p>';
$('#rule-profile-select').addEventListener('change',e=>activateRuleProfile(e.target.value));
$('#rule-profile-search').addEventListener('input',renderRuleProfiles);
$('#rule-profile-save').addEventListener('click',()=>{const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);if(!p)return;p.name=$('#rule-profile-name').value.trim()||'未命名流派';p.character=$('#character-select').value;p.rules=state.rules.map(r=>({...r}));const saved=saveRuleProfiles();renderRuleProfiles();$('#rule-io-status').textContent=saved?`“${p.name}”已保存到当前浏览器（${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}）。建议导出 JSON 备份。`:'保存失败：浏览器不允许本地存储，请使用“导出全部流派”备份。'});
$('#effect-category').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-relic-mode').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-owned-only').addEventListener('change',()=>{state.effectPage=1;renderEffectOptions()});
$('#effect-pagination').addEventListener('click',e=>{const step=e.target.closest('[data-step]');if(!step)return;state.effectPage+=Number(step.dataset.step);renderEffectOptions();$('#effect-options').scrollTop=0});
$('#effect-pagination').addEventListener('change',e=>{if(e.target.tagName!=='SELECT')return;state.effectPage=Number(e.target.value);renderEffectOptions();$('#effect-options').scrollTop=0});
$('#selected-rule-search').addEventListener('input',renderSelectedEffects);
$('#rule-profile-name').addEventListener('change',e=>{const p=state.ruleProfiles.find(x=>x.id===state.activeRuleProfileId);if(p){p.name=e.target.value.trim()||'未命名流派';renderRuleProfiles();saveRuleProfiles()}});
$('#rule-profile-new').addEventListener('click',()=>{saveActiveRuleProfile();const p={id:profileId(),name:'新流派',character:$('#character-select').value,rules:[]};state.ruleProfiles.push(p);activateRuleProfile(p.id);$('#rule-profile-name').focus();$('#rule-io-status').textContent='已新建空白流派，请设置名称、角色和目标词条。'});
$('#rule-profile-duplicate').addEventListener('click',()=>{saveActiveRuleProfile();const src=state.ruleProfiles.find(p=>p.id===state.activeRuleProfileId);if(!src)return;const p={...src,id:profileId(),name:`${src.name}（副本）`,rules:src.rules.map(r=>({...r}))};state.ruleProfiles.push(p);activateRuleProfile(p.id);$('#rule-io-status').textContent='已复制当前流派，可独立修改副本。'});
$('#rule-profile-delete').addEventListener('click',()=>{if(state.ruleProfiles.length<=1){state.rules=[];syncRules();renderSelectedEffects();renderEffectOptions();$('#rule-io-status').textContent='已清空最后一个流派的规则；流派本身已保留。';return}saveActiveRuleProfile();const i=state.ruleProfiles.findIndex(p=>p.id===state.activeRuleProfileId);state.ruleProfiles=state.ruleProfiles.filter(p=>p.id!==state.activeRuleProfileId);const next=state.ruleProfiles[Math.max(0,i-1)].id;state.activeRuleProfileId=null;activateRuleProfile(next);$('#rule-io-status').textContent='当前流派已删除。'});
$('#rule-clear').addEventListener('click',()=>{state.rules=[];syncRules();renderSelectedEffects();renderEffectOptions();$('#rule-io-status').textContent='当前流派规则已清空。'});
let pendingAiRelicPlan=null;
const aiQuestion=$('#ai-relic-question'),aiQuestionCount=$('#ai-question-count');
aiQuestion.addEventListener('input',()=>{aiQuestionCount.textContent=`${Array.from(aiQuestion.value).length} / 240 字`});
const aiKnowledgeStorageKey='nightreign_ai_build_knowledge_v1';
function parseAiKnowledge(input){return input.value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean)}
function updateAiKnowledgeStatus(input,count){
  const rules=parseAiKnowledge(input),tooLong=rules.find(rule=>Array.from(rule).length>300);
  try{localStorage.setItem(aiKnowledgeStorageKey,input.value)}catch(_){count.textContent='本机存储失败'}
  count.textContent=tooLong?'单条规则不能超过 300 字':rules.length>30?'最多保存 30 条规则':`本机已保存 · ${rules.length}/30 条`;
  count.classList.toggle('error',Boolean(tooLong||rules.length>30));
}
// 知识库界面暂时隐藏；保留原本机数据与辅助逻辑，便于日后恢复。
function setAiRelicStatus(message,error=false){const status=$('#ai-relic-status');status.textContent=message;status.classList.toggle('error',error)}
function describeAiPlan(plan,inventory){
  const names=new Map(inventory.map(relic=>[String(relic.id),relic.name]));
  const sections=[['normal','普通遗物'],['deep','深夜遗物']].filter(([group])=>plan[group]?.length);
  $('#ai-relic-result').innerHTML=`<p class="ai-plan-summary"></p>${sections.map(([group,label])=>`<div class="ai-plan-group"><strong>${label}</strong>${plan[group].map(item=>`<p><b>${item.index+1} 槽 · ${item.relic_id?esc(names.get(String(item.relic_id))||'未识别遗物'):'暂留空'}</b><span>${esc(item.reason||'')}</span></p>`).join('')}</div>`).join('')}`;
  $('#ai-relic-result .ai-plan-summary').textContent=plan.summary;
  $('#ai-relic-result').hidden=false;$('#ai-relic-apply').hidden=false;
}
$('#ai-relic-form').addEventListener('submit',async event=>{
  event.preventDefault();pendingAiRelicPlan=null;$('#ai-relic-result').hidden=true;$('#ai-relic-apply').hidden=true;
  if(!state.save?.relics?.length){setAiRelicStatus('请先在“遗物仪式”读取存档。',true);return}
  const question=aiQuestion.value.trim();if(question.length<8||question.length>240){setAiRelicStatus('问题需填写 8–240 字。',true);return}
  const vessel=currentVessel();if(!vessel){setAiRelicStatus('当前供具信息不可用，请重新选择角色或供具。',true);return}
  const character=$('#character-select').value,combined=$('#build-mode').value==='combined';
  const slots=[...(vessel.normalSlots||[]).map((color,index)=>({group:'normal',index,color})),...(combined?(vessel.deepSlots||[]).map((color,index)=>({group:'deep',index,color})):[])];
  const inventory=state.save.relics.map(relic=>({id:String(relic.id),name:relicName(relic),kind:relicType(relic)==='DeepRelic'?'deep':'normal',color:['Red','Blue','Yellow','Green','Any'].includes(relic.itemColor)?relic.itemColor:'Any',effects:effectGroups(relic).map(effect=>ruleEffectName(effect)).filter(Boolean).slice(0,12)}));
  const ruleEffects=Object.entries(state.effects?.effects||{});
  const rules=effectiveRules().map(rule=>{const [id,effect]=ruleEffects.find(([,entry])=>entry.key===rule.key)||[];return {effect:id?ruleEffectName({...effect,id}):rule.key,priority:rule.priority,scope:normalizeRuleScope(rule.key,rule.scope)}});
  const body={character:characterZh[character]||character,vessel:vesselName($('#vessel-select').value,character),question,slots,rules,inventory};
  const button=$('#ai-relic-submit');button.disabled=true;setAiRelicStatus('正在根据你的遗物清单生成配装建议…');
  try{
    const response=await fetch(`${window.NIGHTREIGN_AI_API_BASE||''}/api/ai/recommend`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const contentType=response.headers.get('content-type')||'';
    if(!contentType.includes('application/json')){
      const raw=await response.text();
      if(response.status===500||!raw.trim())throw new Error('本地 FastAPI 服务未启动或无法连接（默认端口 8000）。请按 backend/README.md 启动后端。');
      if(response.status===404)throw new Error('找不到 AI 接口，请检查 FastAPI 地址配置。');
      throw new Error(`AI 服务返回了非 JSON 响应（HTTP ${response.status}），请检查后端地址和运行状态。`);
    }
    let result;try{result=await response.json()}catch(_){throw new Error('AI 服务返回的数据格式异常，请检查后端日志。')}
    if(!response.ok)throw new Error(result.detail||'AI 请求失败，请稍后重试。');
    pendingAiRelicPlan={plan:result,inventory,characterId:character,vesselKey:$('#vessel-select').value,mode:$('#build-mode').value};
    describeAiPlan(result,inventory);setAiRelicStatus('建议已生成；点击“应用方案”后才会替换装配预览。');
  }catch(error){setAiRelicStatus(error.message||'AI 请求失败，请检查 API 服务是否启动。',true)}
  finally{button.disabled=false}
});
$('#ai-relic-apply').addEventListener('click',()=>{
  if(!pendingAiRelicPlan||!state.save)return;
  if(pendingAiRelicPlan.characterId!==$('#character-select').value||pendingAiRelicPlan.vesselKey!==$('#vessel-select').value||pendingAiRelicPlan.mode!==$('#build-mode').value){setAiRelicStatus('角色、供具或组合模式已改变，请重新生成建议。',true);return}
  const next={normal:[...state.equipped.normal],deep:[...state.equipped.deep]},used=new Set();
  for(const group of ['normal','deep'])for(const choice of pendingAiRelicPlan.plan[group]||[]){
    const index=choice.relic_id===null?null:state.save.relics.findIndex(relic=>String(relic.id)===String(choice.relic_id));
    if(index!==null&&(index<0||used.has(index)||!canEquip(index,group,choice.index))){setAiRelicStatus('方案校验失败：遗物不在当前清单中，或与槽位不匹配。请重新生成建议。',true);return}
    if(index!==null)used.add(index);next[group][choice.index]=index;
  }
  state.equipped=next;state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent='AI 配装建议已应用到装配预览，可继续手动调整。';setAiRelicStatus('方案已应用到装配预览；尚未写入存档。');
});
$('#rule-export').addEventListener('click',()=>{saveActiveRuleProfile();const data={version:2,profiles:state.ruleProfiles,activeProfileId:state.activeRuleProfileId};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='nightreign-build-profiles.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#rule-io-status').textContent='已导出全部流派规则；文件不含存档数据。'});
$('#rule-import').addEventListener('click',()=>$('#rule-file').click());
$('#rule-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw new Error('规则文件过大');const data=JSON.parse(await file.text());let profiles;if(data.version===2&&Array.isArray(data.profiles)){profiles=data.profiles.map(normalizeProfile).filter(Boolean);if(!profiles.length)throw new Error('文件中没有有效流派')}else if(data.version===1&&Array.isArray(data.rules)){const rules=data.rules.map(validRule);if(rules.some(r=>!r)||new Set(rules.map(r=>r.key)).size!==rules.length)throw new Error('包含未知或重复词条');profiles=[normalizeProfile({id:profileId(),name:'导入流派',character:data.character,rules})]}else throw new Error('不是受支持的规则文件');state.ruleProfiles=profiles;state.activeRuleProfileId=null;const next=profiles.some(p=>p.id===data.activeProfileId)?data.activeProfileId:profiles[0].id;activateRuleProfile(next);saveRuleProfiles();$('#rule-io-status').textContent=`已导入 ${profiles.length} 个流派。`}catch(err){$('#rule-io-status').textContent='导入失败：'+err.message}finally{e.target.value=''}});
function stackingData(){const map={};for(const e of Object.values(state.effects.effects||{})){const key=e.key,v=e.stackable===true?true:e.stackable==='conditional'?'conditional':false;if(!(key in map)||v===true||v==='conditional'&&map[key]===false)map[key]=v}return map}
function renderBuildResult(data){
  const results=(data.allResults?.flatMap(x=>x.results||[])||[]).filter(x=>x.requiredMet);
  state.buildResults=results.slice(0,10);
  $('#build-results').innerHTML=state.buildResults.length?state.buildResults.map((x,i)=>{const vessel=x.vessel||{};const renderRelic=r=>{const owned=state.save.relics.find(own=>String(own.id)===String(r.id))||r;return `<div class="build-relic"><div class="build-relic-main">${relicImage(owned)}<div><strong>${esc(relicName(owned))} · #${esc(r.id)}</strong><small>${esc(relicCategory(owned))}</small><div class="game-effect-list compact">${renderEffectRows(owned)}</div></div></div></div>`};return `<article class="build-result"><header><h3>方案 ${i+1} · ${esc(vesselName(vessel.key,$('#character-select').value))}</h3><strong class="score">${esc(fmt(x.score))} 分</strong></header><p class="meta">已覆盖必选词条 · 命中 ${(x.matchedEffects||[]).length} 项目标</p><div class="build-relics"><div><h4>普通遗物</h4>${(x.normalRelics||x.relics||[]).map(renderRelic).join('')||'<span class="detail-note">无</span>'}</div><div><h4>深夜遗物</h4>${(x.deepRelics||[]).map(renderRelic).join('')||'<span class="detail-note">当前模式未使用</span>'}</div></div><button type="button" class="button ghost apply-build" data-build-index="${i}">在上方槽位预览此方案 ↗</button></article>`}).join(''):'<div class="note-panel"><span class="note-icon">i</span><div><strong>没有满足全部必选条件的组合</strong><p>请检查存档里是否有必选词条，以及供具颜色是否能装入对应遗物。</p></div></div>';
}
function placeRecommended(relics,colors){
  const indexes=relics.map(r=>state.save.relics.findIndex(own=>String(own.id)===String(r.id)));
  if(indexes.some(i=>i<0))return null;
  const placed=Array(colors.length).fill(null),used=new Set();
  function next(slot){if(slot===indexes.length)return true;for(let i=0;i<colors.length;i++){if(used.has(i))continue;const color=colors[i],relic=state.save.relics[indexes[slot]];if(color!=='Any'&&relic.itemColor!==color)continue;placed[i]=indexes[slot];used.add(i);if(next(slot+1))return true;used.delete(i);placed[i]=null}return false}
  return next(0)?placed:null;
}
$('#build-results').addEventListener('click',e=>{const btn=e.target.closest('[data-build-index]');if(!btn)return;const result=state.buildResults[Number(btn.dataset.buildIndex)];if(!result||!state.save)return;
  const vessel=result.vessel?.key;if(vessel&&[...$('#vessel-select').options].some(option=>option.value===vessel))$('#vessel-select').value=vessel;
  const config=currentVessel(),normal=placeRecommended(result.normalRelics||result.relics||[],config.normalSlots),deep=$('#build-mode').value==='combined'?placeRecommended(result.deepRelics||[],config.deepSlots):[null,null,null];
  if(!normal||!deep){$('#build-status').textContent='此方案无法放入当前供具槽位，请更换供具后重试。';return}
  state.equipped={normal,deep};state.selectedRelicIndex=null;renderBuildWorkspace();$('#equip-status').textContent='已在上方槽位预览推荐方案，可继续拖拽调整。';$('#loadout-slots').scrollIntoView({behavior:'smooth',block:'center'});
});
$('#run-build').addEventListener('click',()=>{
  if(!state.save)return navigate('relics');
  if(!state.rules.length){$('#build-status').textContent='请先添加至少一项规则。';return}
  if($('#build-mode').value==='normal'&&state.rules.some(r=>r.scope==='deep'&&r.priority==='required')){$('#build-status').textContent='仅普通模式无法满足“深夜必选”规则，请切换组合模式或调整规则。';return}
  if(state.worker)state.worker.terminate();
  const btn=$('#run-build');btn.disabled=true;$('#build-status').textContent='正在计算供具槽位与遗物组合…';$('#build-results').innerHTML='';
  const worker=new Worker('./relic-optimizer.js');state.worker=worker;
  worker.onmessage=e=>{const d=e.data;if(d.progress){$('#build-status').textContent=`正在计算 ${d.progress.current}/${d.progress.total} 个供具…`;return}btn.disabled=false;worker.terminate();state.worker=null;if(d.error){$('#build-status').textContent='计算失败：'+d.error;return}renderBuildResult(d.result);$('#build-status').textContent=state.buildResults.length?`计算完成 · ${state.buildResults.length} 套满足必选条件的组合`:'没有满足全部必选条件的组合';};
  worker.onerror=e=>{btn.disabled=false;worker.terminate();state.worker=null;$('#build-status').textContent='计算失败：'+e.message};
  worker.postMessage({relics:state.save.relics,effectSpecs:buildSpecs(),vesselsData:state.vessels,stackingData:stackingData(),params:{character:$('#character-select').value,vessel:$('#vessel-select').value||undefined,combined:$('#build-mode').value==='combined',candidates:25,top:10}});
});

loadCatalogs();navigate(location.hash.slice(1)||'overview');
