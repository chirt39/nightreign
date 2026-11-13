"""Build native Nightreign contact segments (never infer projectile AR scaling).

Requires strict XML params, the c0000 TAE JSONL export, and a fixed Smithbox
checkout for human-readable annotations. TAE events, not annotation ID arithmetic,
select BehaviorParam_PC rows. All source inputs are read-only.
"""
import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path
import re
import struct
import subprocess
import xml.etree.ElementTree as ET

SMITHBOX_COMMIT = "610d3412c1d9433749720eab9739f8911b1b8fe9"
ELEMENTS = {"physical": "Phys", "magic": "Mag", "fire": "Fire", "lightning": "Thun", "holy": "Dark"}
PHYSICAL = {0: "slash", 1: "strike", 2: "thrust", 3: "normal"}
SUB_TAGS = {100: "charged", 102: "jump", 103: "guardCounter", 104: "finalChain",
            111: "charged", 112: "skill", 119: "initialAttack", 122: "characterSkill",
            123: "ultimate", 124: "twoHanded", 125: "dualWield", 127: "running",
            128: "rolling", 129: "backstep", 130: "melee"}
# Only basic right-hand / two-handed animation slots, not special R2 variants,
# left-hand, dual-wield, throws, animation continuations, or landing duplicates.
NORMAL_IDS = set(range(30000, 30070, 10)) | set(range(32000, 32070, 10)) | {
    30200, 30210, 30300, 30400, 30500, 30505, 30510, 30515, 30700,
    31030, 31230, 32200, 32210, 32300, 32400, 32500, 32505, 32510, 32515,
    32700, 33030, 33230}
# Native direct references anchor the skill identity; adjacent IDs alone never do.
SKILLS = {100, 101, 102, 103, 106, 107, 108, 109, 110, 111, 112, 114, 115,
          116, 119, 120, 122, 123, 124, 125}
# Individually named additional contact rows. Kept as separate selections; no
# assertion that all rows fire in one cast or that all weapon variants use them.
SKILL_SEGMENTS = {112: list(range(300000170, 300000176)),
                  114: [300000560, 300000565],
                  115: [300000700, 300000705],
                  123: [300000640, 300000641, 300000642, 300000649, 300000650, 300000655, 300000656]}
WEAPON_NAMES = {1: "短剑", 3: "直剑", 5: "大剑", 7: "特大剑", 9: "曲剑", 11: "大曲剑",
                13: "刀", 14: "双头剑", 15: "刺剑", 16: "重刺剑", 17: "斧", 19: "大斧",
                21: "锤", 23: "大锤", 24: "连枷", 25: "矛", 28: "大矛", 29: "戟",
                31: "镰刀", 33: "徒手", 35: "拳套", 37: "钩爪", 39: "软鞭", 41: "特大武器",
                57: "法杖", 61: "圣印记", 65: "小盾", 67: "中盾", 69: "大盾", 87: "火把"}


def chinese_move(label):
    if label.startswith("Jump"):
        return "跳跃重击" if "Hard" in label else "跳跃轻击"
    name = label.replace("Attack ", "").replace("Right ", "").replace("Both ", "")
    for old, new in (("Light", "轻击"), ("Ligh", "轻击"), ("Heavy", "重击"),
                     ("Counter", "防御反击"), ("Dash", "奔跑"), ("Step", "翻滚"),
                     ("Backstep", "后撤步攻击"), ("Start", "蓄力起始段"), ("End", "释放段")):
        name = name.replace(old, new)
    return " ".join(name.split())


def unknown_segment(key, name, source, tags=()):
    return {"id": key, "name": name, "physicalType": None, "rates": None, "flat": None,
            "hits": 1, "tags": list(tags), "source": source, "calculationStatus": "unresolved"}


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1048576), b""):
            h.update(chunk)
    return h.hexdigest()


def load_params(path):
    root = ET.parse(path).getroot()
    defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
    return {int(r.get("id")): {**defaults, **r.attrib} for r in root.find("rows")}


def annotation(repo, relative):
    raw = subprocess.check_output(["git", "show", f"{SMITHBOX_COMMIT}:src/Smithbox.Data/Assets/{relative}"], cwd=repo)
    return json.loads(raw), hashlib.sha256(raw).hexdigest()


def fmg_names(directory, prefix):
    names = {}
    for path in sorted(directory.rglob(prefix + "*.fmg.xml")):
        for item in ET.parse(path).getroot().iter("text"):
            if item.text and item.text != "%null%":
                names[int(item.get("id"))] = item.text
    return names


