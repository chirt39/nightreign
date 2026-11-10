# 武器原生图片来源与核验

本轮仅用于已批准的武器图鉴本地预览。游戏版本 1.3.3.0，regulation 10350000；未确认公开再分发许可，发布仍由总控安排。

## 覆盖与接口

`public/weapon-image-manifest.json` 遵守 WEAPONS.md 的 schemaVersion 1，images 的键是字符串 iconId。393 个映射具有 `src`、`alt`、`status: verified` 和 source。已确认基础包 389 个、DLC01 包 4 个；全表共 467 个 iconId，74 个未匹配，详见清单的 missing 数组。

全表包含盾牌、内部/定制配置和非公开候选，本图片清单不决定目录收录。当前全部 WebP 为游戏 ItemIcon 原始 160×160 RGBA，保留整幅画布和透明边缘，不放大、不重绘、不生成图。使用无损 WebP，导出后重新解码并逐字节核对 RGBA；总计 4,616,648 字节，单图最大 29,110 字节。文件名含内容 SHA-256 前 12 位，完整哈希在 source.webpSha256。

## 映射证据

1. 从既有 EquipParamWeapon 参数 XML 读取全表 iconId 与原始行 ID，名称只来自已有中文文本对照；原始参数 SHA 逐图登记。
2. 重新解密 data0.bhd，按路径哈希查找四个基础菜单资源，对照既有 menu-inventory 的偏移、大小、AES 位置；重读 /menu/00_solo_h.tpfbhd 并校验哈希。
3. 基础图片使用 /menu/01_common_h.tpf.dcx 的 SB_ItemIcon_0、1、2 图集，按原生 layout 中 `MENU_ItemIcon_<iconId>.png` 矩形裁切。选定 DCX 与本次从 BDT 读取并按 BHD AES 区间解密的字节相同。
4. DLC 使用已独立核验的 /menu/21_common_dlc01_h.tpf.dcx 及 SB_ItemIcon_DLC01_0.layout；复核已有 DLC manifest 的 DCX 哈希，重新 KRAK 解压、PC TPF 解析和 DDS 解码。DLC 来源的归档偏移、AES 位置及源清单哈希登记在 provenance。
5. 389 个 MENU_Knowledge 精确同 ID 候选均作解码比较。它们与 ItemIcon 的画布、比例/摆放并非逐像素对应，本轮没有仅凭同名选用高分辨率候选。source.knowledgeCandidate 保存候选哈希、偏移、原始尺寸和比较值；实际交付均使用权威 ItemIcon 配置裁切。
6. 已查看全部七页联系表；匕首 10000、长剑 10040 的内容与名称相符。DLC 10167/10168/10169 均为参数文本“学者的刺剑”的不同图标，10415 为“送葬者的铁锤”；不把四个图标计为四种不同武器。verified 表示参数 iconId → 原生 ItemIcon 配置 → 裁切像素链条成立，不代表游戏内掉落、版本归组或战斗数值已核验。

缺失中的 iconId 0 有“徒手”名称，其余未匹配 iconId 在当前中文对照中没有有效名称。它们使用前端占位，不从邻近 ID、同名或模型猜图。missing 保留全部 iconId、sourceIds、名称与原因。

## 复现

在当前仓库运行 `python scripts/extract_weapon_images.py`。默认复用本机已有的 `E:\海斗\outputs\nightreign-data-20261109` 与 `E:\海斗\outputs\dlc-images-20261109\extraction`；可用 --source-root、--dlc-root、--evidence、--repo 指定路径。依赖 Python、Pillow、cryptography 和已有 Oodle DLL。辅助脚本仅 import 所需函数，不执行其旧 main，不全量解包，不修改游戏或全局工具配置。

脚本只写本专项的 weapon-images、weapon-image-manifest 及仓库外 evidence 目录。复跑相同内容生成相同文件名；不会自动删除旧资产，若以后参数或源版本改变，由总控依据新 catalog/manifest 裁剪冗余，避免误删其他版本。

输出证据：`E:\海斗\outputs\weapon-encyclopedia-20261110\images`。contact-01 至 contact-07 为全表联系表，representative-verified 为匕首、长剑和四张 DLC 代表图，representative-comparison 为 Item/Knowledge 对照。unmatched.json 与 summary.json 可机器读取，extraction.log 为本次日志。

## 验证范围与后续

游戏 EXE、regulation SHA 与初始 source-manifest 相同；提取前后 EXE、regulation、data0.bhd/data0.bdt 大小与修改时间不变。source 中登记图集 DDS、layout、原始裁切 RGBA 和最终 WebP 哈希，provenance 登记提取脚本、辅助源码与源资源清单。

