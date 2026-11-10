# 地图方案与夜王目录的数据证据

本页对应本地预览的 `public/map-catalog.json`（`schemaVersion: 1`）。数据由 `scripts/build_map_catalog.py` 从本机《ELDEN RING NIGHTREIGN》1.3.3.0、regulation `10350000` 的参数 XML 生成。构建不读取或修改游戏目录。原始参数、提取过程和静态交叉核对证据均保存在仓库外的 `E:\海斗\outputs\nightreign-data-20261109` 与 `E:\海斗\outputs\map-nightlord-20261110`。

## 已接通的引用

| 结果 | 原生字段与验证 | 覆盖范围 |
| --- | --- | --- |
| 地图方案与夜王身份 | `LotResultMapPatternFlag.patternId/targetBoss/rareMap` → `NightBossMenuParam` 行 0–9 → 简中 `CL_MenuText`；同一方案内的 `targetBoss`、`rareMap` 均一致 | 520/520 方案；10 个首领身份。`menuRowId` 仅用于首领身份，不判定实际第三夜普通／永夜形态 |
| 第一、二夜首领 | `LotResultPlayAreaParam.patternId/bossId1/bossId2` → 35 条逐项身份覆盖；本地中英 `NpcName` 核中文名。组合首领显示成员中文名；`4840` 暂缺直接中文词条，保留空名及参考键 | 520/520 方案，18 个第一夜 ID、17 个第二夜 ID；身份覆盖的依据是按显式方案 ID 对齐的 520 条交叉核对，不是游戏运行实测 |
| 地形 | `LotResultMapPatternFlag.rareMap` 对应 0 基础、1 山顶、2 火山口、3 腐败森林、4 大空洞、5 “隐城”诺克拉缇欧 | 520/520 与参考地图类型一致；1–5 的中文名分别核本机简中 `CL_MenuText` 文本 ID `131111`、`131110`、`131112`、DLC `131114`、`131113`。0“基础地图”是描述名；底图绑定由地图资产专项核验 |
| 地图点位 | `LotResultSmallBaseAndSpot.patternId/attachId/smallBaseMapId` → `SmallBaseAndSpotAttachPoint` 的 grid 与 pos 原始坐标；`SmallBaseAndSpotDefine.mapId*` 反查地点图标 | 23,830 个方案点位。资产清单六类数字地形均标 `verified` 后，23,830 个 area 60 地表点按清单系数转成 0–1 坐标；越界不夹取，保持 `null` |
| 建筑类别 | 来源地点图标 ID → 类别；按方案比较原生各图标出现次数与原作者公开的地点类别次数 | 9,102 个点位有已核对类别。教堂、废墟、聚落、魔法师塔、大型营地、沼泽、锻造设施为 520/520 次数一致；要塞 517/520、大教堂 516/520，只作正向标签，差异待核 |
| 方案事件 | `LotResultMapPatternFlag.eventFlag` 或对应 `modifierSet=0` 的 modifier；有突袭日次时用原生 7705/7725 标志 | 251 个方案有一项事件、269 个方案已确认无这些事件，按显式方案 ID 与参考事件家族／日次 520/520 一致；事件位置未知，不绘制到任何点位 |
| 据点首领 | 17 个 `smallBaseMapId` 与参考首领键在 520 个方案中的出现集合逐项完全一致，位置仍取原生 attachId | 348 个点位（主要是大空洞）有已核对首领 ID；其他据点模板仍待核 |
| 野外精英怪 | `SmallBaseAndSpotDefine` 图标 16 与 28 对应的 22 个模板；按显式方案 ID 与参照资料的具名首领槽核对身份，位置取原生 attachId，经已验证地形系数转换 | 22 个模板、5,060 个方案点位标为 `displayCategory: fieldElite`；图标 28 模板位于城堡地下室的 390 个原始点仍保留，但不作野外精英展示或筛选。3,770 个具名野外槽可直接交叉核对且无冲突。通用 Red Wolf 用“红狼”作参考标签译名，并非官方中文名 |
| 特殊地形固定怪物参考点 | 用户提供的无名-Eisregen 标注图，与本地 1536×1536 底图用特征点配准后换算坐标；独立 `referencePoints`，含来源和 `positionAccuracy: reference` | 山顶 12 处、火山口 10 处、隐城 13 处，共 35 处，仅供显示，`filterable: false`。其中营地骑士、废墟双白金之子归 `baseBoss`，其余 33 处归 `fieldElite`。同种怪物的候选刷新位置不表示同局全部出现；腐败森林 buff、宝箱／宝藏楼及基础地图城堡 8、9 号没有加入怪物点 |

