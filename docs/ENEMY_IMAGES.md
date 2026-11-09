# 怪物图片核验清单

状态（2026-11-09）：可显示清单包含 26 个精确详情锚点，使用 26 张图片：11 张既有素材与 15 张本机游戏菜单头像。既有项的核验表示缩图与参考页的怪物外观相符；新增夜王项的核验表示首领身份与指定菜单头像对应，不表示该 NPC 阶段的实景或模型形态已核验。全部许可状态保持 `unverified`。

## 消费契约

`public/enemy-image-verified.json` 只列可在详情标题旁显示的图片，键为当前敌人记录的原始 ID。前端以详情默认数据组锚点 ID 精确查找 `images[id]`；没有已核验映射、清单载入失败或图片请求失败时，详情标题旁显示“图片待补”占位图。该占位图只用于详情，不会添加到列表。若占位 SVG 本身载入失败，前端移除失效图像并停止回退。不得按名称模糊匹配、去掉 ID 末尾的 `a`／`b`，或把同名夜王／永夜王、普通／灾域、武器、体型、阶段之间的图互相继承。

每项记录包含：

- `path`：已存在的站内相对图片路径。
- `sourcePage`、`sourceImage`：既有项用于核对名称、编号和外观的 Wiki 页面及图片 URL；它们不证明仓库内旧素材的来源链。原生菜单图另用下面的游戏资源字段登记来源。
- `assetOrigin`：`legacy-repository` 表示既有资源且历史来源尚未独立追溯；`local-game-menu` 表示从本机游戏菜单图集导出。
- `matchStatus`：既有缩图核对当前详情锚点、来源参考与外观；夜王菜单头像核对首领名称、显式 NPC ID、菜单参数和图集坐标。不能只凭编号或相似文件名标为 `verified`。
- `imageKind`：新增项为 `nightboss-menu-portrait`，详情图的替代文本和悬停提示使用“出击菜单头像”；助手若展示同一 ID 的图片，也使用该说明。不是对应阶段的实景或模型图。
- `sourceGameVersion`、`sourceRegulationVersion`、`sourceResource`、`sourceAtlas`、`sourceLayout`、`sourceRectangle`、`sourceSha256`、`sourceParam`：原生图的游戏版本、包内路径、图集、矩形、PNG 哈希及菜单参数引用。公开清单不包含游戏原始资源包或私人存档。
- `licenseStatus`：`unverified` 表示尚未确认第三方图片的再分发许可；不代表已取得授权。
- `checkedAt`：核对日期。

## 既有 11 项

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

来源原图只用作视觉参照；本地素材是仓库既有的 100×100 缩图，尺寸与 SHA-1 和来源原图不同是预期的裁切／缩放差异，不能据此声称字节相同。参考原图曾临时下载到仓库外的 `E:\海斗\tmp` 供比对，没有将新图片加入仓库。此前批次启用的11项 `assetOrigin` 均记录为 `legacy-repository`，因为本地素材的历史来源尚未独立追溯。

基于主线提交 `bc1688b`，删除已批准的 20 条敌人记录后，共有 254 个实体默认锚点；其中 28 个锚点 ID 在旧映射表中精确命中。28 项中，11 个外观核验通过、0 个名称冲突、17 个仍无法完成视觉核验。清单只纳入已确认项目。

此前删除的“魔像守卫（随机突袭事件）”数据行及其映射不影响普通“魔像守卫”锚点 `46600000`；图片 `enemy-images/46600010.jpg` 继续保留并由该锚点使用。

本次按主线 `bc1688b` 移除 ID `40001020` 的随机突袭事件记录及其唯一旧图映射。其旧映射图片 `enemy-images/40001020.jpg` 不再映射到任何敌人；仓库文件保留。11 个已核验图片记录及其路径未变。

## 前批次待补与冲突（2026-10-30）

- 旧图片映射有 371 个键、指向 174 张 JPG；174 张均已在 Git 跟踪且文件存在。
- 有任一旧图片映射的实体 58 个；其中 29 个实体的已映射记录只落到一个图片路径，另 29 个实体落到多个路径。单一路径只是候选，不能代替来源页、锚点 ID 与变体核对。
- 196 个实体没有图片映射。
- 首批 28 个精确锚点候选的逐项结论：

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
- 截至此前批次，28 个夜王实体全部没有已核验图片；30 个夜晚首领实体中26个无旧映射图片。2026-11-09新增15个夜王出击菜单头像入口后，余下13个夜王实体仍待补；当前范围见后文。这两组可能与上述数量交叉，不应相加。
- “白金之子”实体当前指向 11 个不同图片路径，“失乡骑士”指向 6 个；需按具体 ID 和模型变体选择，不能为实体名指定一张通用图。
- BWiki《小怪一览》为《艾尔登法环》基础游戏资料，页面标注更新于 2022-04-28；不能用名称相似推断《黑夜君临》独有首领、阶段或变体。没有可靠对应时继续留空。

## 既有批次来源与许可

