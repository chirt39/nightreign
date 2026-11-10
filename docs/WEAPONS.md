# 武器图鉴（WPN-01）

用户于 2026-11-10 批准：在网站增加基础武器图鉴，包含能确认的 DLC 武器，先交付本地预览，用户检查后再决定上线。此次不授权发布线上站点。

## 协作与文件所有权

- 总控：本文件、REQUIREMENTS.md、DECISIONS.md、集成审核、最终交付。
- 遗物与配装：`public/weapon-catalog.json`、`scripts/build_weapon_catalog.py`、`scripts/validate_weapon_catalog.py`、`docs/WEAPON_DATA.md`。
- 存档与逆向：`public/weapon-images/`、`public/weapon-image-manifest.json`、`scripts/extract_weapon_images.py`、`docs/WEAPON_IMAGES.md`。
- 前端与美术：`src/pages/WeaponsPage.vue`、`src/App.vue`、`public/game-ui.css`、`vite.config.js`。
- 工程与发布：本地构建与浏览器验收；验证脚本及证据放在仓库外的 `E:\海斗\outputs\weapon-encyclopedia-20261110`，不启动线上发布。

共享工作树：`E:\海斗\nightreign-feedback-email`，分支 `feat/weapon-encyclopedia`。各专项只修改分配的文件，不切换分支、不提交其他人的改动。总控统一提交。

## 数据与页面接口 v1

`public/weapon-catalog.json`：

```json
{
  "schemaVersion": 1,
  "gameVersion": "1.3.3.0",
  "regulationVersion": "10350000",
  "categories": [{"id": "1", "label": "短剑"}],
  "weapons": [{
    "id": "1000000",
    "name": "匕首",
    "categoryId": "1",
    "categoryLabel": "短剑",
    "dlc": false,
    "iconId": 10000,
    "aliases": [],
    "representativeVariantId": "1000000",
    "variants": [{
      "id": "1000000",
      "name": "匕首",
      "label": "普通",
      "iconId": 10000,
      "rarity": null,
      "attack": {"physical": 58, "magic": 0, "fire": 0, "lightning": 0, "holy": 0},
      "attackTypes": [],
      "requirements": null,
      "requirementNote": "使用条件待核对",
      "scaling": null,
      "scalingNote": "能力补正待核对",
      "skill": {"kind": "unknown", "names": [], "note": "战技待核对"},
      "notes": [],
      "sourceIds": ["1000000"]
    }],
    "sourceIds": ["1000000"],
    "notes": []
  }],
  "summary": {},
  "provenance": {}
}
```

这是结构示例，不作为额外数值结论。规则：

- ID 全部为字符串；分类 ID 为 `wepType` 字符串。分类标签由数据专项人工核对。`null` 为未确认，不能转换为 0 或“无要求”。`dlc: true` 只给有明确 DLC 文本/资源证据的条目；来源不能判定用 null。
- `requirements` 和 `scaling` 确认后为 `{strength, dexterity, intelligence, faith, arcane}`，值为数字、已核对的等级字符串或 null；只有核对等级转换规则后才能生成 S–E。若只确认原始补正系数，可提供数字并在 `scalingNote` 明示“基础补正系数，非游戏等级标记”。前端不换算。
- `skill.kind` 为 `fixed`、`pool` 或 `unknown`；`names` 为去重中文名称数组。固定战技与候选池分别标示，不把池中的第一个值当作固定战技。
- 按游戏中的显式来源引用归组；关联冲突留在审计中，不用同名或 ID 取整强行归组。未知名称、内部占位及无法确认属于玩家武器的记录不强行放入公开目录，并在数据说明记载排除理由。
- 基础攻击为所选参数变体的基础分量，不是当前角色实战伤害。首版不计算角色、等级或强化后的最终攻击。
- 图片独立清单 `public/weapon-image-manifest.json`：`{schemaVersion:1, images:{"10000":{src:"/weapon-images/10000-<hash>.webp",alt:"匕首",status:"verified",source:{...}}}, summary:{...}}`。映射键为 iconId 字符串，缺失或失败统一使用前端占位；只有映射与图像证据支持时 status 才为 verified。
- 前端读取 `weapon-catalog.json` 和可选图片清单，使用 Vite 内容哈希缓存。武器数据懒加载，失败只影响本页；图片清单失败仍可浏览资料。所有文字通过 Vue 插值转义。
- 深链参数：`weaponId`、`weaponVariant`（可选）、`weaponQ`、`weaponCategory`，页面 hash 为 `#weapons`。保留其他页面的查询参数；刷新及前进/后退恢复状态。