外部参照仅用于静态核对数字身份与含义：Artimuz 的 [Nightreign Seed Finder](https://nightreign-seed-finder.com/) 数据版本 `1.03.2`，经公开 [nightreign-seed-observer](https://github.com/stockholm754-source/nightreign-seed-observer) 项目安全读取为 JSON。以显式 `seed_id = patternId` 连接，而非数组顺序。没有将外部 36 槽布局、坐标、图片或整表复制到公开目录。原作者资料未声明可再分发本项目所需的授权；公开目录的事实映射保留来源、版本和核对状态，地图图片另按资产专项处理。本地游戏版本更新后须重新比对；此处的 520 条吻合不代表游戏运行时已实测。

## 筛选语义

- `patternId` 是方案主键。`nightlord.menuRowId` 与 `definitions.nightlords` 用于已知夜王正向筛图；`dayBosses.day1/day2.sourceId`、`terrain.value`、`events.values[].sourceId` 和点位 `features[].sourceId` 用同一组方案反向筛选。所有 ID 在前端按字符串比较。
- `known` 是已确认值；`known_absent` 是已确认不存在；`unknown` 是资料未覆盖。点位 `coverage[kind]` 仅在相应类别完整核对时为 `known`，其余不能据缺席排除。`features` 可同时包含原始建筑 ID、通用建筑类别、野外精英怪、据点首领，以及未知的其他怪物／事件；通用类别适用于“教堂”等用户选项。未出现的整个 attachId 目前仍按未知处理。
- 22 类野外精英怪标为 `role: fieldElite`、`displayCategory: fieldElite`，对应点位 `coverage.fieldElite=known`；城堡屋顶 `757/2757` 和地下室 `756/2756` 不纳入该角色，覆盖状态仍为 `unknown`。原有 17 类据点主首领保留 `role: primarySmallBaseBoss`、`displayCategory: baseBoss`；仅已核验的 17 个模板点位标 `coverage.primarySmallBaseBoss=known`。每个 `(patternId, attachId)` 在原生 `LotResultSmallBaseAndSpot` 中至多一个 `smallBaseMapId`。相同角色中两个已核验且不同的模板可以互斥；未知模板和缺少点位行不能据缺席排除。`coverage.monster` 始终为 `unknown`，不能据此排除同点普通怪、召唤物或事件刷怪。`referencePoints` 只有参考位置，不属于方案原生线索，不能用于排除候选。
- 原生野外精英的 `definitions.features[fieldElite:*].worldMapPointIconId` 直接取 `SmallBaseAndSpotDefine`：11 类为 `16`，11 类为 `28`。蓝／红图标由图标资产核验后按此 ID 映射。35 个截图参考点的 `worldMapPointIconId` 均为 `null`；其中 33 个野外精英参考点没有唯一的原版图标证据，不由截图编号颜色或怪物名称猜测强弱。未确定清单见仓库外 `E:\海斗\outputs\map-nightlord-20261110\data\field-elite-icon-classification.json`。
- `nightlord.form` 全部为 `unknown`；夜王菜单普通色头像不能证明深夜实战形态。`eligibility.depths` 全部为 `unknown`，没有将 `NightBossMenuParam` 的抽选权重当成地图方案适用深度。`allPlayersHaveDlc.required=true` 仅用于 DLC 夜王、稀有地形 4 与安定者突袭事件；依据[官方 1.03.1 更新说明](https://en.bandainamcoent.eu/elden-ring/news/elden-ring-nightreign-patch-notes-version-1031)和[热修说明](https://en.bandainamcoent.eu/elden-ring/news/elden-ring-nightreign-hotfix-notes-version-1031)。未提供任何概率。
- `definitions.bosses` 的组合名称由多条本机 FMG 成员名拼接，不能当作 NPC 阶段 ID。首领、野外首领、召唤物、强化体、突袭事件分属不同来源 ID；只按中文同名不能归并。

## 实际筛选链与局限

`scripts/validate_map_catalog.py` 重新读取原生表，逐方案核 `targetBoss`、地形、两夜首领与点位数；可选地读取仓库外参考 JSON 校验 520 个显式 ID、事件身份及日次，并输出 `E:\海斗\outputs\map-nightlord-20261110\data\validation.json`。验证样例：夜王格拉狄乌斯 → 50 方案；加第一夜 `4929` → 25；加第二夜 `4860` → 11；加第二夜黑夜群袭事件 `event:7724` → 2（方案 0、4）；再选附着点 113 的“废墟” → 仅方案 0。方案 4 的同一位置是“大型营地”，两者建筑类别覆盖均为 `known`，所以这是有效的反向排除。添加条件后候选集合只缩小，不会凭空增多。

主遭遇首领的有限反向例子：选夜王格拉狄乌斯与大空洞地形得 5 个方案 `1005`–`1009`；在附着点 `1111` 标记已见“英雄石像鬼们”（`fieldBoss:4917`）后，`1005` 命中，`1006` 同点为已核验的 `fieldBoss:4910`，可据主遭遇角色排除。若候选还包括 `1015`，其同点原始模板为 `4990`、尚未列入已核验 17 类，必须保留为未知，不能因没有 `4917` 标签就排除。这不声称该点没有其他普通怪。方案 `1005` 的附着点 `1156` 则来自原生 `smallBaseMapId=4657`，是单独标注的野外精英怪 `fieldElite:4657`，不可与据点首领合并筛选。

坐标变换以 `public/map-asset-manifest.json` 六类数字地形的 `coordinateTransform` 为准；构建器实际读取并核对系数、底图尺寸、area 60、层号与坐标原点，只为支持的地表点计算 `normalized`。资产专项的至少三个参照点校准及底图来源详见 `docs/MAP_ASSETS.md`。这仍是静态校准，未进行游戏运行实测。

当前未完成的关键边界：要塞与大教堂的少数版本差异；多数建筑的细分属性；常规野外怪物、召唤物及事件落点；深度对 520 方案的适用条件。点位图层只展示已校准坐标与已核对身份，不将未知身份伪装为确定。

具体待核字段：第二夜 `bossId2=4840` 的参考键是 `morgott`，但当前本机 `NpcName` 中没有与这个键直接一一对应的简中名，故 `definitions.bosses["4840"].nameZh=null`；`event:modifier:210` 的参考家族为 `mausoleum`，但尚无直接关联的简中事件文本，故同样留空。这两项原始 ID 与方案绑定仍在目录内，页面不得用相似名称自动补名。

## 复现

在仓库根目录运行 `python scripts/build_map_catalog.py`，再运行 `python scripts/validate_map_catalog.py`。若需完整静态交叉核对，可附 `--reference E:\海斗\outputs\map-nightlord-20261110\references\community-reference.json --report E:\海斗\outputs\map-nightlord-20261110\data\validation.json`。构建只写 `public/map-catalog.json`，不会触及 `dist`、游戏安装目录或服务器。
