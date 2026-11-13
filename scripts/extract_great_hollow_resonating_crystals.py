"""Join native map icons, crystal interaction calls, MSB assets and random sets.

Inputs are read-only exports from the native audit. No frontend/catalog writes.
Run with --help for required source directories; output is deterministic.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import xml.etree.ElementTree as ET


def require(condition, message):
    if not condition:
        raise ValueError(message)


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def json_lines(path):
    with path.open(encoding="utf-8") as source:
        for line in source:
            yield json.loads(line)


def extract(param_dir, audit_dir):
    param_path = param_dir / "WorldMapPointParam.param.xml"
    root = ET.parse(param_path).getroot()
    defaults = {f.get("name"): f.get("defaultValue") for f in root.find("fields")}
    rows = [{**defaults, **row.attrib} for row in root.find("rows")]
    icons = {int(row["eventFlagId0"]): row for row in rows
             if int(row["worldMapPointIconId"]) == 71}
    action_path = param_dir / "ActionButtonParam.param.xml"
    action_root = ET.parse(action_path).getroot()
    action_defaults = {f.get("name"): f.get("defaultValue") for f in action_root.find("fields")}
    action = next({**action_defaults, **r.attrib} for r in action_root.find("rows") if r.get("id") == "107800")
    require(action["textId"] == "9200", "Resonance action text changed")
    signatures = json.loads((audit_dir / "instruction-signatures.json").read_text(encoding="utf-8"))["instructions"]

    def decode(instruction):
        key = f"{instruction['Bank']}[{instruction['ID']}]"
        signature = signatures[key]
        raw = bytes.fromhex(instruction["hex"])
        return signature["name"], {
            field["name"]: struct.unpack_from("<" + field["format"], raw, field["offset"])[0]
            for field in signature["fields"]
        }

    calls = {}
    selection = None
    interaction = None
    for scene in json_lines(audit_dir / "events.jsonl"):
        filename = Path(scene["file"]).name
        for event in scene.get("events", []):
            if event["ID"] == 1037402210:
                require(selection is None, "Duplicate selection event")
                selection = event
            if event["ID"] == 90015440:
                interaction = event
            for index, instruction in enumerate(event["instructions"]):
                words = instruction.get("int32", [])
                if (instruction["Bank"], instruction["ID"]) == (2000, 6) and len(words) >= 6 and words[1] == 90015440:
                    _, _, entity, enabled, used, revealed = words
                    require(enabled not in calls, "Duplicate crystal enable flag")
                    calls[enabled] = {"map": filename.split(".emevd")[0], "eventId": event["ID"],
                                      "instructionIndex": index, "entityId": entity,
                                      "enabledFlag": enabled, "usedFlag": used, "revealedFlag": revealed}
    require(selection is not None and interaction is not None, "Missing crystal events")
    require(any(107800 in x.get("int32", []) for x in interaction["instructions"]), "Crystal action button not found")
    # Source argument 0 is the entity; bytes 4/8/12 are enable/used/reveal flags.
    require(any(p["InstructionIndex"] == 15 and p["SourceStartByte"] == 0 and p["TargetStartByte"] == 8
                for p in interaction["parameters"]), "Interaction entity parameter changed")
    groups = {}
    active_group = None
    random_range = None
    for instruction in selection["instructions"]:
        name, args = decode(instruction)
        if name == "RandomlySetNetworkconnectedEventFlagInRange":
            random_range = instruction["int32"][:2]
        if name == "GotoIfEventFlag" and 1037400211 <= args["targetEventFlagId"] <= 1037400214:
            require(args["desiredFlagState"] == 0, "Expected skip when selection flag is OFF")
            active_group = args["targetEventFlagId"]
            groups[active_group] = []
        elif name.startswith("Label"):
            active_group = None
        elif active_group is not None and name == "SetNetworkconnectedEventFlag":
            require(args["desiredFlagState"] == 1, "Expected crystal enable")
            groups[active_group].append(args["targetEventFlagId"])
    require(random_range == [1037400211, 1037400214], "Random selection range changed")
    require(len(groups) == 4 and all(len(g) == 8 for g in groups.values()), "Expected four groups of eight")
    active_flags = set().union(*map(set, groups.values()))
    require(active_flags == icons.keys(), "Map icon and enabled crystal sets differ")
    require(active_flags <= calls.keys(), "Crystal has no interaction call")

    wanted_entities = {c["entityId"] for c in calls.values()}
    assets = {}
    for scene in json_lines(audit_dir / "native-map-details.jsonl"):
        filename = Path(scene["file"]).name
        if not re.match(r"m60_\d\d_\d\d_40\.msb", filename):
            continue
        map_id = filename.split(".msb")[0]
        for part in scene["parts"]:
            data = part["data"]
            entity = data.get("EntityData", {}).get("EntityID")
            if entity in wanted_entities:
                require(entity not in assets, "Duplicate native crystal entity")
                assets[entity] = {"map": map_id, "name": data["Name"], "model": data["ModelName"],
                                  "position": data["Position"]}
    points = []
    for flag, row in sorted(icons.items(), key=lambda item: int(item[1]["id"])):
        call = calls[flag]
        asset = assets[call["entityId"]]
        gx, gz = int(row["gridXNo"]), int(row["gridZNo"])
        position = {axis: float(row["pos" + axis]) for axis in "XYZ"}
        require(asset["map"] == call["map"] == f"m60_{gx:02}_{gz:02}_40", "Native map mismatch")
        require(asset["model"] == "AEG355_112", "Unexpected crystal asset model")
        # Icons may be deliberately offset from the interactable asset. Preserve both.
        delta = {a: round(position[a] - asset["position"][a], 6) for a in "XYZ"}
        x = ((gx - 41) * 256 + position["X"] + 128) / 1536
        y = ((40 - gz) * 256 - position["Z"] + 128) / 1536
        require(0 <= x <= 1 and 0 <= y <= 1, "Point outside map")
        points.append({"key": f"great-hollow-resonating-crystal-{row['id']}",
                       "normalized": {"x": round(x, 9), "y": round(y, 9)},
                       "patternIds": [],
                       "selectionFlags": [g for g, flags in groups.items() if flag in flags],
                       "source": {"worldMapPointId": int(row["id"]), "iconId": 71,
                                  "alternateIconId": int(row["unknown_5C"]),
                                  "grid": {"x": gx, "z": gz}, "position": position,
                                  "asset": asset, "iconMinusAssetPosition": delta, "interaction": call}})
    return {
        "schemaVersion": 1,
        "name": "大空洞共鸣结晶（小型可触发结晶）",
        "sourceVersion": {"game": "1.3.3.0", "regulation": "10350000"},
        "coverage": {
            "status": "native-candidates-and-random-groups-complete-pattern-join-unresolved",
            "candidateCount": len(points), "nativeInteractionCount": len(calls),
            "perSelectedGroupCount": 8,
            "patternIdsStatus": "unresolved",
            "patternIdsMeaning": "Empty arrays mean unknown map-pattern membership, not no occurrence. Do not render all candidates as simultaneously present.",
            "selection": "Event 1037402210 randomly enables one flag in 1037400211..1037400214; each flag enables eight crystals. No map pattern ID correspondence is established.",
            "excluded": "Central giant crystal; seven native interaction assets never enabled by the four normal random groups; debug groups 1037400215..1037400219.",
            "runtimeVerified": False
        },
        "coordinateTransform": {
            "terrain": "4", "imageSize": [1536, 1536], "tileSize": 256,
            "x": "((gridXNo - 41) * 256 + posX + 128) / 1536",
            "y": "((40 - gridZNo) * 256 - posZ + 128) / 1536",
            "verification": "Native icon enable flags join to common-event calls and same-map MSB AEG355_112 entities. Icon positions and asset positions are both preserved, including their offsets. Static map calibration only."
        },
        "provenance": {
            "method": "WorldMapPointParam icon 71 / alternate 72 -> enable flag -> EMEVD common event 90015440 -> ActionButtonParam 107800 (text 9200 触发共鸣) -> MSB AEG355_112; random groups from event 1037402210.",
            "inputSha256": {"WorldMapPointParam.param.xml": digest(param_path),
                            "ActionButtonParam.param.xml": digest(action_path),
                            **{name: digest(audit_dir / name) for name in
                               ("events.jsonl", "native-map-details.jsonl", "instruction-signatures.json")}},
            "rebuild": "python scripts/extract_great_hollow_resonating_crystals.py --param-dir <strict/regulation-bin> --audit-dir <enemy-full-audit/native>",
            "excludedNativeAssets": [calls[f] for f in sorted(calls.keys() - active_flags)]
        },
        "randomGroups": [{"selectionFlag": flag, "enabledFlags": flags,
                          "pointKeys": [p["key"] for p in points if flag in p["selectionFlags"]]}
                         for flag, flags in groups.items()],
        "points": points
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--param-dir", required=True, type=Path)
    parser.add_argument("--audit-dir", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "data/great_hollow_resonating_crystals.json")
    args = parser.parse_args()
    result = extract(args.param_dir, args.audit_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(result['points'])} candidates and {len(result['randomGroups'])} random groups: {args.output}")


if __name__ == "__main__":
    main()
