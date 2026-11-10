#!/usr/bin/env python3
"""Build the local map-pattern catalog from the verified regulation XML snapshot.

The outside site's 520-row snapshot and named boss slots audit the small
identity override table. They are not build inputs to this published catalog.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET


REPO = Path(__file__).resolve().parents[1]
SOURCE = Path(r"E:\海斗\outputs\nightreign-data-20261109")
OVERRIDES = REPO / "scripts/data/map_identity_overrides.json"
OUTPUT = REPO / "public/map-catalog.json"
ASSET_MANIFEST = REPO / "public/map-asset-manifest.json"
CASTLE_BOSS_ATTACH_IDS = {"756", "757", "2756", "2757"}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def param(source: Path, name: str) -> tuple[dict[str, str], list[dict[str, str]]]:
    root = ET.parse(source / "strict/regulation-bin" / f"{name}.param.xml").getroot()
    defaults = {field.attrib["name"]: field.attrib.get("defaultValue", "") for field in root.find("fields")}
    rows = [defaults | row.attrib for row in root.find("rows")]
    return defaults, rows


def fmg(source: Path, language: str, filename: str) -> dict[str, str]:
    root = source / "localized/text-bundles/data0/msg" / language
    result: dict[str, str] = {}
    for path in sorted(root.rglob(filename)):
        for text in ET.parse(path).getroot().iter("text"):
            value = (text.text or "").strip()
            if value and value != "%null%":
                result[text.attrib["id"]] = value
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    source: Path = args.source
    overrides = json.loads(OVERRIDES.read_text(encoding="utf-8"))
    source_manifest = json.loads((source / "source-manifest.json").read_text(encoding="utf-8"))
    if source_manifest.get("executable_version") != "1.3.3.0" or source_manifest.get("regulation_version") != "10350000":
        raise ValueError("The reviewed identity overrides require game 1.3.3.0 / regulation 10350000")
    asset_manifest = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8")) if ASSET_MANIFEST.exists() else {}
    calibrated_terrains = {}
    for terrain_id, row in asset_manifest.get("terrains", {}).items():
        transform = row.get("coordinateTransform")
        if not terrain_id.isdigit() or row.get("status") != "verified" or not isinstance(transform, dict):
            continue
        if (
            transform.get("status") != "verified-static-calibration"
            or transform.get("origin") != "top-left"
            or transform.get("clamp") is not False
            or transform.get("width") != row.get("width")
            or transform.get("height") != row.get("height")
            or transform.get("layer") != 0
            or transform.get("subLayer") != ""
        ):
            continue
        if not all(isinstance(transform.get(axis), dict) and all(isinstance(transform[axis].get(key), (int, float)) for key in keys) for axis, keys in (("pixelX", ("gridXNo", "posX", "constant")), ("pixelY", ("gridZNo", "posZ", "constant")))):
            continue
        calibrated_terrains[terrain_id] = transform

    _, flag_rows = param(source, "LotResultMapPatternFlag")
    _, play_rows = param(source, "LotResultPlayAreaParam")
    _, point_rows = param(source, "LotResultSmallBaseAndSpot")
    _, attach_rows = param(source, "SmallBaseAndSpotAttachPoint")
    _, define_rows = param(source, "SmallBaseAndSpotDefine")
    _, menu_rows = param(source, "NightBossMenuParam")

    by_pattern: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in flag_rows:
        by_pattern[row["patternId"]].append(row)
    play_by_pattern = {row["patternId"]: row for row in play_rows}
    points_by_pattern: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in point_rows:
        points_by_pattern[row["patternId"]].append(row)
    attach_by_id = {row["id"]: row for row in attach_rows}
    menu_by_id = {row["id"]: row for row in menu_rows}
    point_icons: dict[str, set[str]] = defaultdict(set)
    for row in define_rows:
        for field, value in row.items():
            if field.startswith("mapId") and value.isdigit() and int(value) > 0:
                point_icons[value].add(row["worldMapPointIconId1"])

    pattern_ids = set(by_pattern)
    if len(pattern_ids) != 520 or pattern_ids != set(play_by_pattern) or pattern_ids != set(points_by_pattern):
        raise ValueError("The three native pattern tables do not contain the same 520 IDs")

    menu_text = fmg(source, "zhocn", "CL_MenuText.fmg.xml")
    menu_text.update(fmg(source, "zhocn", "CL_MenuText_dlc01.fmg.xml"))
    npc_text = fmg(source, "zhocn", "NpcName.fmg.xml")
    npc_text.update(fmg(source, "zhocn", "NpcName_dlc01.fmg.xml"))

    definitions: dict[str, dict] = {"nightlords": {}, "bosses": {}, "terrains": {}, "features": {}, "events": {}}
    for target in range(10):
        menu = menu_by_id[str(target)]
        boss_text_id = menu["bossNameId"]
        name = menu_text.get(boss_text_id)
        if not name:
            raise ValueError(f"No Chinese menu text for NightBossMenuParam row {target}")
        definitions["nightlords"][str(target)] = {
            "nameZh": name,
            "bossNameId": int(boss_text_id),
            "expeditionNameId": int(menu["expeditionNameId"]),
            "expeditionNameZh": menu_text.get(menu["expeditionNameId"]),
            "menuRowId": str(target),
            "menuIconId": int(menu["largeBossIconId"]),
            "dlc": target in (8, 9),
            "identityStatus": "native_menu_and_520_reference_crosschecked",
            "formStatus": "menu_identity_only",
        }

    for source_id, identity in overrides["bossIds"].items():
        text_ids = [str(i) for i in identity["npcNameTextIds"]]
        missing = [i for i in text_ids if i not in npc_text]
        if missing:
            raise ValueError(f"Missing NpcName text for boss {source_id}: {missing}")
        names = [npc_text[i] for i in text_ids]
        definitions["bosses"][source_id] = {
            "nameZh": "、".join(names) if names else None,
            "namePartsZh": names,
            "npcNameTextIds": [int(i) for i in text_ids],
            "referenceSlug": identity["referenceSlug"],
            "identityStatus": "cross_version_520_pair_check",
            "nameStatus": identity["nameMethod"],
            "evidence": identity["evidence"],
        }

    for terrain_id, terrain in overrides["terrainCodes"].items():
        text_id = terrain.get("menuTextId")
        if text_id is not None and terrain["nameZh"] not in menu_text.get(str(text_id), ""):
            raise ValueError(f"Terrain {terrain_id} does not match local CL_MenuText:{text_id}")
        definitions["terrains"][terrain_id] = {
            "nameZh": terrain["nameZh"],
            "menuTextId": text_id,
            "referenceName": terrain["referenceName"],
            "status": "native_text_and_code_crosschecked" if text_id is not None else "descriptive_label",
        }

    for icon_id, category in overrides["pointIconCategories"].items():
        definitions["features"][f"buildingCategory:{category['key']}"] = {
            "kind": "building", "nameZh": category["nameZh"],
            "identityStatus": "native_icon_reference_count_crosschecked",
            "worldMapPointIconId": int(icon_id),
            "referenceAgreement": category["referenceAgreement"],
            "source": "SmallBaseAndSpotDefine.mapId* -> worldMapPointIconId1",
        }

    for event_code, event in overrides["eventCodes"].items():
        text_id = event["menuTextId"]
        definitions["events"][f"event:{event_code}"] = {
            "kind": "event", "nameZh": menu_text.get(str(text_id)) if text_id else None,
            "menuTextId": text_id,
            "referenceFamily": event["referenceFamily"],
            "identityStatus": "native_marker_520_reference_crosschecked",
            "evidence": event["evidence"],
        }

    for map_id, field_boss in overrides["verifiedFieldBossMapIds"].items():
        boss_id = field_boss["bossId"]
        if definitions["bosses"][boss_id]["referenceSlug"] != field_boss["referenceSlug"]:
            raise ValueError(f"Field-boss identity conflict for map {map_id}")
        definitions["features"][f"fieldBoss:{boss_id}"] = {
            "kind": "monster", "nameZh": definitions["bosses"][boss_id]["nameZh"],
            "bossId": boss_id,
            "role": "primarySmallBaseBoss",
            "displayCategory": "baseBoss",
            "identityStatus": "native_map_id_520_presence_set_crosschecked",
            "evidence": field_boss["evidence"],
        }

    for map_id, elite in overrides["verifiedFieldEliteMapIds"].items():
        text_id = elite["npcNameTextId"]
        name = npc_text.get(str(text_id)) if text_id is not None else elite.get("displayNameZh")
        if text_id is not None and not name:
            raise ValueError(f"Missing NpcName text for field elite {map_id}: {text_id}")
        definitions["features"][f"fieldElite:{map_id}"] = {
            "kind": "monster", "nameZh": name,
            "referenceName": elite["referenceName"],
            "npcNameTextId": text_id,
            "nameMethod": elite.get("nameMethod", "native_fmg_exact"),
            "worldMapPointIconId": elite["worldMapPointIconId"],
            "role": "fieldElite", "displayCategory": "fieldElite",
            "identityStatus": "native_icon_and_pattern_slot_crosschecked",
            "evidence": elite["evidence"],
        }

    patterns = []
    raw_map_ids: set[str] = set()
    for pattern_id in sorted(pattern_ids, key=int):
        flag = by_pattern[pattern_id]
        target_ids = {row["targetBoss"] for row in flag}
        terrain_ids = {row["rareMap"] for row in flag}
        if len(target_ids) != 1 or len(terrain_ids) != 1:
            raise ValueError(f"Conflicting native target/terrain for pattern {pattern_id}")
        target = target_ids.pop()
        terrain = terrain_ids.pop()
        if target not in definitions["nightlords"] or terrain not in definitions["terrains"]:
            raise ValueError(f"Unknown target/terrain for pattern {pattern_id}")

        play = play_by_pattern[pattern_id]
        event_codes: list[str] = []
        native_day_flags = {row["eventFlag"] for row in flag if row["eventFlag"] in {"7705", "7725"}}
        for row in flag:
            event_flag = row["eventFlag"]
            if event_flag in overrides["eventCodes"]:
                event_codes.append(event_flag)
            modifier_code = f"modifier:{row['modifier']}"
            if row["modifierSet"] == "0" and modifier_code in overrides["eventCodes"]:
                event_codes.append(modifier_code)
        if len(event_codes) > 1:
            raise ValueError(f"Multiple event identities for pattern {pattern_id}: {event_codes}")
        if event_codes:
            event_code = event_codes[0]
            event_rule = overrides["eventCodes"][event_code]["dayRule"]
            if event_rule == "raid_day_flag":
                if len(native_day_flags) != 1:
                    raise ValueError(f"Unresolved raid day for pattern {pattern_id}")
                event_day = 1 if "7705" in native_day_flags else 2
            else:
                event_day = event_rule
            events = {"state": "known", "values": [{"sourceId": f"event:{event_code}", "day": event_day}]}
        else:
            events = {"state": "known_absent", "values": []}
        day_bosses = {}
        for day, column in (("day1", "bossId1"), ("day2", "bossId2")):
            source_id = play[column]
            if source_id not in definitions["bosses"]:
                raise ValueError(f"No reviewed boss identity for {source_id}")
            day_bosses[day] = {
                "state": "known", "sourceId": source_id,
                "identityStatus": "cross_version_520_pair_check",
            }

        points = []
        for row in sorted(points_by_pattern[pattern_id], key=lambda r: int(r["attachId"])):
            attach_id = row["attachId"]
            attach = attach_by_id.get(attach_id)
            if attach is None:
                raise ValueError(f"Missing attach point {attach_id}")
            map_id = row["smallBaseMapId"]
            raw_map_ids.add(map_id)
            classified_icons = (point_icons.get(map_id, set()) - {"0"}) & set(overrides["pointIconCategories"])
            category_feature = None
            category_complete = False
            if len(classified_icons) == 1:
                icon_id = next(iter(classified_icons))
                category = overrides["pointIconCategories"][icon_id]
                category_feature = {
                    "kind": "building", "state": "known",
                    "sourceId": f"buildingCategory:{category['key']}",
                    "identityStatus": "native_icon_reference_count_crosschecked",
                }
                category_complete = category["referenceAgreement"] == "520/520" and len(point_icons[map_id] - {"0"}) == 1
            world = {
                "areaNo": int(attach["areaNo"]) if attach.get("areaNo") else None,
                "gridXNo": int(attach["gridXNo"]),
                "gridZNo": int(attach["gridZNo"]),
                "posX": float(attach["posX"]),
                "posY": float(attach["posY"]),
                "posZ": float(attach["posZ"]),
                "source": f"SmallBaseAndSpotAttachPoint:{attach_id}",
            }
            normalized = None
            transform = calibrated_terrains.get(terrain)
            if transform and world["areaNo"] == transform["areaNo"]:
                px = transform["pixelX"]
                py = transform["pixelY"]
                x = (world["gridXNo"] * px["gridXNo"] + world["posX"] * px["posX"] + px["constant"]) / transform["width"]
                y = (world["gridZNo"] * py["gridZNo"] + world["posZ"] * py["posZ"] + py["constant"]) / transform["height"]
                if 0 <= x <= 1 and 0 <= y <= 1:
                    normalized = {"x": round(x, 7), "y": round(y, 7)}
            features = [
                {"kind": "building", "state": "known", "sourceId": f"smallBaseMap:{map_id}", "identityStatus": "raw_id_only"},
            ]
            if category_feature:
                features.append(category_feature)
            if map_id in overrides["verifiedFieldBossMapIds"]:
                features.append({
                    "kind": "monster", "state": "known", "sourceId": f"fieldBoss:{map_id}",
                    "role": "primarySmallBaseBoss", "displayCategory": "baseBoss",
                    "identityStatus": "native_map_id_520_presence_set_crosschecked",
                })
            if map_id in overrides["verifiedFieldEliteMapIds"] and attach_id not in CASTLE_BOSS_ATTACH_IDS:
                if str(overrides["verifiedFieldEliteMapIds"][map_id]["worldMapPointIconId"]) not in point_icons[map_id]:
                    raise ValueError(f"Field elite map {map_id} has no matching native boss icon")
                features.append({
                    "kind": "monster", "state": "known", "sourceId": f"fieldElite:{map_id}",
                    "role": "fieldElite", "displayCategory": "fieldElite",
                    "identityStatus": "native_icon_and_pattern_slot_crosschecked",
                })
            features.extend((
                {"kind": "monster", "state": "unknown"},
                {"kind": "event", "state": "unknown"},
            ))
            points.append({
                "attachId": attach_id,
                "world": world,
                "normalized": normalized,
                "features": features,
                "coverage": {
                    "building": "known" if category_complete else "unknown",
                    "monster": "unknown", "event": "unknown",
                    "primarySmallBaseBoss": "known" if map_id in overrides["verifiedFieldBossMapIds"] else "unknown",
                    "fieldElite": "known" if map_id in overrides["verifiedFieldEliteMapIds"] and attach_id not in CASTLE_BOSS_ATTACH_IDS else "unknown",
                },
                "sourceRows": {"lotResultSmallBaseAndSpot": row["id"]},
            })

        menu = definitions["nightlords"][target]
        # DLC-only target, Great Hollow terrain, and the Balancers raid are
        # gated by all matched players owning the DLC in the cited patch notes.
        needs_dlc = bool(menu["dlc"] or terrain == "4" or "8081" in event_codes)
        patterns.append({
            "patternId": pattern_id,
            "terrain": {"state": "known", "value": terrain},
            "nightlord": {
                "state": "known", "menuRowId": target,
                "bossNameId": menu["bossNameId"], "form": "unknown",
                "formCertainty": "menu_identity_only",
            },
            "dayBosses": day_bosses,
            "events": events,
            "eligibility": {
                "depths": {"state": "unknown"},
                "allPlayersHaveDlc": {"state": "known", "required": needs_dlc},
            },
            "points": points,
            "coverage": {
                "nightlord": "known", "dayBossIds": "known",
                "dayBossNames": "cross_version_520_pair_check",
                "terrain": "known", "pointBuildings": "raw_ids_only",
                "eventIdentity": "native_marker_crosschecked", "eventPosition": "unknown",
                "pointCoordinates": "verified_transform" if terrain in calibrated_terrains else "unknown",
                "pointMonsters": "partial_verified_field_boss_ids", "pointEvents": "unknown",
            },
            "sourceRows": {
                "lotResultMapPatternFlag": [row["id"] for row in flag],
                "lotResultPlayAreaParam": play["id"],
            },
        })

    for map_id in sorted(raw_map_ids, key=int):
        definitions["features"][f"smallBaseMap:{map_id}"] = {
            "kind": "building", "nameZh": None, "identityStatus": "raw_id_only",
            "source": "LotResultSmallBaseAndSpot.smallBaseMapId",
        }

    native_names = ("LotResultMapPatternFlag", "LotResultPlayAreaParam", "LotResultSmallBaseAndSpot", "SmallBaseAndSpotAttachPoint", "SmallBaseAndSpotDefine", "NightBossMenuParam")
    catalog = {
        "schemaVersion": 1,
        "sourceVersion": {"game": source_manifest["executable_version"], "regulation": source_manifest["regulation_version"]},
        "scope": "Deep of Night local preview; native pattern identities, raw point IDs",
        "provenance": {
            "nativeParamSha256": {name: sha256(source / "strict/regulation-bin" / f"{name}.param.xml") for name in native_names},
            "sourceManifestSha256": sha256(source / "source-manifest.json"),
            "identityOverridesSha256": sha256(OVERRIDES),
            "assetManifestSha256": sha256(ASSET_MANIFEST) if ASSET_MANIFEST.exists() else None,
            "referenceVersion": overrides["reference"]["datasetVersion"],
            "referenceUse": "520-row ID and named boss-slot identity cross-check only; no external slots, positions or event assignments copied",
        },
        "definitions": definitions,
        "patterns": patterns,
        "referencePoints": overrides["referencePoints"],
    }
    for point in catalog["referencePoints"]:
        xy = point["normalized"]
        if point["filterable"] is not False or point["positionAccuracy"] != "reference" or point["displayCategory"] not in {"fieldElite", "baseBoss"} or not (0 <= xy["x"] <= 1 and 0 <= xy["y"] <= 1):
            raise ValueError(f"Invalid display-only reference point {point['key']}")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{args.output}: {len(patterns)} patterns, {sum(len(p['points']) for p in patterns)} raw points")


if __name__ == "__main__":
    main()
