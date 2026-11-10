# 武器图鉴（WPN-01）

用户于 2026-11-10 批准：在网站增加基础武器图鉴，包含能确认的 DLC 武器，先交付本地预览，用户检查后再决定上线。此次不授权发布线上站点。

## 协作与文件所有权

- 总控：本文件、REQUIREMENTS.md、DECISIONS.md、集成审核、最终交付。
- 遗物与配装：`public/weapon-catalog.json`、`scripts/build_weapon_catalog.py`、`scripts/validate_weapon_catalog.py`、`docs/WEAPON_DATA.md`。
- 存档与逆向：`public/weapon-images/`、`public/weapon-image-manifest.json`、`scripts/extract_weapon_images.py`、`docs/WEAPON_IMAGES.md`；本轮新增 `public/skill-images/`、`public/skill-image-manifest.json`、`public/nav-icons/weapons.webp`、`scripts/extract_weapon_ui_icons.py`。
- 前端与美术：`src/pages/WeaponsPage.vue`、`src/App.vue`、`public/game-ui.css`、`vite.config.js`。
- 工程与发布：本地构建与浏览器验收；验证脚本及证据放在仓库外的 `E:\海斗\outputs\weapon-encyclopedia-20261110`，不启动线上发布。

共享工作树：`E:\海斗\nightreign-feedback-email`，分支 `feat/weapon-encyclopedia`。各专项只修改分配的文件，不切换分支、不提交其他人的改动。总控统一提交。

## 已批准的本地预览调整（2026-11-10）

- 能力补正改为 S、A、B、C、D、E；已确认无补正显示“—”，未知显示“待核对”。使用本作菜单等级表，转换边界与来源由数据专项核对。
- 保留 `scaling` 的五项原始数值，新增 `scalingGrades` 的同名五项字段，值为 `S`、`A`、`B`、`C`、`D`、`E`、`-` 或 null。前端只显示 `scalingGrades`，不自行将数字换算为等级。
- 删除武器页“资料说明”区、底部游戏资料版本及说明、基础攻击与补正的说明段落，以及整个“使用条件”区；页首简介同步删除“使用条件”。原始字段与来源继续保存在数据和仓库文档。
- 数据专项修改生成器、目录、校验器和 WEAPON_DATA.md；前端专项修改 WeaponsPage.vue，必要时仅移除本次废弃区块的样式；工程专项构建并验证本地预览；总控维护需求、接口和验收记录。
- 验收：等级阈值与样例、零值和未知值区分、变体及深链切换、指定文字与区块消失、桌面与手机布局。继续使用本地预览，不推送或发布线上站点。

## 数据与页面接口 v1

### 已批准的图标接入（2026-11-10，基线 b334de2）

- 左侧武器图鉴入口使用原生 `MENU_MenuIcon_40051.png` 直剑轮廓，保存为 `/nav-icons/weapons.webp`。这是按图形内容选用的入口标志，不宣称它就是游戏内武器图鉴菜单的绑定图标。
- 基础攻击五项按字段明确复用 `/enemy-attribute-icons/damage-{physical,magic,fire,lightning,holy}.png`，图标作为名称的补充，保留数值。既有 Wiki 来源说明保留，不登记为本轮原生提取。
- 战技按当前变体的引用匹配原生图。保留 `skill.names` 的集合、顺序及 fixed/pool 语义，新增等长 `skill.itemIds`（战技参数 ID 字符串或 null）；顶层新增 `skillDefinitions`，键为战技 ID，每项 `{id,textId,name,iconId}`。共享定义避免在 35,106 个显示上下文重复完整对象，公开目录继续控制在 3 MB 内。
- 每个 `itemIds[index]` 来自当前变体实际固定引用或有效候选池，且对应定义名称必须等于 `names[index]`；不能全局按同名取首张图。出现同一上下文歧义时该 ID 留 null，原名称继续显示。现有快照 176 个名称对应 182 个实际展示战技 ID，当前上下文不存在歧义。
- 新增独立可选清单 `skill-image-manifest.json`：`{schemaVersion:1, images:{"8300":{src:"/skill-images/8300-<hash>.webp",alt:"狮子斩",status:"verified",source:{...}}}, summary:{...}, provenance:{...}}`。键为 iconId，前端只接受已核验的本地图片路径。读取清单失败、旧数据无新增字段或图片失败时保留名称与稳定图标空间，不猜图、不阻断武器页。
- 数据专项负责目录、生成/校验脚本及 WEAPON_DATA.md；逆向专项负责新图片、清单、提取脚本及 WEAPON_IMAGES.md；前端专项负责 App.vue、WeaponsPage.vue、game-ui.css 和可选清单缓存版本；工程负责仓库外构建与针对性浏览器验收，总控审核、更新需求并统一提交。
- 验收包括 182 个图标的源引用与裁切、六组同名不同图的上下文、变体切换、五种攻击图标、导航一致性、手机长名称、缺图/旧数据回退及原始数值和战技集合不变。证据放在 `E:\海斗\outputs\weapon-encyclopedia-20261110\icons`。继续仅更新本地 4187 预览，不推送或上线。