def segment(atk_id, row, behavior_rows, weapons, label, extra_tags=()):
    raw_attr = int(row["atkAttribute"])
    weapon_field = {252: "atkAttribute2", 253: "atkAttribute"}.get(raw_attr)
    types = {PHYSICAL.get(int(w[weapon_field])) for w in weapons} if weapon_field else {PHYSICAL.get(raw_attr)}
    physical_type = next(iter(types)) if len(types) == 1 else None
    raw_rates = {element: float(row["atk" + suffix + "Correction"]) / 100 for element, suffix in ELEMENTS.items()}
    raw_flat = {element: float(row["atk" + suffix]) for element, suffix in ELEMENTS.items()}
    # Nonzero additive attack / alternate elemental scaling requires another
    # formula layer. Keep raw values as evidence, never call it fixed damage.
    safe_ar = not any(raw_flat.values()) and int(row["overwriteAttackElementCorrectId"]) == -1
    subcategories = {f"subCategory{i}": int(row[f"subCategory{i}"]) for i in range(1, 6)}
    tags = set(extra_tags)
    for value in subcategories.values():
        if value:
            tags.add(f"atkSubCategory:{value}")
            if value in SUB_TAGS:
                tags.add(SUB_TAGS[value])
    if 130 in subcategories.values() and safe_ar:
        tags.add("weaponAttack")
    return {
        "id": f"atk-{atk_id}", "name": label, "physicalType": physical_type,
        "rates": raw_rates if safe_ar else None,
        "flat": {element: 0 for element in ELEMENTS} if safe_ar else None,
        "hits": 1, "tags": sorted(tags),
        "source": f"AtkParam_Pc:{atk_id}; BehaviorParam_PC:" + ",".join(str(x["id"]) for x in behavior_rows),
        "evidence": {"atkParamId": atk_id, "behaviorRows": behavior_rows,
                     "spEffectDamageCorrectionPercent": int(row["spEffectAtkPowerCorrectRate_byDmg"]),
                     "rawAtkAttribute": raw_attr, "physicalTypeWeaponField": weapon_field,
                     "subcategories": subcategories, "rawRates": raw_rates,
                     "rawAdditiveAttack": raw_flat, "isAddBaseAtk": int(row["isAddBaseAtk"]),
                     "atkSpEffectIds": [int(row[f"spEffectId{i}"]) for i in range(5) if int(row[f"spEffectId{i}"]) > 0],
                     "isDisableBothHandsAtkBonus": int(row["isDisableBothHandsAtkBonus"]),
                     "overwriteAttackElementCorrectId": int(row["overwriteAttackElementCorrectId"])},
        "calculationStatus": "weapon-ar-contact" if safe_ar else "additional-scaling-unresolved",
    }


# Only traced single-contact bullets with a verified correction path.
AUTO_PROJECTILES = {301902901: 19020000, 301902911: 19020000, 301902921: 19020000,
                    300116900: 1160000, 300107901: 1070000, 300107900: 1070000,
                    300200821: 9010500}


def mark_automatic_projectile(segment):
    evidence = segment["evidence"]
    if (AUTO_PROJECTILES.get(evidence["atkParamId"]) != int(evidence["weaponVariantId"])
            or evidence["isAddBaseAtk"] != 1 or any(evidence["rawRates"].values())):
        return
    # Category 130 on these traced weapon-skill bullets also participates in
    # weapon-domain effects, even though the attack has no blade contact.
    if 130 in evidence["subcategories"].values():
        segment["tags"] = sorted(set(segment["tags"]) | {"weaponAttack"})
    segment["calculationStatus"] = "native-additive-projectile-estimate"
    segment["projectile"]["unresolved"] = ["encounter-specific modifiers and repeat-hit behavior"]


