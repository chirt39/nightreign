# 武器参数目录的数据依据

本页对应 `docs/WEAPONS.md` 的数据接口 v1，供本地预览与人工核对使用。当前是**武器参数目录，获得范围待核对**，不声称完整游戏武器清单，也不把参数存在、中文名存在或图鉴开关视为实际可掉落/可获取证明。

## 生成与复核

只使用已提取的本机资料，无网络请求，不重新解包游戏：

```powershell
python scripts/build_weapon_catalog.py
python scripts/validate_weapon_catalog.py
```

生成器支持 `--source-root`、`--paramdex`、`--output`、`--audit-dir`；校验器支持 `--source-root`、`--catalogue`、`--audit-dir`。默认源为 `E:\海斗\outputs\nightreign-data-20261109`，审计目录为 `E:\海斗\outputs\weapon-encyclopedia-20261110\data`。Python 标准库即可运行。校验器会返回非零退出码拒绝失败结果，成功报告写入外部 `validation.json`。

正式读取 `strict/regulation-bin/*.param.xml`，先展开每表 `<fields>` 的 `defaultValue` 再读取行属性，避免把 XML 省略字段误当零。`csv/EquipParamWeapon.csv` 可对照这些已展开参数；战技表与效果表必须读取全部 XML 行，不能以 ID 字典覆盖重复记录。公开 JSON 采用紧凑 UTF-8 编码，顺序固定，不嵌入运行时间；重复生成可比较 SHA-256。

## 快照与数量

源 `source-manifest.json`：游戏版本 **1.3.3.0**、regulation **10350000**、Steam build **22818764**。regulation SHA-256 为 `876a3ca279a4561d0c69f81fe5e510c75c59ab9a8a201694f8cf4a42c91e0268`。公开目录的 `provenance.files` 保存所用参数及游戏文本文件的相对路径和 SHA-256。

| 项目 | 数量与含义 |
| --- | --- |
| EquipParamWeapon | 2317 个原始参数行 |
| 同 ID 中文武器名 | 1793 个参数行，不是基础武器数量 |
| 本版目录 | 391 个基础来源归组、1792 个命名变体、33 类 |
| 排除/待核对 | 525 个原始参数行，逐行记录理由 |
| DLC | 2 个基础归组有专属 DLC 文本证据；389 组获取范围未确认，`dlc: null` |
| 战技 | 1617 个变体引用候选池，175 个变体使用参数默认固定战技 |
| 使用的战技池 | 224 个表 ID、5631 条原始候选，含权重为零或无战技引用的记录 |
| SwordArtsTableParam 全量 | 11896 行、841 个不同 ID；重复 ID 不丢行 |
| AttachEffectTableParam 全量 | 22088 行、1081 个不同 ID；重复 ID 不丢行 |
| EquipParamCustomWeapon | 5148 个配置行，不计为新增武器 |
| 定制目标关联 | 4547 行命中公开变体，4 行命中已排除参数，597 行无法按原 ID 命中 |

生成条件是“具有一致中文名、明确人工分类、有效显式来源及非占位排序”，用于形成可审阅资料集合；未完成逐件游戏内获得性验收。代表行中有两个 `enableSparringGrounds=0` 的命名来源组仍予保留，因为该开关不足以证明内部或未用。不能把 `disableParam_NT` 当正式版禁用开关：它表示网络测试包筛选，本版没有据此排除记录。

## 名称、分类和归组

中文名称直接读 `localized/text-bundles/**/zhocn/**/WeaponName.fmg.xml` 与 `WeaponName_dlc01.fmg.xml`，同 ID 非空、非 `%null%` 文本必须一致。名称冲突不自动选第一项。

分类使用 NR Paramdex `Meta/EquipParamWeapon.xml` 的 `WEP_TYPE`，人工提供中文标签：短剑、直剑、大剑、特大剑、曲剑、大曲剑、刀、双头剑、刺剑、重刺剑、斧、大斧、槌、大槌、连枷、矛、大矛、戟、镰刀、拳头、钩爪、软鞭、特大武器、弓弩、手杖、圣印记、盾和火把等。生成器中的 `CATEGORIES` 是完整标签映射，并校验实际目录类别都有对应枚举。未解释值如 `wepType=33` 不冒充已确认武器分类。未使用较粗且含多项 Unknown 的 `weaponCategory` 作为玩家分类。

归组沿 `originEquipWep`、`originEquipWep1…25` 的一致非负引用追溯到自身来源行；任何循环、缺失、多源冲突、分类冲突或源名称缺失都进入外部审计。没有使用同名、同图标、ID 取整、固定尾数或 `baseChangeCategory` 单字段强并。

真实样例：

