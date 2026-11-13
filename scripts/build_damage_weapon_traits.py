"""Build selectable weapon traits with exact native pool and effect references.

Separate missing damage rules from utility traits and attribute-point grants.
This does not assert that arbitrary selected traits form a legal dropped item.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
SHOWCASE = [(19020000, 19020000, 1051), (9040000, 9040000, 1177),
            (9080000, 9080000, 112), (9010000, 9010500, 214),
            (1070000, 1070000, 1017), (1160000, 1160000, 1037)]
STAT_FIELDS = {"addStrengthStatus": "strength", "addDexterityStatus": "dexterity",
               "addMagicStatus": "intelligence", "addFaithStatus": "faith", "addLuckStatus": "arcane"}
OTHER_STATS = {"addLifeForceStatus": "vigor", "addWillpowerStatus": "mind",
               "addEndureStatus": "endurance", "addVitalityStatus": "vitality"}
STAT_LABELS = {"strength": "力气", "dexterity": "灵巧", "intelligence": "智力", "faith": "信仰",
               "arcane": "感应", "vigor": "生命力", "mind": "集中力", "endurance": "耐力", "vitality": "体力"}
DAMAGE_FIELDS = [p + s for p in ["physics", "magic", "fire", "thunder", "dark"]
                 for s in ["AttackRate", "AttackPowerRate"]]
# Audited utility titles only; no inference that every non-scalar proc is harmless.
NON_DAMAGE_TITLES = {
    "提升瓦解防御的能力", "提升魔力属性减伤率", "提升火属性减伤率", "提升雷属性减伤率", "提升圣属性减伤率",
    "提升对中毒的抵抗力", "提升对出血的抵抗力", "提升对催眠的抵抗力", "提升对骤死的抵抗力",
    "提升对腐败的抵抗力", "提升对冻伤的抵抗力", "提升对发狂的抵抗力", "提升防御强度",
    "蓄力攻击命中时，提升减伤率", "缩短魔法、祷告的咏唱时间", "减少魔法、祷告专注值消耗",
    "咏唱魔法、祷告时，提升减伤率", "减少战技专注值消耗", "提升观察力", "敌人比较不会攻击自己",
    "持续恢复血量", "攻击命中时，恢复血量", "攻击命中时，恢复专注值", "连续攻击时，仅限一次提升减伤率",
    "受到损伤时，恢复专注值", "受到损伤时，提升减伤率", "打倒敌人时，恢复血量", "打倒敌人时，恢复专注值",
    "防御成功时，提升强韧度", "防御成功时，提升减伤率", "血量偏低时，提升减伤率", "血量全满时，提升减伤率",
    "降低血量上限", "降低专注值上限", "降低精力上限", "降低物理减伤率", "降低属性减伤率",
    "降低对所有异常状态的抵抗力", "降低圣杯瓶恢复量", "持续减少血量", "被黑夜雨淋到的损伤加剧",
    "时间越接近夜晚，受到的损伤加剧", "闪避后的当下，降低减伤率", "连续闪避时，降低减伤率",
    "使用圣杯瓶时，降低减伤率", "血量没有全满时，降低绝招量表累积", "血量没有全满时，累积中毒量表",
    "血量没有全满时，累积猩红腐败量表", "精力偏少时，降低减伤率", "增加因异常状态受到的损伤",
    "濒死时，减少绝招量表", "濒死时，降低血量上限", "提升血量上限", "提升专注值上限", "减少专注值消耗",
    "提升精力上限", "提升精力恢复速度", "提升让敌人失去平衡的能力", "提升物理减伤率", "提升属性减伤率",
    "提升对所有异常状态的抵抗力", "提升强韧度", "延长魔法、祷告的有效时间", "提升圣杯瓶恢复量",
    "打倒敌人时，增加获得的卢恩", "使用圣杯瓶时，也恢复专注值",
}


def build(source):
    inputs = set()

    def table(name):
        path = source / "strict/regulation-bin" / (name + ".param.xml")
        inputs.add(path)
        root = ET.parse(path).getroot()
        defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
        return [{**defaults, **r.attrib} for r in root.find("rows")]

    def names(kind):
        result = {}
        for path in sorted((source / "localized/text-bundles/data0/msg/zhocn").rglob(kind + "*.fmg.xml")):
            inputs.add(path)
            for row in ET.parse(path).getroot().find("entries"):
                text = (row.text or "").strip()
                if text and text != "%null%":
                    result.setdefault(int(row.get("id")), text)
        return result

    custom = table("EquipParamCustomWeapon")
    attach = {int(r["id"]): r for r in table("AttachEffectParam")}
    sp = {int(r["id"]): r for r in table("SpEffectParam")}
    weapons = {int(r["id"]): r for r in table("EquipParamWeapon")}
    effects_path = ROOT / "public/damage-effects.json"
    damage = json.loads(effects_path.read_text(encoding="utf-8"))
    rules = defaultdict(list)
    for row in damage["effects"]:
        if row.get("nativeEffectId") is not None:
            rules[row["nativeEffectId"]].append(row)
    titles, weapon_names = names("AttachEffectName"), names("WeaponName")

    # These tables repeat IDs; do not flatten them into a dictionary of one row.
    arts, pools = defaultdict(set), defaultdict(set)
    invalid_candidates = defaultdict(set)
    inactive = 0
    for row in table("SwordArtsTableParam"):
        if int(row["chanceWeight"]) > 0 and int(row["swordArtsId"]) >= 0:
            arts[int(row["id"])].add(int(row["swordArtsId"]))
    for row in table("AttachEffectTableParam"):
        base, override = int(row["chanceWeight"]), int(row["chanceWeight_dlc"])
        dlc = base if override == -1 else override
        if base <= 0 and dlc <= 0:
            inactive += 1
            continue
        eid = int(row["attachEffectId"])
        if eid <= 0 or eid not in attach:
            invalid_candidates[int(row["id"])].add(eid)
            continue  # Keep unresolved legacy rows separate from valid candidates.
        pools[int(row["id"])].add(eid)

    references = defaultdict(list)
    for row in table("ItemTableParam"):
        if row["itemCategory"] == "6" and int(row["chanceWeight"]) > 0 and int(row["quantity"]) > 0:
            references[int(row["itemId"])].append("ItemTableParam#" + row["id"])
    for name in ["ItemLotParam_enemy", "ItemLotParam_map"]:
        for row in table(name):
            for slot in range(1, 9):
                if row[f"lotItemCategory{slot:02}"] == "6" and int(row[f"lotItemBasePoint{slot:02}"]) > 0:
                    references[int(row[f"lotItemId{slot:02}"])].append(f"{name}#{row['id']}.lotItemId{slot:02}")

    trait_origins = defaultdict(list)
    profiles, showcased = [], []
    for wid, variant, aid in SHOWCASE:
        assert wid in weapons and variant in weapons
        selected = [r for r in custom if int(r["targetWeaponId"]) == wid and int(r["id"]) in references
                    and aid in arts[int(r["swordArtsTableId"])]]
        if not selected:
            raise ValueError(f"No referenced native custom weapon supports {wid}/{aid}")
        for row in selected:
            cid = int(row["id"])
            slots = [int(row[f"attachEffectTableId_{i}"]) for i in range(1, 7)]
            if any(pid != -1 and not pools[pid] for pid in slots):
                raise ValueError(f"Unresolved selected native weapon pool: {cid}")
            if any(invalid_candidates[pid] for pid in slots if pid != -1):
                raise ValueError(f"Unresolved candidate in selected native weapon pool: {cid}")
            profile = {"id": cid, "weaponId": wid, "artId": aid, "isCursed": row["isCursed"] == "1",
                             "slotPoolIds": [pid if pid != -1 else None for pid in slots],
                             "dropReferenceExamples": list(dict.fromkeys(references[cid]))[:3],
                             "source": f"EquipParamCustomWeapon#{cid}"}
            if profile["isCursed"]:
                # Compare complete source rows, without inferring a relationship from ID offsets.
                unchanged_fields = [field for field in row if field not in {"id", "isCursed"}
                                    and not field.startswith("attachEffectTableId_")]
                peers = [peer for peer in selected if peer["isCursed"] == "0"
                         and peer["attachEffectTableId_1"] == row["attachEffectTableId_2"]
                         and all(peer[field] == row[field] for field in unchanged_fields)]
                if len(peers) != 1 or slots[:3] != slots[3:] or -1 in slots[3:]:
                    raise ValueError(f"Review red weapon configuration {cid}: ambiguous counterpart or slots")
                profile.update(redTraitSlots=slots[3:], ordinaryPeerId=int(peers[0]["id"]),
                               targetWeaponId=int(row["targetWeaponId"]), weaponLevel=int(row["weaponLevel"]))
            profiles.append(profile)
            for slot, pid in enumerate(slots, 1):
                if pid == -1:
                    continue
                for eid in pools[pid]:
                    trait_origins[eid].append({"weaponId": wid, "customWeaponId": cid,
                                               "field": f"attachEffectTableId_{slot}", "poolId": pid,
                                               "isCursed": profile["isCursed"],
                                               "mode": "deep" if row["isCursed"] == "1" or slot >= 4 else "normal"})
        showcased.append({"id": wid, "variantId": variant, "artId": aid,
                          "name": weapon_names.get(variant, weapon_names.get(wid, str(wid))),
                          "customWeaponIds": [int(r["id"]) for r in selected]})

    def passive_ids(row):
        return [int(row[f"passiveSpEffectId_{i}"]) for i in range(1, 4)
                if int(row[f"passiveSpEffectId_{i}"]) >= 0]

    def stat_gains(sids, fields):
        return {label: sum(int(sp[sid][field]) for sid in sids) for field, label in fields.items()
                if any(int(sp[sid][field]) != 0 for sid in sids)}

    traits = []
    for eid, origins in sorted(trait_origins.items()):
        row = attach[eid]
        sids = passive_ids(row)
        if any(sid not in sp for sid in sids):
            raise ValueError(f"Missing selected passive effect: {eid}")
        name = titles.get(int(row["attachTextId"]), f"词条 #{eid}")
        label = name
        if row["displayPercentageSymbol"] == "1":
            label += "（" + row["displayedModifierValue"] + "%）"
        scalar_ids = {sid for sid in sids if any(float(sp[sid][key]) != 1 for key in DAMAGE_FIELDS)}
        known = rules[eid]
        stats, other = stat_gains(sids, STAT_FIELDS), stat_gains(sids, OTHER_STATS)
        if known:
            status = "partial" if scalar_ids - {r["spEffectId"] for r in known} else "supported"
            note = "按原生适用属性、命中分类及条件计算。"
        elif stats:
            status, note = "stat-gains", "攻击相关属性点须在面板补正前加入；手填最终面板不重复计入。"
        elif name in NON_DAMAGE_TITLES and not scalar_ids:
            status, note = "non-damage", "不直接改变本次命中的输出伤害；其恢复、减伤或其他效果仍然存在。"
        else:
            status, note = "missing-rule", "尚缺该效果的命中、换算或触发规则；不能把它按零伤害处理。"
        if eid in {8821000, 8821050}:
            note = "随机掠过惩罚的触发概率/单次状态未核实，不能把0.01设为全程伤害倍率。"
        if eid // 100 in {83000, 83100}:
            note = "武器分量修正 isUseAtkParamAtkPowerCorrect 未完整核实，不能当全命中倍率。"
        examples = {}
        for origin in origins:
            examples.setdefault((origin["weaponId"], origin["poolId"], origin["mode"], origin["isCursed"]), origin)
        trait = {"id": eid, "name": label, "polarity": "negative" if row["isDebuff"] == "1" else "positive",
                 "effectIds": [r["id"] for r in known], "calculationStatus": status, "note": note,
                 "weaponIds": sorted({r["weaponId"] for r in origins}),
                 "modes": sorted({r["mode"] for r in origins}), "poolIds": sorted({r["poolId"] for r in origins}),
                 "sourceRefs": list(examples.values()), "nativeOriginsCount": len(origins), "spEffectIds": sids,
                 "source": f"AttachEffectParam#{eid}; AttachEffectName#{row['attachTextId']}"}
        if stats:
            trait["statGains"] = stats
        if other:
            trait["nonAttackStatGains"] = other
        if known:
            trait["conditions"] = list(dict.fromkeys(c for r in known for c in r.get("conditions", [])))
        traits.append(trait)

    # Corpse assignment is runtime data, not an ordinary random weapon pool.
    # Collapse only calculation-equivalent IDs, never rewrite a save's native ID.
    corpses = defaultdict(list)
    for eid, row in attach.items():
        text_id = int(row["attachTextId"])
        if "不甘" in titles.get(text_id, ""):
            corpses[(text_id, tuple(passive_ids(row)))].append(eid)
    for (text_id, sids), aliases in sorted(corpses.items()):
        stats, other = stat_gains(sids, STAT_FIELDS), stat_gains(sids, OTHER_STATS)
        if not stats and not other:
            raise ValueError(f"Unresolved corpse attribute payload: {text_id}")
        suffix = "、".join(STAT_LABELS[k] + f"{v:+d}" for k, v in {**stats, **other}.items())
        traits.append({"id": min(aliases), "name": titles[text_id] + "（" + suffix + "）", "polarity": "corpse",
                       "effectIds": [], "calculationStatus": "stat-gains" if stats else "non-damage",
                       "statGains": stats, "nonAttackStatGains": other, "aliasIds": sorted(aliases),
                       "sourceCharacterId": str((text_id - 9990000) // 100),
                       "weaponIds": [r[0] for r in SHOWCASE], "modes": ["normal", "deep"], "poolIds": [],
                       "assignmentStatus": "corpse-runtime-assignment-unverified",
                       "note": "原生属性点载荷已核对；名称是来源角色，不限制接收者。尸体赋予链和多份叠加未核实。",
                       "source": f"AttachEffectName#{text_id}; AttachEffectParam#{min(aliases)} -> SpEffectParam#{','.join(map(str,sids))}",
                       "spEffectIds": list(sids)})

    manifest_path = source / "source-manifest.json"
    inputs.add(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    result = {"traits": traits, "weapons": showcased, "profiles": profiles,
              "pools": {str(pid): sorted(pools[pid]) for pid in sorted({p for r in profiles for p in r["slotPoolIds"] if p is not None})},
              "victoryAttributeGains": {"status": "manual-actual-points", "automaticEnemyMapping": "unverified",
                  "pointsPerKill": None, "applyBeforeScaling": True, "skipWhenManualPanel": True,
                  "fields": [{"id": key, "name": STAT_LABELS[key], "labelTextId": tid}
                             for key, tid in [("strength",19700030),("dexterity",19700040),("intelligence",19700050),
                                              ("faith",19700060),("arcane",19700070)]],
                  "note": "只输入实际已获得的属性点；文本ID不是可执行加点效果。不能从击杀数、卢恩或敌人名称推算固定点数。"},
              "metadata": {"version": "native-" + manifest["regulation_version"] + "-v1",
                  "gameVersion": manifest["executable_version"], "runtimeVerified": False,
                  "poolPolicy": "positive base OR effective DLC weight; exact referenced CustomWeapon and supported skill table",
                  "modeConvention": "fields1-3 normal / fields4-6 deep; red restricted to deep by approved user rule; not proof every candidate is mandatory",
                  "sourceRefsPolicy": "one example per weapon/pool/mode/curse state; profiles retain all exact six-field vectors",
                  "counts": {"traits": len(traits), "polarity": dict(Counter(t["polarity"] for t in traits)),
                             "calculationStatus": dict(Counter(t["calculationStatus"] for t in traits)),
                             "profiles": len(profiles), "weapons": len(showcased), "inactivePoolRowsExcluded": inactive},
                  "unknown": ["corpse assignment and multiple-copy stacking", "per-enemy attribute reward amounts",
                              "random miss probability", "arbitrary multi-trait combination legality", "runtime execution of every static drop reference"],
                  "damageEffects": {"file": "public/damage-effects.json", "sha256": hashlib.sha256(effects_path.read_bytes()).hexdigest()},
                  "sources": [{"file": f.relative_to(source).as_posix(), "sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
                              for f in sorted(inputs)],
                  "rights": "Derived from local game data; rights remain with original owners."}}
    assert len({r["id"] for r in traits}) == len(traits)
    ids = {r["id"] for r in damage["effects"]}
    assert all(set(r["effectIds"]) <= ids for r in traits)
    return result


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=ROOT / "public/damage-weapon-traits.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build(args.source_root)
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Weapon trait output differs from sources")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(json.dumps(data["metadata"]["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