旧的 `public/enemy-image-map.json` 只保存 ID 到本地路径，没有逐图的来源页、图片文件名或许可状态。2026-10-30批次只引用已随公开站点分发的现有素材，没有将来源图下载进仓库；2026-11-09新增的游戏原生菜单头像来源另见后文。来源许可继续如实标记为 `unverified`；这个状态不阻止未来接入已视觉核验的既有图片。以后新增或替换素材时，应单独核对来源与许可，并记录来源页、来源图片、匹配状态、许可状态和日期。项目的一般许可要求见 [数据来源台账](DATA.md#许可与发布门槛)。


## 2026-11-09：新增夜王出击菜单头像

用户批准将本地已提取的15张头像接入网站并上线。每张PNG是本机《ELDEN RING NIGHTREIGN》1.3.3.0（regulation `10350000`）的菜单图，按游戏layout矩形无重采样裁切；尺寸均为460×460。详情保持既有80×80展示，窄屏为64×64。只登记下表的15个原始NPC ID，原有11项逐项保留，敌人行、数值、分类及合并规则不变。

普通色与紫色头像分别绑定各自记录；这些是用于识别首领的出击菜单头像，不用于证明具体阶段或分身形态。尤其格诺斯塔、玛利斯与布德奇冥的阶段记录，仅使用本表明确列出的ID；其他阶段与格拉狄乌斯分身继续占位。

| NPC ID | 当前资料名称 | 菜单行ID | 大图ID | 站内图片 |
| --- | --- | --- | --- | --- |
| `49000010` | “黑夜雾霾”卡莉果 (Boss) | `6` | `41826` | `enemy-images/nightboss-41826.png` |
| `49010010` | “黑夜雾霾”卡莉果 (永夜Boss) | `16` | `41846` | `enemy-images/nightboss-41846.png` |
| `75000020` | “黑夜野兽”格拉狄乌斯 (Boss) | `0` | `41820` | `enemy-images/nightboss-41820.png` |
| `75000210` | “黑夜野兽”格拉狄乌斯 (永夜Boss) | `10` | `41840` | `enemy-images/nightboss-41840.png` |
| `75100020` | “黑夜之爵”艾德雷 (Boss) | `1` | `41821` | `enemy-images/nightboss-41821.png` |
| `75110010` | “黑夜之爵”艾德雷 (永夜Boss) | `11` | `41841` | `enemy-images/nightboss-41841.png` |
| `75200000` | “黑夜之智”格诺斯塔 (Boss) | `2` | `41822` | `enemy-images/nightboss-41822.png` |
| `75200120` | “黑夜之智”格诺斯塔 (永夜Boss 1阶段) | `12` | `41842` | `enemy-images/nightboss-41842.png` |
| `75400020` | “深海黑夜”玛利斯 (Boss) | `3` | `41823` | `enemy-images/nightboss-41823.png` |
| `75410000` | “深海黑夜”玛利斯 (永夜Boss 2阶段) | `13` | `41843` | `enemy-images/nightboss-41843.png` |
| `75600020` | “黑夜之魔”利普拉 (Boss) | `4` | `41824` | `enemy-images/nightboss-41824.png` |
| `75610010` | “黑夜之魔”利普拉 (永夜Boss) | `14` | `41844` | `enemy-images/nightboss-41844.png` |
| `75802010` | “黑夜王”布德奇冥 | `7` | `41827` | `enemy-images/nightboss-41827.png` |
| `76000010` | “黑夜光骑士”弗格尔 (Boss) | `5` | `41825` | `enemy-images/nightboss-41825.png` |
| `76001010` | “黑夜光骑士”弗格尔 (永夜Boss) | `15` | `41845` | `enemy-images/nightboss-41845.png` |

来源链：`NightBossMenuParam.bossNameId` → 游戏简体中文 `CL_MenuText`；同一菜单行的 `largeBossIconId` → `MENU_MenuIcon_ID.png` → `SB_MenuIcon_1.layout` 的原始矩形 → `SB_MenuIcon_1` 纹理。图集来自 `data0.bdt` 内 `/menu/01_common_h.tpf.dcx`，layout来自 `/menu/01_common_h.sblytbnd.dcx`。每项的完整矩形、参数行、文本ID与PNG SHA256保存在 `public/enemy-image-verified.json`。

源regulation SHA256：`876a3ca279a4561d0c69f81fe5e510c75c59ab9a8a201694f8cf4a42c91e0268`；源exe SHA256：`9545e8732919bb6a63904cb73223641b3c4f9a67869be5722612acca413e8b3a`。解析与裁切使用既有WitchyBND 3.0.1.0、其Oodle解码库及Pillow；原PNG像素已与图集矩形逐一比对一致。

DLC首领哈尔莫妮亚（菜单行8、18）与史柴格斯（菜单行9）的相应大图未在本次定位的基础菜单图集中找到。本轮保留待补，不把基础游戏头像用于这两个首领，也不据此宣称DLC没有这些图片。新素材仍标注 `licenseStatus: unverified`，不以本轮接入宣称取得权利人的再分发授权。
