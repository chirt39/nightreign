"""Reconcile the curated enemy atlas with native NpcParam and static scene evidence.

The atlas is a curated seed, not a one-to-one export of all NpcParam rows. This
script only appends game-text-named hostile entries explicitly listed below.
Every native row is represented in the audit, including unresolved candidates.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


REMOVED_COLUMNS = (20, 21, 22, 23, 25, 27)
DAMAGE_FIELDS = (
    "neutralDamageCutRate", "slashDamageCutRate", "blowDamageCutRate",
    "thrustDamageCutRate", "magicDamageCutRate", "fireDamageCutRate",
    "thunderDamageCutRate", "darkDamageCutRate",
)
STATUS_FIELDS = (
    "resist_poison", "resist_desease", "resist_blood", "resist_freeze",
    "resist_sleep", "resist_madness", "resist_curse",
)
STATUS_DISABLE_FIELDS = ("disablePoison", "disableDisease", "disableBlood", "disableFreeze",
                         "disableSleep", "disableMadness", "disableCurse")
LARGE_CAMP = "大型营地"
EVERGAOL = "封印监牢"
HOLLOW_CATHEDRAL = "大教堂（大空洞）"
NIGHT_BOSS = "夜晚Boss"
NIGHT_VANGUARD = "夜晚Boss前哨战"
NIGHT_LOCATIONS = {NIGHT_BOSS, NIGHT_VANGUARD}
ALIAS_LOCATION_PREFIXES = {
    "Fort": "小型要塞", "Camp": "大型营地", "Castle": "要塞",
    "Small Camp": "小型营地", "Night Horde": "夜晚Boss前哨战",
    "Church": "教堂", "Sorcerer's Rise": "魔法师塔", "Township": "聚落",
    "Ruins": "遗迹", "Great Church": "大教堂",
    "Evergaol": "封印监牢", "Field Boss": "原野Boss",
    "Basement Boss": "要塞底层Boss", "Night Boss": "夜晚Boss",
    "Forsaken Hollows": "大空洞",
}


def native_id(value: object) -> str:
    return re.sub(r"(?:[ab]|-phase\d+)$", "", str(value))


def entity_name(value: object) -> str:
    name = str(value).replace("[灾域]", "").strip()
    return re.split(r"\s*[（(]", name, maxsplit=1)[0].strip()


def public_location(value: str) -> str | None:
    aliases = {"锻造设施": "锻造村", "永夜Boss": "夜王", "第三夜Boss": "夜王",
               "原野Boss - 恐怖强敌": "原野Boss", "古代封印监牢": "封印监牢"}
    if value in ("宁姆韦德", "大空洞", "魔法师塔", "魔法师塔（大空洞）", "小型营地", "教堂"):
        return None
    return aliases.get(value, value)


def ordered_public_locations(values: list[str]) -> list[str]:
    output = []
    for value in values:
        normalized = public_location(value)
        if normalized and normalized not in output:
            output.append(normalized)
    return output


def small_fort_appearances(rows, forms, places):
    by_npc = defaultdict(list)
    for row in rows:
        by_npc[native_id(row[1])].append(row)
    result = []
    assigned = set()
    for form in forms:
        ids = list(map(str, form["npcIds"]))
        ids.extend(npc for npc, parent in places["sameAppearanceAs"].items() if parent in form["npcIds"] and npc not in ids)
        profiles = defaultdict(list)
        for npc in ids:
            for row in by_npc[npc]:
                profiles[tuple(row[5:13])].append(row)
        for members in profiles.values():
            source_ids = [str(row[1]) for row in members]
            if assigned.intersection(source_ids):
                raise ValueError(f"Duplicate small fort appearance: {source_ids}")
            assigned.update(source_ids)
            locations = [location for npc in dict.fromkeys(native_id(s) for s in source_ids)
                         for location in places["locationsByNpcId"].get(npc, [])]
            result.append({"label": form.get("equipmentLabel") or form["label"], "sourceIds": source_ids,
                           "statId": source_ids[0], "locations": ordered_public_locations(locations)})
    return result


def number(value: str) -> int | float:
    n = float(value)
    return int(n) if n.is_integer() else round(n, 4)


def species_weakness_flags(npc: dict[str, str]) -> list[str | None]:
    # The native CSV includes the regulation defaults. Only an explicit bit
    # value identifies a weakness or its absence.
    labels = {"1": "Yes", "0": "No"}
    return [labels.get(npc.get("isWeak" + suffix)) for suffix in "ABCD"]


def resident_status_values(npc, immunities):
    disabled = set()
    for slot in range(32):
        disabled.update(immunities.get(npc[f"spEffectID{slot}"], ()))
    return ["Immune" if i in disabled or npc[field] == "999" else number(npc[field])
            for i, field in enumerate(STATUS_FIELDS)]


def fill_reviewed_fields(row, npc):
    row[38:42] = species_weakness_flags(npc)
    suffixes = ("Magic", "Fire", "Lightning", "Holy", "Poison", "ScarletRot", "Bleed",
                "Frostbite", "Sleep", "Madness", "Blight", "WeakA", "WeakB", "WeakC", "WeakD")
    for index, suffix in enumerate(suffixes, 42):
        row[index] = number(npc["poiseBonusRate_" + suffix])
    cap = int(npc["poiseBonusMax"])
    row[57] = -1 if cap == 65535 else cap


def albinauric_forms(native, rows, placements, encounters):
    npcs = {r["row_id"]: r for r in native}
    def appearance(npc_id):
        r = npcs[npc_id]
        return tuple(r[k] for k in ("modelDispMask13", "modelDispMask16", "residentMaterialExParamId00"))

    forms = {}
    for stat_id, label in [("34700000", "普通"), ("34700200", "红色长角"), ("34700300", "银白")]:
        forms[appearance(stat_id)] = {"label": label, "statId": stat_id, "sourceIds": [], "locations": []}
    for row in rows:
        if entity_name(row[0]) == "白金之子":
            forms[appearance(native_id(row[1]))]["sourceIds"].append(str(row[1]))
    forge = next((e for e in encounters if e["scene"] == "m50_10_00_00" and e["encounterNameId"] == 905081000), None)
    forge_boss = next((p for p in placements if forge and p["scene"] == forge["scene"]
                       and p["entityId"] == forge["healthBarEntityOrGroupId"] and p["kind"] == "enemies"), None)
    forge_parts = [p for p in placements if forge_boss and p["kind"] == "enemies"
                   and p["scene"] == forge_boss["scene"] and p["variation"] == forge_boss["variation"]
                   and p["model"] in ("c3470", "c3471")]
    forge_keys = {(p["scene"], p["part"]) for p in forge_parts}
    for part in placements:
        if part["kind"] != "enemies" or part["model"] != "c3470" or not part["location"]:
            continue
        form = forms[appearance(part["npcId"])]
        if part["location"] == "锻造村" and (part["scene"], part["part"]) not in forge_keys:
            continue
        if part["location"] not in form["locations"]:
            form["locations"].append(part["location"])
    if forge_parts:
        for part in forge_parts:
            if part["model"] == "c3470":
                forms[appearance(part["npcId"])]["forgeEncounter"] = forge["encounterName"]
        evidence = {"scene": forge["scene"], "variation": forge_boss["variation"], "boss": forge["encounterName"],
                    "nameId": forge["encounterNameId"], "bossEntity": forge_boss["entityId"],
                    "placements": [{k: p[k] for k in ("model", "part", "npcId")} for p in forge_parts]}
    else:
        evidence = {}
    return list(forms.values()), evidence


def first_party_row(npc: dict[str, str], name: str, width: int) -> list[object]:
    row: list[object] = [None] * width
    row[0], row[1] = name, int(npc["row_id"])
    for offset, field in enumerate(DAMAGE_FIELDS, 5):
        row[offset] = number(str((1 - float(npc[field])) * 100))
    for offset, field in enumerate(STATUS_FIELDS, 13):
        raw = number(npc[field])
        row[offset] = "Immune" if raw == 999 else raw
    armor = number(npc["superArmorDurability"])
    row[24] = armor
    for offset in range(8):
        row[28 + offset] = number(npc[f"partsDamageRate{offset + 1}"])
    row[36] = number(npc["weakPartsDamageRate"])
    # HP, weak-part class and poise modifiers need separate game-side
    # transformations. Null represents an unresolved value, never a zero.
    return row


def dreglord_phases(npc, encounters, width, effects_path):
    bars = {event["nameId"]: event["nameTexts"][0]["text"] for event in encounters
            if event["mapId"] == "m16_10_00_00" and event["targetEntityOrGroup"] == 16100800
            and event["memberResolution"] == "same-scene"
            and any(str(member["npcParamId"]) == npc["row_id"] for member in event["members"])}
    with effects_path.open(encoding="utf-8-sig", newline="") as stream:
        effects = {r["row_id"]: r for r in csv.DictReader(stream) if r["row_id"] in ("60545", "60546")}
    # After the transition, the low-HP effect replaces the opening effect.
    # Both states must support one common set of rates for the second bar.
    if any(effects["60545"][field] != effects["60546"][field] for field in DAMAGE_FIELDS):
        raise ValueError("The two Dreglord phase-two effects have different damage rates")
    for phase, bar in enumerate((907630000, 907630001), 1):
        row = first_party_row(npc, f"{bars[bar]} (Boss {phase}阶段)", width)
        evidence = {"name": "native_healthbar_FMG_and_exact_MSB_NpcParamId", "npcParamId": npc["row_id"],
                    "nativeNameIds": [bar], "phase": phase, "scene": "m16_10_00_00", "stats": "NpcParam"}
        if phase == 2:
            row[1] = npc["row_id"] + "-phase2"
            row[5:13] = [round(100 * (1 - float(npc[f]) * float(effects["60546"][f])), 6) for f in DAMAGE_FIELDS]
            evidence.update(stats="NpcParam_and_phase_SpEffectParam", damageEffectId="60546",
                            replacementDamageEffectId="60545")
        yield row, evidence


def harmonia_sources(placements, encounters):
    scene = "m16_00_00_00"
    bars = {e["targetEntityOrGroup"]: e for e in encounters if e["mapId"] == scene
            and e["nameId"] == 907640000 and e["memberResolution"] == "same-scene"}
    parts = {p["entityId"]: p for p in placements if p["scene"] == scene and p["kind"] == "enemies"}
    sources = {}
    # 90075850 links damage from each group to its own health-bar proxy.
    for bar_id, group, form, version in ((16000807, 16005800, "普通", "Boss"),
                                          (16000867, 16005860, "永夜一阶段", "永夜Boss 1阶段"),
                                          (16000857, 16005850, "永夜二阶段", "永夜Boss 2阶段")):
        if bar_id not in bars:
            continue
        name = bars[bar_id]["nameTexts"][0]["text"]
        for i in range(7):
            part = parts[bar_id - 7 + i]
            if part["model"] != "c7620":
                raise ValueError(f"Unexpected Harmonia member at {part['entityId']}")
            sources[part["npcId"]] = {
                "displayName": f"{name} ({version}) · 成员{i + 1}",
                "nightlordFamily": name, "formLabel": form, "member": i + 1,
                "scene": scene, "entityId": part["entityId"], "damageGroupId": group,
                "healthBarEntityId": bar_id, "nativeNameIds": [907640000],
                "searchAliases": ["七仙女", "安定者"], "stats": "NpcParam",
            }
        if bar_id == 16000857:
            worm = parts[16000858]
            if worm["model"] != "c4641":
                raise ValueError("Unexpected Harmonia worm model")
            sources[worm["npcId"]] = {
                "displayName": f"{name} · 虫形 (永夜Boss 2阶段)", "formLabel": form,
                "scene": scene, "entityId": 16000858, "damageGroupId": 16005851,
                "healthBarEntityId": bar_id, "nativeNameIds": [907640000],
                "searchAliases": ["七仙女", "安定者"], "stats": "NpcParam_and_resident_SpEffectParam",
                "damageEffectId": "62990",
            }
    return sources


def scene_records(paths: list[Path], aliases: dict[str, str],
                  templates: dict[str, dict], forts: dict[str, dict]) -> tuple[list[dict], dict[str, set[str]]]:
    records: list[dict] = []
    locations: dict[str, set[str]] = defaultdict(set)
    for path in paths:
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            scene = json.loads(line)
            if scene.get("status") not in (None, "ok", "parsed", "parsed-MSB_NR", "success"):
                continue
            basename = Path(scene.get("file", "").replace("\\", "/")).stem
            match = re.match(r"m50_(0[0-6]|1[01])_00_00$", basename)
            location = ("沼泽" if int(match.group(1)) <= 6 else "锻造村") if match else None
            alias = aliases.get(basename)
            if not location and alias:
                location = ALIAS_LOCATION_PREFIXES.get(alias.split(" - ", 1)[0])
            template = templates.get(basename)
            if template and template.get("building"):
                location = template["building"]
                if template.get("terrainCodes") == ["4"]:
                    location += "（大空洞）"
            if basename in forts:
                location = forts[basename]["building"] + "（大空洞）"
            for kind in ("enemies", "dummyEnemies"):
                for enemy in scene.get(kind, []):
                    raw_id = str(enemy.get("NpcParamId", ""))
                    if not raw_id or raw_id in ("0", "-1"):
                        continue
                    record = {
                        "npcId": raw_id, "scene": basename,
                        "entityId": enemy.get("entityId"),
                        "part": enemy.get("Name"), "kind": kind,
                        "model": enemy.get("ModelName"),
                        "variation": enemy.get("native", {}).get("data", {}).get("EntityData", {}).get("Variation"),
                        "placeholderModel": enemy.get("ModelName") in ("c0100", "c1000"),
                        "location": location,
                        "communityMapAlias": alias,
                        "nativeTemplateId": template.get("template") if template else None,
                        "source": str(path),
                    }
                    records.append(record)
                    if location and kind == "enemies" and not record["placeholderModel"]:
                        locations[raw_id].add(location)
    return records, locations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--native-csv", type=Path, required=True)
    parser.add_argument("--localized-csv", type=Path, required=True)
    parser.add_argument("--atlas", type=Path, default=Path("public/enemy-data.json"))
    parser.add_argument("--audit-dir", type=Path, required=True)
    parser.add_argument("--scene", type=Path, action="append", default=[])
    parser.add_argument("--encounters", type=Path)
    parser.add_argument("--native-encounters", type=Path)
    parser.add_argument("--map-aliases", type=Path, default=Path("scripts/data/enemy_map_aliases.json"))
    parser.add_argument("--template-locations", type=Path, default=Path("scripts/data/enemy_template_locations.json"))
    parser.add_argument("--entity-location-candidates", type=Path, default=Path("scripts/data/enemy_entity_location_candidates.json"))
    parser.add_argument("--underground-forts", type=Path, default=Path("scripts/data/enemy_underground_fort_locations.json"))
    parser.add_argument("--curated-extra-locations", type=Path, default=Path("scripts/data/enemy_curated_extra_locations.json"))
    parser.add_argument("--legacy-scale-locations", type=Path, default=Path("scripts/data/enemy_legacy_scale_locations.json"))
    parser.add_argument("--curation", type=Path, default=Path("scripts/data/enemy_atlas_curation.json"))
    parser.add_argument("--difference-review", type=Path, default=Path("scripts/data/enemy_difference_review.json"))
    parser.add_argument("--retired-ids", type=Path, default=Path("scripts/data/enemy_retired_source_ids.json"))
    parser.add_argument("--bilingual-candidates", type=Path, default=Path("scripts/data/enemy_bilingual_name_candidates.json"))
    parser.add_argument("--model-family-names", type=Path, default=Path("scripts/data/enemy_model_family_names.json"))
    parser.add_argument("--write", action="store_true", help="Update the atlas after auditing")
    args = parser.parse_args()
    if args.write and (not args.scene or not args.encounters or not args.native_encounters):
        parser.error("--write requires --scene, --encounters and --native-encounters")
    curation = json.loads(args.curation.read_text(encoding="utf-8"))
    difference_review = json.loads(args.difference_review.read_text(encoding="utf-8"))
    hostile_prefixes = tuple(curation["hostilePrefixes"])
    generated_ids = set(curation["generatedIds"])
    retired_prefixes = tuple(curation["retiredPrefixes"])
    retired_ids = set(curation["retiredIds"])
    excluded_generated_ids = curation["excludedGeneratedIds"]
    excluded_public_source_ids = set(curation["excludedPublicSourceIds"])
    retired_source_ids = set(json.loads(args.retired_ids.read_text(encoding="utf-8")))
    bilingual_candidates = json.loads(args.bilingual_candidates.read_text(encoding="utf-8"))
    model_family_names = json.loads(args.model_family_names.read_text(encoding="utf-8"))
    non_enemy_prefixes = tuple(curation["nonEnemyPrefixes"])

    atlas = json.loads(args.atlas.read_text(encoding="utf-8"))
    curated_extras = json.loads(args.curated_extra_locations.read_text(encoding="utf-8"))
    atlas["extraLocations"] = curated_extras["extraLocations"]
    # Rebuild script-owned cards from source every run so source corrections or
    # withdrawals cannot leave stale generated values in the curated file.
    generated_ids.update(atlas.get("generatedNativeIds", []))
    atlas["rows"] = [row for row in atlas["rows"]
                     if str(row[1]) not in generated_ids and str(row[1]) not in excluded_public_source_ids]
    curated_rows = list(atlas["rows"])
    ordinary_troll_ids = {str(row[1]) for row in curated_rows if str(row[0]).strip() == "山妖"}
    atlas["scale"]["rows"] = [row for row in atlas["scale"]["rows"]
                               if not (row[0] == "山妖" and row[1] == "山顶" and row[2] == "boss")]
    for scale_row in atlas["scale"]["rows"]:
        for index in (1, 2):
            if scale_row[index] == "古代封印监牢":
                scale_row[index] = "封印监牢"
    for row_id in generated_ids | excluded_public_source_ids:
        atlas.get("extraLocations", {}).pop(row_id, None)
    if len(atlas["columns"]) != 58 or any(len(row) != 58 for row in atlas["rows"]):
        raise ValueError("Expected 58-column curated enemy atlas")
    # Retire the value in place so existing rows keep their column offsets.
    atlas["columns"][27] = {"k": "removed_27", "label": "", "group": "removed", "src": None, "kind": "removed"}
    for row in atlas["rows"]:
        row[27] = None
    with args.native_csv.open(encoding="utf-8-sig", newline="") as handle:
        native = list(csv.DictReader(handle))
    npcs_by_id = {npc["row_id"]: npc for npc in native}
    # These resident effects have permanent duration and no HP activation threshold.
    reviewed_immunities = {"90000", "90010", "90020", "90030", "90040", "90060", "90300", "5852"}
    with args.native_csv.with_name("SpEffectParam.csv").open(encoding="utf-8-sig", newline="") as stream:
        immunity_fields = {effect["row_id"]: tuple(i for i, field in enumerate(STATUS_DISABLE_FIELDS)
                                                   if effect[field] == "1")
                           for effect in csv.DictReader(stream) if effect["row_id"] in reviewed_immunities
                           and effect["effectEndurance"] == "-1" and effect["conditionHpRate"] == "-1"}
    if immunity_fields.keys() != reviewed_immunities or not all(immunity_fields.values()):
        raise ValueError("Reviewed permanent status immunities have changed")
    with args.localized_csv.open(encoding="utf-8-sig", newline="") as handle:
        localized = {row["行ID"]: row for row in csv.DictReader(handle)}
    if len(native) != len(localized):
        raise ValueError("NpcParam and localized CSV row counts differ")

    aliases = {}
    if args.map_aliases:
        aliases = {row["ID"]: row["Name"] for row in json.loads(args.map_aliases.read_text(encoding="utf-8"))}
    templates = json.loads(args.template_locations.read_text(encoding="utf-8"))
    forts = json.loads(args.underground_forts.read_text(encoding="utf-8"))
    scene_rows, exact_locations = scene_records(args.scene, aliases, templates, forts)
    location_review = json.loads((args.curation.parent / "enemy_location_full_review.json").read_text(encoding="utf-8"))
    new_location_sources = location_review["newSources"]
    rolls = defaultdict(set)
    rolls_by_id = {}
    if args.native_encounters:
        lots = args.native_encounters.parent / "configs/LotResultSmallBaseAndSpot.jsonl"
        for line in lots.read_text(encoding="utf-8").splitlines():
            result = json.loads(line)
            lot = result["values"]
            rolls[lot["smallBaseMapId"]].add(int(lot["variationId"]))
            rolls_by_id[str(result["id"])] = lot
    if args.write:
        enemy_parts = {(p["npcId"], p["scene"], p["variation"], p["part"]): p for p in scene_rows
                       if p["kind"] == "enemies" and not p["placeholderModel"]}
        placements_to_check = [(source_id, row["model"], row["placements"]) for source_id, row in new_location_sources.items()]
        placements_to_check.extend((native_id(source_id), None, {k: v["placements"] for k, v in row["add"].items()})
                                   for source_id, row in location_review["sources"].items() if row.get("add"))
        for npc_id, model, placements in placements_to_check:
            for location, examples in placements.items():
                for scene, variation, part_name, *roll_source in examples:
                    part = enemy_parts.get((npc_id, scene, variation, part_name))
                    if not part or model and part["model"] != model:
                        raise ValueError(f"Missing reviewed {location} enemy {npc_id} in {scene}/{variation}/{part_name}")
                    if roll_source:
                        template, (pattern, attach, lot_id) = roll_source[0]
                        lot = rolls_by_id.get(lot_id, {})
                        if (part["nativeTemplateId"] != template or lot.get("smallBaseMapId") != template
                                or lot.get("patternId") != pattern or lot.get("attachId") != attach
                                or variation not in (-1, int(lot["variationId"]))):
                            raise ValueError(f"Changed rolled placement for {location} enemy {npc_id}, lot {lot_id}")
    ruins_beastmen = {p["npcId"] for p in scene_rows
                     if p["location"] == "遗迹" and p["model"] == "c3970" and p["kind"] == "enemies"
                     and p["nativeTemplateId"] in rolls and p["variation"] in {-1, *rolls[p["nativeTemplateId"]]}}
    if args.write and ruins_beastmen != {"39700210", "39700310", "39702210", "39701120"}:
        raise ValueError("Rolled ruins beastmen differ from the reviewed sources")
    hollow = json.loads((args.curation.parent / "enemy_hollow_cathedral.json").read_text(encoding="utf-8"))
    hollow_parts = {p["npcId"] for p in scene_rows
                    if p["location"] == HOLLOW_CATHEDRAL and p["nativeTemplateId"] in rolls
                    and p["variation"] in {-1, *rolls[p["nativeTemplateId"]]}
                    and p["kind"] == "enemies" and not p["placeholderModel"] and p["npcId"] != "76200110"}
    if args.write:
        if any(rolls[t] != set(v) for t, v in hollow["templates"].items()) or hollow_parts != set(hollow["cardNames"]):
            raise ValueError("Rolled Hollow cathedral placements differ from the reviewed sources")
    native_encounters = []
    if args.native_encounters:
        native_encounters = [json.loads(line) for line in args.native_encounters.read_text(encoding="utf-8").splitlines() if line]
    gaol = json.loads((args.curation.parent / "enemy_evergaol.json").read_text(encoding="utf-8"))
    gaol_scenes = {f"m{t[:2]}_{t[2:]}_00_00": t for t in gaol["layouts"]}
    gaol_parts = {(p["scene"], p["part"], p["npcId"]) for p in scene_rows
                  if p["scene"] in gaol_scenes and p["variation"] in rolls[gaol_scenes[p["scene"]]]
                  and p["kind"] == "enemies" and not p["placeholderModel"]}
    gaol_members = {(m["mapId"], m["part"], str(m["npcParamId"])) for event in native_encounters
                    if event["mapId"] in gaol_scenes and event["memberResolution"] == "same-scene"
                    for m in event["members"] if m["mapId"] == event["mapId"]}
    gaol_ids = {npc for _, _, npc in gaol_parts}
    gaol_names = {npc: form["name"] for form in gaol["forms"] for npc in form["sources"]}
    if args.write and (gaol_parts != gaol_members or gaol_ids != gaol_names.keys()
                       or any(rolls[t] != set(v) for t, v in gaol["layouts"].items())):
        raise ValueError("Evergaol layouts, placed enemies and health bar members must match the review")
    camp = json.loads((args.curation.parent / "enemy_large_camp.json").read_text(encoding="utf-8"))
    camp_names = {npc: form["name"] for form in camp["forms"] for npc in form["npcIds"]}
    camp_templates = {t["template"] for t in templates.values() if t.get("building") == LARGE_CAMP}
    camp_ids = {p["npcId"] for p in scene_rows if p["nativeTemplateId"] in camp_templates
                and p["variation"] in {-1, *rolls[p["nativeTemplateId"]]} and p["kind"] == "enemies"
                and not p["placeholderModel"] and p["npcId"] not in {"32000000", "76200110"}}
    if args.write and (camp_ids != camp_names.keys() or camp_templates != camp["layouts"].keys()
                       or any(rolls[t] != set(v) for t, v in camp["layouts"].items())):
        raise ValueError("Large camp layouts and active enemy placements must match the review")
    camp_npcs = {r["row_id"]: r for r in native if r["row_id"] in camp_ids}
    burning_corpses = {r["row_id"] for r in native if r["row_id"].startswith(("3661", "3662"))
                      and "17002" in {v for k, v in r.items() if k.startswith("spEffectID")}}
    atlas["largeCampSources"] = []
    retired_source_ids.difference_update(gaol_ids | camp_ids)
    gaol_npcs = {r["row_id"]: r for r in native if r["row_id"] in gaol_ids}
    atlas["evergaolSources"] = sorted(gaol_ids)
    harmonia = harmonia_sources(scene_rows, native_encounters)
    for npc_id in harmonia:
        exact_locations.setdefault(npc_id, set()).add("夜王")
    night_review = json.loads((args.curation.parent / "enemy_night_encounters.json").read_text(encoding="utf-8"))
    fort_forms = json.loads((args.curation.parent / "enemy_small_fort_forms.json").read_text(encoding="utf-8"))["forms"]
    fort_places = json.loads((args.curation.parent / "enemy_small_fort_places.json").read_text(encoding="utf-8"))
    authoritative_places = set(fort_places["authoritativeNpcIds"])
    night_scenes = night_review["vanguardByNightScene"]
    for scene, actors in location_review["nightVanguardActors"].items():
        night_scenes[scene] = sorted(set(night_scenes[scene]).union(actors))
    dlc_scenes = {scene for scene, template in templates.items()
                  if "4" in template["terrainCodes"] or template.get("building") in ("沼泽", "锻造村")}
    dlc_scenes.update(scene for scene in night_scenes if scene.startswith("m52_"))
    dlc_scenes.update(("m16_00_00_00", "m16_10_00_00", "m16_11_00_00"))
    dlc_npcs = {part["npcId"] for part in scene_rows if part["kind"] == "enemies" and not part["placeholderModel"]
                and (part["scene"] in dlc_scenes or (part["scene"].startswith("m60_") and part["scene"].endswith("_40")))}
    night_roles = {source_id: NIGHT_VANGUARD for members in night_scenes.values() for source_id in members}
    night_actors = {(part["scene"], part["entityId"], part["npcId"]) for part in scene_rows
                    if part["scene"] in night_scenes and part["kind"] == "enemies"
                    and not part["placeholderModel"] and part["model"] != "c0000"}
    # A collective health bar targets a group ID. Only a bar bound to the
    # individual placed actor identifies a boss, including in multi-boss fights.
    for encounter in native_encounters:
        scene = encounter["mapId"]
        target = encounter["targetEntityOrGroup"]
        if scene not in night_scenes or not target or encounter["memberResolution"] != "same-scene":
            continue
        for member in encounter["members"]:
            npc_id = str(member["npcParamId"])
            if member["mapId"] == scene and member["entityId"] == target and (scene, target, npc_id) in night_actors:
                night_roles[npc_id] = NIGHT_BOSS
    encounters = json.loads(args.encounters.read_text(encoding="utf-8"))["encounters"] if args.encounters else []
    forms, forge_evidence = albinauric_forms(native, curated_rows, scene_rows, encounters)
    for form in forms:
        other_places = location_review["sources"].get(form["statId"], {}).get("entityOnly", {})
        form["locations"] = ordered_public_locations([*form["locations"], *other_places])
    atlas["albinauricForms"] = forms
    hollow_evidence = json.loads((args.curation.parent / "enemy_dlc_location_evidence.json").read_text(encoding="utf-8"))
    for sources in hollow_evidence["locations"].values():
        dlc_npcs.update(native_id(source_id) for source_id in sources)
    for locations in exact_locations.values():
        locations.difference_update(NIGHT_LOCATIONS | {"魔法师塔", "魔法师塔（大空洞）"})
    for npc_id, role in night_roles.items():
        exact_locations.setdefault(npc_id, set()).add(role)
    for npc_id, excluded_locations in curation["displayLocationExclusionsById"].items():
        exact_locations.get(npc_id, set()).difference_update(excluded_locations)
    scene_counts = Counter(record["npcId"] for record in scene_rows)
    scene_enemy_ids = {record["npcId"] for record in scene_rows
                       if record["kind"] == "enemies" and not record["placeholderModel"]}
    scene_locations = {record["scene"]: record["location"] for record in scene_rows if record["location"]}
    group_name_ids = {event["nameId"] for event in native_encounters if len(event["members"]) > 1}
    single_event_names: dict[str, Counter[str]] = defaultdict(Counter)
    single_event_name_ids: dict[str, set[int]] = defaultdict(set)
    for event in native_encounters:
        if (len(event["members"]) != 1 or event["memberResolution"] == "unresolved"
                or event["nameId"] == 907640001 or event["mapId"].startswith(("m10_", "m13_", "m15_"))):
            continue
        if event["members"][0]["model"] in ("c0100", "c1000"):
            continue
        npc_id = str(event["members"][0]["npcParamId"])
        names = {item["text"] for item in event["nameTexts"] if item["text"] and item["text"] != "%null%"}
        if (len(names) != 1 or event["nameId"] in group_name_ids
                or any(marker in next(iter(names)) for marker in ("们", "群", "集团", "双人组", "众女孩", "三头野兽"))):
            continue
        single_event_names[npc_id][next(iter(names))] += 1
        single_event_name_ids[npc_id].add(event["nameId"])
    existing: dict[str, list[list[object]]] = defaultdict(list)
    for row in atlas["rows"]:
        existing[native_id(row[1])].append(row)

    coverage = []
    added = []
    generated_now = []
    card_evidence = {}
    harmonia_rows = []
    fort_rows = []
    vanguard_rows = []
    hollow_rows = []
    gaol_rows = []
    camp_rows = []
    reviewed_location_rows = []
    numeric_drift = []
    for npc in native:
        row_id = npc["row_id"]
        locale = localized[row_id]
        name = locale["中文名称"].strip()
        candidate = locale["中文候选"].strip()
        bilingual = bilingual_candidates.get(row_id)
        if not candidate and bilingual:
            candidate = bilingual["nameZh"]
        if row_id in excluded_public_source_ids:
            state = "intentionally_removed_from_public_atlas"
        elif row_id in excluded_generated_ids:
            state = "excluded_unreliable_or_out_of_scope"
        elif row_id in new_location_sources and row_id not in existing:
            state = "atlas_reviewed_location_source"
            source = new_location_sources[row_id]
            new_row = first_party_row(npc, source["name"], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            reviewed_location_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_and_encounter", "stats": "NpcParam", "scene": "MSB_NR_enemy_part"}
            if "encounterRole" in source:
                card_evidence[row_id]["encounterRole"] = source["encounterRole"]
            added.append({"npcId": row_id, "name": new_row[0], "locations": list(source["placements"])})
        elif row_id in camp_ids and row_id not in existing:
            # New records may have copies in unrolled variants of other maps.
            # Only carry those places forward when their own layout can roll.
            placed_locations = set()
            for part in scene_rows:
                if part["npcId"] != row_id or part["kind"] != "enemies" or part["placeholderModel"]:
                    continue
                template_id = part["scene"][1:6].replace("_", "")
                if part["variation"] == -1 or part["variation"] in rolls.get(template_id, ()):
                    placed_locations.add(part["location"])
            exact_locations.setdefault(row_id, set()).intersection_update(placed_locations | NIGHT_LOCATIONS)
            state = "atlas_reviewed_large_camp"
            new_row = first_party_row(npc, name or camp_names[row_id], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            camp_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_and_encounter", "stats": "NpcParam", "scene": "MSB_NR_enemy_part"}
            added.append({"npcId": row_id, "name": new_row[0], "locations": [LARGE_CAMP]})
        elif row_id in gaol_ids and row_id not in existing:
            state = "atlas_reviewed_evergaol"
            new_row = first_party_row(npc, gaol_names[row_id] + " (封印监牢Boss)", len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            gaol_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_and_encounter", "stats": "NpcParam", "scene": "MSB_NR_enemy_part"}
            added.append({"npcId": row_id, "name": new_row[0], "locations": [EVERGAOL]})
        elif (row_id in retired_source_ids or row_id in retired_ids
                or (row_id.startswith(retired_prefixes) and row_id not in existing)):
            state = "intentionally_retired"
        elif row_id in generated_ids and row_id.startswith(hostile_prefixes) and locale["对应状态"] == "游戏文本ID对应" and name:
            state = "atlas_game_text_enemy"
            new_row = first_party_row(npc, name, len(atlas["columns"]))
            atlas["rows"].append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "native_game_text_id", "stats": "NpcParam"}
            added.append({"npcId": row_id, "name": name, "locations": sorted(exact_locations.get(row_id, []))})
        elif row_id in existing:
            state = "atlas_exact_source_id"
        elif row_id in hollow["newSources"] and row_id in hollow_parts:
            state = "atlas_reviewed_hollow_cathedral"
            new_row = first_party_row(npc, hollow["newSources"][row_id], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            hollow_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_and_encounter", "stats": "NpcParam", "scene": "MSB_NR_enemy_part"}
            added.append({"npcId": row_id, "name": new_row[0], "locations": [HOLLOW_CATHEDRAL]})
        elif row_id in night_review["newVanguardNames"]:
            scenes = [scene for scene, members in night_scenes.items() if row_id in members]
            if not scenes or not set(scenes) <= {scene for scene, _, npc_id in night_actors if npc_id == row_id}:
                raise ValueError(f"Missing reviewed night vanguard placement for {row_id}")
            state = "atlas_reviewed_vanguard"
            new_row = first_party_row(npc, night_review["newVanguardNames"][row_id], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            vanguard_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_family", "stats": "NpcParam", "scene": scenes}
            added.append({"npcId": row_id, "name": new_row[0], "locations": [NIGHT_VANGUARD]})
        elif row_id in fort_places["newSources"]:
            if row_id not in scene_enemy_ids or not fort_places["locationsByNpcId"].get(row_id):
                raise ValueError(f"Missing placement for {row_id}")
            state = "atlas_reviewed_appearance"
            new_row = first_party_row(npc, fort_places["newSources"][row_id], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            fort_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {"name": "reviewed_model_family", "stats": "NpcParam", "scene": "MSB_NR_enemy_part"}
            added.append({"npcId": row_id, "name": new_row[0], "locations": fort_places["locationsByNpcId"][row_id]})
        elif row_id in harmonia:
            state = "atlas_event_text_enemy"
            evidence = harmonia[row_id]
            new_row = first_party_row(npc, evidence["displayName"], len(atlas["columns"]))
            fill_reviewed_fields(new_row, npc)
            if "damageEffectId" in evidence:
                effect_id = evidence["damageEffectId"]
                if npc["spEffectID20"] != effect_id:
                    raise ValueError("Harmonia worm resident effect changed")
                with args.native_csv.with_name("SpEffectParam.csv").open(encoding="utf-8-sig", newline="") as stream:
                    effect = next(r for r in csv.DictReader(stream) if r["row_id"] == effect_id)
                new_row[5:13] = [round(100 * (1 - float(npc[f]) * float(effect[f])), 6) for f in DAMAGE_FIELDS]
            harmonia_rows.append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = evidence
            added.append({"npcId": row_id, "name": new_row[0], "locations": ["夜王"]})
        elif row_id == "76100010" and row_id in single_event_names:
            state = "atlas_event_text_enemy"
            for phase_row, evidence in dreglord_phases(npc, native_encounters, len(atlas["columns"]),
                                                       args.native_csv.with_name("SpEffectParam.csv")):
                source_id = str(phase_row[1])
                atlas["rows"].append(phase_row)
                existing[row_id].append(phase_row)
                generated_now.append(source_id)
                card_evidence[source_id] = evidence
                added.append({"npcId": row_id, "sourceId": source_id, "name": phase_row[0], "locations": ["夜王"]})
        elif row_id in single_event_names and npc["teamType"] != "26":
            state = "atlas_event_text_enemy"
            event_name = sorted(single_event_names[row_id].items(), key=lambda item: (-item[1], len(item[0]), item[0]))[0][0]
            new_row = first_party_row(npc, event_name, len(atlas["columns"]))
            atlas["rows"].append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {
                "name": "native_healthbar_FMG_and_exact_MSB_NpcParamId",
                "nativeNameIds": sorted(single_event_name_ids[row_id]),
                "allObservedNames": sorted(single_event_names[row_id]),
                "stats": "NpcParam", "scene": "MSB_NR_enemy_part",
            }
            added.append({"npcId": row_id, "name": event_name,
                          "locations": sorted(exact_locations.get(row_id, []))})
        elif row_id.startswith(non_enemy_prefixes):
            state = "non_enemy_actor"
        elif (row_id in model_family_names and row_id in scene_enemy_ids
              and any(not scene.startswith(("m10_", "m13_", "m15_"))
                      for scene in model_family_names[row_id]["scenes"])):
            state = "atlas_model_family_candidate"
            family = model_family_names[row_id]
            family_name = family["familyName"]
            new_row = first_party_row(npc, family_name, len(atlas["columns"]))
            atlas["rows"].append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {
                "name": "native_model_community_alias_and_native_FMG_family_term",
                "model": family["model"], "modelAlias": family["modelAlias"],
                "termSource": family["termSource"],
                "stats": "NpcParam", "scene": family["scenes"],
            }
            added.append({"npcId": row_id, "name": family_name,
                          "locations": sorted(exact_locations.get(row_id, []))})
        elif (row_id in bilingual_candidates and row_id in scene_enemy_ids
              and npc["teamType"] != "26"):
            state = "atlas_bilingual_candidate"
            candidate_name = bilingual_candidates[row_id]["nameZh"]
            new_row = first_party_row(npc, candidate_name, len(atlas["columns"]))
            atlas["rows"].append(new_row)
            existing[row_id].append(new_row)
            generated_now.append(row_id)
            card_evidence[row_id] = {
                "name": "Smithbox_row_alias_matched_to_native_FMG_candidate",
                "nativeNameIds": bilingual_candidates[row_id]["nativeNameIds"],
                "stats": "NpcParam", "scene": "MSB_NR_enemy_part",
            }
            added.append({"npcId": row_id, "name": candidate_name,
                          "locations": sorted(exact_locations.get(row_id, []))})
        elif name or candidate:
            state = "named_unresolved"
        else:
            state = "unnamed_unresolved"
        coverage.append({
            "npcId": row_id, "nativeRowName": npc["row_name"],
            "localizedName": name or None, "nameCandidate": candidate or None,
            "nameEvidence": locale["对应状态"],
            "bilingualEvidence": (bilingual["nativeNameIds"] if bilingual else None),
            "status": state,
            "nameResolution": ("native_event_fmg_exact_member" if state == "atlas_event_text_enemy"
                               else "model_alias_fmg_family_candidate" if state == "atlas_model_family_candidate"
                               else "game_text_id" if locale["对应状态"] == "游戏文本ID对应" and name
                               else "community_alias_fmg_candidate" if state == "atlas_bilingual_candidate"
                               else "community_alias_fmg_candidate" if bilingual
                               else "legacy_atlas_candidate" if name or candidate else "unresolved"),
            "locationResolution": ("static_template_identified" if exact_locations.get(row_id)
                                   else "scene_placed_location_unresolved" if scene_counts[row_id]
                                   else "no_static_scene_placement"),
            "atlasSourceIds": [str(row[1]) for row in existing.get(row_id, [])],
            "sceneCount": scene_counts[row_id],
            "exactLocations": sorted(exact_locations.get(row_id, [])),
        })
        for atlas_row in existing.get(row_id, []):
            if row_id in dlc_npcs:
                atlas_row[38:42] = species_weakness_flags(npc)

    # Append the new encounter in battle order, preserving older atlas row links.
    form_order = {"普通": 0, "永夜一阶段": 1, "永夜二阶段": 2}
    atlas["rows"].extend(sorted(harmonia_rows, key=lambda row: (
        form_order[harmonia[str(row[1])]["formLabel"]], harmonia[str(row[1])].get("member", 8))))
    atlas["rows"].extend(fort_rows)
    atlas["rows"].extend(vanguard_rows)
    atlas["rows"].extend(hollow_rows)
    atlas["rows"].extend(gaol_rows)
    atlas["rows"].extend(camp_rows)
    atlas["rows"].extend(reviewed_location_rows)

    extras = atlas.setdefault("extraLocations", {})
    for source_id, names in list(extras.items()):
        extras[source_id] = sorted(set(ordered_public_locations(names)) - NIGHT_LOCATIONS)
    for source_id, rows in existing.items():
        names = {HOLLOW_CATHEDRAL} if source_id in hollow["newSources"] and source_id in hollow_parts else exact_locations.get(source_id)
        if names:
            for row in rows:
                # An MSB NPC ID cannot select the a/b scaling branch.
                if str(row[1]) != source_id:
                    continue
                key = str(row[1])
                extras[key] = sorted(set(extras.get(key, [])) | set(ordered_public_locations(names)))
    for source_id in ordinary_troll_ids:
        if source_id in extras:
            extras[source_id] = [name for name in extras[source_id] if name != "山顶"]

    for row in atlas["rows"]:
        for index in REMOVED_COLUMNS:
            if row[index] is not None:
                raise ValueError(f"Retired column {index} populated in source ID {row[1]}")
    atlas["generatedNativeIds"] = sorted(generated_now)
    atlas["nativeCardEvidence"] = card_evidence
    variant_groups = []
    named_generated: dict[str, list[str]] = defaultdict(list)
    for row in atlas["rows"]:
        if str(row[1]) in generated_now:
            named_generated[entity_name(row[0])].append(str(row[1]))
    for name, source_ids in sorted(named_generated.items()):
        if len(source_ids) > 1:
            variant_groups.append({"name": name, "sourceIds": sorted(source_ids),
                                   "relation": "same_display_name; form and activation not inferred"})
    (args.audit_dir / "variant-groups.json").parent.mkdir(parents=True, exist_ok=True)
    (args.audit_dir / "variant-groups.json").write_text(json.dumps(variant_groups, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    audit = args.audit_dir
    audit.mkdir(parents=True, exist_ok=True)
    dlc_species = [{"sourceId": str(row[1]), "npcId": native_id(row[1]), "flags": row[38:42]}
                   for row in atlas["rows"] if native_id(row[1]) in dlc_npcs]
    (audit / "dlc-species.json").write_text(json.dumps(dlc_species, indent=2) + "\n", encoding="utf-8")
    gaps = [row for row in coverage if row["status"].endswith("unresolved")]
    (audit / "gaps.json").write_text(json.dumps(gaps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "new-cards.json").write_text(json.dumps(added, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    entity_candidates = json.loads(args.entity_location_candidates.read_text(encoding="utf-8"))
    entity_location_rows = []
    entity_sources: dict[tuple[str, str, str], dict] = {}
    for npc_id, candidate in entity_candidates.items():
        if candidate["entityName"] == "白金之子":
            continue  # Matched by native appearance and placement above.
        if (not exact_locations.get(npc_id) or npc_id not in scene_enemy_ids
                or npc_id in retired_source_ids or npc_id in excluded_generated_ids
                or candidate["model"] in ("c0100", "c1000")
                or any(str(row[1]) == npc_id for row in existing.get(npc_id, []))):
            continue
        entity_location_rows.append({
            "npcId": npc_id, "entityName": candidate["entityName"],
            "locations": sorted(exact_locations[npc_id]),
            "candidateAtlasSourceIds": candidate["sourceIds"],
            "relation": "same model and behavior; entity location candidate, not variant-specific",
        })
        eligible_sources = [row for row in curated_rows
                            if native_id(row[1]) in candidate["sourceIds"]
                            and entity_name(row[0]) == candidate["entityName"]]
        if not eligible_sources:
            continue
        family_key = (candidate["entityName"], candidate["model"], candidate["behaviorVariationId"])
        family = entity_sources.setdefault(family_key, {"locations": set(), "rows": {}})
        family["locations"].update(exact_locations[npc_id])
        for row in eligible_sources:
            family["rows"][str(row[1])] = row
    entity_location_by_source = {}
    entity_assignments = []
    for (name, model, behavior), family in sorted(entity_sources.items()):
        def priority(source_id: str) -> tuple[int, int, int, str]:
            row = family["rows"][source_id]
            return (source_id.endswith("b"), bool(re.search(r"[（(]", str(row[0]))),
                    source_id.endswith("a"), source_id)
        representative = min(family["rows"], key=priority)
        locations = sorted(set(ordered_public_locations(family["locations"])))
        if representative in ordinary_troll_ids:
            locations = [name for name in locations if name != "山顶"]
        entity_location_by_source[representative] = sorted(set(entity_location_by_source.get(representative, [])) | set(locations))
        entity_assignments.append({"sourceId": representative, "entityName": name,
                                   "model": model, "behaviorVariationId": behavior,
                                   "locations": locations, "scope": "entity-only"})
    for form in forms:
        entity_location_by_source[form["statId"]] = sorted(form["locations"])
    # Display on the shared card when a placement cannot identify a stat branch.
    for source_id, locations in curation["entityLocationOverridesById"].items():
        entity_location_by_source[source_id] = ordered_public_locations(
            entity_location_by_source.get(source_id, []) + locations)
    atlas["entityLocationsBySourceId"] = entity_location_by_source
    (audit / "entity-location-candidates.json").write_text(json.dumps(entity_location_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "entity-location-assignments.json").write_text(json.dumps(entity_assignments, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "scene-placements.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in scene_rows), encoding="utf-8"
    )
    encounter_links = []
    public_encounters: dict[str, dict] = {}
    if args.encounters:
        for encounter in encounters:
            members = []
            public_members: dict[str, dict] = {}
            for member in encounter["members"]:
                npc_id = str(member["NpcParamId"])
                source_ids = [str(row[1]) for row in existing.get(npc_id, [])]
                members.append({
                    "npcId": npc_id, "part": member["Name"],
                    "entityId": member["entityId"], "atlasSourceIds": source_ids,
                    "variantBranchUnresolved": any(source_id != npc_id for source_id in source_ids),
                })
                exact_card = next((row for row in existing.get(npc_id, []) if str(row[1]) == npc_id), None)
                public_id = npc_id if exact_card is not None else (source_ids[0] if len(source_ids) == 1 else npc_id)
                public_name = (str(exact_card[0]) if exact_card is not None else
                               localized.get(npc_id, {}).get("中文名称", "").strip())
                item = public_members.setdefault(public_id, {"enemyId": public_id, "count": 0})
                item["count"] += 1
                if public_name:
                    item["name"] = public_name
            encounter_links.append({
                "templateId": encounter["templateId"], "scene": encounter["scene"],
                "location": "锻造村" if encounter["location"] == "锻造设施" else encounter["location"],
                "encounterNameId": encounter["encounterNameId"],
                "encounterName": encounter["encounterName"],
                "sharedReference": encounter["encounterName"] == "安定者们",
                "members": members,
                "scope": "group encounter; member NPC names and spawn conditions are separate",
            })
            if encounter["encounterName"] != "安定者们":
                if all(any(str(row[1]) == str(member["NpcParamId"])
                           and str(row[0]) == encounter["encounterName"]
                           for row in existing.get(str(member["NpcParamId"]), []))
                       for member in encounter["members"]):
                    continue
                if len(encounter["members"]) == 1:
                    only_id = str(encounter["members"][0]["NpcParamId"])
                    if any(str(row[1]) == only_id and str(row[0]) == encounter["encounterName"]
                           for row in existing.get(only_id, [])):
                        continue
                encounter_id = f"encounter-{encounter['encounterNameId']}"
                card = public_encounters.setdefault(encounter_id, {
                    "id": encounter_id, "name": encounter["encounterName"],
                    "locations": [], "category": "据点遭遇", "members": [],
                })
                location = "锻造村" if encounter["location"] == "锻造设施" else encounter["location"]
                if location not in card["locations"]:
                    card["locations"].append(location)
                for member in public_members.values():
                    if member not in card["members"]:
                        card["members"].append(member)
    native_event_audit = []
    for event in native_encounters:
        event_id = f"encounter-{event['nameId']}"
        location = scene_locations.get(event["mapId"])
        texts = sorted({item["text"] for item in event["nameTexts"] if item["text"] and item["text"] != "%null%"})
        eligible_members = []
        for member in event["members"]:
            npc_id = str(member["npcParamId"])
            npc = next((item for item in native if item["row_id"] == npc_id), None)
            if (npc_id in retired_source_ids or npc_id in retired_ids or npc_id in excluded_generated_ids
                    or (npc_id.startswith(retired_prefixes) and npc_id not in existing) or not npc
                    or npc["teamType"] == "26" or member["model"] in ("c0100", "c1000")):
                continue
            eligible_members.append(member)
        if event["nameId"] == 907640001:
            disposition = "shared_common_reference"
        elif event["mapId"].startswith(("m10_", "m13_", "m15_")):
            disposition = "hub_or_tutorial"
        elif not event["members"] or event["memberResolution"] == "unresolved":
            disposition = "member_unresolved"
        elif not eligible_members:
            disposition = "retired_or_friendly"
        elif len(eligible_members) != len(event["members"]):
            disposition = "partial_retired_or_friendly"
        elif len(event["members"]) == 1 and len(eligible_members) == 1:
            only_id = str(eligible_members[0]["npcParamId"])
            if any(str(row[1]) == only_id for row in existing.get(only_id, [])):
                disposition = "single_native_card"
            elif only_id in existing:
                disposition = "single_variant_branch_unresolved"
            else:
                disposition = "single_unlinked"
        else:
            disposition = "group_encounter"
        native_event_audit.append({
            "mapId": event["mapId"], "nameId": event["nameId"], "names": texts,
            "location": location, "memberResolution": event["memberResolution"],
            "memberNpcIds": [str(member["npcParamId"]) for member in event["members"]],
            "disposition": disposition,
            "triggerResolution": event["triggerResolution"],
        })
        if disposition != "group_encounter" or not texts:
            continue
        if all(any(str(row[1]) == str(member["npcParamId"]) and str(row[0]) == texts[0]
                   for row in existing.get(str(member["npcParamId"]), []))
               for member in eligible_members):
            native_event_audit[-1]["disposition"] = "same_name_members_folded_into_card"
            continue
        card = public_encounters.setdefault(event_id, {
            "id": event_id, "name": texts[0], "locations": [],
            "category": (location if location in ("夜晚Boss", "原野Boss")
                         else "据点遭遇" if location else "具名遭遇"),
            "members": [],
        })
        if location and location not in card["locations"]:
            card["locations"].append(location)
        group_members: dict[str, dict] = {}
        for member in eligible_members:
            npc_id = str(member["npcParamId"])
            linked = next((row for row in existing.get(npc_id, []) if str(row[1]) == npc_id), None)
            display_name = str(linked[0]) if linked else bilingual_candidates.get(npc_id, {}).get("nameZh")
            item = group_members.setdefault(npc_id, {"enemyId": npc_id, "count": 0})
            item["count"] += 1
            if display_name:
                item["name"] = display_name
        for member in group_members.values():
            prior = next((item for item in card["members"] if item["enemyId"] == member["enemyId"]), None)
            if prior:
                prior["count"] = max(prior.get("count", 1), member["count"])
                if member.get("name"):
                    prior["name"] = member["name"]
            else:
                card["members"].append(member)
    atlas["encounters"] = (sorted(public_encounters.values(), key=lambda card: card["id"])
                           if curation["publishEncounters"] else [])
    legacy_locations = json.loads(args.legacy_scale_locations.read_text(encoding="utf-8"))
    if legacy_locations["sourceCommit"] != curation["legacyScaleSourceCommit"]:
        raise ValueError("Unexpected legacy scale location source commit")
    scale_by_source = legacy_locations["locationsBySourceId"]
    display_locations: dict[str, list[str]] = {}
    stat_locations: dict[str, list[str]] = {}
    # Validate against rolled layouts and their enabled enemy variations. A map
    # alias alone also matches the unrolled 3190 template.
    fort_parts = defaultdict(list)
    fort_templates = {scene: str(t["template"]) for scene, t in templates.items()
                      if t.get("building") == "小型要塞"}
    for part in scene_rows:
        template = fort_templates.get(part["scene"])
        if (template in rolls and part["variation"] in rolls[template]
                and part["kind"] == "enemies" and not part["placeholderModel"]):
            fort_parts[part["npcId"]].append(part)
    # Only the base-game cathedral layouts use these maps. The always-present
    # Harmonia actor is activated by a separate invasion event.
    cathedral_parts = {part["npcId"] for part in scene_rows
                       if part["location"] == "大教堂" and part["nativeTemplateId"] in rolls
                       and part["variation"] in {-1, *rolls[part["nativeTemplateId"]]}
                       and part["kind"] == "enemies" and not part["placeholderModel"]
                       and part["npcId"] != "76200110"}
    if args.write:
        for template in ("3800", "3810"):
            variations = {p["variation"] for p in scene_rows if p["nativeTemplateId"] == template
                          and p["npcId"] in cathedral_parts and p["kind"] == "enemies" and not p["placeholderModel"]}
            if not rolls[template] or not rolls[template] <= variations:
                raise ValueError(f"Missing rolled cathedral placements for {template}")
    if args.write and not fort_parts:
        raise ValueError("No rolled fort placements available")
    # Check the same NPCs in every scene. Attach the findings to the shared
    # card: a placement identifies an NPC, not its a/b scaling branch.
    other_placements = defaultdict(set)
    for part in scene_rows:
        if part["npcId"] not in fort_parts or part["kind"] != "enemies" or part["placeholderModel"]:
            continue
        location = public_location(part["location"]) if part["location"] else None
        if not location or location == "小型要塞":
            continue
        template = part["nativeTemplateId"]
        if template and (template not in rolls or part["variation"] not in {-1, *rolls[template]}):
            continue
        other_placements[part["npcId"]].add(location)
    atlas["fortVariantSources"] = []
    atlas["cathedralSources"] = []
    atlas["hollowCathedralSources"] = []
    resident_effects = {"21300520": ["16178"], **(hollow["residentEffects"] if hollow_parts else {})}
    wanted_effects = {sid for ids in resident_effects.values() for sid in ids}
    wanted_effects.update(info["damageEffectId"] for info in card_evidence.values() if "damageEffectId" in info)
    effect_rates = {}
    if wanted_effects:
        with args.native_csv.with_name("SpEffectParam.csv").open(encoding="utf-8-sig", newline="") as stream:
            effect_rates = {r["row_id"]: r for r in csv.DictReader(stream) if r["row_id"] in wanted_effects}
    affected_npcs = {r["row_id"]: r for r in native if r["row_id"] in resident_effects}
    # Once the shell breaks, the eight incoming damage rates are the NPC's
    # base rates. Effect 11550 only applies while the shell is intact.
    crystal_ids = {"33500020", "33500010", "33501010", "33501040", "33502010"}
    crystals = {r["row_id"]: r for r in native if r["row_id"] in crystal_ids}
    atlas["crystalianSources"] = []
    atlas["cardNamesBySourceId"] = {}
    fort_names = {str(npc): form["cardName"] for form in fort_forms if form.get("cardName") for npc in form["npcIds"]}
    for npc, parent in fort_places["sameAppearanceAs"].items():
        if parent in fort_names:
            fort_names[npc] = fort_names[parent]
    public_location_evidence: dict[str, dict] = {}
    completed_ids = set(difference_review["completeNativeFields"])
    reviewed_npcs = {r["row_id"]: r for r in native if r["row_id"] in completed_ids}
    atlas["reviewedProfileFamilies"] = list(difference_review["profileRepresentatives"].values())
    atlas["poiseFormBySource"] = {}
    for row in atlas["rows"]:
        source_id = str(row[1])
        if source_id in completed_ids:
            fill_reviewed_fields(row, reviewed_npcs[source_id])
        row[0] = curation.get("sourceNameOverridesById", {}).get(source_id, row[0])
        row[0] = row[0].replace("古代封印监牢", "封印监牢")
        if entity_name(row[0]) == "小恶魔":
            row[24] = 30  # Public poise shared by all imp forms.
        npc_id = native_id(source_id)
        npc = npcs_by_id[npc_id]
        row[13:20] = resident_status_values(npc, immunity_fields)
        row[38:42] = species_weakness_flags(npc)
        if npc_id.startswith(("2270", "2276")) and entity_name(row[0]) in {"大螃蟹", "大螃蟹 - 骤死"}:
            atlas["cardNamesBySourceId"][source_id] = "大螃蟹"
            card_evidence.setdefault(source_id, {})["searchAliases"] = [
                "骤死大螃蟹" if npc_id.startswith("2276") else "普通大螃蟹"]
        if npc_id in fort_names:
            atlas["cardNamesBySourceId"][source_id] = fort_names[npc_id]
        if npc_id in ruins_beastmen or (npc_id.startswith("3970") and npc_id in gaol_ids):
            atlas["poiseFormBySource"][source_id] = "大型兽人" if npc_id in {"39701110", "39701120"} else "其他兽人"
        for family in ("灵庙无头士兵", "灵庙无头骑士", "法姆亚兹拉的兽人", "片鳞混种", "熔炉骑士", "失乡骑士"):
            if entity_name(row[0]).split(" - ")[0] == family:
                atlas["cardNamesBySourceId"][source_id] = family
        if npc_id in hollow_parts:
            atlas["cardNamesBySourceId"][source_id] = hollow["cardNames"][npc_id]
            if npc_id in hollow["aliases"]:
                card_evidence.setdefault(source_id, {})["searchAliases"] = hollow["aliases"][npc_id]
        if entity_name(row[0]).split(" - ")[0] == "法姆亚兹拉的骷髅兽人":
            atlas["cardNamesBySourceId"][source_id] = "法姆亚兹拉的骷髅兽人"
        # Keep equipment aliases searchable while grouping repeated loadouts by damage.
        camp_family = entity_name(row[0]).split(" - ")[0]
        if camp_family in {"流刑士兵", "罗德尔骑士", "红狮子骑士", "红狮子城士兵"}:
            atlas["cardNamesBySourceId"][source_id] = camp_family
        if npc_id in burning_corpses:
            atlas["cardNamesBySourceId"][source_id] = "燃烧活尸"
        if npc_id in camp_ids:
            atlas["cardNamesBySourceId"][source_id] = camp_names[npc_id]
            row[5:13] = [round(100 * (1 - float(camp_npcs[npc_id][field])), 6) for field in DAMAGE_FIELDS]
        if npc_id == "36615010":
            row[0] = row[0].replace(" (大型营地)", "")
        if source_id in gaol_ids:
            atlas["cardNamesBySourceId"][source_id] = gaol_names[source_id]
            row[5:13] = [round(100 * (1 - float(gaol_npcs[source_id][f])), 6) for f in DAMAGE_FIELDS]
        if npc_id in resident_effects:
            npc = affected_npcs[npc_id]
            ids = resident_effects[npc_id]
            if not set(ids) <= {v for k,v in npc.items() if k.startswith("spEffectID")}:
                raise ValueError(f"Resident damage effects changed for {npc_id}")
            rates = [float(npc[field]) for field in DAMAGE_FIELDS]
            for sid in ids:
                rates = [v * float(effect_rates[sid][field]) for v, field in zip(rates, DAMAGE_FIELDS)]
            row[5:13] = [round(100 * (1 - v), 6) for v in rates]
            card_evidence.setdefault(source_id, {}).update(stats="NpcParam_and_resident_SpEffectParam", damageEffectIds=ids)
        if npc_id == "37022010":
            row[0] = "辉石魔法师" + (" [灾域]" if source_id.endswith("b") else "")
            card_evidence.setdefault(source_id, {})["searchAliases"] = ["双辉石头套魔法师"]
        if npc_id in crystal_ids:
            crystal = crystals[npc_id]
            row[5:13] = [round(100 * (1 - float(crystal[field])), 4) for field in DAMAGE_FIELDS]
            atlas["crystalianSources"].append(source_id)
        curated_scale_locations = list(scale_by_source.get(source_id, []))
        superseded = difference_review["supersededScaleLocations"].get(source_id, [])
        locations = [location for location in curated_scale_locations if location not in superseded and location not in NIGHT_LOCATIONS]
        exact_source_locations = atlas["extraLocations"].get(source_id, [])
        if source_id in night_review["sourceNames"]:
            row[0] = night_review["sourceNames"][source_id]
        elif night_roles.get(source_id) == NIGHT_VANGUARD:
            row[0] = re.sub(r"夜晚Boss(?!\s*前哨战)", NIGHT_VANGUARD, str(row[0]))
        if source_id == "35700010" and night_roles.get(source_id) == NIGHT_BOSS:
            row[0] = "神皮贵族 (夜晚Boss)"
        if source_id in {"41000040", "41001040", "41002040"}:
            row[0] = "亚人 (亚人女王随从)"
        if entity_name(row[0]) in {"亚人", "大型亚人"}:
            atlas["cardNamesBySourceId"][source_id] = "亚人"
        elif source_id == "49801110":
            atlas["cardNamesBySourceId"][source_id] = "死亡仪式鸟"
        entity_only_locations = atlas["entityLocationsBySourceId"].get(source_id, [])
        locations.extend(exact_source_locations)
        locations.extend(curation["displayLocationOverridesById"].get(source_id, []))
        excluded = set(curation["displayLocationExclusionsById"].get(native_id(source_id), []))
        if ruins_beastmen and npc_id.startswith("3970"):
            if npc_id in ruins_beastmen:
                locations.append("遗迹")
            else:
                excluded.add("遗迹")
                entity_only_locations = [loc for loc in entity_only_locations if loc != "遗迹"]
        if source_id in ordinary_troll_ids:
            excluded.add("山顶")
        if entity_name(row[0]) == "祖灵":
            excluded.add("要塞底层Boss")
        if fort_parts:
            if npc_id in fort_parts:
                locations.append("小型要塞")
                atlas["fortVariantSources"].append(source_id)
                if source_id == npc_id or source_id == npc_id + "a":
                    entity_only_locations = ordered_public_locations(
                        entity_only_locations + sorted(other_placements[npc_id]))
                    atlas["entityLocationsBySourceId"][source_id] = entity_only_locations
                if source_id == "44900010b" and "[灾域]" not in row[0]:
                    row[0] = row[0].replace("大壶", "大壶 [灾域]", 1)
            else:
                excluded.add("小型要塞")
                entity_only_locations = [v for v in entity_only_locations if v != "小型要塞"]
            if npc_id == "37024010":
                locations.extend(sorted(exact_locations.get(npc_id, set())))
        reviewed_locations = difference_review["additionalEntityLocations"].get(source_id, [])
        if reviewed_locations:
            entity_only_locations = ordered_public_locations(entity_only_locations + reviewed_locations)
            atlas["entityLocationsBySourceId"][source_id] = entity_only_locations
        # Old scale rows and same-family overrides cannot transfer night roles
        # to another source. Keep those provenance records outside the filters.
        role = night_roles.get(source_id)
        excluded.update(NIGHT_LOCATIONS - {role})
        entity_only_locations = [item for item in entity_only_locations if item not in NIGHT_LOCATIONS]
        if npc_id in authoritative_places:
            verified = fort_places["locationsByNpcId"][npc_id]
            excluded.update(set(locations) - set(verified))
            entity_only_locations = [item for item in entity_only_locations if item in verified]
            exact_source_locations = [item for item in exact_source_locations if item in verified]
            if source_id in atlas["extraLocations"]:
                atlas["extraLocations"][source_id] = exact_source_locations
            if source_id in (npc_id, npc_id + "a"):
                entity_only_locations = ordered_public_locations(entity_only_locations + [
                    loc for loc in verified if loc not in locations and loc not in NIGHT_LOCATIONS])
            if entity_only_locations:
                atlas["entityLocationsBySourceId"][source_id] = entity_only_locations
        if cathedral_parts:
            if npc_id in cathedral_parts:
                locations.append("大教堂")
                atlas["cathedralSources"].append(source_id)
            else:
                excluded.add("大教堂")
                entity_only_locations = [loc for loc in entity_only_locations if loc != "大教堂"]
                if "大教堂" in exact_source_locations:
                    exact_source_locations = [loc for loc in exact_source_locations if loc != "大教堂"]
                    atlas["extraLocations"][source_id] = exact_source_locations
        if hollow_parts:
            # The native ID identifies the actor. A placement alone cannot identify
            # the a/b scaling branch of a record imported from another area.
            locations = [loc for loc in locations if loc != HOLLOW_CATHEDRAL]
            entity_only_locations = [loc for loc in entity_only_locations if loc != HOLLOW_CATHEDRAL]
            if npc_id in hollow_parts and source_id in (npc_id, npc_id + "a"):
                atlas["hollowCathedralSources"].append(source_id)
                if source_id == npc_id:
                    excluded.discard(HOLLOW_CATHEDRAL)
                    locations.append(HOLLOW_CATHEDRAL)
                else:
                    entity_only_locations.append(HOLLOW_CATHEDRAL)
            elif HOLLOW_CATHEDRAL in exact_source_locations:
                exact_source_locations = [loc for loc in exact_source_locations if loc != HOLLOW_CATHEDRAL]
                atlas["extraLocations"][source_id] = exact_source_locations
        if camp_ids:
            if npc_id in camp_ids:
                atlas["largeCampSources"].append(source_id)
                excluded.discard(LARGE_CAMP)
                # A shared NPC proves the actor and eight rates, but a castle
                # HP scaling record cannot be attributed to the camp by ID alone.
                if source_id == npc_id or LARGE_CAMP in locations or not locations:
                    locations.append(LARGE_CAMP)
                else:
                    entity_only_locations = ordered_public_locations(entity_only_locations + [LARGE_CAMP])
            else:
                excluded.add(LARGE_CAMP)
                entity_only_locations = [v for v in entity_only_locations if v != LARGE_CAMP]
                if LARGE_CAMP in exact_source_locations:
                    exact_source_locations = [v for v in exact_source_locations if v != LARGE_CAMP]
                    atlas["extraLocations"][source_id] = exact_source_locations
        if gaol_ids:
            if source_id in gaol_ids:
                locations.append(EVERGAOL)
                excluded.discard(EVERGAOL)
            else:
                locations = [loc for loc in locations if public_location(loc) != EVERGAOL]
                entity_only_locations = [loc for loc in entity_only_locations if loc != EVERGAOL]
                if EVERGAOL in exact_source_locations:
                    exact_source_locations = [loc for loc in exact_source_locations if loc != EVERGAOL]
                    atlas["extraLocations"][source_id] = exact_source_locations
        if source_id in new_location_sources:
            locations = ordered_public_locations(list(new_location_sources[source_id]["placements"]))
            exact_source_locations = list(locations)
            entity_only_locations = []
            atlas["extraLocations"][source_id] = exact_source_locations
        if review := location_review["sources"].get(source_id):
            # Other actors can establish a matching form without establishing the
            # underlying NPC or the normal/disaster scaling branch at that place.
            entity_places = list(review.get("entityOnly", {}))
            for place, entry in review.get("add", {}).items():
                if entry["scope"] == "stat":
                    locations.append(place)
                    exact_source_locations = [*exact_source_locations, place]
                else:
                    entity_places.append(place)
            removed = set(review.get("remove", {}))
            excluded_stats = removed.union(entity_places)
            locations = [place for place in ordered_public_locations(locations) if place not in excluded_stats]
            exact_source_locations = [p for p in ordered_public_locations(exact_source_locations) if p not in excluded_stats]
            entity_only_locations = [p for p in ordered_public_locations([*entity_only_locations, *entity_places])
                                     if p not in removed]
            atlas["extraLocations"][source_id] = exact_source_locations
        if source_id in atlas["entityLocationsBySourceId"] or entity_only_locations:
            atlas["entityLocationsBySourceId"][source_id] = entity_only_locations
        stat_locations[source_id] = ordered_public_locations([item for item in locations if item not in excluded])
        display_locations[source_id] = ordered_public_locations(
            stat_locations[source_id] + entity_only_locations)
        public_location_evidence[source_id] = {
            "curatedScale": ordered_public_locations(curated_scale_locations),
            "exactSource": ordered_public_locations(exact_source_locations),
            "entityOnly": ordered_public_locations(entity_only_locations),
            "stat": stat_locations[source_id], "display": display_locations[source_id],
        }
    for encounter in atlas["encounters"]:
        display_locations[encounter["id"]] = ordered_public_locations(encounter["locations"])
        public_location_evidence[encounter["id"]] = {
            "encounter": ordered_public_locations(encounter["locations"]),
            "display": display_locations[encounter["id"]],
        }
    atlas["displayLocationsBySourceId"] = display_locations
    atlas["appearanceForms"] = small_fort_appearances(atlas["rows"], fort_forms, fort_places)
    fort_sources = set(atlas["fortVariantSources"])
    portraits = json.loads((args.curation.parent / "enemy_small_fort_portraits.json").read_text(encoding="utf-8")) if fort_sources else {}
    profiles = {str(row[1]): (fort_names[native_id(row[1])], *row[5:13])
                for row in atlas["rows"] if str(row[1]) in fort_sources}
    if not portraits.keys() <= profiles.keys() or sorted(profiles[k] for k in portraits) != sorted(set(profiles.values())):
        raise ValueError("Expected one small fort representative per name and eight damage rates")
    cathedral_portraits = json.loads((args.curation.parent / "enemy_cathedral_portraits.json").read_text(encoding="utf-8")) if cathedral_parts else {}
    if not cathedral_portraits.keys() <= set(atlas["cathedralSources"]):
        raise ValueError("Cathedral representative missing its rolled placement")
    hollow_portraits = hollow["representatives"] if hollow_parts else {}
    if not hollow_portraits.keys() <= set(atlas["hollowCathedralSources"]):
        raise ValueError("Hollow cathedral representative missing its placement")
    gaol_portraits = {form["sources"][0]: form for form in gaol["forms"]} if gaol_ids else {}
    gaol_profiles = {str(row[1]): (gaol_names[str(row[1])], *row[5:13])
                     for row in atlas["rows"] if str(row[1]) in gaol_ids}
    if gaol_portraits and (gaol_profiles.keys() != gaol_ids
            or len({gaol_profiles[k] for k in gaol_portraits}) != len(gaol_portraits)
            or any(gaol_profiles[k] != gaol_profiles[rep] for rep, form in gaol_portraits.items() for k in form["sources"])):
        raise ValueError("Evergaol representatives must cover each name and damage profile exactly once")
    camp_portraits = {form["representative"]: form for form in camp["forms"]} if camp_ids else {}
    camp_profiles = {str(row[1]): (camp_names[native_id(row[1])], *row[5:13])
                     for row in atlas["rows"] if native_id(row[1]) in camp_ids}
    if camp_portraits and (not camp_portraits.keys() <= camp_profiles.keys()
            or sorted(camp_profiles[k] for k in camp_portraits) != sorted(set(camp_profiles.values()))
            or {native_id(k) for k in camp_profiles} != camp_ids):
        raise ValueError("Expected a placed large camp representative per name and damage profile")
    for entry in [*portraits.values(), *cathedral_portraits.values(), *hollow_portraits.values(),
                  *gaol_portraits.values(), *camp_portraits.values()]:
        path = entry["path"]
        if path is not None and (not re.fullmatch(r"enemy-images/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)", path)
                                 or not (Path(__file__).resolve().parents[1] / "public" / path).is_file()):
            raise ValueError(f"Invalid regional portrait: {path}")
    regions = {"smallFortRepresentatives": portraits, "cathedralRepresentatives": cathedral_portraits,
               "hollowCathedralRepresentatives": hollow_portraits, "evergaolRepresentatives": gaol_portraits,
               "largeCampRepresentatives": camp_portraits,
               # Both large beastmen use c3970 masks 02/10 and share the same portrait.
               "ruinsRepresentatives": {"39701120a": gaol_portraits["39701110"]}
               if ruins_beastmen and "39701110" in gaol_portraits else {}}
    portrait_profiles = {str(row[1]): (atlas["cardNamesBySourceId"].get(str(row[1]), entity_name(row[0])), *row[5:13])
                         for row in atlas["rows"] if all(isinstance(v, (int, float)) for v in row[5:13])}
    photos = {}
    for records in regions.values():
        for source, entry in records.items():
            if source in portrait_profiles and entry["path"] and entry.get("imageKind") != "game-model-render":
                photos.setdefault(portrait_profiles[source], entry)
    atlas["modelPortraitSources"] = []
    for key, records in regions.items():
        atlas[key] = {}
        for source, fallback in records.items():
            image = photos.get(portrait_profiles.get(source), fallback)
            atlas[key][source] = image["path"]
            if image.get("imageKind") == "game-model-render":
                atlas["modelPortraitSources"].append(source)
    atlas["reviewedResistanceLocations"] = difference_review["reviewedResistanceLocations"]
    atlas["statusImmunityNotesBySource"] = curation["statusImmunityNotesBySource"]
    atlas["statLocationsBySourceId"] = stat_locations
    (audit / "albinauric-forge.json").write_text(json.dumps(forge_evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "display-location-evidence.json").write_text(
        json.dumps(public_location_evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "encounter-links.json").write_text(json.dumps(encounter_links, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "native-event-dispositions.json").write_text(json.dumps(native_event_audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for row in atlas["rows"]:
        source = str(row[1])
        info = card_evidence.get(source, {})
        npc_id = info.get("npcParamId") or native_id(source)
        npc = npcs_by_id[npc_id]
        expected = first_party_row(npc, row[0], len(row))
        effects = list(info.get("damageEffectIds", []))
        if "damageEffectId" in info:
            effects.append(info["damageEffectId"])
        for index, field in enumerate(DAMAGE_FIELDS, 5):
            multiplier = float(npc[field])
            for effect in effects:
                multiplier *= float(effect_rates[effect][field])
            expected[index] = round(100 * (1 - multiplier), 6)
        expected[13:20] = resident_status_values(npc, immunity_fields)
        expected[38:42] = species_weakness_flags(npc)
        if entity_name(row[0]) == "小恶魔":
            expected[24] = 30
        for index in (*range(5, 20), 24, *range(28, 37), *range(38, 42)):
            if 28 <= index <= 36 and row[index] is None:
                continue
            if row[index] != expected[index]:
                numeric_drift.append({"sourceId": source, "npcId": npc_id, "column": index,
                                      "atlas": row[index], "native": expected[index]})
    drift_ids = {item["npcId"] for item in numeric_drift}
    for item in coverage:
        item["numericResolution"] = ("native_drift_review" if item["npcId"] in drift_ids
                                     else "native_fields_agree" if item["atlasSourceIds"] else "no_atlas_card")
    (audit / "native-numeric-drift.json").write_text(json.dumps(numeric_drift, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "coverage-rows.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in coverage), encoding="utf-8")
    summary = {
        "sourceGameVersion": curation["sourceGameVersion"],
        "sourceRegulation": curation["sourceRegulation"],
        "curatedLocationBaseCommit": curated_extras["sourceCommit"],
        "sceneInputs": [str(path) for path in args.scene],
        "nativeEncountersInput": str(args.native_encounters) if args.native_encounters else None,
        "nativeRows": len(native), "atlasRows": len(atlas["rows"]),
        "scenesWithNpcPlacements": len({row["scene"] for row in scene_rows}),
        "newCards": len(added), "scenePlacements": len(scene_rows),
        "candidateVariantGroups": len(variant_groups),
        "sceneEnemyPlacements": sum(row["kind"] == "enemies" for row in scene_rows),
        "sceneDummyPlacements": sum(row["kind"] == "dummyEnemies" for row in scene_rows),
        "identifiedLocationPlacements": sum(bool(row["location"]) for row in scene_rows),
        "eligibleLocationEnemyPlacements": sum(bool(row["location"]) and row["kind"] == "enemies"
                                               and not row["placeholderModel"] for row in scene_rows),
        "namedEncounterLinks": len(encounter_links),
        "nativeNamedEvents": len(native_event_audit),
        "nativeEventDispositions": dict(Counter(row["disposition"] for row in native_event_audit)),
        "publicEncounters": len(atlas["encounters"]),
        "entityLocationCandidates": len(entity_location_rows),
        "entityLocationAssignments": len(entity_assignments),
        "nativeNumericDrift": len(numeric_drift),
        "coverage": dict(Counter(row["status"] for row in coverage)),
        "locationResolution": dict(Counter(row["locationResolution"] for row in coverage)),
        "nameResolution": dict(Counter(row["nameResolution"] for row in coverage)),
        "evidenceScope": "Static MSB placement; occurrence does not imply guaranteed spawn",
    }
    (audit / "coverage.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.write:
        if numeric_drift:
            raise ValueError(f"Generated numeric fields differ from game data; see {audit / 'native-numeric-drift.json'}")
        args.atlas.write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
