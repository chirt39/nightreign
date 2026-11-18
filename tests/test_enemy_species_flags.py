import unittest
import json
from pathlib import Path

from scripts.build_enemy_atlas import species_weakness_flags


class EnemySpeciesFlagsTest(unittest.TestCase):
    def test_native_row_preserves_species_field_order_and_unknowns(self):
        npc = dict(isWeakA="0", isWeakB="1", isWeakC="0", isWeakD="1")
        self.assertEqual(species_weakness_flags(npc), ["No", "Yes", "No", "Yes"])
        del npc["isWeakB"]
        self.assertEqual(species_weakness_flags(npc), ["No", None, "No", "Yes"])

    def test_dlc_field_and_boss_sources_use_their_own_flags(self):
        atlas = Path(__file__).resolve().parents[1] / "public/enemy-data.json"
        rows = {str(r[1]): r for r in json.loads(atlas.read_text(encoding="utf-8"))["rows"]}
        self.assertEqual(rows["58600010"][38:42], ["No", "Yes", "No", "Yes"])
        for source_id in ("76100010", "76100010-phase2", "50800010", "44203010"):
            self.assertEqual(rows[source_id][38:42], ["No"] * 4)
