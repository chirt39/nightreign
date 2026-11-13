"""Build damage targets from the public atlas and the matching native NpcParam CSV.

NpcParam damage-cut rates are taken multipliers. Its def_* fields are not
treated as verified final defense for a particular encounter or day.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
# Existing public target IDs contain the original atlas index for these duplicate NPC IDs.
DUPLICATE_TARGET_IDS = {
    ("37010030", "调香师 (遗迹Boss)"): "37010030#row1114",
    ("37010030", "调香师 [灾域] (遗迹Boss)"): "37010030#row1116",
    ("35003110", "法姆亚兹拉的骷髅兽人 - 骑士 (遗迹)"): "35003110#row1359",
    ("35003110", "法姆亚兹拉的骷髅兽人 - 骑士 [灾域] (遗迹)"): "35003110#row1361",
}
TAKEN_FIELDS = {
    "normal": "neutralDamageCutRate",
    "slash": "slashDamageCutRate",
    "strike": "blowDamageCutRate",
    "thrust": "thrustDamageCutRate",
    "magic": "magicDamageCutRate",
    "fire": "fireDamageCutRate",
    "lightning": "thunderDamageCutRate",
    "holy": "darkDamageCutRate",
}
BASE_DEFENSE_FIELDS = {
    "physical": "def_phys", "magic": "def_mag", "fire": "def_fire",
    "lightning": "def_thunder", "holy": "def_dark",
}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas", type=Path, default=REPO / "public/enemy-data.json")
    parser.add_argument("--native-csv", type=Path, default=REPO.parent / "outputs/nightreign-data-20261109/csv/NpcParam.csv")
    parser.add_argument("--output", type=Path, default=REPO / "public/damage-targets.json")
    args = parser.parse_args()

    atlas = json.loads(args.atlas.read_text(encoding="utf-8"))
    with args.native_csv.open(encoding="utf-8-sig", newline="") as stream:
        native = {row["row_id"]: row for row in csv.DictReader(stream)}
    source_ids = Counter(str(row[1]) for row in atlas["rows"])
    generated = set(atlas.get("generatedNativeIds", []))
    targets = []
    for index, row in enumerate(atlas["rows"]):
        source_id = str(row[1])
        npc_id = re.sub(r"[ab]$", "", source_id)
        npc = native.get(npc_id)
        if npc is None:
            raise ValueError(f"No native NpcParam row for atlas source {source_id}")
        native_taken = {key: float(npc[field]) for key, field in TAKEN_FIELDS.items()}
        atlas_percent = row[5:13]
        agrees = all(isinstance(value, (int, float)) and abs((1 - native_taken[key]) * 100 - value) < .01
                     for (key, _), value in zip(TAKEN_FIELDS.items(), atlas_percent))
        target_id = DUPLICATE_TARGET_IDS.get((source_id, row[0]), source_id if source_ids[source_id] == 1 else f"{source_id}#row{index}")
        targets.append({
            "id": target_id,
            "name": row[0],
            "defense": None,
            "baseDefense": {key: int(npc[field]) for key, field in BASE_DEFENSE_FIELDS.items()},
            "taken": native_taken if agrees else {key: None for key in TAKEN_FIELDS},
            "source": {
                "atlasSourceId": source_id,
                "atlasRowIndex": index,
                "npcParamId": npc_id,
                "rowOrigin": "generated_native" if source_id in generated else "curated_atlas",
                "variantBranch": source_id[-1] if source_id.endswith(("a", "b")) else None,
                "disasterForm": "[灾域]" in str(row[0]),
                "locations": atlas.get("displayLocationsBySourceId", {}).get(source_id, []),
                "takenStatus": "native_param_atlas_agree" if agrees else "manual_review_native_atlas_conflict",
                "baseDefenseStatus": "native_npc_param_base; not encounter_final",
                "defenseStatus": "manual_final_defense_required",
                **({"nativeTaken": native_taken, "atlasTakenPercent": atlas_percent} if not agrees else {}),
            },
        })
    if len({target["id"] for target in targets}) != len(targets):
        raise ValueError("Duplicate damage target IDs")
    output = {
        "schemaVersion": 1,
        "sourceGameVersion": "1.3.3.0",
        "sourceRegulation": "10350000",
        "provenance": {
            "enemyAtlasSha256": hashlib.sha256(args.atlas.read_bytes()).hexdigest(),
            "npcParamCsvSha256": hashlib.sha256(args.native_csv.read_bytes()).hexdigest(),
        },
        "defenseStatus": "not_verified_for_encounter; enter the target's actual physical/magic/fire/lightning/holy defense",
        "baseDefenseStatus": "NpcParam def_* base values; not encounter-final defense or a day/depth multiplier",
        "takenUnit": "multiplier; 1 means unchanged damage",
        "estimateModel": "Elden Ring ratio curve; Nightreign order and rounding unverified",
        "defaultMode": "pre_defense",
        "estimateRequiresOptIn": True,
        "targets": targets,
    }
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{args.output}: {len(targets)} targets, {sum(target['source']['takenStatus'].startswith('manual') for target in targets)} taken-rate conflicts")


if __name__ == "__main__":
    main()