def six_skill_actions(param_dir, taes, tables, bullets, art_names):
    """Forward-trace the six preview weapons; SwordArts.atkParamId is not routing."""
    weapons, behaviors, atks, arts = (tables[k] for k in
        ("EquipParamWeapon", "BehaviorParam_PC", "AtkParam_Pc", "SwordArtsParam"))
    reinforcement = load_params(param_dir / "ReinforceParamWeapon.param.xml")
    effects = load_params(param_dir / "SpEffectParam.param.xml")
    configs = {
        1051: (19020000, [("chain", [40000, 40010, 40020], True), ("no-fp", [40005, 40015, 40025], False)]),
        1177: (9040000, [("chain", [40000, 40010, 40020], True), ("no-fp", [40005, 40015, 40025], False)]),
        112: (9080000, [("chain", [40000, 40010, 40020], True), ("no-fp", [40005, 40015, 40025], False)]),
        214: (9010500, [("release-followup", [40000, 40010], True), ("no-fp", [40005, 40015], False)]),
        1017: (1070000, [("charged-followup", [40000, 40010], True),
                        ("release-followup", [40001, 40010], True),
                        ("charged-no-fp", [40005, 40015], False), ("no-fp", [40006, 40015], False)]),
        1037: (1160000, [("release", [40000], True), ("no-fp", [40005], False)]),
    }
    actions, summary = [], {}
    for sid, (wid, branches) in configs.items():
        weapon, art = weapons[wid], arts[sid]
        variation = int(weapon["behaviorVariationId"])
        motion = 600 + int(art["swordArtsType"])
        clip_table = taes[motion]
        upgrade_base = int(weapon["reinforceTypeId"])
        upgrade_evidence = {str(i): {"reinforceRowId": upgrade_base + i,
            "baseAtkRate": float(reinforcement[upgrade_base + i]["baseAtkRate"])}
            for i in range(4) if upgrade_base + i in reinforcement}
        skill_actions = []
        for branch_index, (branch, clip_ids, enough_fp) in enumerate(branches):
            contact_segments, utility, applied_effects, gaps = [], [], [], []
            fp_costs, fp_events = [], []
            for stage, clip_id in enumerate(clip_ids, 1):
                clip = clip_table[clip_id]
                # These six routes have a single activation followed by optional
                # continuation inputs. Several contacts may share one payment.
                field = "useMagicPoint_L2" if stage == 1 else "useMagicPoint_R2"
                payments = [(index, event) for index, event in enumerate(clip["events"]) if event["Type"] == 330]
                if len(payments) != int(enough_fp) or (enough_fp and int(art[field]) < 0):
                    raise ValueError(f"Unexpected FP routing for art {sid}, clip {clip_id}")
                fp_costs.append(int(art[field]) if payments else 0)
                for index, event in payments:
                    fp_events.append({"inputStage": stage, "swordArtsField": field, "animationId": clip_id,
                                      "eventType": 330, "eventIndex": index, "startTime": event["StartTime"]})
                contact_number = 0
                for event_index, event in enumerate(clip["events"]):
                    raw = bytes.fromhex(event["hex"])
                    tae_proof = {"file": f"a{motion}.tae", "animationId": clip_id,
                        "eventIndex": event_index, "eventType": event["Type"],
                        "rawHex": event["hex"], "startTime": event["StartTime"], "endTime": event["EndTime"]}
                    if event["Type"] == 331:
                        effect_id = struct.unpack_from("<i", raw, 0 if enough_fp else 4)[0]
                        if effect_id in effects:
                            trigger = effects[effect_id]
                            target_id = int(trigger["cycleOccurrenceSpEffectId"])
                            target = effects.get(target_id)
                            if target is not None:
                                applied_effects.append({"triggerEffectId": effect_id, "effectId": target_id,
                                    "inputStage": stage, "tae": tae_proof,
                                    "conditionStateInfo": int(trigger["invocationConditionsStateChange1"]),
                                    "durationSeconds": float(target["effectEndurance"]),
                                    "weaponParamChange": int(target["wepParamChange"]),
                                    "stackCategory": int(target["spCategory"]),
                                    "additiveAttack": {ch: float(target[field]) for ch, field in
                                        (("physical", "physicsAttackPower"), ("magic", "magicAttackPower"),
                                         ("fire", "fireAttackPower"), ("lightning", "thunderAttackPower"), ("holy", "darkAttackPower"))},
                                    "useAtkParamAttackPowerCorrect": bool(int(target["isUseAtkParamAtkPowerCorrect"])),
                                    "alreadyIncludedInSegment": False,
                                    "applicationStatus": "native-trigger-and-effect-verified-condition-must-be-satisfied"})
                        continue
                    if event["Type"] not in (1, 2):
                        continue
                    judge = struct.unpack_from("<i", raw, 8)[0]
                    # These exact six TAE clips encode 3xxx (skill family).
                    # 39xx resolves the actual weapon's behavior variation;
                    # other 3xxx entries are shared skill behavior rows.
                    if not 3000 <= judge < 4000:
                        gaps.append({"tae": tae_proof, "reason": "skill judge routing unresolved"})
                        continue
                    local_judge = judge - 3000
                    bid = 300000000 + (variation * 1000 if local_judge >= 900 else 0) + local_judge
                    behavior = behaviors.get(bid)
                    if behavior is None:
                        gaps.append({"tae": tae_proof, "behaviorId": bid, "reason": "behavior row missing"})
                        contact_segments.append(unknown_segment(f"missing-behavior-{clip_id}-{event_index}",
                            "攻击行为引用缺失", f"TAE {motion}/{clip_id} -> BehaviorParam_PC:{bid}"))
                        continue
                    ref_type, ref_id = int(behavior["refType"]), int(behavior["refId"])
                    proof = {"id": bid, "variationId": int(behavior["variationId"]),
                             "behaviorJudgeId": int(behavior["behaviorJudgeId"]), "refId": ref_id, "refType": ref_type}
                    bullet = bullets.get(ref_id) if ref_type == 1 else None
                    attack_id = bullet["fields"]["atkId_Bullet"] if bullet else ref_id if ref_type == 0 else None
                    attack = atks.get(attack_id)
                    if attack is None:
                        name = "附加弹体引用缺失" if ref_type == 1 else "攻击参数缺失"
                        s = unknown_segment(f"missing-attack-{clip_id}-{event_index}", name,
                            f"TAE {motion}/{clip_id} -> BehaviorParam_PC:{bid} -> refType {ref_type}:{ref_id}",
                            ["projectile"] if ref_type == 1 else [])
                        s["evidence"] = {"tae": tae_proof, "behavior": proof}
                        s["inputStage"] = stage
                        contact_segments.append(s)
                        gaps.append({"behaviorId": bid, "refId": ref_id, "reason": name})
                        continue
                    additive = {ch: float(attack["atk" + suf]) for ch, suf in ELEMENTS.items()}
                    corrections = {ch: float(attack["atk" + suf + "Correction"]) for ch, suf in ELEMENTS.items()}
                    if not any(additive.values()) and not any(corrections.values()):
                        utility.append({"atkParamId": attack_id, "behavior": proof, "tae": tae_proof,
                                        "reason": "All five damage rates and additive attacks are zero; not an extra damage contact."})
                        continue
                    contact_number += 1
                    name = f"第 {stage} 次输入 · {'弹体' if bullet else '刀身'}第 {contact_number} 段"
                    if sid == 214:
                        name = "释放火焰" if bullet and ref_id == 2000 else "重击派生 · 刀身" if stage == 2 else "无专注值释放动作"
                    if sid == 1017:
                        name = (("蓄力彗砾" if "charged" in branch else "未蓄力彗砾") if bullet else
                                "重击派生 · 突刺" if stage == 2 else "释放动作 · 无专注值刀身")
                    if sid == 1037:
                        name = "黄金刀刃弹体" if bullet else "无专注值 · 刀身"
                    if sid == 1051:
                        name = f"第 {stage} 次输入 · {'光环弹体' if bullet else '镰刀接触'}"
                    if sid == 1177:
                        name = f"第 {stage} 次输入 · 攻击窗口 {contact_number}"
                    s = segment(attack_id, attack, [proof], [weapon], name, ["skill"])
                    s["id"] = f"atk-{attack_id}-clip-{clip_id}-event-{event_index}"
                    s["inputStage"] = stage
                    s["evidence"].update({"tae": tae_proof, "behavior": proof,
                        "weaponVariantId": str(wid), "weaponBehaviorVariationId": variation,
                        "weaponSpEffectBehaviorIds": [int(weapon[f"spEffectBehaviorId{i}"]) for i in range(3)
                                                      if int(weapon[f"spEffectBehaviorId{i}"]) > 0],
                        "swordArtsParamReference": {"id": sid, "swordArtsType": int(art["swordArtsType"]),
                            "atkParamId": int(art["atkParamId"]), "role": "display/AI-reference-not-authoritative-release-routing"},
                        "hitVolumes": {k: v for k, v in attack.items() if re.match(r"hit\d+_(Radius|DmyPoly[12]|hitType)$", k)}})
                    if bullet:
                        s["tags"] = sorted((set(s["tags"]) | {"projectile"}) - {"weaponAttack", "melee"})
                        s["rates"] = s["flat"] = None
                        s["manualChannels"] = [ch for ch, value in additive.items() if value > 0]
                        s["calculationStatus"] = "independent-projectile-components-required"
                        s["projectile"] = {"bulletId": ref_id, "rawBaseComponents": additive,
                            "baseAtkRatesByReinforcement": upgrade_evidence,
                            "panelSource": "independent-additive-attack-not-weapon-AR",
                            "manualInputBasis": "pre-defense elemental attack for ONE contact, before selected hit/final buffs; not HP damage",
                            "rawBaseIsEstimatedDamage": False,
                            "unresolved": ["full character-stat/level correction formula", "projectile tail flags and repeat-hit behavior"]}
                        mark_automatic_projectile(s)
                        chain, seen, child = [], {ref_id}, int(bullet["fields"]["HitBulletID"])
                        while child >= 0 and child not in seen:
                            seen.add(child)
                            child_bullet = bullets.get(child)
                            chain.append({"bulletId": child, "exists": child_bullet is not None,
                                "atkParamId": child_bullet["fields"]["atkId_Bullet"] if child_bullet else None})
                            child = int(child_bullet["fields"]["HitBulletID"]) if child_bullet else -1
                        s["evidence"]["bullet"] = {k: bullet[k] for k in
                            ("bulletId", "offset", "length", "fields", "attackReferences", "prefix128Hex")}
                        s["evidence"]["hitBulletContinuation"] = {"chain": chain,
                            "countedAsAdditionalHits": False,
                            "note": "HitBulletID proves continuation, not independent additional landed damage; do not automatically sum its same-damage child."}
                    contact_segments.append(s)
            if sid == 1177 and enough_fp:
                geometry = unknown_segment("corpse-piler-component-separation", "刀身与血刃的近远分量／重叠关系未核实",
                    "a777.tae invokes six AttackBehavior windows, no BulletBehavior; each 303400300..305 contains hit0(type 0, radius .55, dummies 16..182) and hit1(type 2, radius .1, dummy 122). Multiple volumes do not prove additive hits.")
                geometry["evidence"] = {"excludedNearbyRows": list(range(303400380, 303400386)),
                    "excludedBehaviorVariationId": 999, "actualBehaviorVariationId": 906,
                    "taeEventTypes": sorted({e["Type"] for clip_id in clip_ids for e in clip_table[clip_id]["events"]}),
                    "noIndependentBulletEventInSelectedClips": True,
                    "countingRule": "Each known row is one native attack window. Near/far effects are not separate damage additions."}
                contact_segments.append(geometry)
            if sid == 214 and applied_effects:
                buff_gap = unknown_segment("flaming-strike-enchantment-addition", "附魔火攻击增量（条件与应用待核实）",
                    "a663.tae/40010 type331 at .2s -> SpEffect 1775/1777 -> 1776/1778; +35 fire, 40s; attack window .6s; this addition is not included in automatic base-panel damage")
                buff_gap["conditional"] = True
                buff_gap["evidence"] = {"effectIds": [1776, 1778], "rawFireAttackPower": 35,
                    "isUseAtkParamAtkPowerCorrect": True, "includedInKnownSubtotal": False,
                    "notAutomaticallyStackedTogether": True}
                contact_segments.append(buff_gap)
            branch_label = {"chain": "完整输入连段", "no-fp": "无专注值", "release-followup": "释放与重击派生",
                "charged-followup": "蓄力释放与重击派生", "charged-no-fp": "蓄力动作（无专注值）", "release": "释放"}[branch]
            action_id = "art-112-contact-300000170" if sid == 112 and branch_index == 0 else f"art-{sid}-native-{branch}"
            action = {"id": action_id, "name": art_names[int(art["textId"])] + " · " + branch_label,
                "artId": str(sid), "weaponIds": [str(wid)], "weaponTypes": [int(weapon["wepType"])],
                "fpCosts": fp_costs, "fpConsumptionEvents": fp_events,
                "scope": {"weaponVariantIds": [str(wid)], "weaponBehaviorVariationId": variation,
                    "skillMotionFile": f"a{motion}.tae", "enoughFp": enough_fp,
                    "selectedArtMustMatch": True, "heroMovesetOverrideActive": False,
                    "note": "仅本次预览的实际武器变体；逐段按TAE释放追踪，不用整类武器或SwordArts攻击行代替。"},
                "segments": contact_segments, "appliedWeaponEffects": applied_effects,
                "nonDamageEvents": utility, "unresolvedEvents": gaps,
                "completeDamage": not gaps and all(s["rates"] is not None for s in contact_segments),
                "coverage": "six-preview-weapon-native-release-chain",
                "notes": ["Each TAE attack activation is one selectable contact; hit-volume count is not a hit multiplier.",
                          "Damage-over-time/status buildup and target contact success are not included."]}
            if applied_effects:
                action["weaponEffectPolicy"] = "Choose the effect matching its weaponParamChange and conditionStateInfo; do not sum 1776 and 1778 on one weapon. The +35 fire contribution is not included in the known subtotal."
            actions.append(action)
            skill_actions.append(action)
        summary[str(sid)] = {"variantId": str(wid), "motionFile": f"a{motion}.tae",
            "actions": [a["id"] for a in skill_actions],
            "knownContacts": sum(s["rates"] is not None for a in skill_actions for s in a["segments"]),
            "manualProjectiles": sum(bool(s.get("manualChannels")) for a in skill_actions for s in a["segments"]),
            "missingReferences": sum(len(a["unresolvedEvents"]) for a in skill_actions)}
    return actions, summary


