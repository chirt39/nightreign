# 数据来源与核对台账

现有 [README](../README.md) 记录了主要资料来源；本文件将其转成可执行的核对要求。外部网页、截图和表格是证据，不是覆盖游戏版本与全部怪物的保证。

| 数据集 | 当前静态文件／代码 | 现有来源 | 必须核对的事项 |
| --- | --- | --- | --- |
| 怪物属性与抗性 | `public/enemy-data.json` | 夜之数据 Wiki、用户提供的 Boss 倍率表 | ID、同名变体、魔火雷圣倍率、异常抗性、遭遇位置、版本 |
| DLC 怪物出现地点 | `public/enemy-data.json` 的 `extraLocations` | 游戏 1.3.3.0、regulation 10350000 的地图方案、据点模板与 MSB 敌人配置 | 地点按图鉴来源 ID 关联。表内记录的是可出现的敌人，不能用模板里的摆放数量推算每局数量。 |
| 遗物基础数据 | `public/items_data.json`、`public/relic_catalog_zh.json` | ERN_RelicForge、Biligame、5gamers | 道具 key、中文名、图片、普通／深夜／独特、专属或夜王类型 |
| 深夜遗物共用的普通词条 | `public/relic_effect_cross_mode.json`，生成脚本 `scripts/build_relic_effect_cross_mode.py` | Steam Build 22818764，参数版本 10350000。引用本地提取的 EquipParamAntique、AttachEffectTableParam 和 AttachEffectParam | 2026-11-11 遗物与配装及总控核对。按正负槽位和有效抽选权重确认 ID，再与普通、深夜局外图鉴核对。本次收录 167 个正面 ID。公开清单仅含数字 ID，原生参数和文本保留在本地。 |
| 词条与分类 | `public/effects_data.json`、`public/effect_names_zh.json`、`public/quickref_effects_zh.json`、`public/relic_rule_effects.json`、`public/effect_encyclopedia.json` | 夜之数据 Wiki、NightreignQuickRef（图鉴快照固定为提交 `3e23450094c18125ae5665927ed240b18189a040`） | 原始效果 ID、等级、中文文案、局内／局外、深夜局内／深夜局外、负面配对、可叠加性 |
| 器皿 | `public/vessels_data.json` | ERN_RelicForge、人工中文对照 | 槽位顺序、颜色、角色限制 |
| 存档结构与战绩 | `public/relic-parser.js`、`public/save-editor.js` | 当前实现、游戏样本、逆向证据 | 文件版本、字段偏移、类型、数值边界、与游戏画面逐项一致 |
| 图片 | `public/enemy-images/`、`public/enemy-image-map.json`、`public/enemy-image-verified.json`、`public/relic-images/`、`public/character-images/`、`public/nav-icons/` | 用户提供与第三方页面；首批怪物图的 Bilibili Wiki 外观参考与逐项状态见 [ENEMY_IMAGES.md](ENEMY_IMAGES.md) | 精确 ID 对应、来源、许可、缺失时不显示图片；来源或许可未知时如实标记 |

每条新增或修正记录至少登记：稳定 ID、中文显示名、原始值、来源 URL 或本地样本代号、游戏版本、核对日期、核对人、状态（待核对／已核对／有争议）。推断值必须注明推断方法。没有依据时显示“未收录”，不得用 0 冒充缺失值。