图片按全表 iconId 提前提取。本轮对接当前 catalog 的 391 种武器、391 个不同变体 iconId，图片覆盖 391/391，缺图为 0；仅 10330、10331 两张资产未被当前 catalog 使用，保留并交总控决定是否裁剪。validation.json 同时记录当时的 catalog、manifest、脚本 SHA，catalog 后续变化时需重新计算覆盖率。

没有为缺失图标生成替代图，没有修改武器数值、目录归组、其他图片或页面 UI。

## 已批准的武器入口与战技图标（2026-11-10）

本轮新增 `public/skill-images/`、`public/skill-image-manifest.json`、`public/nav-icons/weapons.webp` 和 `scripts/extract_weapon_ui_icons.py`，只供已批准的本地预览。基础攻击五项继续使用既有 Wiki 来源的 damage PNG，本轮没有修改、复制或登记为游戏解包素材。

导航采用原生 `MENU_MenuIcon_40051.png` 直剑轮廓，来自 `01_common_h.tpf.dcx` 的 `SB_MenuIcon_0`，layout 矩形 `[1364,2036,172,172]`。按原生 172×172 整幅矩形无损导出，浏览器路径为 `/nav-icons/weapons.webp`；`navigation.weapons` 登记裁切和文件 SHA。这是按图形内容选用的入口标志，尚未证明它在游戏中绑定哪一条菜单命令。

战技固定引用链为 `EquipParamWeapon.swordArtsParamId → SwordArtsParam.id → iconId`；池引用链为 `swordArtsTableId → SwordArtsTableParam` 同 ID 的全部正权重行 → `swordArtsId → SwordArtsParam.id → iconId`。名称另由 `SwordArtsParam.textId → ArtsName` 获取，不能把战技参数 ID 当作图标 ID，也不能全局按同名选首图。

从当前 catalog 的实际 names 及每变体源引用独立推导出 35,106 个显示上下文、182 个战技 ID、182 个图标 ID，均精确命中基础包 `SB_ItemIcon_0` 或 `SB_ItemIcon_1` 的 `MENU_ItemIcon_<iconId>.png`。隐藏 default 125（icon8496）和 1056（icon8589）未提取，未知/占位图未提取，缺图为 0。数据专项新增的 skillDefinitions 与 skill.itemIds 保留 ID，由前端据当前上下文取图；图片清单只按 iconId 建键。

182 张图片均保留原生 160×160、完整透明画布，无缩放、重绘或生成图。全部以无损 RGBA WebP 导出，重新解码后尺寸和 RGBA 字节与原图集矩形裁切严格相等；战技文件共 5,601,430 字节，导航 2,414 字节。六组同名不同 iconId 均保留：回旋斩、罗蕾塔的斩击、欧赫剑舞、流体化、星云、不可挡之刃。其中欧赫剑舞的 8512/8555 图标编号不同但原生裁切像素相同；其余五组的像素也不同。不会根据名称或像素相同反向合并战技参数 ID。

源文件复用已核验的 `monster-images/game-source/01_common_h.tpf.dcx` 和 layout，DCX 哈希与既有武器清单的基础菜单源一致。在内存进行 KRAK/PC TPF/DDS 解码，仅选中所需的三个图集，不重新全量解包。清单 source 登记归档资源位置、DCX/TPF/DDS/layout 哈希、sprite、矩形、参数 ID/textId/iconId、原生 RGBA 与 WebP SHA；provenance 登记参数表、中文文本、catalog 快照和提取脚本哈希。

复现：`python scripts/extract_weapon_ui_icons.py`；可选 `--repo`、`--source-root`、`--evidence`。脚本只写本轮分配的图标文件、清单及证据目录，不自动删除旧资产。182 个公开战技范围若变化会中止，需先审核新范围。依赖沿用本机既有 Pillow、cryptography 与 Oodle 解码链，不执行旧提取脚本 main。

证据目录为 `E:\海斗\outputs\weapon-encyclopedia-20261110\icons`：`skills-contact-01.png` 至 `skills-contact-04.png` 覆盖全部 182 图；`same-name-different-icons.png` 为六组对照；`navigation-native.png` 为导航原尺寸预览；`validation.json` 为源、像素、覆盖和保护哈希检查。已查看完整联系表和六组对照。游戏 EXE/regulation 哈希与初始清单相同，游戏资源大小/mtime 及旧武器图片、其他导航资产哈希保持不变。此核验不表示已逐条游戏内实测或已取得公开再分发许可。
