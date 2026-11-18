"""Review an occurrence audit against the full local regulation export and the atlas forms."""
import argparse
import json
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

from build_enemy_atlas import entity_name, first_party_row

def read(path):
    return json.loads(path.read_text(encoding="utf-8"))

def lines(path):
    with path.open(encoding="utf-8") as stream:
        yield from (json.loads(line) for line in stream if line.strip())

def xml_matches(directory, ids):
    found = defaultdict(lambda: defaultdict(list))
    files = sorted(directory.glob("*.param.xml"))
    if not files:
        raise ValueError("Missing regulation XML export")
    for path in files:
        root = ET.parse(path).getroot()
        table = path.name.split(".")[0]
        for field in root.findall("fields/field"):
            value = field.get("defaultValue")
            if value in ids:
                found[value][table + "." + field.get("name")].append("default")
        for row in root.findall("rows/row"):
            for field, value in row.attrib.items():
                if field not in ("id", "name") and value in ids:
                    found[value][table + "." + field].append(row.get("id"))
    return len(files), found

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, default=Path("public/enemy-data.json"))
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--native-dir", type=Path, required=True)
    parser.add_argument("--regulation-dir", type=Path, required=True)
    parser.add_argument("--location-evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    atlas = read(args.atlas)
    location_evidence = read(args.location_evidence)
    records = read(args.audit)["records"]
    if len(atlas["rows"]) != len(records):
        raise ValueError("Audit and atlas snapshots differ")

    # Other stat sources may describe a placed NPC under a different ID.
    aliases = {str(r["ID"]): set(filter(None, r["Entries"])) for r in
               read(args.native_dir / "npc-community-names.json")["Entries"]}
    placed = defaultdict(set)
    for p in lines(args.native_dir / "placements.jsonl"):
        if p["recordType"] == "Enemy" and p["ModelName"] not in ("c0100", "c1000"):
            placed[str(p["NpcParamId"])].add(p["mapId"])
    native = {r["id"]: dict(r["values"], row_id=r["id"]) for r in
              lines(args.native_dir / "configs/NpcParam.jsonl")}
    def equivalent_parameters(npc):
        return tuple(sorted((k, v) for k, v in native[npc].items()
                            if k not in ("id", "row_id", "getSoul", "chaosMatchingItemLotId")))

    equivalent_placements = defaultdict(list)
    native_peers = defaultdict(set)
    for npc in placed.keys() & native.keys():
        equivalent_placements[equivalent_parameters(npc)].append(npc)
        profile = tuple(first_party_row(native[npc], "", 58)[5:20])
        for alias in aliases.get(npc, set()):
            native_peers[alias, profile].add(npc)

    by_name = defaultdict(lambda: defaultdict(list))
    for source, row in zip(records, atlas["rows"], strict=True):
        if (source["sourceId"], source["name"]) != (str(row[1]), row[0]):
            raise ValueError("Source rows do not match")
        if source["evidence"] in ("enemy_placement", "named_encounter"):
            by_name[entity_name(row[0])][tuple(row[5:20])].append(source["sourceId"])
    form_ids = {sid for form in atlas["albinauricForms"] for sid in form["sourceIds"]}
    candidates = {r["npcId"] for r in records if r["evidence"] not in ("enemy_placement", "named_encounter")}
    table_count, collisions = xml_matches(args.regulation_dir, candidates)
    results = []
    for index, (r, row) in enumerate(zip(records, atlas["rows"], strict=True)):
        sid, npc = r["sourceId"], r["npcId"]
        locations = atlas["displayLocationsBySourceId"].get(sid, [])
        family = by_name[entity_name(row[0])]
        profile = tuple(row[5:20])
        peers = set(family.get(profile, []))
        for alias in aliases.get(npc, set()):
            peers.update(native_peers.get((alias, profile), set()))
        peers.discard(sid)
        equivalents = sorted(equivalent_placements.get(equivalent_parameters(npc), [])) if npc in native and npc not in placed else []
        if r["evidence"] in ("enemy_placement", "named_encounter"):
            decision = "正式布置或具名遭遇"
        elif sid in form_ids or entity_name(row[0]) == "闪电光球" or sid == "46022000":
            decision = "保留既有形态来源或明确指定记录"
        elif r["placements"] or r["eventLiteralHitsNotSpawnProof"] or r["npcParameterReferences"]:
            decision = "有占位或引用线索"
        elif locations:
            decision = "另有图鉴地点依据待逐项核实"
        elif equivalents:
            decision = "已布置编号具有相同的原生参数（奖励除外）"
        elif peers:
            decision = "同名已布置来源有相同倍率与抗性"
        elif not family:
            decision = "无同名正式来源可比"
        elif set(collisions.get(npc, {})) - {"EquipParamCustomWeapon.swordArtsTableId"}:
            decision = "其他规则表存在同值字段，单独核对"
        else:
            decision = "移除无出场依据变体"
        results.append(dict(index=index, sourceId=sid, name=r["name"], decision=decision,
                            locations=locations, locationEvidence=location_evidence.get(sid, {}),
                            scenes=sorted({p["map"] for p in r["placements"]}),
                            equivalentPlacements={k: sorted(placed[k]) for k in equivalents},
                            sameProfilePeers=sorted(peers), placedFamilySources=sorted({s for v in family.values() for s in v}),
                            damageAndResistance=list(profile), parameterFieldHits=collisions.get(npc, {}),
                            eventReferences=r["eventLiteralHitsNotSpawnProof"]))
    summary = dict(records=len(results), regulationTables=table_count,
                   decisions=dict(Counter(r["decision"] for r in results)))
    args.output.mkdir(exist_ok=True, parents=True)
    (args.output / "review.json").write_text(json.dumps(dict(summary=summary, rows=results), ensure_ascii=False, indent=2), encoding="utf-8")
    with (args.output / "怪物出场逐条核对.md").open("w", encoding="utf-8") as out:
        out.write("# 怪物出场逐条核对\n\n数据版本 1.3.3.0，regulation 10350000。按清理前顺序列出所有来源。地点列为图鉴已有地点，场景列为直接命中的地图。属性比较只使用八项受伤倍率与七项异常抗性。\n\n")
        for decision, count in summary["decisions"].items():
            out.write(f"\n## {decision}（{count} 条）\n\n| 来源 ID | 名称 | 原有地点 | 场景 | 核对结果或可比编号 |\n| --- | --- | --- | --- | --- |\n")
            for r in results:
                if r["decision"] != decision:
                    continue
                relevant = r["sameProfilePeers"] or r["placedFamilySources"]
                if decision == "正式布置或具名遭遇":
                    note = "地图或具名记录"
                elif r["sameProfilePeers"]:
                    note = "相同倍率和抗性：" + "、".join(r["sameProfilePeers"])
                elif relevant:
                    note = "其他属性组合：" + "、".join(relevant)
                else:
                    note = "无已比对的同名来源"
                if r["decision"] == "另有图鉴地点依据待逐项核实":
                    origins = [label + "：" + "、".join(r["locationEvidence"][key])
                               for key, label in (("curatedScale", "既有地点表"), ("exactSource", "来源地点"), ("entityOnly", "怪物卡地点"))
                               if r["locationEvidence"].get(key)]
                    note += "。" + "；".join(origins) if origins else "。地点来自图鉴的单独校订"
                if r["equivalentPlacements"]:
                    note += "。相同原生参数的布置：" + "、".join(f"{k}（{'、'.join(v)}）" for k, v in r["equivalentPlacements"].items())
                if r["eventReferences"]:
                    note += "。事件位置：" + "、".join(sorted({f"{hit['file']}#{hit['event']}" for hit in r["eventReferences"]}))
                out.write("| " + " | ".join([r["sourceId"], r["name"], "、".join(r["locations"]) or "—", "、".join(r["scenes"]) or "—", note]) + " |\n")
    print(json.dumps(summary, ensure_ascii=False))

if __name__ == "__main__":
    main()
