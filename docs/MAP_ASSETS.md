# 地图底图、坐标与静态证据

2026-11-10：六张地形底图已完成原生贴图提取、无损拼接与静态坐标校准。页面接口为 `public/map-asset-manifest.json` 的 `terrains[rareMapId]`；六项 `status=verified`。这里的 verified 表示本节所列静态核验已通过，运行时投影核验仍为 false。游戏未启动、未注入，安装目录只读。

| rareMapId | 地形 | 当前安装资源 | 校准依据 |
| --- | --- | --- | --- |
| 0 | 普通宁姆韦德 | `/menu/71_maptile_m00.tpf.dcx` | 原生点 103、107、117 与图面及社区参照核对 |
| 1 | 山顶 | `/menu/71_maptile_m01.tpf.dcx` | 同为 6×6、256 像素框架；变动区外固定地点与普通图重合，北西雪山图面吻合 |
| 2 | 火山口 | `/menu/71_maptile_m02.tpf.dcx` | 同一框架与固定地点；北部火山口图面吻合 |
| 3 | 腐败森林 | `/menu/71_maptile_m03.tpf.dcx` | 同一框架与固定地点；东南腐败区图面吻合 |
| 4 | 大空洞 | `/menu/71_maptile_m04.tpf.dcx` | 原生点 1144、1151、1109、1150 与独立大空洞参照核对 |
| 5 | 隐城诺克拉缇欧 | `/menu/71_maptile_m05.tpf.dcx` | 同一框架与固定地点；西南城市图面吻合 |

地形 ID 名称沿用总控对全部 520 个原生方案与参考方案的静态交叉核对结果，证据为仓库外 `references/native-reference-crosscheck.json`。资源对应另经原图地形特征核对，不能由地形 ID 直接猜文件名。`m10` 原图明确是圆桌厅堂，未放入六地形接口。

## 图像与来源

每张公开图为 L0、无 `_B1` 后缀的 36 块原生 DDS，每块 256×256，最终 1536×1536，无重采样和裁边。纹理名解析为 `MENU_MapTile_L{layer}_{column}_{row}`，拼接位置为 `x=column×256`、`y=(5−row)×256`。保存为 lossless WebP，开启 exact；解码 WebP 后，整图 RGBA 与拼接画布比较相等，每个 tile 裁块再与源 DDS 解码的 RGBA 比较相等。像素完全一致的范围是原 DDS 解码结果至派生 WebP，并非有损 DDS 压缩前的原始美术文件。

完整资源 SHA256、解码 TPF SHA256、RGBA SHA256、WebP SHA256 均在公开清单；档案偏移、AES 范围索引、每块 DDS 哈希、原始解包文件及未用图层仅保存在仓库外。六图共 17,703,414 字节。公共清单不含本机绝对路径、MSB/事件清单或未使用图层。

原安装版本 1.3.3.0，regulation 10350000：

- `nightreign.exe` SHA256：`9545e8732919bb6a63904cb73223641b3c4f9a67869be5722612acca413e8b3a`
- `regulation.bin` SHA256：`876a3ca279a4561d0c69f81fe5e510c75c59ab9a8a201694f8cf4a42c91e0268`

