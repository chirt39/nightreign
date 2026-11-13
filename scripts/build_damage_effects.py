"""Build scoped damage multipliers from the local native extraction.

This is an audited allow-list, not a parser of percentages in prose. Unmodelled
effects are recorded without supplying neutral or guessed multipliers.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
META = Path(r"E:\海斗\tools\WitchyBND-3.0.1.0\Assets\Paramdex\NR\Meta\SpEffectParam.xml")
BULLET_EVIDENCE = Path(r"E:\海斗\outputs\damage-actions-20261113")
CHANNELS = {"physics": "physical", "magic": "magic", "fire": "fire",
            "thunder": "lightning", "dark": "holy"}
RATE_FIELDS = {"panel": {k + "AttackPowerRate": v for k, v in CHANNELS.items()},
               "final": {k + "AttackRate": v for k, v in CHANNELS.items()}}


def build(source: Path, bullet_evidence: Path = BULLET_EVIDENCE):
    inputs = set()

    def table(name):
        path = source / "strict/regulation-bin" / (name + ".param.xml")
        inputs.add(path)
        root = ET.parse(path).getroot()
        defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
        return [{**defaults, **r.attrib} for r in root.find("rows")]

    def text(kind):
        found = {}
        for path in sorted((source / "localized/text-bundles/data0/msg/zhocn").rglob(kind + "*.fmg.xml")):
            inputs.add(path)
            for row in ET.parse(path).getroot().find("entries"):
                value = (row.text or "").strip()
                if value and value != "%null%":
                    key = int(row.get("id"))
                    # Base labels take precedence; DLC-only IDs fill the gaps.
                    found.setdefault(key, value)
        return found

    attach = {int(r["id"]): r for r in table("AttachEffectParam")}
    sp = {int(r["id"]): r for r in table("SpEffectParam")}
    goods = {int(r["id"]): r for r in table("EquipParamGoods")}
    magic = {int(r["id"]): r for r in table("Magic")}
    antiques = table("EquipParamAntique")
    pool_rows = table("AttachEffectTableParam")
    names = text("AttachEffectName")
    item_names = text("AntiqueName")
    goods_names, magic_names = text("GoodsName"), text("MagicName")
    glossary_path = ROOT / "public/effect_encyclopedia.json"
    glossary = json.loads(glossary_path.read_text(encoding="utf-8"))
    stack_notes = {(r["category"], int(r["id"])): r["stackability"] for r in glossary["entries"]}
    effects, unsupported = [], []
    effect_keys = defaultdict(list)

    def emit(key, name, kind, sid, source_chain, *, native_id=None, conditions=(), tags=(),
             native_goods=None, native_magic=None, character_ids=(), exclusive_group=None,
             buff_id=None, stack_note=None, stack_scope=None, check_hit_correction=False):
        row = sp[sid]
        categories = [int(row[k]) for k in ("magicSubCategoryChange1", "magicSubCategoryChange2",
                                           "magicSubCategoryChange3") if int(row[k]) != 0]
        required_tags = list(tags)
        required_conditions = list(conditions)
        domain_any = []
        if categories and set(categories) <= {100, 110}:
            required_conditions.append("已蓄力")
        # These flags select the casting domain, not a damage element.
        if row["wepParamChange"] == "3":
            if row["magParamChange"] == "1" and row["miracleParamChange"] == "0":
                required_tags.append("sorcery")
            elif row["miracleParamChange"] == "1" and row["magParamChange"] == "0":
                required_tags.append("incantation")
            elif row["magParamChange"] == "1" and row["miracleParamChange"] == "1":
                if categories:
                    required_tags.append("spell")
                else:
                    domain_any = ["sorcery", "incantation"]
        elif all(row[k] == "0" for k in ("magParamChange", "miracleParamChange", "shamanParamChange")):
            required_tags.append("weaponAttack")
        if int(row["triggerOnWepType"]) != 0:
            required_tags.append("heldWeaponType:" + row["triggerOnWepType"])
        category = int(row["spCategory"])
        if category == 10:
            stack_rule = "multiply"
            stack_source = "SpEffectParam.spCategory=10 (Stack Self)"
        elif kind == "buff" or category == 20:
            # Identical active effects refresh. Cross-buff replacement is separate.
            stack_rule = "highest"
            stack_source = "same active SpEffect refresh; exclusiveGroup handles whole-buff replacement"
        elif stack_note in {"不可叠加", "不同级别可叠加"}:
            stack_rule = "highest"
            stack_source = "public/effect_encyclopedia.json: " + stack_note
        else:
            raise ValueError(f"Unaudited stacking {key}: category={category}, note={stack_note}")
        count_before = len(effects)
        for phase, fields in RATE_FIELDS.items():
            by_rate = defaultdict(list)
            for field, channel in fields.items():
                rate = float(row[field])
                if rate != 1:
                    if rate <= 0:
                        raise ValueError(f"Nonpositive damage multiplier: {sid}.{field}")
                    by_rate[rate].append((field, channel))
            for rate, selected in by_rate.items():
                suffix = phase + ":" + ",".join(c for _, c in selected)
                entry = {"id": key + ":" + suffix, "name": name, "kind": kind, "phase": phase,
                         "rate": rate, "channels": [c for _, c in selected],
                         "stackGroup": "speffect:" + str(sid) + ":" + suffix,
                         "stackRule": stack_rule,
                         "source": source_chain + " -> SpEffectParam#" + str(sid) + "." + ",".join(f for f, _ in selected),
                         "spEffectId": sid, "stackSource": stack_source}
                if required_tags:
                    entry["tags"] = list(dict.fromkeys(required_tags))
                if categories:
                    entry["anyTags"] = ["atkSubCategory:" + str(c) for c in categories]
                elif domain_any:
                    entry["anyTags"] = domain_any
                if required_conditions:
                    entry["conditions"] = list(dict.fromkeys(required_conditions))
                if character_ids:
                    entry["characterIds"] = list(character_ids)
                if native_id is not None:
                    entry["nativeEffectId"] = native_id
                    effect_keys[native_id].append(entry["id"])
                if native_goods is not None:
                    entry["goodsId"] = native_goods
                if native_magic is not None:
                    entry["magicId"] = native_magic
                if buff_id:
                    entry["buffId"] = buff_id
                if check_hit_correction:
                    assert phase == "final" and row["isUseAtkParamAtkPowerCorrect"] == "1"
                    entry["useHitDamageCorrection"] = True
                if exclusive_group:
                    entry["exclusiveGroup"] = exclusive_group
                if float(row["effectEndurance"]) > 0:
                    entry["durationSeconds"] = float(row["effectEndurance"])
                if stack_scope:
                    entry["scopeNote"] = stack_scope
                effects.append(entry)
        if len(effects) == count_before:
            raise ValueError(f"No scalar damage contribution for {key}")

    def from_attach(eid, kind, **options):
        row = attach[eid]
        passive = int(row["passiveSpEffectId_1"])
        name = names[int(row["attachTextId"])]
        if kind == "field" and row["displayPercentageSymbol"] == "1":
            name += "（" + row["displayedModifierValue"] + "%）"
        outside = "deep-outside" if eid < 7000000 else "normal-outside"
        note = stack_notes.get((outside, eid))
        emit(f"{kind}:{eid}", name, kind, passive,
             f"AttachEffectParam#{eid}.passiveSpEffectId_1", native_id=eid, stack_note=note, **options)

    # Five channels, with their exact normal/deep native IDs and levels.
    for base in range(7001400, 7001900, 100):
        for level in range(3):
            from_attach(base + level, "relic")
        for level in range(2):
            from_attach(base - 1000000 + level, "relic")
    for eid in range(6610800, 6610803):
        from_attach(eid, "relic")

    # Native category conditions stay per-hit OR filters, never entire-art buffs.
    relic_scoped = [7006600, 7006700, 7040000, 7040100, 7040300, 7040400, 7040500,
                    *range(7043000, 7044700, 100), 6040100, 6040101, 6040300,
                    6040400, 6040500, 6043100, *range(6611200, 6611203), *range(6611300, 6611303)]
    for eid in relic_scoped:
        if eid in attach:
            from_attach(eid, "relic")
    for eid in [7040200, 7040201]:
        from_attach(eid, "relic", tags=["critical"])
    for eid in range(7330000, 7332500, 100):
        if eid in attach:
            from_attach(eid, "relic", stack_scope="held weapon type trigger; not inventory count")
    for eid in range(7080000, 7082500, 100):
        if eid in attach:
            from_attach(eid, "relic", conditions=[names[int(attach[eid]["attachTextId"])] + "（条件已满足）"],
                        stack_scope="inventory prerequisite; damage is not restricted to that weapon class")
    for eid in [7260000, 6260000, 6260001, 7260300, 6260300, 6260301,
                7260400, 6260400, 6260401]:
        sid = int(attach[eid]["passiveSpEffectId_1"])
        trigger = sp[sid]["enemyStateInfoTrigger"]
        # State values are recorded explicitly rather than inferred from ID prefixes.
        text_condition = next((label for token, label in [("中毒", "目标已中毒"), ("猩红腐败", "目标已猩红腐败"),
                                                         ("冻伤", "目标已冻伤")]
                               if token in names[int(attach[eid]["attachTextId"]) ]), None)
        if int(trigger) == 0 or text_condition is None:
            raise ValueError(f"Missing target condition: {eid}")
        from_attach(eid, "relic", conditions=[text_condition], stack_scope="same level does not stack; distinct levels multiply")

    # Proc chains: root state -> conditional transition -> active multiplier.
    procs = {7030900: (7030901, 7030902, "使用油脂后的物理强化已生效"),
             6030900: (7030911, 7030912, "使用油脂后的物理强化已生效"),
             6030901: (7030921, 7030922, "使用油脂后的物理强化已生效"),
             7032200: (7032201, 7032202, "受到攻击后的强化已生效"),
             7035900: (7035901, 7035902, "切换武器后的物理强化已生效")}
    for eid, (transition, active, condition) in procs.items():
        root = int(attach[eid]["passiveSpEffectId_1"])
        assert sp[transition]["invocationConditionsStateChange1"] == sp[root]["stateInfo"]
        assert int(sp[transition]["replaceSpEffectId"]) == active
        emit(f"relic:{eid}", names[int(attach[eid]["attachTextId"])], "relic", active,
             f"AttachEffectParam#{eid} -> SpEffectParam#{root}.stateInfo -> #{transition}.replaceSpEffectId",
             native_id=eid, conditions=[condition],
             stack_scope="same active proc refreshes; distinct-level active effects multiply")
    assert int(attach[7220000]["passiveSpEffectId_2"]) == 7220001
    emit("relic:7220000", names[int(attach[7220000]["attachTextId"])] + "（弗雷德利克）",
         "relic", 7220001, "AttachEffectParam#7220000.passiveSpEffectId_2",
         native_id=7220000, character_ids=["6"], stack_note="不可叠加",
         conditions=["弗雷德利克在场且专属强化已生效"], stack_scope="only the player's damage; not family damage")

    field_families = [8100000, 8100100, 8100200, 8100300, 8100400, 8320000, 8320100,
                      8320300, 8330000, 8330100, 8330200, 8330300, 8340000, 8350000, 8420000]
    for base in field_families:
        for level in range(3):
            if base + level in attach:
                from_attach(base + level, "field")
    for base, category in [(8300000, "124"), (8310000, "125")]:
        for eid in range(base, base + 3):
            assert int(attach[eid]["passiveSpEffectId_1"]) == eid and sp[eid]["magicSubCategoryChange1"] == category
            from_attach(eid, "field", check_hit_correction=True)
    for base, tags in [(8130000, ["critical"]), (8430000, ["piercingCounter"])]:
        for level in range(3):
            if base + level in attach:
                from_attach(base + level, "field", tags=tags)
    for base in [8660000, 8670000, 8810000]:
        for level in range(3):
            eid = base + level
            if eid not in attach:
                continue
            sid = int(attach[eid]["passiveSpEffectId_1"])
            hp_below, hp_above = sp[sid]["conditionHp"], sp[sid]["conditionHpRate"]
            condition = "满血" if hp_above == "100" else "低血量攻击效果已触发（原生阈值" + hp_below + "%）"
            from_attach(eid, "field", conditions=[condition])
    from_attach(6851200, "relic", conditions=["低血量攻击效果已触发（原生阈值84.99%）"])

    # Exact IDs observed in the six showcased weapons' native custom-weapon pools.
    for eid in [8320510, 8320520, 8320610, 8320620, 8320710, 8320720,
                8850500, 8850550, 8850600, 8850650, 8851200, 8851250]:
        from_attach(eid, "field")
    for eid in [8851800, 8851850]:
        from_attach(eid, "field", tags=["piercingCounter"])
    from_attach(8810050, "field", conditions=["低血量攻击效果已触发（原生阈值84.99%）"])

    # Direct Goods -> SpEffect references only; Bullet-based buffs need a decoded chain.
    for gid in [1210, 11014, 11028, 11029, 11030, 11031]:
        row = goods[gid]
        assert row["refCategory"] == "2"
        sid = int(row["refId_default"])
        emit(f"buff:goods:{gid}", goods_names[gid], "buff", sid,
             f"EquipParamGoods#{gid}.refCategory=2.refId_default",
             native_goods=gid, buff_id=f"goods:{gid}",
             exclusive_group="spCategory:151" if sp[sid]["spCategory"] == "151" else "goods:" + str(gid),
             conditions=[goods_names[gid] + "效果生效中"])
    assert magic[6050]["refCategory1"] == "2"
    emit("buff:magic:6050", magic_names[6050], "buff", int(magic[6050]["refId1"]),
         "Magic#6050.refCategory1=2.refId1", native_magic=6050,
         buff_id="magic:6050", exclusive_group="spCategory:151",
         conditions=[magic_names[6050] + "效果生效中"])

    # Use the separately audited 128-byte Bullet prefix, checking its fields
    # against the original binary rather than trusting a guessed numeric alias.
    summary_path = bullet_evidence / "bullet-prefix-summary.json"
    refs_path = bullet_evidence / "bullet-prefix-refs.jsonl"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["status"] == "static-prefix-verified"
    assert summary["decodedPrefixBytes"] == 128
    offsets = {r["name"]: r["offset"] for r in summary["prefixFields"]}
    needed_bullets = {10350000, 10355000, 10660000, 2710, 2250}
    selected_bullets = {}
    with refs_path.open(encoding="utf-8") as stream:
        for line in stream:
            row = json.loads(line)
            if row["bulletId"] in needed_bullets:
                selected_bullets[row["bulletId"]] = row
    assert set(selected_bullets) == needed_bullets
    raw_bullet_path = source / "strict/regulation-bin/Bullet.param"
    inputs.add(raw_bullet_path)
    binary = raw_bullet_path.read_bytes()
    for bid, row in selected_bullets.items():
        prefix = binary[row["offset"]:row["offset"] + 128]
        assert prefix.hex() == row["prefix128Hex"]
        assert struct.unpack_from("<i", binary, row["headerOffset"])[0] == bid
        assert struct.unpack_from("<Q", binary, row["headerOffset"] + 8)[0] == row["offset"]
        for field, value in row["fields"].items():
            assert struct.unpack_from("<i", prefix, offsets[field])[0] == value
    for key, name, bid, sid, native_goods, native_magic in [
        ("goods:3500", goods_names[3500], 10350000, 503501, 3500, None),
        ("goods:3550", goods_names[3550], 10355000, 503550, 3550, None),
        ("magic:6600", magic_names[6600] + "（祷告）", 10660000, 1660000, None, 6600),
    ]:
        if native_goods is not None:
            assert goods[native_goods]["refCategory"] == "1"
            assert int(goods[native_goods]["refId_default"]) == bid
            chain = f"EquipParamGoods#{native_goods}.refId_default"
        else:
            assert magic[native_magic]["refCategory1"] == "1"
            assert int(magic[native_magic]["refId1"]) == bid
            chain = f"Magic#{native_magic}.refId1"
        slots = selected_bullets[bid]["fields"]
        field = next(f for f in ("spEffectId0", "spEffectId1", "spEffectId2", "spEffectId3", "spEffectId4")
                     if slots[f] == sid)
        emit("buff:" + key, name, "buff", sid, chain + f" -> Bullet#{bid}.{field} (raw-prefix verified)",
             native_goods=native_goods, native_magic=native_magic, buff_id=key,
             exclusive_group="spCategory:" + sp[sid]["spCategory"],
             conditions=["当前攻击者已获得" + name + "增益"],
             stack_scope="recipient has this active effect; target slot does not imply an unconditional caster buff")
        if native_magic == 6600:
            effects[-1]["unresolvedReferences"] = ["Bullet#10660000.spEffectId1 -> missing SpEffectParam#1660001"]

    # Trace the paid cast separately from the damage action receiving its buff.
    arts = {int(r["id"]): r for r in table("SwordArtsParam")}
    weapons = {int(r["id"]): r for r in table("EquipParamWeapon")}
    behaviors = {int(r["id"]): r for r in table("BehaviorParam_PC")}
    art_names, weapon_names = text("ArtsName"), text("WeaponName")
    tae_path = bullet_evidence / "tae.jsonl"
    wanted = {f'a{600 + int(arts[aid]["swordArtsType"])}.tae' for aid in (1010, 603, 1197)}
    clips = {}
    with tae_path.open(encoding="utf-8") as stream:
        for line in stream:
            if not any(name in line[:160] for name in wanted):
                continue
            tae = json.loads(line)
            name = tae["file"].replace("\\", "/").rsplit("/", 1)[-1]
            if name in wanted:
                clips[name] = {clip["ID"]: clip["events"] for clip in tae["animations"]}
    for aid, wid, bid, sid in [(1010, 18040000, 2710, 1768), (603, None, 2250, 1730),
                               (1197, 32120000, None, 1586)]:
        tae = f'a{600 + int(arts[aid]["swordArtsType"])}.tae'
        route = f"SwordArtsParam#{aid} -> {tae}/40000"
        if wid is not None:
            assert int(weapons[wid]["swordArtsParamId"]) == aid
            route = f"EquipParamWeapon#{wid} -> " + route
        def event_values(clip_id, event_type, offset):
            return [struct.unpack_from("<i", bytes.fromhex(e["hex"]), offset)[0]
                    for e in clips[tae][clip_id] if e["Type"] == event_type]
        if bid is not None:
            judge, = event_values(40000, 2, 8)
            assert judge not in event_values(40005, 2, 8)
            behavior_id = 300000000 + judge - 3000
            if judge >= 3900:
                behavior_id += int(weapons[wid]["behaviorVariationId"]) * 1000
            behavior = behaviors[behavior_id]
            assert behavior["refType"] == "1" and int(behavior["refId"]) == bid
            assert selected_bullets[bid]["fields"]["spEffectId0"] == sid
            route += f" judge {judge} -> BehaviorParam_PC#{behavior_id} -> Bullet#{bid}.spEffectId0"
        else:
            assert 1585 in event_values(40000, 66, 0) and 1585 not in event_values(40005, 66, 0)
            assert sp[1585]["invocationConditionsStateChange1"] == "323" and int(sp[1585]["cycleOccurrenceSpEffectId"]) == sid
            route += " event66 -> SpEffectParam#1585 (state 323).cycleOccurrenceSpEffectId"
        name = (weapon_names[wid] + "（" + art_names[aid] + "）") if wid else art_names[aid] + "（战技）"
        assert sp[sid]["categoryPriority"] == "0"
        emit(f"buff:art:{aid}", name, "buff", sid, route, buff_id=f"art:{aid}",
             exclusive_group="spCategory:" + sp[sid]["spCategory"], check_hit_correction=True,
             conditions=["当前攻击者已获得" + name + "增益"])

    catalog_path = ROOT / "public/relic_catalog_zh.json"
    items_path = ROOT / "public/items_data.json"
    relic_catalog = json.loads(catalog_path.read_text(encoding="utf-8"))["items"]
    item_index = json.loads(items_path.read_text(encoding="utf-8"))["items"]
    official = {key: item for key, item in relic_catalog.items()
                if item["category"] in {"黑夜王", "永夜王", "角色专属", "特殊遗物"}}
    pools = defaultdict(set)
    for row in pool_rows:
        base, dlc = int(row["chanceWeight"]), int(row["chanceWeight_dlc"])
        if int(row["attachEffectId"]) > 0 and (base > 0 or (base if dlc == -1 else dlc) > 0):
            pools[int(row["id"])].add(int(row["attachEffectId"]))
    relics = []
    included_keys = set()
    for item in antiques:
        iid = int(item["id"])
        item_key = item_index.get(str(iid), {}).get("key")
        if item_key not in official:
            continue
        catalog_item = official[item_key]
        if item_key in included_keys or item_names.get(iid) != catalog_item["name_zh"]:
            raise ValueError(f"Ambiguous official relic identity for {item_key}: {iid}")
        included_keys.add(item_key)
        table_ids = [int(item[f"attachEffectTableId_{i}"]) for i in range(1, 4)]
        if not all(tid == -1 or len(pools[tid]) == 1 for tid in table_ids):
            raise ValueError(f"Expected fixed effect slots for official relic {iid}")
        native_ids = [next(iter(pools[tid])) for tid in table_ids if tid != -1]
        keys = [key for eid in native_ids for key in effect_keys[eid]]
        rows = [{"id": eid, "name": names[int(attach[eid]["attachTextId"])]} for eid in native_ids]
        relics.append({"id": iid, "key": item_key, "name": item_names[iid], "category": catalog_item["category"],
                       "image": catalog_item["image"], "rows": rows, "effectIds": keys,
                       "nativeEffectIds": native_ids,
                       "unmodelledEffectIds": [eid for eid in native_ids if not effect_keys[eid]],
                       "source": f"EquipParamAntique#{iid} -> AttachEffectTableParam (singleton pools)"})
    if official.keys() != included_keys:
        raise ValueError(f"Missing game IDs for official relics: {sorted(official.keys() - included_keys)}")

    for eid, reason in {
        7060000: "per-victory count and exponential scaling cannot be represented by a fixed scalar toggle",
        7060200: "per-victory count and exponential scaling cannot be represented by a fixed scalar toggle",
        7032700: "independently expiring per-kill stack count", 7037600: "independently timed combo tiers",
        7037700: "time-evolving ailment tiers", 7150000: "adds damage from player HP, not a multiplier",
        6500200: "flat and target-max-HP damage in a specific skill proc",
        7120000: "weapon-type-dependent flat AR conversion, not scalar",
        7120100: "weapon-type-dependent flat AR conversion, not scalar",
        7120200: "weapon-type-dependent flat AR conversion, not scalar",
        7120300: "weapon-type-dependent flat AR conversion, not scalar",
        7035700: "random-element flat AR addition, not scalar",
        7031200: "recipient and proc chain not fully audited", 7290000: "changes copied damage fraction, not a generic multiplier",
    }.items():
        unsupported.append({"nativeEffectId": eid, "reason": reason})
    unsupported += [{"magicId": 6600, "spEffectId": 1660001, "reason": "Bullet10660000.spEffectId1 references a missing definition; never synthesise its effect"},
                    {"magicId": 6600, "spEffectId": 7037001, "reason": "separate conditional slot10 is not an unconditional Golden Vow effect"},
                    {"scope": "Bullet", "reason": "only audited prefix references; 220-byte row tail and execution/recipient timing remain unverified"},
                    {"scope": "all other effects", "reason": "not audited; no implicit multiplier of 1 or universal scope"},
                    {"scope": "attribute bonuses", "reason": "flat STR/DEX/INT/FTH/ARC changes require recalculating weapon scaling; not a scalar damage rule"},
                    {"scope": "enhanced consumables", "reason": "only base refId_default is modelled; level2/level3 are not interchangeable"}]
    manifest_path = source / "source-manifest.json"
    inputs.add(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if len({r["id"] for r in effects}) != len(effects):
        raise ValueError("Duplicate calculation rule IDs")
    for item in relics:
        assert set(item["effectIds"]) <= {e["id"] for e in effects}
    return {"effects": effects, "relics": relics, "unsupported": unsupported,
            "metadata": {"version": "native-" + manifest["regulation_version"] + "-v1",
                         "gameVersion": manifest["executable_version"],
                         "runtimeVerified": False,
                         "scope": "audited scalar damage rules; not exhaustive, not a relic legality checker",
                         "phases": {"panel": "AttackPowerRate before defense, weapon component only",
                                    "final": "AttackRate after defense; limited to matching hit channels and categories"},
                         "matching": "tags AND; anyTags OR; conditions AND; unknown tags never match",
                         "sources": [{"file": f.relative_to(source).as_posix(),
                                      "sha256": hashlib.sha256(f.read_bytes()).hexdigest()} for f in sorted(inputs)],
                         "fieldDefinitions": {"file": "Paramdex/NR/Meta/SpEffectParam.xml",
                                              "sha256": hashlib.sha256(META.read_bytes()).hexdigest()},
                         "bulletEvidence": [{"file": f.name, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()}
                                            for f in [summary_path, refs_path, tae_path]],
                         "stackSnapshot": {"file": "public/effect_encyclopedia.json",
                                           "source": glossary["source"], "license": glossary["license"],
                                           "sha256": hashlib.sha256(glossary_path.read_bytes()).hexdigest()},
                         "relicCatalogInputs": [{"file": path.relative_to(ROOT).as_posix(),
                                                 "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                                                for path in (catalog_path, items_path)],
                         "rights": "Game data rights remain with original owners; stacking snapshot retains GPL-3.0 attribution",
                         "counts": {"effects": len(effects), "kinds": dict(Counter(e["kind"] for e in effects)),
                                    "phases": dict(Counter(e["phase"] for e in effects)), "officialRelics": len(relics)}}}


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=SOURCE)
    parser.add_argument("--bullet-evidence-root", type=Path, default=BULLET_EVIDENCE)
    parser.add_argument("--output", type=Path, default=ROOT / "public/damage-effects.json")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = build(args.source_root, args.bullet_evidence_root)
    encoded = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if args.output.read_text(encoding="utf-8") != encoded:
            raise SystemExit("Damage effect output differs from source generation")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded, encoding="utf-8")
    print(json.dumps(data["metadata"]["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()
