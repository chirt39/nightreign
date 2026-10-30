# 怪物图片核验清单

状态：已核验 11 个详情锚点图片，可显示清单只引用仓库内既有素材。核验表示本地缩图与来源页展示的怪物外观相符，不表示本地文件就是来源原图或已取得再分发许可；许可均标为 `unverified`。

## 消费契约

`public/enemy-image-verified.json` 只列可在详情标题旁显示的图片，键为当前敌人记录的原始 ID。前端以详情默认数据组锚点 ID 精确查找 `images[id]`；没有已核验映射、清单载入失败或图片请求失败时，详情标题旁显示“图片待补”占位图。该占位图只用于详情，不会添加到列表。若占位 SVG 本身载入失败，前端移除失效图像并停止回退。不得按名称模糊匹配、去掉 ID 末尾的 `a`／`b`，或把同名夜王／永夜王、普通／灾域、武器、体型、阶段之间的图互相继承。

每项记录包含：

- `path`：已存在的站内相对图片路径。
- `sourcePage`、`sourceImage`：用于核对名称、编号和外观的 Wiki 页面及图片 URL；它们不证明仓库内旧素材的来源链。
- `assetOrigin`：当前素材来自仓库已有资源；历史来源尚未独立追溯。
- `matchStatus`：只有当前详情锚点 ID、本地映射与来源图片外观确认相符后，才能标为 `verified`。仅编号或文件名相同不够。
- `licenseStatus`：`unverified` 表示尚未确认第三方图片的再分发许可；不代表已取得授权。
- `checkedAt`：核对日期。

## 已核验并可显示