`public/weapon-catalog.json`：

```json
{
  "schemaVersion": 1,
  "gameVersion": "1.3.3.0",
  "regulationVersion": "10350000",
  "categories": [{"id": "1", "label": "短剑"}],
  "skillDefinitions": {},
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
      "scaling": {"strength": 13, "dexterity": 73, "intelligence": 0, "faith": 0, "arcane": 0},
      "scalingGrades": {"strength": "E", "dexterity": "S", "intelligence": "-", "faith": "-", "arcane": "-"},
      "skill": {"kind": "unknown", "names": [], "itemIds": [], "note": "战技待核对"},
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
- `requirements` 保留原始接口的未知状态，不再显示使用条件区。`scaling` 保留五项原始数值；`scalingGrades` 按本作菜单表推导字母等级，完整证据与转换范围见 [WEAPON_DATA.md](WEAPON_DATA.md)。前端只读取等级字段，`-` 显示为“—”，缺失或非法值显示“待核对”，不把未知值当作无补正，不回退显示原始系数。
- `skill.kind` 为 `fixed`、`pool` 或 `unknown`；`names` 为去重中文名称数组。固定战技与候选池分别标示，不把池中的第一个值当作固定战技。`itemIds` 与 `names` 等长同序，引用顶层 `skillDefinitions`，不能用全局同名匹配替代当前变体的引用；旧数据缺少这两个新增字段时保留名称与图标占位。
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

## 首版本地集成记录（2026-11-10，c11a86b）

- 已生成 391 个基础来源组、1,792 个命名变体、33 类；这是可审阅的参数目录，逐件获取范围仍待核对。两个有专属 DLC 文本证据的组为“学者的刺剑”和“送葬者的铁锤”。
- 已提取 393 张原生透明图标；目录实际使用的 391 个不同 iconId 全部覆盖。全参数表另有 74 个未匹配图标编号，不影响当前目录。详见 [图片来源](WEAPON_IMAGES.md)。
- 网页目录精简为约 1.8 MB，重复战技候选明细放入外部核对记录。全部使用条件暂标待核对；补正展示基础系数，不生成未经验证的 S–E 等级。详见 [数据依据](WEAPON_DATA.md)。
- 总控独立使用 CSV 对照生成器所读 XML，核对 1,792 个变体的 17,920 个攻击/补正值，并检查 393 张图片的哈希与解码像素；当前无差异。既有怪物、遗物与助手脚本的基线哈希保持一致。
- 工程浏览器验收共 20 项通过、0 项失败，包括搜索与分类、匕首变体、深链/刷新/前进后退、未知 ID、数据失败重试、图片失败、1280×900 / 1280×720 / 390×844 布局、跨页侧栏与手机菜单、键盘、DLC 以及原怪物/词条/遗物/助手和反馈入口回归。
- 验收修复了新增导航导致短屏侧栏底部不可达的问题；导航区域现可在各页及手机菜单独立滚动。武器桌面页缩短标题和留白，列表与详情各自滚动，基础攻击和补正优先进入首屏。
- 本地预览：[http://localhost:4187/#weapons](http://localhost:4187/#weapons)。静态预览的 API 请求被隔离；此次未导入真实存档、调用真实 AI 模型或提交测试反馈。此验收不等于游戏内数值与可获取性全部完成核对。
- 构建输出在仓库外，源码/构建所用六个关键文件哈希一致，tracked dist 未修改；无推送或线上发布。本地预览以隐藏后台进程提供，重启电脑后可使用证据目录中 `qa/start-preview.ps1` 再启动。
- 集成证据目录：`E:\海斗\outputs\weapon-encyclopedia-20261110`。主要文件：`independent-review.json`、`data/validation.json`、`qa/checks.json`、`qa/build-report.json`、`qa/final-integrity.json` 与 `qa/screenshots/`。总控已读取并审核最终通过结果。

## 字母补正与页面精简验收（2026-11-10）

- 数据专项为全部 1,792 个变体生成 `scalingGrades`，保留 8,960 项原始系数。阈值与显示字母来自本作菜单表，比较含义有同工具枚举及样例支持；记录为静态推导，`runtimeVerified: false`，不声称逐件游戏内实测。
- 数据校验覆盖六个阈值的紧邻前值、等值、后值，以及零值、未知和非法输入；CSV 对照与基线深比较通过，名称、攻击、战技、图标和归组未改变。目录 SHA-256：`9ee2c5156d06334f4eed47d62225d561e61b445b9018693eab0c8b67b07b95fa`。
- 前端只读取字母等级，不回落展示原始数字；指定说明、使用条件、资料说明和版本区块已删除。总控已审查源码差异并刷新本地页面确认。
- 本轮 8 项针对性浏览器验收全部通过，覆盖真实变体切换、未知和非法等级、指定内容移除、深链与历史、1280×720 / 390×844 布局和键盘操作。构建前后六个源文件哈希一致，tracked dist 未改变。
- 本地预览继续为 [http://localhost:4187/#weapons](http://localhost:4187/#weapons)，未推送或上线。当前证据在 `E:\海斗\outputs\weapon-encyclopedia-20261110\grades`，含 `root-review.json`、`validation.json`、`mapping-evidence.json` 及 `qa/checks.json`；首版证据归档在 `grades/qa/baseline`。

## 武器、战技与攻击图标集成（2026-11-10）

- 已为入口接入原生直剑轮廓、为基础攻击接入五种既有属性图标，并为当前目录的 182 个战技参数 ID 提取 160×160 无损 WebP 图；这些战技对应 176 个不同名称。导航图按图形选用，不声称已验证游戏内菜单绑定。
- 全部 35,106 个逐变体名称上下文均能唯一匹配，缺失与歧义为 0。六组同名不同 iconId 保留各自引用；其中“欧赫剑舞”的两个原生 iconId 像素相同，不强行替换为不同图。
- 目录新增共享 `skillDefinitions` 和等长同序的 `skill.itemIds`，约 2.18 MB。对照 `b334de2`，除这两个新增字段外，原目录内容完全一致；生成结果可重复，上一轮补正证据哈希未变。当前目录 SHA-256：`d87da9d6246042eccf1a9aea36997fd027e519f09a7a7bf5959f24adafe74fe7`。
- 图片清单 SHA-256：`cb386af1499b26d1c8c4f30c36e3f7657fd55f67576809e47707a675e148b422`。清单的 `catalogueSha256AtExtraction` 记录提取时的 `b334de2` 目录快照；本轮最终目录的完整覆盖由 `icons/root-review.json` 独立核对。所有图片的文件哈希、解码像素及原生参数引用均通过校验，418 个受保护的既有文件保持不变。
- 总控已审查数据、提取脚本与前端差异，并在本地预览确认武器导航、黑刀“死亡刀刃”图片与五项攻击图标正常显示。图标仅补充文字；旧数据、缺清单、缺图或名称映射不一致时保留名称和固定占位，不阻断页面。
- 工程 22 项专项检查全部通过，包含 182 张图片可读与浏览器解码、六组同名战技的 12 个实际显示上下文、固定/候选战技与变体切换、五种攻击图标（含零值）、旧目录/清单失败/缺图/未核验/名称不符/404 回退，以及 1280×720 和 390×844 布局、键盘导航及备案链接可达。总控已查看桌面与手机截图。构建前后八个关键文件哈希一致，tracked dist 未改变。
- 预览地址仍为 [http://localhost:4187/#weapons](http://localhost:4187/#weapons)，后台进程已恢复；本轮未推送或部署线上站点。静态预览的 API 保持隔离，浏览器验收未调用真实模型或提交反馈。
- 本轮证据集中在 `E:\海斗\outputs\weapon-encyclopedia-20261110\icons`：`root-review.json`、`validation.json`、`data/validation.json`、`data/integrity.json`、原生图像对照和 `qa/`。当前仍仅为本地预览，原游戏文件未修改，也未以本次静态提取代替游戏内实测。

## 双列列表与候选池说明精简（2026-11-10）

- 按用户批准的 ADR-015 删除战技候选池下方两段说明，保留“固定战技”的现有说明与候选池标题，不改变战技集合或数值。
- 列表使用容器查询：内容宽度达到 600px 时两列，窄侧栏与手机保持一列。工程实际测得 599.69px 一列、600.63px 两列；807px 附近的上下布局可同时看到两件武器。
- 工程专项 5 项通过、0 项失败，覆盖两段文字消失、固定战技说明保留、临界宽度、分页/选中/键盘操作、桌面及手机长名称。总控已核对源码差异、报告和双列截图。
- 当前预览仍为 [http://localhost:4187/#weapons](http://localhost:4187/#weapons)。证据在 `E:\海斗\outputs\map-nightlord-20261110\qa\weapons`；同期地图功能的独立验收见 [MAPS.md](MAPS.md)。目录与既有图片哈希未变，构建输出位于仓库外，未推送或部署线上。