遗物词条补录以 Steam Build 22818764（参数版本 10350000）为依据。遗物与配装、存档与逆向及总控按词条 ID 核对了 7 个新增深夜条目和 33 个原有局外条目。核对依据随每条记录存放在 `scripts/data/relic_glossary_*.json`，同步 QuickRef 时一并应用到图鉴。游戏简中遗物词条同名，网站按实际道具名区分：6623200「漫绿结晶露滴」基础效果为精力上限 +15%，6621700「涌绿结晶露滴」为精力恢复速度 +15 点/秒，均持续 120 秒。玩家提供的[神攻略遗物效果](https://kamikouryaku.net/nightreign_eldenring/?%E9%81%BA%E7%89%A9%E5%8A%B9%E6%9E%9C#be19fc74)作为参考入口，本次未能读取其正文。

### DLC 怪物地点的复核

[地点对照表](../scripts/data/enemy_dlc_location_evidence.json)按图鉴来源 ID 记录关联依据。对照表仅登记出现地点。具名遭遇可以对应同种怪物的一张图鉴卡，战斗数值仍取卡片原有的来源行。

图鉴的列表、详情和区域筛选读取同一组展示地点。大空洞据点按场景和地图方案区分，例如掳人少女人偶在普通地图显示「小型要塞」，在大空洞显示「大教堂（大空洞）」。后者通过同种怪物的场景配置关联到卡片，不能据此把小型要塞记录的数值归给这座大教堂。「地点与记录差异」只使用能对应到该条数值来源的地点。

- 大空洞按地图方案的地形值 4 查得 94 个据点模板。用模板 MSB 的敌人配置编号与图鉴来源编号对应。对照表为每个命中的来源 ID 留有一组地图方案、附着点、模板和敌人部件。例如方案 1005 的附着点 1103 对应模板 4654，卡利亚禁卫骑士的原生 NPC 编号为 32520010，图鉴原野记录为 `32520010a`。
- 沼泽对应模板 5000–5006，锻造村对应 5010、5011。16 个原生 NPC 编号可直接关联已有图鉴记录。另外五种怪物由简中遭遇名、事件指定的实体或组、MSB 成员和图鉴角色配置共同定位。
- 本地工作区的 `outputs/enemy-great-hollow` 和 `outputs/enemy-dlc-locations` 保存了提取脚本、模板清单和逐项证据。涉及的游戏档案、完整场景和事件留在本地。静态配置能证明一种遭遇可能出现，实战刷新仍由本局配置决定。

### 本体与 DLC 怪物、场景对账

游戏版本为 1.3.3.0，参数版本为 10350000。本地解析从五个已安装档案的资源索引出发，结合地图参数、资源路径清单及标准场景名扫描。此次命中的 402 个 MSB 和 278 个事件文件均已解析。场景内有 7,476 条敌人摆放和 1,225 条占位摆放。NPC 参数表的 3,016 行、345 个原生字段与 XML 的行值及字段默认值逐格一致。

公开怪物图鉴收录怪物属性记录。群体血条的成员关系保存在本地事件对账中，成员各自收录在对应的怪物卡。魔法师塔及其大空洞版本不作为怪物地点收录，两个塔共用的闪电光球来源 `21500400` 已移除。地图模板里出现的敌人可能受波次、事件开关或出击方案约束。普通、灾域和夜王形态继续按怪物图鉴原有要求展示。

社区地图别名和用于比对的英文配置名来自 [Smithbox 固定版本](https://github.com/vawser/Smithbox/tree/610d3412c1d9433749720eab9739f8911b1b8fe9/src/Smithbox.Data/Assets)，上游许可见 [Smithbox-LICENSE.txt](../scripts/data/Smithbox-LICENSE.txt)。游戏简中术语来自本机同版本文本。

工作区 `outputs/enemy-full-audit/native` 保存逐场景摆放、事件指令、血条、条件与无法对应的引用。`outputs/enemy-full-audit/atlas` 保存每个 NPC 编号的识别结果和去向。`outputs/enemy-full-audit/review` 提供可离线检索的完整参数、按地点整理的预览清单及本次核对脚本。玩家图鉴的卡片数与参数表行数按各自口径统计。

从仓库根目录使用已解包的同版本文件重新生成：

```powershell
python scripts/build_enemy_atlas.py `
  --native-csv ../outputs/nightreign-data-20261109/csv/NpcParam.csv `
  --localized-csv ../outputs/nightreign-data-20261109/localized/csv/NpcParam.zh-CN.csv `
  --scene ../outputs/enemy-full-audit/native/scenes.jsonl `
  --encounters ../outputs/enemy-dlc-locations/named-encounters.json `
  --native-encounters ../outputs/enemy-full-audit/native/named-encounters.jsonl `
  --audit-dir ../outputs/enemy-full-audit/atlas --write
```

大空洞夜晚战斗场景中的前哨战沿用「夜晚Boss前哨战」。修正按图鉴来源记录处理，具体据点和独立首领记录各自保留。

锻造村按布局及常规首领配置区分。5010、5011 两种布局各有四种常规首领配置。5010 的第 2 种配置使用血怪之首（血条实体 50100820）。同配置布置 6 个 c3470 红色长角白金之子和 3 个 c3471 大型白金之子。逐部件记录由构建器写入审计目录的 `albinauric-forge.json`，玩家区域筛选共用「锻造村」。

## 样本管理

真实存档只在授权的本地核对环境使用，不入 Git、不上传到公开站点或任务附件。需要共享回归用例时，制作最小脱敏样例并记录生成方法。用户截图仅用于字段对照，不用截图中的数值推断其他存档的通用偏移。

## 许可与发布门槛

保留仓库中的 ERN_RelicForge MIT 与 NightreignQuickRef GPLv3 许可文本。第三方图片和数据在 GitHub 再分发前由数据对话与工程对话逐项检查许可或授权；不能确认时，记录缺口并使用可替代素材。资料说明页应链接原始来源并标示数据快照版本。
