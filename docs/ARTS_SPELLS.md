# 战技与法术目录

2026-11-12，本轮仅生成本地预览数据与原版图标，不提交、推送或部署。使用既有本机解包快照：游戏 1.3.3.0、regulation 10350000，regulation SHA256 为 `876a3ca279a4561d0c69f81fe5e510c75c59ab9a8a201694f8cf4a42c91e0268`。生成过程中不打开或修改游戏安装文件，不重新解包档案。

## 接口与数量

`public/arts-catalog.json`、`public/spells-catalog.json` 顶层均为 `{schemaVersion:1,sourceVersion,entries,summary,provenance}`。ID 使用字符串；图片为站内绝对路径。说明直接保存简中原文及换行，不用英文、日文或同名其他条目补写。

| 输出 | 当前结果 |
| --- | --- |
| 战技 | 182 条原生 SwordArtsParam ID，176 个不同中文名称；同名参数分别保留 |
| 战技武器关联 | 111 个去重的固定来源组关联、7,424 个去重的候选来源组关联 |
| 法术 | 158 条 Magic ID：65 魔法、93 祷告 |
| 图片 | 181 条战技复用既有核验图；新增 1 张战技图、158 张法术图；缺图 0 |
| 新增图片体积 | 战技图 35,940 字节，法术图 4,287,272 字节 |
| 说明 | 当前收录条目缺说明 0；生成器允许已确认有引用的战技说明为空，并在 summary 登记，不以缺说明冒充未实装 |
| 原始参数排除 | SwordArtsParam 194 条中排除 12 条；Magic 178 条中排除 20 条。排除表示本目录缺少纳入依据，不统一断言为废案或 NPC 专用 |

战技条目：

```json
{
  "id": "101",
  "name": "贯穿",
  "description": "蓄力之后，大幅度向前跨出\n从正面突破防御",
  "image": "/skill-images/8301-<hash>.webp",
  "fixedWeapons": [],
  "possibleWeapons": [{"id":"1000000","name":"匕首"}]
}
```

以上图片路径及武器数组仅示意结构，具体集合读生成文件。每个武器引用是 `weapon-catalog.json.weapons[].id` 的来源组 ID，名称也是该组原文。组内各参数变体和定制配置都可能贡献关联，所以同一来源组可以同时出现在固定和候选列表；这不是声称该组所有武器实例都固定或都随机。

法术保留基础字段 `{id,name,description,image,type,fp}`。`type` 为 `sorcery` 或 `incantation`，`fp` 取自本作 `Magic.mp`。当前 158 个法术均有基础消耗。每个有效施放引用通过 `refId1～10` 对应到同槽的 `consumeType1～10`。类型 0 扣基础消耗，1 扣 `mp_charge`，2 跳过扣费。

菜单有 `consumeLoopMP_forMenu` 且能对应同值扣费引用时，图鉴显示起手 `fp` 和每次续放 `fpPerRepeat`。例如彗星亚兹勒为起手 40、每次续放 10，持续释放的总消耗取决于实际扣费次数。菜单无循环费用、使用蓄力引用且消耗与普通不同的条目另列 `fpCharged`，如创星雨普通 27、蓄力 32。其余条目只显示基础消耗。

## 可复现的纳入与关联规则

读取 `strict/regulation-bin/*.param.xml`，先合并 `<fields>` 默认值，再读取行字段。加权池保留重复 ID 的全部行，不能构造成单行字典。中文来自 `localized/text-bundles/**/zhocn/**` 中确切的基础及 `_dlc01` FMG 文件；同 ID 文本冲突不选首项。

本轮复用已审查的 391 个武器来源组、1,792 个变体作为装备引用边界。该目录的来源追溯、已知获取范围限制见 [WEAPON_DATA.md](WEAPON_DATA.md)。本目录证明的是参数中的装备/候选引用，不是每条配置都已经过游戏内掉落验收，也不把抽选权重当概率展示。

战技关联：

1. 对每个入选武器变体读取 `EquipParamWeapon.swordArtsTableId`。非负时只处理该池 `SwordArtsTableParam` 中 `chanceWeight>0`、`swordArtsId>=0` 的行，记为候选。
2. 该表 ID 为负时，读取 `swordArtsParamId` 为固定默认引用。存在候选池时不擅自把默认字段也算固定；缺失池、空池或全零权重也不退回默认字段冒充可用。
3. 仅处理 `targetWeaponId` 精确命中上述武器变体的 `EquipParamCustomWeapon`，其非负战技池同样按有效权重加入候选。没有按 ID 取整或同名猜定制目标。
4. 引用须命中 SwordArtsParam，中文名称取其 `textId → ArtsName`，说明取同 `textId → ArtsInfo`；无名、冲突名、`？？？`、“无战技”及无有效原版图标编号的占位项不纳入。
5. 按原生战技 ID 分项，再把关联去重到武器来源组 ID。固定与候选各自去重，保持两种语义。

法术纳入：