def build(param_dir, tae_path, text_dir, smithbox, bullet_dir=None):
    tables = {name: load_params(param_dir / (name + ".param.xml")) for name in
              ("AtkParam_Pc", "BehaviorParam_PC", "EquipParamWeapon", "SwordArtsParam")}
    atks, behaviors, weapons, arts = (tables[n] for n in tables)
    anim_labels, anim_sha = annotation(smithbox, "Aliases/NR/Animations.json")
    anim_labels = {r["ID"]: r["Name"] for r in anim_labels}
    atk_labels, atk_sha = annotation(smithbox, "PARAM/NR/Param Row Names/English/AtkParam_Pc.json")
    atk_labels = {r["ID"]: r["Entries"][0] for r in atk_labels["Entries"] if any(r["Entries"])}
    weapon_names = fmg_names(text_dir, "WeaponName")
    art_names = fmg_names(text_dir, "ArtsName")
    bullet_dir = bullet_dir or tae_path.parent
    bullet_path = bullet_dir / "bullet-prefix-refs.jsonl"
    behavior_bullet_path = bullet_dir / "behavior-bullet-refs.json"
    bullets = {}
    bullet_behaviors = []
    if bullet_path.exists() and behavior_bullet_path.exists():
        with bullet_path.open(encoding="utf-8") as source:
            bullets = {r["bulletId"]: r for r in map(json.loads, source)}
        bullet_behaviors = json.loads(behavior_bullet_path.read_text(encoding="utf-8"))
    by_variation = defaultdict(dict)
    by_attack = defaultdict(list)
    for bid, row in behaviors.items():
        if row["refType"] == "0" and int(row["refId"]) in atks:
            proof = {"id": bid, "variationId": int(row["variationId"]),
                     "behaviorJudgeId": int(row["behaviorJudgeId"]), "refId": int(row["refId"])}
            # Weapon, skill, hero-skill and other behavior families reuse judges.
            # Only the 100M family is a normal weapon behavior lookup.
            if 100000000 <= bid < 200000000:
                bucket = by_variation[int(row["variationId"])]
                judge = int(row["behaviorJudgeId"])
                if judge in bucket and bucket[judge]["refId"] != proof["refId"]:
                    raise ValueError(f"Ambiguous normal behavior {judge}")
                bucket[judge] = proof
            by_attack[int(row["refId"])].append(proof)
    taes = {}
    with tae_path.open(encoding="utf-8") as source:
        for line in source:
            row = json.loads(line)
            match = re.search(r"[\\/]a(\d+)\.tae$", row["file"])
            if match:
                taes[int(match[1])] = {a["ID"]: a for a in row["animations"]}
    groups = defaultdict(list)
    for wid, weapon in weapons.items():
        # Special-attack categories and paired weapons need their own animation
        # routing. A shared base motion category is insufficient to bind them.
        if wid in weapon_names and int(weapon["spAtkcategory"]) == 0 and int(weapon["isDualBlade"]) == 0:
            groups[(int(weapon["wepmotionCategory"]), int(weapon["behaviorVariationId"]))].append(weapon)
    actions = []
    for (motion, variation), candidates in sorted(groups.items()):
        for aid in sorted(NORMAL_IDS):
            animation = taes.get(motion, {}).get(aid)
            label_id = f"c0000_a{motion:03}_{aid:06}"
            label = anim_labels.get(label_id)
            if not animation or not label:
                continue
            hand = "bothHand" if aid >= 32000 else "oneHand"
            field, expected = ("wepmotionBothHandId", 10) if hand == "bothHand" else ("wepmotionOneHandId", 0)
            bound = [w for w in candidates if int(w[field]) == expected]
            if not bound:
                continue
            segments = []
            unsupported = []
            for index, event in enumerate(animation["events"]):
                if event["Type"] == 2:
                    raw = bytes.fromhex(event["hex"])
                    unsupported.append({"eventIndex": index, "type": 2,
                        "behaviorJudgeId": struct.unpack_from("<i", raw, 8)[0],
                        "stateInfo": struct.unpack_from("<h", raw, 14)[0],
                        "source": raw[19], "rawHex": event["hex"],
                        "reason": "bullet linkage and conditional effects not resolved"})
                if event["Type"] != 1:
                    continue
                raw = bytes.fromhex(event["hex"])
                attack_type, attack_index, judge = struct.unpack_from("<iii", raw)
                source = raw[13]
                proof = by_variation[variation].get(judge)
                if source != 0 or attack_type not in (0, 1, 2, 3) or not proof:
                    unsupported.append({"eventIndex": index, "type": 1, "reason": "source/throw/behavior not resolved"})
                    continue
                atk_id = proof["refId"]
                tags = ["normalAttack"]
                if "Light" in label or "Ligh " in label:
                    tags.append("light")
                if "Heavy" in label or "Hard" in label:
                    tags.append("heavy")
                s = segment(atk_id, atks[atk_id], [proof], bound, chinese_move(label) + f" · 命中段 {len(segments) + 1}", tags)
                s["id"] += f"-event-{index}"
                s["evidence"]["tae"] = {"file": f"a{motion:02}.tae", "animationId": aid,
                    "animationFileName": animation["AnimFileName"], "eventIndex": index,
                    "eventType": 1, "attackType": attack_type, "attackIndex": attack_index,
                    "behaviorJudgeId": judge, "source": source, "rawHex": event["hex"],
                    "startTime": event["StartTime"], "endTime": event["EndTime"]}
                segments.append(s)
            if segments:
                bullet_events = [e for e in unsupported if e["type"] == 2]
                if bullet_events:
                    unknown = unknown_segment("unresolved-bullet-effects", "条件弹体或附加效果（伤害未核实）",
                        f"a{motion:02}.tae animation {aid}: BulletBehavior events; conditions are not assumed active", ["projectile"])
                    unknown["evidence"] = {"taeEvents": bullet_events,
                        "requiredStateInfoIds": sorted({e["stateInfo"] for e in bullet_events if e["stateInfo"] != 0})}
                    unknown["conditional"] = all(e["stateInfo"] != 0 for e in bullet_events)
                    segments.append(unknown)
                for event in (e for e in unsupported if e["type"] != 2):
                    segments.append(unknown_segment(f"unresolved-event-{event['eventIndex']}",
                        "弹体伤害（未核实）" if event["type"] == 2 else "其他攻击段（未核实）",
                        f"a{motion:02}.tae animation {aid} event {event['eventIndex']}: {event['reason']}",
                        ["projectile"] if event["type"] == 2 else []))
                weapon_type = int(bound[0]["wepType"])
                zh_name = chinese_move(label)
                actions.append({"id": f"motion-{motion}-variation-{variation}-animation-{aid}",
                    "name": f"{WEAPON_NAMES.get(weapon_type, '武器')}·{'双手持握' if hand == 'bothHand' else '单手'}·{zh_name}",
                    "weaponIds": [w["id"] for w in bound],
                    "weaponTypes": sorted({int(w["wepType"]) for w in bound}),
                    "scope": {"motionCategory": motion, "behaviorVariationId": variation,
                              "hand": hand, "heroMovesetOverrideActive": False,
                              "specialAttackCategory": 0, "pairedWeapon": False,
                              "note": "仅适用列出的基础武器变体；角色专属动作覆盖启用时不适用。特殊攻击类别与成对武器已排除。"},
                    "segments": segments, "unresolvedEvents": unsupported,
                    "coverage": "animation-contact-events-only", "completeDamage": not unsupported})
    # Executor skill weapon has an explicit hero override, not a universal katana moveset.
    bound = [w for w in weapons.values() if int(w["heroBehaviorVariationID"]) == 960]
    for atk_id, label in sorted(atk_labels.items()):
        if not (960200 <= atk_id <= 960380 and label.startswith("[Executor Skill - Cursed Sword] ")):
            continue
        suffix = label.split("] ", 1)[1]
        if not suffix or atk_id not in atks or not by_attack[atk_id]:
            continue
        zh_suffix = suffix
        for old, new in (("Charged Heavy", "蓄力重击"), ("Running Light", "奔跑轻击"),
                         ("Running Heavy", "奔跑重击"), ("Jump Light", "跳跃轻击"),
                         ("Jump Heavy", "跳跃重击"), ("Guard Counter", "防御反击"),
                         ("Light", "轻击"), ("Heavy", "重击"), ("Rolling", "翻滚攻击"), ("Backstep", "后撤步攻击")):
            zh_suffix = zh_suffix.replace(old, new)
        s = segment(atk_id, atks[atk_id], by_attack[atk_id], bound, zh_suffix, ["characterSkill"])
        actions.append({"id": f"executor-cursed-sword-atk-{atk_id}", "name": "执行者妖刀 · " + zh_suffix,
                        "weaponIds": [w["id"] for w in bound], "weaponTypes": [13],
                        "scope": {"heroId": 8, "heroBehaviorVariationId": 960, "skillWeaponOnly": True},
                        "segments": [s], "coverage": "one-named-contact-row-not-full-combo"})
    for sid in sorted(SKILLS):
        art = arts[sid]
        first = int(art["atkParamId"])
        contacts = []
        for atk_id in SKILL_SEGMENTS.get(sid, [first]):
            if atk_id not in atks or not by_attack[atk_id] or not atk_labels.get(atk_id, "").startswith("[AoW"):
                continue
            # A curated additional contact must share the anchor's skill label.
            label = atk_labels[atk_id]
            detail = label.split("] ", 1)[-1]
            suffix = detail.split(" - ", 1)[1] if " - " in detail else "已核实接触段"
            suffix = suffix.replace("L2", "战技输入").replace("R1", "轻击派生").replace("R2", "重击派生")
            for old, new in (("Swing", "挥击"), ("Initial", "起始段"), ("Small Weapon", "小型武器")):
                suffix = suffix.replace(old, new)
            s = segment(atk_id, atks[atk_id], by_attack[atk_id], [], "刀身 · " + suffix, ["skill", "melee"])
            if sid == 112:
                stage, contact = ((1, 1), (1, 2), (2, 1), (2, 2), (2, 3), (3, 1))[atk_id - 300000170]
                s["name"] = f"第 {stage} 次输入 · 刀身第 {contact} 段"
            if sid == 100:
                s["name"] = "武器本体接触段"
            s["evidence"]["swordArtsParam"] = {"id": sid, "atkParamId": first}
            contacts.append(s)
        art_name = art_names.get(int(art["textId"]), f"战技 {sid}")
        sets = [contacts] if sid in (112, 123) else [[s] for s in contacts]
        for contact_set in sets:
            if not contact_set:
                continue
            atk_id = contact_set[0]["evidence"]["atkParamId"]
            name = art_name + (" · 刀身连段" if sid in (112, 123) else " · " + contact_set[0]["name"])
            wanted_projectiles = ({300000643, 300000644, 300000645, 300000651, 300000652, 300000657, 300000658}
                                  if sid == 123 else {300000461, 300000462} if sid == 122 else set())
            found_projectiles = set()
            for ref in bullet_behaviors:
                if not 300000000 <= ref["behaviorId"] < 400000000:
                    continue
                bullet = bullets.get(ref["bulletId"])
                if not bullet:
                    continue
                projectile_atk = bullet["fields"]["atkId_Bullet"]
                if projectile_atk not in wanted_projectiles or not bullet["attackReferences"]["AtkParam_Pc"]:
                    continue
                found_projectiles.add(projectile_atk)
                label = atk_labels.get(projectile_atk, "")
                stage_labels = {300000643: "第一次输入 · 第一段", 300000644: "第一次输入 · 第二段",
                    300000645: "第一次输入 · 第三段", 300000651: "第二次输入 · 第一段",
                    300000652: "第二次输入 · 第二段", 300000657: "第三次输入 · 第一段",
                    300000658: "第三次输入 · 第二段", 300000461: "起始段", 300000462: "后续段"}
                p = segment(projectile_atk, atks[projectile_atk], [], [], "风暴弹体 · " + stage_labels[projectile_atk], ["projectile", "skill"])
                p["rates"] = p["flat"] = None
                p["tags"] = [t for t in p["tags"] if t not in ("weaponAttack", "melee")]
                p["calculationStatus"] = "projectile-scaling-unresolved"
                p["source"] = f"BehaviorParam_PC:{ref['behaviorId']} refType=1 -> Bullet:{ref['bulletId']} atkId_Bullet -> AtkParam_Pc:{projectile_atk}"
                p["evidence"].update({"behaviorBulletReference": ref,
                    "bullet": {k: bullet[k] for k in ("bulletId", "offset", "length", "fields", "attackReferences", "prefix128Hex")},
                    "annotation": label, "swordArtsAnchor": {"id": sid, "atkParamId": first},
                    "scopeNote": "Skill attribution of additional rows uses fixed NR row annotations; native references prove the bullet-to-PC-attack chain, not execution order or repetition."})
                contact_set.append(p)
            for missing in sorted(wanted_projectiles - found_projectiles):
                contact_set.append(unknown_segment(f"unresolved-projectile-{missing}", "风暴弹体（引用待核实）",
                    f"NR annotation AtkParam_Pc:{missing}; native bullet chain not available", ["projectile"]))
            if wanted_projectiles:
                name = art_name + " · 刀身与风暴命中段（弹体伤害待核实）"
            unknown = unknown_segment("cast-coverage-unresolved", "同招其他伤害是否存在／完整性未核实",
                "TAE skill transitions and projectile chain have not been fully traced; this entry cannot yield a full-cast total")
            actions.append({"id": f"art-{sid}-contact-{atk_id}", "name": name,
                            "artId": str(sid), "segments": contact_set + [unknown],
                            "coverage": "known-contact-subtotal-only", "completeDamage": False})
    # These explicitly annotated paired stages are a single selectable action.
    # Do not merge mutually exclusive light/heavy follow-ups.
    for first_id, second_id, name in ((960305, 960306, "蓄力重击第一式"),
                                      (960315, 960316, "蓄力重击第二式"),
                                      (960325, 960326, "奔跑重击")):
        first = next(a for a in actions if a["id"] == f"executor-cursed-sword-atk-{first_id}")
        second = next(a for a in actions if a["id"] == f"executor-cursed-sword-atk-{second_id}")
        first["name"] = "执行者妖刀 · " + name
        first["segments"].extend(second["segments"])
        first["coverage"] = "named-contact-stages-only"
        actions.remove(second)
    # This row is shared with Square Off in the regulation and is not proof of
    # Storm Ruler's actual contact/projectile stages.
    storm = arts[1200]
    actions.append({"id": "art-1200-unresolved", "name": art_names[int(storm["textId"])], "artId": "1200",
        "segments": [{"id": "unresolved", "name": "具体攻击段未确认", "physicalType": None,
                      "rates": None, "flat": None, "hits": 1, "tags": [],
                      "source": "SwordArtsParam:1200 atkParamId=300000700; shared reference is not segment identity"}],
        "coverage": "unresolved-no-calculation"})
    six_actions, six_summary = six_skill_actions(param_dir, taes, tables, bullets, art_names)
    six_ids = set(six_summary)
    actions = [a for a in actions if a.get("artId") not in six_ids] + six_actions
    return {"schemaVersion": 1, "sourceVersion": {"game": "1.3.3.0", "regulation": "10350000"},
        "units": {"rates": "1 = 100% of the matching weapon AR element", "hits": "one contact instance per segment; not guaranteed landed hits or full-cast repetition count"},
        "coverage": {"status": "native-contacts-with-recorded-gaps", "runtimeVerified": False,
            "actionCount": len(actions), "segmentCount": sum(len(a["segments"]) for a in actions),
            "limitations": ["Basic normal moves only; hero-specific overrides, dual-wield and ammo are not inferred.",
                "TAE timelines do not prove damage landing or repeat-hit resets; imported and transition animations are not assembled into complete moves.",
                "Skill entries are named contacts or annotated contact chains, not full casts. Projectile damage, status, unique additional scaling and skill buffs remain unresolved.",
                "Nonzero native additive attack is not final fixed damage; rates/flat stay null until its scaling is supported.",
                "Animation/action labels use fixed Smithbox NR annotations; all numerical values and behavior/timeline links come from local native data."]},
        "calculationPolicy": {"nullRates": "Never replace null rates or flat with zero, one, or weapon AR. Show a known subtotal and unresolved segments.",
                              "conditionalSegments": "StateInfo-gated bullet hooks are retained as conditional unknowns, not assumed active.",
                              "completeDamage": "false means the displayed known contacts cannot be presented as complete action damage."},
        "sixSkillCoverage": six_summary,
        "tagEvidence": {"fields": [f"AtkParam_Pc.subCategory{i}" for i in range(1, 6)],
                        "format": "atkSubCategory:<nonzero integer>", "semanticTags": SUB_TAGS},
        "provenance": {"paramsSha256": {n: sha(param_dir / (n + ".param.xml")) for n in
            (*tables, "ReinforceParamWeapon", "SpEffectParam")},
            "taeExportSha256": sha(tae_path), "taeResource": "/chr/c0000.anibnd.dcx",
            "taeBinderSha256": sha(tae_path.parent / "c0000.anibnd.dcx") if (tae_path.parent / "c0000.anibnd.dcx").exists() else None,
            "taeEventLayout": "AttackBehavior type 1: s32 AttackType@0, s32 AttackIndex@4, s32 BehaviorJudgeID@8, u8 Source@13. BulletBehavior type 2: s32 BehaviorJudgeID@8, s16 StateInfo@14, u8 Source@19.",
            "annotationRepository": "https://github.com/vawser/Smithbox", "annotationCommit": SMITHBOX_COMMIT,
            "annotationSha256": {"Animations.json": anim_sha, "AtkParam_Pc.json": atk_sha},
            "bulletEvidenceSha256": {path.name: sha(path) for path in (bullet_path, behavior_bullet_path) if path.exists()},
            "physicalTypeRule": "atkAttribute 0 slash / 1 strike / 2 thrust / 3 normal; 252 resolves weapon atkAttribute2, 253 resolves weapon atkAttribute; mixed or unbound types remain null"},
        "actions": actions}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--param-dir", required=True, type=Path)
    parser.add_argument("--tae-jsonl", required=True, type=Path)
    parser.add_argument("--text-dir", required=True, type=Path, help="zhocn FMG XML directory")
    parser.add_argument("--smithbox", required=True, type=Path)
    parser.add_argument("--bullet-evidence-dir", type=Path, help="Verified Bullet prefix evidence; defaults to TAE export directory")
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "public/damage-actions.json")
    args = parser.parse_args()
    result = build(args.param_dir, args.tae_jsonl, args.text_dir, args.smithbox, args.bullet_evidence_dir)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result["coverage"], ensure_ascii=False))


if __name__ == "__main__":
    main()