## 验收门槛

1. 匕首普通/火焰/雷电能正确归组，变体值不混用；同图标不同武器不误并，定制配置不重复计为武器；多行同 ID 战技表不丢候选。
2. 名称、分类、图片与参数来源可追溯；DLC 标记有证据；未解析引用和缺图数量可核查。
3. 搜索、分类、清空、零结果、详情选择、参数变体、深链、刷新及浏览器历史正常。
4. 数据失败可重试，图片失败有占位；桌面和手机无整页横向溢出，键盘可完成主要操作。
5. 原怪物图鉴、词条、遗物和助手/反馈入口回归；不触发真实 AI 模型费用或提交测试反馈。
6. 构建产物写入仓库外，交付本地预览地址、截图和已知局限；上线等待用户检查后的独立指令。

## 本地集成记录（2026-11-10）

- 已生成 391 个基础来源组、1,792 个命名变体、33 类；这是可审阅的参数目录，逐件获取范围仍待核对。两个有专属 DLC 文本证据的组为“学者的刺剑”和“送葬者的铁锤”。
- 已提取 393 张原生透明图标；目录实际使用的 391 个不同 iconId 全部覆盖。全参数表另有 74 个未匹配图标编号，不影响当前目录。详见 [图片来源](WEAPON_IMAGES.md)。
- 网页目录精简为约 1.8 MB，重复战技候选明细放入外部核对记录。全部使用条件暂标待核对；补正展示基础系数，不生成未经验证的 S–E 等级。详见 [数据依据](WEAPON_DATA.md)。
- 总控独立使用 CSV 对照生成器所读 XML，核对 1,792 个变体的 17,920 个攻击/补正值，并检查 393 张图片的哈希与解码像素；当前无差异。既有怪物、遗物与助手脚本的基线哈希保持一致。
- 工程浏览器验收共 20 项通过、0 项失败，包括搜索与分类、匕首变体、深链/刷新/前进后退、未知 ID、数据失败重试、图片失败、1280×900 / 1280×720 / 390×844 布局、跨页侧栏与手机菜单、键盘、DLC 以及原怪物/词条/遗物/助手和反馈入口回归。
- 验收修复了新增导航导致短屏侧栏底部不可达的问题；导航区域现可在各页及手机菜单独立滚动。武器桌面页缩短标题和留白，列表与详情各自滚动，基础攻击和补正优先进入首屏。
- 本地预览：[http://localhost:4187/#weapons](http://localhost:4187/#weapons)。静态预览的 API 请求被隔离；此次未导入真实存档、调用真实 AI 模型或提交测试反馈。此验收不等于游戏内数值与可获取性全部完成核对。
- 构建输出在仓库外，源码/构建所用六个关键文件哈希一致，tracked dist 未修改；无推送或线上发布。本地预览以隐藏后台进程提供，重启电脑后可使用证据目录中 `qa/start-preview.ps1` 再启动。
- 集成证据目录：`E:\海斗\outputs\weapon-encyclopedia-20261110`。主要文件：`independent-review.json`、`data/validation.json`、`qa/checks.json`、`qa/build-report.json`、`qa/final-integrity.json` 与 `qa/screenshots/`。总控已读取并审核最终通过结果。