- `1000000` 匕首、`1000500` 火焰匕首、`1000600` 雷电匕首共同显式引用 `1000000`；基础匕首物理 58，火焰匕首物理 29/火 29，各变体独立保存分量。
- `33750000`、`33770000` 都名为“隐士的手杖”，都用图标 11220，但各自来源指向自身，保留为不同目录组。它们的实际用途区别仍需核对。
- `33990100` 的来源 `33990000` 未命中，排除而不取整。全表有 36 行此类未命中来源。
- `110000`“徒手”具有未解释分类、占位排序及缺失来源，不强行进入公开武器清单。
- “学者的刺剑”`5760000/5770000/5780000` 有中文名并显式引用 `5750000`，保留为同名变体，提示适用条件待核对；未据开关或 ID 推断强化等级。

排除理由可能重叠：524 行中文名缺失或冲突、143 行来源缺失/不一致、36 行源 ID 未命中、75 行分类未确认、100 行排序为占位值，另有源名称/分类/排序问题。每行原始值和理由见 `excluded-weapon-rows.json`，不是把所有排除行都判定为游戏未使用。

## DLC 的证据与限制

只有具体条目来自 **文件名** `WeaponName_dlc01.fmg.xml` 才给正向 DLC 标记。本快照明确命中 `5750000/5760000/5770000/5780000`“学者的刺剑”和 `11750000`“送葬者的铁锤”，合为两个基础组。没有因为容器目录名 `item_dlc01-msgbnd-dcx` 含 dlc01 而把普通 `WeaponName.fmg.xml` 全部判成 DLC。

其他组设为 `null`，表示尚无充分证据确认获取范围；不以“未出现在 DLC 文本文件”反推“获得无需 DLC”。DLC 文本归属也不是掉落地点或解锁条件证据。

## 参数、补正与战技

公开 `attack` 来自本变体的 `attackBasePhysics/Magic/Fire/Thunder/Dark`，其中 Dark 是旧字段名，对应圣属性分量。`attackTypes` 由四个 `isNormalAttackType/isBlowAttackType/isSlashAttackType/isThrustAttackType` 显示标记生成，零值不生成额外标签。

`requirements` 全部为 null，并写“使用条件待核对”；`proper*`、`throwAtkRate` 的夜渡实际生效含义尚未确认，不生成“无要求”或角色等级限制。`rarity` 也暂为 null，原值在审计源行中。`scaling` 保存 `correctStrength/Agility/Magic/Faith/Luck` 数字，说明为“基础补正系数，非游戏等级标记”；不自动推算 S–E。强化、等级同步、角色属性、特殊效果、异常累积和动作倍率未计算，数据不能用作最终面板、实战伤害或抽取概率。

战技名称按 `SwordArtsParam.textId → ArtsName` 关联，不假设战技参数 ID 必然就是文本 ID。XML 省略的 `chanceWeight` 用表内默认值 100 恢复。引用 `swordArtsTableId` 时，保留其全部同行 ID 记录为候选池；`names` 仅汇总权重大于零且引用有效的去重中文名，池只有一个名字也不冒称固定战技。无表引用时使用 `swordArtsParamId` 的参数默认战技，定制配置仍可能覆盖。

公开 `skill` 只含接口 v1 的 kind/names/note 和简短 tableId/default；完整候选、权重、原始行索引和中文文本依据放在外部审计。`10000010` 匕首池含多条不同战技，验证器逐条比对源表，不能取首项“贯穿”当固定战技。没有对权重进行概率归一化，也没有声称该池就是全部实际掉落结果。

## 外部审计与许可

`E:\海斗\outputs\weapon-encyclopedia-20261110\data`：

- `included-source-rows.json`：公开变体原始参数、同 ID 中文文本及 DLC 证据。
- `excluded-weapon-rows.json`、`reference-conflicts.json`：排除、缺失和冲突，不补猜关联。
- `custom-configurations.json`：5148 行配置和原样目标 ID，保留 weaponLevel、诅咒、战技、法术、附加效果表字段。597 个未命中配置行不改写目标，不能断言坏数据或自动还原虚拟强化 ID。
- `skill-table-rows.json`、`resolved-skill-pools.json`、`skill-name-evidence.json`：全量多行战技表、公开条目使用的池及文本文件依据。
- `attach-effect-table-rows.json`、`attach-effect-definitions.json`：全量附加效果候选及 AttachEffectParam/attachTextId 中文证据；没有擅自推导随机组合的出现概率。
- `summary.json`、`validation.json`：数量、样例及源文件散列核验结果。

图片由图片专项独立负责；本目录只保留真实 `iconId`，不生成图片清单、不假定武器 ID 等于图标 ID。游戏数据与文本来自用户本机游戏，第三方 Paramdex 仅用于字段/枚举解释。原游戏数据与文本的再分发许可须在正式发布前另行核对；本次仅交付本地预览资料，不构成发布授权。
