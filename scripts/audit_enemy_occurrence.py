"""Audit public enemy sources against local native evidence without deleting candidates.

An Enemy placement is static evidence, not proof that its runtime condition is met.
Dummy placement, equivalent stats, and a literal ID hit are never spawn proof.
"""
import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path


def jsonlines(path):
    with path.open(encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, default=Path("public/enemy-data.json"))
    parser.add_argument("--native-dir", type=Path, required=True)
    parser.add_argument("--csv-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    atlas = json.loads(args.atlas.read_text(encoding="utf-8"))
    def native_id(source_id):
        info = atlas.get("nativeCardEvidence", {}).get(str(source_id), {})
        return info.get("npcParamId") or re.sub(r"[ab]$", "", str(source_id))

    ids = {native_id(row[1]) for row in atlas["rows"]}
    placements, encounters = defaultdict(list), defaultdict(list)
    for part in jsonlines(args.native_dir / "placements.jsonl"):
        placements[str(part["NpcParamId"])].append({
            "map": part["mapId"], "part": part["Name"], "type": part["recordType"],
            "model": part["ModelName"], "entityId": part["entityId"],
        })
    for encounter in jsonlines(args.native_dir / "named-encounters.jsonl"):
        for member in encounter["members"]:
            encounters[str(member["npcParamId"])].append({
                "map": encounter["mapId"], "nameId": encounter["nameId"],
                "memberResolution": encounter["memberResolution"],
            })
    parameter_refs, literal_refs = defaultdict(list), defaultdict(list)
    csv_count = 0
    for path in sorted(args.csv_dir.glob("*.csv")):
        csv_count += 1
        with path.open(encoding="utf-8-sig", newline="") as stream:
            rows = csv.DictReader(stream)
            # Only explicitly NPC-ID-named fields; arbitrary matching numbers are not references.
            fields = [key for key in rows.fieldnames or []
                      if "npc" in key.lower() and "id" in key.lower() and "think" not in key.lower()]
            if not fields:
                continue
            for row in rows:
                for key in fields:
                    if row[key] in ids:
                        parameter_refs[row[key]].append({"table": path.stem, "row": row.get("row_id"), "field": key})
    config_paths = sorted((args.native_dir / "configs").glob("*.jsonl"))
    for path in config_paths:
        for row in jsonlines(path):
            for key, value in row["values"].items():
                if ("npc" in key.lower() and "id" in key.lower() and "think" not in key.lower()
                        and str(value) in ids):
                    reference = {"table": path.stem, "row": row["id"], "field": key}
                    if reference not in parameter_refs[str(value)]:
                        parameter_refs[str(value)].append(reference)
    for script in jsonlines(args.native_dir / "events.jsonl"):
        for event in script.get("events", []):
            for index, instruction in enumerate(event["instructions"]):
                for value in set(instruction.get("int32", [])):
                    if str(value) in ids:
                        literal_refs[str(value)].append({
                            "file": Path(script["file"]).name, "event": event["ID"],
                            "instruction": index, "bank": instruction["Bank"], "id": instruction["ID"],
                        })
    def actual(npc_id):
        return [p for p in placements[npc_id] if p["type"] == "Enemy" and p["model"] not in ("c0100", "c1000")]
    def signature(row):
        # Compare visible attributes only. HP scaling and source-specific locations are not equivalent.
        name = re.split(r"\s*[（(]", row[0].replace("[灾域]", "").strip(), maxsplit=1)[0]
        values = [value for index, value in enumerate(row) if index >= 5 and atlas["columns"][index]["kind"] != "removed"]
        return name, json.dumps(values, ensure_ascii=False)
    supported_stats = defaultdict(list)
    for row in atlas["rows"]:
        npc_id = native_id(row[1])
        if actual(npc_id):
            supported_stats[signature(row)].append(str(row[1]))
    result = []
    for row in atlas["rows"]:
        source_id = str(row[1])
        npc_id = native_id(source_id)
        state = ("enemy_placement" if actual(npc_id) else "named_encounter" if encounters[npc_id]
                 else "dummy_or_placeholder_only" if placements[npc_id] else "no_placement_or_named_encounter")
        result.append({
            "sourceId": source_id, "npcId": npc_id, "name": row[0], "evidence": state,
            "placements": placements[npc_id], "namedEncounters": encounters[npc_id],
            "npcParameterReferences": parameter_refs[npc_id],
            "eventLiteralHitsNotSpawnProof": literal_refs[npc_id],
            "sameVisibleStatsAsPlacedSource": supported_stats[signature(row)] if not actual(npc_id) else [],
        })
    candidates = [r for r in result if r["evidence"] not in ("enemy_placement", "named_encounter")]
    summary = {
        "atlasRows": len(result), "csvTablesScanned": csv_count, "nativeConfigTablesScanned": len(config_paths),
        "evidenceCounts": dict(Counter(r["evidence"] for r in result)),
        "candidateRows": len(candidates),
        "candidatesWithSameVisibleStats": sum(bool(r["sameVisibleStatsAsPlacedSource"]) for r in candidates),
        "candidatesWithNpcParameterReferences": sum(bool(r["npcParameterReferences"]) for r in candidates),
        "candidatesWithEventLiteralHits": sum(bool(r["eventLiteralHitsNotSpawnProof"]) for r in candidates),
        "scope": "Local static evidence only; absence is not a claim of unused content. Literal event numbers may be entity IDs or flags.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"summary": summary, "records": result}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
