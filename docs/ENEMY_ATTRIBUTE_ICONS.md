# 敌人详情属性图标来源

图鉴中“伤害倍率”和“异常状态抗性”使用本地 PNG 图标。图片取自[黑夜君临资料站 WIKI 的艾德雷页面](https://wiki.biligame.com/nightreign/艾德雷)，原图托管在 `patchwiki.biligame.com`。

抓取日期：2026-10-30。许可状态：未核实；此记录不代表素材已获授权。

## 素材映射

映射按 `public/enemy-data.json` 的固定列索引实现，不根据显示文字模糊匹配。图标只作为标签旁的装饰；`alt` 为空，图片加载失败时隐藏图片并保留文字。

| 列索引 | 标签 | 本地文件 | 原图来源 |
| ---: | --- | --- | --- |
| 5 | 普通 | `damage-physical.png` | https://patchwiki.biligame.com/images/nightreign/1/1a/3kbzbqkbsep2ddku4fwntyvv5gkgdfq.png |
| 6 | 斩击 | `damage-slash.png` | https://patchwiki.biligame.com/images/nightreign/3/36/8f6dnyhtoqb2bmyqiinhvinnfp5nbuj.png |
| 7 | 打击 | `damage-strike.png` | https://patchwiki.biligame.com/images/nightreign/0/0d/ip5uefz9uplef3a1zobe4p0mxbak1ox.png |
| 8 | 突刺 | `damage-pierce.png` | https://patchwiki.biligame.com/images/nightreign/f/f8/1nkis9nidocbzqal4zpwm6ovcd4hvm3.png |
| 9 | 魔力 | `damage-magic.png` | https://patchwiki.biligame.com/images/nightreign/7/7d/t4djs5lsvuh1tcegf5fiorp0indjwk5.png |
| 10 | 火焰 | `damage-fire.png` | https://patchwiki.biligame.com/images/nightreign/a/a2/jqhhafr8uweur482ck1ysg6g4di2x8i.png |
| 11 | 雷电 | `damage-lightning.png` | https://patchwiki.biligame.com/images/nightreign/f/fe/o8la5zxl0gmus8f1sugkifmog7rpsm0.png |
| 12 | 神圣 | `damage-holy.png` | https://patchwiki.biligame.com/images/nightreign/5/58/buhd3qkh81kijol5pucs2q754b72tbu.png |
| 13 | 毒素 | `status-poison.png` | https://patchwiki.biligame.com/images/nightreign/d/d9/eeiplvwscsvlv39q70fzjw6d7iiwrqe.png |
| 14 | 腐败 | `status-rot.png` | https://patchwiki.biligame.com/images/nightreign/c/c4/mlqmejtek9097qtcdm15h2luhjlxvi5.png |
| 15、20 | 出血、承受·出血 | `status-bleed.png` | https://patchwiki.biligame.com/images/nightreign/f/f7/fbxxuujofqdlpptii6ohi68duphnoe3.png |
| 16、21 | 冻伤、承受·冻伤 | `status-frost.png` | https://patchwiki.biligame.com/images/nightreign/1/1b/1vd2qpd0ib48t648i5dezv8emu42syc.png |
| 17、22 | 催眠、承受·催眠 | `status-sleep.png` | https://patchwiki.biligame.com/images/nightreign/5/5b/d3549ey5gky3gf1149en7nn4aryyhqd.png |
| 18、23 | 发狂、承受·发狂 | `status-madness.png` | https://patchwiki.biligame.com/images/nightreign/d/d3/30ngd7ncfx6ide1zf4x5rup3i08o8du.png |
| 19 | 骤死 | 不使用图标 | — |

图标存放于 `public/enemy-attribute-icons/`，不修改敌人数据文件或图片审核白名单。
