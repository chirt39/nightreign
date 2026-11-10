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