| 当前详情锚点 ID | 本地记录 | 本地图片 | 外观参考页 | 来源图片 | 核对说明 |
| --- | --- | --- | --- | --- | --- |
| `34700000` | 白金之子 | `enemy-images/34700020.jpg` | [编号 34700020](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B734700020) | [NPC FullBody 34700020.jpg](https://patchwiki.biligame.com/images/eldenring/9/92/fujzfj09wmb03qoha7l1polhp0lwau0.jpg) | 锚点旧映射所指白金之子与参考图外观相符；未确认本地图片与来源图字节相同或存在裁切关系。 |
| `30100000` | 失乡骑士 | `enemy-images/30100014.jpg` | [编号 30100014](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B730100014) | [NPC FullBody 30100014.jpg](https://patchwiki.biligame.com/images/eldenring/5/50/s6ve1c6w2qxd1c6e9a77vmi5kicbp4o.jpg) | 本地骑士头像与来源页中的失乡骑士外观对应。 |
| `34600000` | 狮子混种 | `enemy-images/34600913.jpg` | [编号 34600913](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B734600913) | [NPC FullBody 34600913.jpg](https://patchwiki.biligame.com/images/eldenring/b/b4/n0l7me1diov4w1fsp5oqdye2umtem2v.jpg) | 本地狮子头部与来源图中狮子混种外观一致。 |
| `39000000` | 火焰习武修士 | `enemy-images/39000020.jpg` | [编号 39000020](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B739000020) | [NPC FullBody 39000020.jpg](https://patchwiki.biligame.com/images/eldenring/b/b8/80srx1jxsqgsdd1ng2uol3ng3xffb8l.jpg) | 本地红衣火焰修士缩图与来源图外观一致；来源编号不同于锚点 ID，但旧映射为该锚点提供此图。 |
| `41000000` | 亚人 | `enemy-images/41002020.jpg` | [编号 41002020](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B741002020) | [NPC FullBody 41002020.jpg](https://patchwiki.biligame.com/images/eldenring/2/28/b8c5uasb6q3du0e78wscd1ygoodb05f.jpg) | 本地红眼亚人面部与来源图中的亚人外观相符。 |
| `41200000` | 亚人首领 | `enemy-images/41200012.jpg` | [编号 41200012](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B741200012) | [NPC FullBody 41200012.jpg](https://patchwiki.biligame.com/images/eldenring/7/77/96hp98v0frs73xjtq3wd7is3kfyxhk9.jpg) | 本地红眼、蓬发面部缩图与来源图中亚人首领面部外观相符。 |
| `45000010` | 飞龙（原野Boss） | `enemy-images/45000010.jpg` | [编号 45000010](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B745000010) | [NPC FullBody 45000010.jpg](https://patchwiki.biligame.com/images/eldenring/e/ec/iprc8ugso44v7w5bs30vao9lcvyzyz7.jpg) | 同 ID 飞龙外观核对通过；来源页／原图仅作视觉参考，未确认本地图片与其字节相同或存在裁切关系。 |
| `49500010` | 提比娅的唤声船（夜晚Boss） | `enemy-images/49500010.jpg` | [编号 49500010](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B749500010) | [NPC FullBody 49500010.jpg](https://patchwiki.biligame.com/images/eldenring/f/f0/1mdyhscal3f25lqiscyph759d5z8dx7.jpg) | 本地与来源图均呈现幽灵船Boss；中文本地名称存在译写差异。 |
| `43400000` | 发狂南瓜头士兵 | `enemy-images/43400010.jpg` | [编号 43400010](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B743400010) | [NPC FullBody 43400010.jpg](https://patchwiki.biligame.com/images/eldenring/1/1a/fkabivf1x7pa1e8rumrwrtq3i3xqec7.jpg) | 本地金色南瓜头盔与来源图中士兵外观对应；未确认裁切关系。 |
| `43530000` | 罗德尔骑士 | `enemy-images/43530020.jpg` | [编号 43530020](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B743530020) | [NPC FullBody 43530020.jpg](https://patchwiki.biligame.com/images/eldenring/d/d8/l5c49bskzng5vjskyrm77vtizqcdzer.jpg) | 本地金色盔甲、盾牌和扇形头饰与来源图中的罗德尔骑士对应。 |
| `46600000` | 魔像守卫 | `enemy-images/46600010.jpg` | [编号 46600010](https://wiki.biligame.com/eldenring/%E6%80%AA%E7%89%A9%E7%BC%96%E5%8F%B746600010) | [NPC FullBody 46600010.jpg](https://patchwiki.biligame.com/images/eldenring/7/73/19neq4nrio7wy58wprc0237bc6siexg.jpg) | 本地与来源图都显示持戟、带发光胸甲和塔形头部的魔像守卫。 |

来源原图只用作视觉参照；本地素材是仓库既有的 100×100 缩图，尺寸与 SHA-1 和来源原图不同是预期的裁切／缩放差异，不能据此声称字节相同。参考原图曾临时下载到仓库外的 `E:\海斗\tmp` 供比对，没有将新图片加入仓库。全部已启用项的 `assetOrigin` 均记录为 `legacy-repository`，因为本地素材的历史来源尚未独立追溯。

基于主线提交 `e04cc4d`，删除随机突袭事件专属的 `46600010` 记录后，共有 272 个实体默认锚点；其中 29 个锚点 ID 在旧映射表中精确命中。29 项中，11 个外观核验通过、1 个发现名称冲突、17 个仍无法完成视觉核验。清单只纳入已确认项目。

本次删除“魔像守卫（随机突袭事件）”数据行及其旧图映射与已核验映射。图片 `enemy-images/46600010.jpg` 仍由保留的普通“魔像守卫”锚点 `46600000` 使用，因此文件保留。

## 待补与冲突

- 旧图片映射有 372 个键、指向 175 张 JPG；175 张均已在 Git 跟踪且文件存在。
- 有任一旧图片映射的实体 59 个；其中 30 个实体的已映射记录只落到一个图片路径，另 29 个实体落到多个路径。单一路径只是候选，不能代替来源页、锚点 ID 与变体核对。
- 213 个实体没有图片映射。
- 首批 29 个精确锚点候选的逐项结论：

| 状态 | 详情锚点 ID | 数据名称 | 旧映射图片／结论 |
| --- | --- | --- | --- |
| 外观核验通过 | `34700000` | 白金之子 | `enemy-images/34700020.jpg` |
| 外观核验通过 | `30100000` | 失乡骑士 | `enemy-images/30100014.jpg` |
| 外观核验通过 | `34600000` | 狮子混种 | `enemy-images/34600913.jpg` |
| 外观核验通过 | `39000000` | 火焰习武修士 | `enemy-images/39000020.jpg` |
| 外观核验通过 | `41000000` | 亚人 | `enemy-images/41002020.jpg` |
| 外观核验通过 | `41200000` | 亚人首领 | `enemy-images/41200012.jpg` |
| 外观核验通过 | `43400000` | 发狂南瓜头士兵 | `enemy-images/43400010.jpg` |
| 外观核验通过 | `46600000` | 魔像守卫 | `enemy-images/46600010.jpg` |
| 外观核验通过 | `43530000` | 罗德尔骑士 | `enemy-images/43530020.jpg` |
| 外观核验通过 | `45000010` | 飞龙 | `enemy-images/45000010.jpg` |
| 外观核验通过 | `49500010` | 提比娅的唤声船 | `enemy-images/49500010.jpg` |
| 名称冲突，排除 | `40001020` | 小王室幽魂（随机突袭事件） | BWiki 页面称“王室骑手”，不匹配 |
| 来源无法取证 | `42900000` | 猎犬骑士 | `enemy-images/42900020.jpg` |
| 来源无法取证 | `22710000` | 小螃蟹 | `enemy-images/22710010.jpg` |
| 来源无法取证 | `42600110` | 归树看门犬（熔铁恶魔 夜晚Boss前哨战） | `enemy-images/42600110.jpg` |
| 来源无法取证 | `30000000` | 流刑士兵 | `enemy-images/30000014.jpg` |
| 来源无法取证 | `44600000` | 火焰战车 | `enemy-images/44607020.jpg` |
| 来源无法取证 | `31600010` | 黑夜骑兵 - 马 | `enemy-images/31600010.jpg` |
| 来源无法取证 | `43770000` | 强盗 | `enemy-images/43770012.jpg` |
| 来源无法取证 | `30800000` | 小恶魔 | `enemy-images/30800007.jpg` |
| 来源无法取证 | `40500000` | 凯丹佣兵 | `enemy-images/40500010.jpg` |
| 来源无法取证 | `44910000` | 小壶 | `enemy-images/44910014.jpg` |
| 来源无法取证 | `44900000` | 大壶 | `enemy-images/44907014.jpg` |
| 来源无法取证 | `43510000` | 葛瑞克骑士 | `enemy-images/43510010.jpg` |
| 来源无法取证 | `31500010` | 黑夜骑兵 - 戟 | `enemy-images/31500010.jpg` |
| 来源无法取证 | `31810020` | 王夫的红狼 | `enemy-images/31810020.jpg` |
| 来源无法取证 | `41800000` | 灵魂水母 | `enemy-images/41800010.jpg` |
| 来源无法取证 | `43210000` | 恶兵 | `enemy-images/43210020.jpg` |
| 来源无法取证 | `40710000` | 白狼 | `enemy-images/40710010.jpg` |

核对方式与限制：所有通过项的来源页均能对应编号、名称和图片文件；来源图仅用于外观对照，既有素材的历史出处和许可仍未确认。其余 17 项的来源页缓存未命中、媒体请求被拒或尚无可用视觉对照，因此保留为未核验；这不表示图片已判定不匹配。
- 29 个夜王实体全部没有已核验图片；32 个夜晚首领实体中 28 个无旧映射图片。这两组可能与上述数量交叉，不应相加。
- “白金之子”实体当前指向 11 个不同图片路径，“失乡骑士”指向 6 个；需按具体 ID 和模型变体选择，不能为实体名指定一张通用图。
- ID `40001020` 的 BWiki 页称为“王室骑手”，当前数据则是“小王室幽魂（随机突袭事件）”。即使旧映射存在，也因名称冲突不列入显示清单。
- BWiki《小怪一览》为《艾尔登法环》基础游戏资料，页面标注更新于 2022-04-28；不能用名称相似推断《黑夜君临》独有首领、阶段或变体。没有可靠对应时继续留空。

## 来源与许可

旧的 `public/enemy-image-map.json` 只保存 ID 到本地路径，没有逐图的来源页、图片文件名或许可状态。本次只引用已随公开站点分发的现有素材，没有将来源图下载进仓库。来源许可继续如实标记为 `unverified`；这个状态不阻止未来接入已视觉核验的既有图片。以后新增或替换素材时，应单独核对来源与许可，并记录来源页、来源图片、匹配状态、许可状态和日期。项目的一般许可要求见 [数据来源台账](DATA.md#许可与发布门槛)。