1. 收集上述武器变体的非负 `equippedSpell_R1/R2`。
2. 收集目标精确命中的定制武器的 `magicTableId_1/2`，只沿 `MagicTableParam.chanceWeight>0`、`magicId>=0` 的记录追踪。
3. 必须命中 Magic 参数及一致、非占位的 `MagicName` 和 `MagicCaption`。类别依据本机 NR Paramdex `Meta/Magic.xml` 的 `MAGIC_CATEGORY`：0=Sorcery，1=Incantation，对应字段为 `ezStateBehaviorType`。枚举原文和哈希写入公开 provenance。
4. 未获得这条装备引用链的法术参数不自动纳入。`MixcraftMagicParam` 中角色技能内部组合效果不因此当成可装备魔法/祷告。没有用 `disableParam_NT` 当正式版禁用标志，也没有仅凭 `enableSparringGrounds` 就宣称玩家可用。

## 抽样与边界

- 魔法 4000“辉石魔砾”基础 FP=7；祷告 6000“燃火”基础 FP=10；祷告 7000“龙焰”基础 FP=28。均与原生 Magic、简中名称和完整说明逐字核对。
- 战技 100“狮子斩”图标 8300；101“贯穿”图标 8301。两者保留各自候选武器集合，不通过显示名称合并。
- 战技 1200“风暴管束者”有玩家初始武器定制配置的有效池引用，候选关联包括学者的刺剑 5750000、送葬者的铁锤 11750000 等十个来源组；原版图标 8590。本次增加该条与图标。Magic 8100/8101 虽也名为“风暴管束者”，但未命中此处的法术装备引用链，故没有按同名合并或作为法术收录。
- 六组同名战技分别保留不同 ID：回旋斩 103/1166、罗蕾塔的斩击 118/1165、欧赫剑舞 1012/1055、流体化 1018/1035、星云 1047/1173、不可挡之刃 1054/1191。
- “回旋锁链”125 有原生名称、说明和图标，但未命中当前入选玩家武器的有效引用，不纳入，也不因此断言其一定是废案。
- 与旧武器目录的 182 个战技定义相比，本次新增 1200，移除表示“无战技”的 10；总数同为 182，但不能当作集合完全相同。
- 所有已解包的确切 `_dlc01` 名称/说明文件都参与查询。可确认 DLC 来源的学者刺剑、送葬者铁锤组参与关联；本快照没有找到具有有效装备引用的独立 DLC 法术名称，DLC 战技名称文件中的 `？？？` 占位不收录。这不证明不存在其他版本或其他获取方式的 DLC 内容。

## 原版图标与来源

战技优先复用 `skill-image-manifest.json` 中 status=verified 的确切 iconId 图片，没有按同名选图。额外的战技 8590 和 158 个法术 iconId 从既有缓存 `/menu/01_common_h.tpf.dcx`、`/menu/21_common_dlc01_h.tpf.dcx` 及对应 `.sblytbnd.dcx` 布局中查找 `MENU_ItemIcon_<编号>.png`。名称中的前导零不影响数值编号匹配。

按原生布局矩形裁切原尺寸 RGBA，保存 lossless、exact WebP；没有绘制替代图、染色或重采样。每个新图均重新解码 WebP，并与源 DDS 解码后的对应 RGBA 裁块逐字节比较。资源 SHA256、DDS 哈希、布局哈希、sprite 名、矩形、像素哈希和 WebP 哈希保存在仓库外 `catalog-evidence.json`。复用的旧战技图片也校验其清单哈希与实际文件。完整图集、解包文件和大量配置引用不进入公开目录。

原图权利属于原权利人。本项目只记录本机游戏素材的派生来源，不将其描述为原创或已取得再分发许可。

## 生成、验证与证据

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts/build_arts_spells_catalog.py
python scripts/validate_arts_spells_catalog.py
```

默认只读取 `E:\海斗\outputs\nightreign-data-20261109`、前轮 DLC 解包缓存和现有武器目录。生成器支持 `--source-root`、`--repo`、`--audit-dir`、`--paramdex`。标准库处理参数和文本，Pillow 与前轮 `monster-images/decode_textures.py`、WitchyBND 的 Oodle DLL 处理既有缓存图集。无需网络或重新读取游戏档案。目录和图片文件名输出稳定，可按内容哈希复核。

独立验证器重新读取原生参数和中文文本，比较完整纳入 ID 集合、每条战技两类来源组关联、正权重条件、法术类别及基础 FP、原文说明、路径和图片哈希、所用输入哈希。当前验证通过 182 条战技、158 条法术及 159 张新增裁块；未用游戏运行实测代替静态证据。

仓库外证据根目录为 `E:\海斗\outputs\arts-spells-20261112`：

- `catalog-evidence.json`：逐条原生引用、排除清单、图片裁切记录与未解析引用；本轮未解析池引用 0。
- `validation.json`：独立核对结果与两个公开目录的 SHA256。
- `icon-contact-sheet.png`：战技、魔法、祷告原版图标抽样检查图。

此脚本不会更新武器目录、旧战技图片清单、前端页面或其他专项文件。后续源版本更新时应重新生成、核对排除项及 DLC 记录，不能沿用本次数量作为新版本完整性保证。
