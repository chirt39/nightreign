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


REMOVED_COLUMNS = (20, 21, 22, 23, 25)
DAMAGE_FIELDS = (
    "neutralDamageCutRate", "slashDamageCutRate", "blowDamageCutRate",
    "thrustDamageCutRate", "magicDamageCutRate", "fireDamageCutRate",
    "thunderDamageCutRate", "darkDamageCutRate",
)
STATUS_FIELDS = (
    "resist_poison", "resist_desease", "resist_blood", "resist_freeze",
    "resist_sleep", "resist_madness", "resist_curse",
)
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
    return re.sub(r"[ab]$", "", str(value))


def entity_name(value: object) -> str:
    name = str(value).replace("[灾域]", "").strip()
    return re.split(r"\s*[（(]", name, maxsplit=1)[0].strip()


def public_location(value: str) -> str | None:
    aliases = {"锻造设施": "锻造村", "永夜Boss": "夜王", "第三夜Boss": "夜王",
               "原野Boss - 恐怖强敌": "原野Boss"}
    if value in ("宁姆韦德", "魔法师塔", "魔法师塔（大空洞）", "小型营地", "教堂"):
        return None
    return aliases.get(value, value)


def ordered_public_locations(values: list[str]) -> list[str]:
    output = []
    for value in values:
        normalized = public_location(value)
        if normalized and normalized not in output:
            output.append(normalized)
    if any(value.endswith("（大空洞）") for value in output):
        output = [value for value in output if value != "大空洞"]
    return output


def number(value: str) -> int | float:
    n = float(value)
    return int(n) if n.is_integer() else round(n, 4)


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
    # HP, weak-part class, race, and poise modifiers need separate game-side
    # transformations. Null represents an unresolved value, never a zero.
    return row


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
    parser.add_argument("--retired-ids", type=Path, default=Path("scripts/data/enemy_retired_source_ids.json"))
    parser.add_argument("--bilingual-candidates", type=Path, default=Path("scripts/data/enemy_bilingual_name_candidates.json"))
    parser.add_argument("--model-family-names", type=Path, default=Path("scripts/data/enemy_model_family_names.json"))
    parser.add_argument("--write", action="store_true", help="Update the atlas after auditing")
    args = parser.parse_args()
    if args.write and (not args.scene or not args.encounters or not args.native_encounters):
        parser.error("--write requires --scene, --encounters and --native-encounters")
    curation = json.loads(args.curation.read_text(encoding="utf-8"))
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
    for row_id in generated_ids | excluded_public_source_ids:
        atlas.get("extraLocations", {}).pop(row_id, None)
    if len(atlas["columns"]) != 58 or any(len(row) != 58 for row in atlas["rows"]):
        raise ValueError("Expected 58-column curated enemy atlas")
    with args.native_csv.open(encoding="utf-8-sig", newline="") as handle:
        native = list(csv.DictReader(handle))
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
    encounters = json.loads(args.encounters.read_text(encoding="utf-8"))["encounters"] if args.encounters else []
    forms, forge_evidence = albinauric_forms(native, curated_rows, scene_rows, encounters)
    atlas["albinauricForms"] = forms
    # A night battle template identifies the arena, not a second overworld placement.
    hollow_evidence = json.loads((args.curation.parent / "enemy_dlc_location_evidence.json").read_text(encoding="utf-8"))
    night_templates = {int(t["template"]) for scene, t in templates.items()
                       if aliases.get(scene, "").startswith("Night Boss -")}
    hollow_night_ids = {k for k, v in hollow_evidence["locations"]["大空洞"].items() if v[0] in night_templates}
    for row in curated_rows:
        sid = str(row[1])
        if "前哨战" not in str(row[0]):
            continue
        exact = exact_locations.get(sid, set())
        if "夜晚Boss" in exact:
            exact.remove("夜晚Boss")
            exact.add("夜晚Boss前哨战")
        if sid in hollow_night_ids and "大空洞" not in exact:
            prior = atlas["extraLocations"].get(sid, [])
            if "大空洞" in prior:
                atlas["extraLocations"][sid] = [loc for loc in prior if loc != "大空洞"]
    for locations in exact_locations.values():
        locations.difference_update({"魔法师塔", "魔法师塔（大空洞）"})
    for npc_id, excluded_locations in curation["displayLocationExclusionsById"].items():
        exact_locations.get(npc_id, set()).difference_update(excluded_locations)
    scene_counts = Counter(record["npcId"] for record in scene_rows)
    scene_enemy_ids = {record["npcId"] for record in scene_rows
                       if record["kind"] == "enemies" and not record["placeholderModel"]}
    scene_locations = {record["scene"]: record["location"] for record in scene_rows if record["location"]}
    native_encounters = []
    if args.native_encounters:
        native_encounters = [json.loads(line) for line in args.native_encounters.read_text(encoding="utf-8").splitlines() if line]
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
            if str(atlas_row[1]) != row_id:
                continue
            expected = first_party_row(npc, name or str(atlas_row[0]), len(atlas["columns"]))
            for column in list(range(5, 20)) + [24, 28, 29, 30, 31, 32, 33, 34, 35, 36]:
                actual = atlas_row[column]
                native_value = expected[column]
                equal = (abs(actual - native_value) < 0.11 if isinstance(actual, (int, float))
                         and isinstance(native_value, (int, float)) else actual == native_value)
                if actual is not None and not equal:
                    numeric_drift.append({"npcId": row_id, "column": column,
                                          "atlas": actual, "native": native_value})

    drift_ids = {item["npcId"] for item in numeric_drift}
    for item in coverage:
        item["numericResolution"] = ("native_drift_review" if item["npcId"] in drift_ids
                                     else "native_fields_agree" if item["atlasSourceIds"]
                                     else "no_atlas_card")

    extras = atlas.setdefault("extraLocations", {})
    for source_id, names in list(extras.items()):
        extras[source_id] = sorted(set(ordered_public_locations(names)))
    for source_id, rows in existing.items():
        names = exact_locations.get(source_id)
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
    (audit / "coverage-rows.jsonl").write_text(
        "".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n" for row in coverage), encoding="utf-8"
    )
    gaps = [row for row in coverage if row["status"].endswith("unresolved")]
    (audit / "gaps.json").write_text(json.dumps(gaps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "new-cards.json").write_text(json.dumps(added, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "native-numeric-drift.json").write_text(json.dumps(numeric_drift, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
    public_location_evidence: dict[str, dict] = {}
    for row in atlas["rows"]:
        source_id = str(row[1])
        curated_scale_locations = list(scale_by_source.get(source_id, []))
        locations = list(curated_scale_locations)
        exact_source_locations = atlas["extraLocations"].get(source_id, [])
        entity_only_locations = atlas["entityLocationsBySourceId"].get(source_id, [])
        locations.extend(exact_source_locations)
        locations.extend(curation["displayLocationOverridesById"].get(source_id, []))
        excluded = set(curation["displayLocationExclusionsById"].get(native_id(source_id), []))
        if source_id in ordinary_troll_ids:
            excluded.add("山顶")
        if entity_name(row[0]) == "祖灵":
            excluded.add("要塞底层Boss")
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
    atlas["statLocationsBySourceId"] = stat_locations
    (audit / "albinauric-forge.json").write_text(json.dumps(forge_evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "display-location-evidence.json").write_text(
        json.dumps(public_location_evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "encounter-links.json").write_text(json.dumps(encounter_links, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (audit / "native-event-dispositions.json").write_text(json.dumps(native_event_audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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
        args.atlas.write_text(json.dumps(atlas, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