已知路径来自 [Nordgaren/UXM-Selective-Unpack 的 Nightreign 字典](https://github.com/Nordgaren/UXM-Selective-Unpack/blob/9501be87e272b6dae55e60a13c3f4753ca6fb3bb/UXM/res/EldenRingNightreignDictionary.txt)，固定提交 `9501be87e272b6dae55e60a13c3f4753ca6fb3bb`，文件 SHA256 为 `7f81526f89bfee584774641259f52b3f3d133e327a491d4d9faf2f2cbe4b6544`，见仓库外 `references/filelist-source.json`。`m04` 不在该字典，先由 [focusmade/nightreign-map-extract](https://github.com/focusmade/nightreign-map-extract/tree/ce222238593690d52d055fb4838f218a62f17dc7) 固定提交中的资源哈希 `0xA7F963AB16C713AB` 发现，再验证路径哈希与当前安装 BHD 实际条目匹配后读取；该作者的 `enir-ilim` 标签没有直接当作游戏地形名称。六张地图均实际命中当前 `data0.bdt`。

## 坐标接口

仅适用 areaNo=60、地面 L0 原生 attach/world-map 坐标。X 取 gridXNo 与 posX，垂直轴使用 gridZNo 与 posZ；posY 是高度，不参与平面投影。

```text
pixelX = gridXNo*256 + posX - 10368
pixelY = 10368 - gridZNo*256 - posZ
normalized.x = pixelX/1536
normalized.y = pixelY/1536
```

原点左上，向右/向下为正。公开清单 `coordinateTransform.pixelX/pixelY` 给出字段系数和 constant，另给 gridSize、尺寸及 normalizedX/normalizedY 表达式。归一化坐标不钳制到 0–1；越界、非 area60、地下/室内及未核验坐标空间保持未知。此处 grid 拼接后的世界坐标是明确约定的派生坐标，不能当作已证明的引擎绝对世界原点。

| 地形 | 原生 attachId | 社区参照 slot | 投影像素 (x,y) | 参照偏差/原图像素 |
| --- | --- | --- | --- | --- |
| 普通 | 107 | 1 | 616,273 | 3.830 |
| 普通 | 117 | 2 | 1096,330 | 9.217 |
| 普通 | 103 | 4 | 354,429 | 3.518 |
| 大空洞 | 1144 | 1 | 534.67,475.64 | 3.965 |
| 大空洞 | 1151 | 5 | 544,802 | 4.751 |
| 大空洞 | 1109 | 6 | 394.25,887.33 | 5.991 |
| 大空洞 | 1150 | 9 | 556,1182 | 5.536 |

普通三点的坐标字段在 SmallBaseAndSpotAttachPoint 与同 ID 的 WorldMapPointParam 中逐字段一致。大空洞四点取原生 attach 参数。地点与社区 slot 的关联采用原图地标、相对位置静态检查，并非已解出引擎内部 slot-ID 关联。社区坐标是 1000×1000 手工参照，未参与公共坐标生成；来源快照 SHA256 为 `375302f473f2d7623f86ed369594be69870e9c75f57a03bbb0bc3d54dcf333fc`，见仓库外 `references/community-reference-source.json`。

七点最大参照偏差 9.217 原图像素。这只是所列点的参照差，不是全部点或运行时投影的误差上界。社区普通 slot7 与原生 attach313 的 Z 方向相差约 95 像素，尚未解释，未据此拟合或编造修正。变动地形内部的点位仍需按其原生数据独立核验，不因底图坐标框架一致就保证任意实体位置准确。

## 复现与证据位置

```powershell
$env:PYTHONIOENCODING='utf-8'
python scripts/extract_map_assets.py --scenes
```

脚本默认读取 `E:\SteamLibrary\steamapps\common\ELDEN RING NIGHTREIGN\Game`；复用 `E:\海斗\outputs\nightreign-data-20261109\monster-images` 中的 archive、DCX/TPF 辅助代码及既有 RSA 公钥，不改游戏文件。启动时检查 exe/regulation 哈希，结束时比较 BHD/BDT 大小与 mtime。Oodle 解码使用既有 WitchyBND 3.0.1.0 的 `oo2core_9_win64.dll`；图片解码使用 Pillow。`--previous`、`--evidence`、`--repo` 可指定已有材料与输出位置。执行需要原安装与前一日解包材料，不是无资源环境的一键下载流程。

仓库外根目录：`E:\海斗\outputs\map-nightlord-20261110\assets`。

- `extraction.json`：全资源命中、档案信息、原图层记录、来源与脚本哈希。
- `tile-evidence.json`：全部原纹理名、DDS 哈希、解码像素哈希、TPF offset。
- `coordinate-calibration.json`：原生字段、XML 哈希、参照位置、逐点残差及限制。
- `calibration-terrain-0.png`、`calibration-terrain-4.png`：原尺寸红色原生位置与青色参照位置叠图。
- `terrain-calibration-montage.png`：六地形图面与固定地点人工检查图。
- `sources/`：只读提取的 TPF/DCX、选定 MSB、EMEVD、GFX；`derived-images/` 与 `unused-webp/` 留存未发布图层。
- `gfx-scripts/`、`gfx-export.log`：FFDec 26.3.0 对 `02_120_worldmap.gfx` 的 182 个 AS3 脚本导出。本次选定 GFX 主要为包装类/时间轴，未找到世界坐标投影或模式选择算式；不能据此推断其他文件或引擎也没有。

## 场景与模式的边界

已提取选定 m60_42_38、m60_45_39、m60_44_36 的字典列出的场景/事件变体，以及 common、common_func、m60_00_00_99 事件，命中与哈希保存在完整证据中。提取成功不等于已理解运行逻辑。当前底图工作未建立“深夜等级 → 运行场景 → NPC 实例”完整链路，不能由菜单抽选权重补造模式可用性或概率。

尝试 SoulsFormats 时，旧版 `MSBN` 实为 Ninja Blade 格式，不适用于 Nightreign。另对 soulsmods/SoulsFormats 提交 `e25d1a5c3cda83b801fdefe00f4d2903892cc526` 的 MSBE 解析器作只读测试，m60_42_38_00 在 Treasure 事件字段读取失败（偏移 0x4DAC，预期 0 实得 0x100），见 `scene-reader-test.jsonl`。没有忽略该断言或将失败结果作为 NPC 关联证明。

另聚焦读取了 `m49_10`、`m49_17`、`m49_27` 的实际 MSB/EMEVD，各六个资源均在当前 BHD 命中；完整来源见 `primary-encounter-resources.json`。EMEVD 成功解析，三者均有公共函数 90065900/90065910/90065911 调用，实参分别出现原生 NpcName 的 904750000（“接肢”君王）、904770000（英雄石像鬼）、903050600（战场老将）。这是数值与名称引用的静态佐证，仍需核实参数语义及 NPC 实例链路。三份 MSB 均在不同格式断言处失败，没有据失败解析编造 NPC 列表。逐调用原始参数、中文 FMG 哈希及限制见 `primary-encounter-summary.json`；该证据的 `sceneExclusionProven`、`npcInstanceLinkProven` 均为 false。此资产专项未修改普通怪物或主遭遇的覆盖范围。

最终资产校验见 `asset-validation.json`：六张文件存在且哈希吻合、1536×1536、数字地形键 0–5、清单无本机路径、生成脚本哈希吻合、七个参照点偏差小于 10 原图像素。该文件校验的公开清单 SHA256 为 `f8fee03675e3fdc6cac4ede045ac3a85d22e566a852e6a78c0121c81f1d1c373`。公开清单与图片已冻结供集成构建使用。

底图为本机游戏资源的派生物，原图权利归原权利人；这里记录提取与核验来源，不将其描述为新创作资产。
