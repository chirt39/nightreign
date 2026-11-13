"""Build unbuffed Nightfarer weapon panels from the existing NR extraction.

No game files are unpacked or modified. See --help for input/output overrides.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from build_weapon_catalog import Extraction, DEFAULT_SOURCE

ROOT = Path(__file__).resolve().parents[1]
STATS = {"strength": ("Strength", "Strength"), "dexterity": ("Dexterity", "Agility"),
         "intelligence": ("Intelligence", "Magic"), "faith": ("Faith", "Faith"),
         "arcane": ("Arcane", "Luck")}
ELEMENTS = {"physical": ("Physics", "physics"), "magic": ("Magic", "magic"),
            "fire": ("Fire", "fire"), "lightning": ("Thunder", "thunder"), "holy": ("Dark", "dark")}
ELEMENT_STATS = {"strength": "Strength", "dexterity": "Dexterity", "intelligence": "Magic", "faith": "Faith", "arcane": "Luck"}
PHYSICAL_TYPES = {0: "slash", 1: "strike", 2: "thrust", 3: "normal"}
QUALITY_COLORS = {0: "gray", 1: "blue", 2: "purple", 3: "gold"}
GAIN_FIELDS = {"strength": "addStrengthStatus", "dexterity": "addDexterityStatus",
               "intelligence": "addMagicStatus", "faith": "addFaithStatus", "arcane": "addLuckStatus"}


def quality_profile(row, steps, custom_rows, drop_configurations):
    rarity = int(row["rarity"])
    gold_step = 3 - rarity
    can_volcano = rarity in (0, 1, 2) and gold_step in steps
    cursed = [r["id"] for r in custom_rows if r["isCursed"] == "1"]
    dropped_cursed = [cid for cid in cursed if cid in drop_configurations]
    levels = {int(r["weaponLevel"]) for r in custom_rows if r["id"] in dropped_cursed}
    if dropped_cursed and (levels != {0} or rarity != 2):
        raise ValueError(f"Review red weapon reinforcement for {row['id']}")
    return {"baseColor": QUALITY_COLORS.get(rarity), "nativeRarity": rarity,
        "colorByReinforcement": {str(step): QUALITY_COLORS.get(rarity + step) for step in steps},
        "canVolcano": can_volcano, "volcanoReinforcement": gold_step if can_volcano else None,
        "volcanoColor": "gold" if can_volcano else None,
        "redAvailable": True if dropped_cursed else None, "redConfigurationIds": cursed,
        "redDropConfigurationIds": dropped_cursed,
        "redCanVolcano": False, "redReinforcement": next(iter(levels), None),
        "source": {"weaponRowId": row["id"], "reinforceTypeId": row["reinforceTypeId"]}}


def unique(rows, table):
    result = {r["id"]: r for r in rows}
    if len(result) != len(rows):
        raise ValueError(f"Duplicate {table} IDs")
    return result


def numeric(row, field):
    return float(row[field])


def character_levels(anchors):
    """Use NR's own level knots; interpolate each attribute and round down."""
    result = {}
    for level in range(1, 16):
        left = max((r for r in anchors if int(r["totalLevel"]) <= level), key=lambda r: int(r["totalLevel"]))
        right = min((r for r in anchors if int(r["totalLevel"]) >= level), key=lambda r: int(r["totalLevel"]))
        a, b = int(left["totalLevel"]), int(right["totalLevel"])
        stats = {}
        for key, (hero, _) in STATS.items():
            lo, hi = int(left["stat" + hero]), int(right["stat" + hero])
            stats[key] = lo if a == b else lo + (hi - lo) * (level - a) // (b - a)
        # All shipped base-character rows currently use 1. Do not silently
        # interpolate a future unknown attack-rate implementation.
        if left["attackRate"] != "1" or right["attackRate"] != "1":
            raise ValueError("Non-unit HeroStatusParam.attackRate requires review")
        result[str(level)] = stats
    return result


