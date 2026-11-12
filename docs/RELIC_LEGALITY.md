# 遗物原生槽位与组合规则证据

本数据供静态 import 使用：`src/data/relic-legality.json`。生成器为
`scripts/build_relic_legality.py`。只描述参数中的候选关系，不证明任意组合的实际获取方式，
不读取存档，不修改原有道具 ID、公开道具表或词条图鉴。

## 版本和重建

来源为用户本机 Steam 游戏提取结果 `nightreign-data-20261109`，执行文件版本
`1.3.3.0`、regulation `10350000`；解包工具 WitchyBND `3.0.1.0`。
生成 JSON 的 `metadata.sources` 保留输入文件的相对路径和 SHA-256。
公开 `items_data.json` 只用于对照、记录旧映射冲突，不提供别名或槽位证据。
游戏数据权利归原权利人所有，此生成物不改变原有许可边界。

```powershell
python scripts/build_relic_legality.py
python scripts/build_relic_legality.py --check
```

可用 `--source-root` 指定另一份同结构提取目录，用 `--output` 指定生成位置。
`--check` 重新解析来源并比较完整输出，不写文件。

原生 XML 行省略了默认字段，生成器先展开 `fields/field@defaultValue`。
`AttachEffectTableParam` 同 ID 多行是候选记录，不能用普通字典覆盖成最后一行。

## 消费接口

| 字段 | 含义 |
| --- | --- |
| `items[id].mode` | 原生 `isDeepRelic`，`normal` 或 `deep` |
| `items[id].color` | 原生颜色枚举：0红、1蓝、2黄/橙、3绿、4白 |
| `items[id].positive` | 原生 `attachEffectTableId_1/2/3`，保留原槽位顺序 |
| `items[id].negative` | 原生 `attachEffectTableId_curse1/2/3`，与正槽同位置配对读取 |
| `items[id].generation` | `fixed`：每个非空池均只有一个候选；`random`：均有多个候选；`mixed`：两者兼有。本版无 `mixed` 实例 |
| `items[id].presetPositive/Negative` | 仅固定预设存在，3位效应 ID 数组，空位为 `null`；应按原顺序精确匹配 |
| `pools[poolId]` | 基础与 DLC 两种正权重候选的并集，数组成员是数字效应 ID |
| `effects[effectId].negative` | 原生 `isDebuff`，已与该道具的正负池角色交叉检查 |
| `effects[effectId].compatibilityId` | 同一件随机遗物的互斥组，非负值才参与组比较 |
| `effects[effectId].exclusivityId` | 装配多件遗物时重复效果的提示组，不是随机生成互斥或能否叠加的证明 |
| `effects[effectId].requiresNegativeInRandomDeep` | 只按本数据中的随机/混合深夜模板推导：所有出现位置均有配对负槽为 `true`，均无为 `false`，混合为 `null`；没有随机深夜出现记录则不输出此字段 |
| `poolVariantDifferences[poolId].baseOnly/dlcOnly` | 并集中的单侧独有候选；无差异的池不输出 |
| `unknownItems[id].reasons` | 无法建立可靠模板的原因，不得当作非法道具或确认无槽 |

所有对象键都是字符串，槽位里的池 ID 和候选效应 ID 是数字。
`null` **只**表示原生槽位字段等于 `-1`。不存在的池、空池、全零权重、
正负角色混杂、缺失效应定义，均不能改写为 `null`，应省略该道具并记录未知原因。

若已知基础模式，从 `pools[pid]` 排除 `dlcOnly`；若已知 DLC 模式，排除 `baseOnly`。
未知 DLC 状态用并集只做保守候选检查，不据 DLC 独有项直接判错。
本版使用到的池无 `baseOnly` 候选，有31个池存在 `dlcOnly` 候选。
权重覆盖规则为：`chanceWeight_dlc == -1` 使用基础权重，否则使用 DLC 权重；
零权重不参与候选。输出不携带权重原值或重复的完整 DLC 池表。

## 已核实关系与反例

- 1397条原生 Antique 参数中，849条有原生英文名称，548条无名称参数不进入模板。
  通过池引用和角色检查的模板768条，其中普通552条、深夜216条；固定120条、随机648条。
  这些计数是参数覆盖量，不是全游戏可获得道具数量。
- `2000000` 正池49项；所有已收录随机深夜模板使用该池的位置，
  同位负槽均为 `3000000`，负池24项。随机模板按实际正负槽配对检查。
- `2100000` 正池277项、`2200000` 正池283项，交集277项。
  使用这两个池的已收录随机模板同位负槽均为空。保留两个原生池，不能用新池替换旧池。
- `2000001` 的正槽为 `[2000000,2100000,null]`，负槽为
  `[3000000,null,null]`。因此同一件随机遗物可混用有负面与无负面的正池；
  不能要求所有正效应都带负面，也不能把负面任意挂到另一正槽。
- 已收录随机正负池中没有正权重的空效应候选。导入的非空槽位缺少效应时，
  它与留空的自定义构造草稿不是同一种情况。全零权重的 `effectId=0` 不代表允许空选。
  测试道具 `1/2/3` 引用的池含不同正负角色，不能照单当作普通正面候选，已省略这些道具。
- 固定预设 `1080` 为 `[7002600,7000901,null]`；`1120` 为
  `[7121000,7040500,null]`；`1510` 为 `[7060000,7120900,7070000]`。
  它们不按 `(overrideBaseEffectId,ID)` 升序。固定预设应精确匹配，不做通用重排。
- 原生 `7900013` 确有固定正槽 `[6040300,6001601,6610400]`、负槽全空，
  其中 `6001601` 同时存在于随机必负面池。但这条与另外5条深夜固定参数均无原生名称，
  `sortGroupId=255`、`disableParam_NT=1`，也不在公开道具表中。
  它们**不进入**最终模板，不能作为当前可获得遗物或合法存档的反例。
- 公开 `30029` 标为 `DeepRelic`，同 ID 原生 `isDeepRelic=0`，正池字段为
  `[1,1,1]`，但池 `1` 不存在。输出 `unknownItems["30029"]`，不四舍五入、
  不按图标或名字映射到 `2000000` 系列，也不据此判用户存档非法。

## 规则依据与未知边界

字段含义交叉核对本机 `tools/WitchyBND-3.0.1.0/Assets/Paramdex/NR/Meta/`
下的 `EquipParamAntique.xml`、`AttachEffectParam.xml`、`AttachEffectTableParam.xml`。
这些注释属于解包工具的字段解释，不能替代游戏执行或合法存档样本证据。

[社区原始 SQL](https://github.com/ParaphrazeTutorials/nightreign-data-tools/blob/main/downloads/reliquary/queries/reliquary.sql)
与本版深夜池和 DLC 覆盖规则可作交叉核对，但不能直接复制其255哨兵到当前输出为-1的 XML。
[社区校验规则](https://github.com/SEANPNEX/nightregin_relic_verifier/blob/main/ruleset.md)
对模拟排序和完整存档检查采用不同处理；没有本版本运行时或授权存档证据，
本生成物不输出排序硬约束，也不引入其效应白名单例外。

本任务没有证明运行时排序、保存错位、第四保存槽语义、池字段 `unknown_0`、
实际获得概率、跨遗物叠加或遗留 ID 别名。不得仅凭这些未明字段硬判非法。
`compatibilityId` 的比较限于同一件随机遗物，不跨六件已装备遗物施加生成互斥。
本版已收录随机池的所有效应均有非负 compatibility 组，因此同 ID 重复也会被组比较阻止。
固定专属效应中的 `compatibilityId=-1` 不能合并成一个互斥组。