def build(source, catalog_path):
    extraction = Extraction(source)
    weapon_rows = unique(extraction.param("EquipParamWeapon"), "EquipParamWeapon")
    heroes = extraction.param("HeroParam")
    statuses = unique(extraction.param("HeroStatusParam"), "HeroStatusParam")
    reinforcement = unique(extraction.param("ReinforceParamWeapon"), "ReinforceParamWeapon")
    elements = unique(extraction.param("AttackElementCorrectParam"), "AttackElementCorrectParam")
    graphs = unique(extraction.param("CalcCorrectGraph"), "CalcCorrectGraph")
    common = unique(extraction.param("GameSystemCommonParam"), "GameSystemCommonParam")["0"]
    attack_scale = numeric(common, "unknown_30C")
    if attack_scale != numeric(common, "unknown_310") or attack_scale != 0.6:
        raise ValueError("Common attack rates changed; recheck against menu and projectile observations")
    # Local paramdef labels for these offsets predate the identified weapon paths.
    red_panel_rate = numeric(common, "rewardMultiplierSuperTargetBoss3")
    red_projectile_rate = numeric(common, "rewardMultiplierSuperTargetBoss4")
    if (red_panel_rate, red_projectile_rate) != (1.1, 1.07):
        raise ValueError("Recheck red weapon paths and GameSystemCommonParam[0]+0x47C/+0x480 for this build")
    custom = extraction.param("EquipParamCustomWeapon")
    custom_by_weapon = {}
    for row in custom:
        custom_by_weapon.setdefault(row["targetWeaponId"], []).append(row)
    drop_configurations = {r["itemId"] for r in extraction.param("ItemTableParam")
        if r["itemCategory"] == "6" and int(r["chanceWeight"]) > 0}
    special_effects = unique(extraction.param("SpEffectParam"), "SpEffectParam")
    names = extraction.texts("CL_MenuText")
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    characters, character_stats, character_curves = [], {}, {}
    for hero in heroes:
        hero_id = hero["id"]
        name_options = {entry["text"] for entry in names.get(hero["characterNameId"], [])}
        if len(name_options) != 1:
            raise ValueError(f"Missing/ambiguous hero name {hero_id}")
        start = int(hero["heroStatusParamId"])
        anchors = [statuses[str(start + i)] for i in range(4)]
        if [int(row["totalLevel"]) for row in anchors] != [1, 2, 12, 15]:
            raise ValueError(f"Hero level knots changed: {hero_id}")
        characters.append({"id": hero_id, "name": next(iter(name_options))})
        character_stats[hero_id] = character_levels(anchors)
        character_curves[hero_id] = [{"rowId": r["id"], "level": int(r["totalLevel"]),
            "stats": {k: int(r["stat" + h]) for k, (h, _) in STATS.items()}} for r in anchors]

    variants, used_graphs, used_elements, used_reinforcement = {}, set(), set(), set()
    for weapon in catalog["weapons"]:
        for variant in weapon["variants"]:
            row = weapon_rows[variant["id"]]
            reasons = []
            if row["enableMagic"] == "1" or row["enableMiracle"] == "1":
                reasons.append("施法触媒：法术补正与近战面板不同，暂不自动计算")
            if row["isHeroPointCorrect"] != "0":
                reasons.append("特殊补正标志 isHeroPointCorrect 的运行时语义待核对")
            if any(int(row[field]) >= 0 for field in ("residentSpEffectId", "residentSpEffectId1", "residentSpEffectId2")):
                reasons.append("武器自带常驻特殊效果，尚未纳入无增益面板")
            if any(int(row["proper" + suffix]) > 0 for _, suffix in STATS.values()):
                reasons.append("武器使用条件的惩罚尚未核对")
            graph_ids = {key: row["correctType_" + suffix] for key, (suffix, _) in ELEMENTS.items()}
            for gid in graph_ids.values():
                g = graphs.get(gid)
                if g is None or any(float(g[f"adjPt_maxGrowVal{i}"]) != 1 for i in range(5)):
                    reasons.append("补正曲线缺失或为尚未支持的非线性曲线")
            base_type = int(row["reinforceTypeId"])
            steps = [i for i in range(4) if str(base_type + i) in reinforcement]
            if not steps:
                reasons.append("强化表缺失")
            # Keep the raw coefficients. Display grades are deliberately unused.
            attack = {k: numeric(row, "attackBase" + s) for k, (s, _) in ELEMENTS.items()}
            scaling = {k: numeric(row, "correct" + s) for k, (_, s) in STATS.items()}
            if attack != variant["attack"] or scaling != variant["scaling"]:
                raise ValueError(f"Weapon catalog is stale: {variant['id']}")
            variants[row["id"]] = {"attack": attack, "scaling": scaling,
                "physicalTypes": {field: PHYSICAL_TYPES.get(int(row[field])) for field in ("atkAttribute", "atkAttribute2")},
                "correctionGraphIds": graph_ids, "elementCorrectionId": row["attackElementCorrectId"],
                "reinforceTypeId": row["reinforceTypeId"], "reinforcements": steps,
                "qualityProfile": quality_profile(row, steps, custom_by_weapon.get(row["id"], []), drop_configurations),
                "unavailableReasons": sorted(set(reasons))}
            used_graphs.update(graph_ids.values())
            used_elements.add(row["attackElementCorrectId"])
            used_reinforcement.update(str(base_type + i) for i in steps)

    correction_graphs = {gid: {"points": [[float(graphs[gid][f"stageMaxVal{i}"]),
        float(graphs[gid][f"stageMaxGrowVal{i}"])] for i in range(5)],
        "exponents": [float(graphs[gid][f"adjPt_maxGrowVal{i}"]) for i in range(5)]}
        for gid in sorted(used_graphs, key=int)}
    # Flaming Strike flame (AtkParam_Pc 300200821) overrides its weapon correction.
    used_elements.add("51040")
    element_corrections = {}
    for eid in sorted(used_elements, key=int):
        row = elements[eid]
        element_corrections[eid] = {key: {stat: {
            "enabled": row["is" + hero + "Correct_by" + suffix] == "1",
            "override": numeric(row, "overwrite" + hero + "CorrectRate_by" + suffix),
            "influence": numeric(row, "Influence" + hero + "CorrectRate_by" + suffix),
        } for stat, hero in ELEMENT_STATS.items()} for key, (suffix, _) in ELEMENTS.items()}
    reinforcement_rows = {}
    for rid in sorted(used_reinforcement, key=int):
        row = reinforcement[rid]
        reinforcement_rows[rid] = {
            "attack": {k: numeric(row, prefix + "AtkRate") for k, (_, prefix) in ELEMENTS.items()},
            "scaling": {k: numeric(row, "correct" + suffix + "Rate") for k, (_, suffix) in STATS.items()}}
    manifest_path = source / "source-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (manifest["exe_sha256"] != "9545e8732919bb6a63904cb73223641b3c4f9a67869be5722612acca413e8b3a"
            or manifest["regulation_version"] != "10350000"):
        raise ValueError("Recheck the red weapon mark and attack paths for the new game version")
    return {"schemaVersion": 1, "gameVersion": manifest["executable_version"],
        "regulationVersion": manifest["regulation_version"], "status": "data-backed-inference",
        "runtimeVerified": False, "characters": characters, "levels": list(range(1, 16)),
        "reinforcements": [{"id": i, "name": "未强化" if i == 0 else f"+{i}"} for i in range(4)],
        "characterStats": character_stats, "characterCurves": character_curves,
        "variants": variants, "correctionGraphs": correction_graphs,
        "elementCorrections": element_corrections, "reinforcementRows": reinforcement_rows,
        "statGainExamples": [{"spEffectId": str(base + offset),
            "statGains": {key: int(special_effects[str(base + offset)][field]) for key, field in GAIN_FIELDS.items()}}
            for base in (7000300, 7000400, 7000500, 7000600, 7000700) for offset in range(3)],
        "statGainHandling": "显式加点先加到渡夜者能力，再进入各属性补正曲线；未输入的能力加点为0；超出已知曲线范围返回null，不猜测溢出规则。",
        "redQuality": {"panelRate": red_panel_rate, "projectileRate": red_projectile_rate,
            "panelSource": "GameSystemCommonParam[0]+0x47C", "projectileSource": "GameSystemCommonParam[0]+0x480",
            "observations": ["https://img.gamewith.jp/img/76fc72efc91663a1fd2e0db82e32c2da.png",
                "https://www.reddit.com/r/Nightreign/comments/1st1cdf/ar_difference_between_purple_gold_red/"]},
        "qualityHandling": "native按相对强化档读取一次；volcano直接选择本变体金色目标档，不能与已有强化相乘；红武面板按掉落强化档及红武攻击修正计算一次。",
        "scope": "基础五属性攻击力与显式能力加点；相对强化档位或火山金色目标档；无隐含遗物、常驻特殊效果、双持动作倍率、角色技能、法术或等级同步。",
        "rounding": "角色属性在本作等级节点间线性插值后向下取整；每属性攻击力在基础与补正相加后向下取整。",
        "observedAttackScale": attack_scale,
        "scaleReference": "https://docs.google.com/spreadsheets/d/1J_4rxMAFlTG1b0xtFSQQXg8A_Y2CdYZAnnAF0v0Hmu4/edit",
        "formula": "0.6 * base * reinforceAttack * (1 + sum(influence/100 - 1 + coefficient/100 * reinforceScaling * graph/100 * influence/100))；仅累加属性修正表启用的能力。",
        "summary": {"variants": len(variants), "supportedVariants": sum(not v["unavailableReasons"] for v in variants.values()),
            "unavailableReasons": dict(Counter(reason for v in variants.values() for reason in v["unavailableReasons"]))},
        "provenance": {"source": "Local Steam installation; existing WitchyBND strict extraction",
            "regulationSha256": manifest["regulation_sha256"],
            "files": [{"path": p.relative_to(source).as_posix(), "sha256": hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in sorted(extraction.inputs)],
            "weaponCatalogSha256": hashlib.sha256(catalog_path.read_bytes()).hexdigest(),
            "algorithmReference": "https://github.com/EldenRingDatabase/erdb/blob/master/src/erdb/utils/attack_power.py",
            "algorithmNote": "补正合成参考算法为跨作实现；数值和曲线全部来自本作，尚未逐组合游戏内验证。levelSyncCorrectId 不作为普通面板额外乘数。",
            "license": "本地游戏数据提取；公开再分发许可未确认，沿用项目资料许可边界。"}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--catalog", type=Path, default=ROOT / "public/weapon-catalog.json")
    parser.add_argument("--output", type=Path, default=ROOT / "public/damage-panel.json")
    args = parser.parse_args()
    data = build(args.source_root, args.catalog)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(data["summary"], ensure_ascii=True))


if __name__ == "__main__":
    main()
