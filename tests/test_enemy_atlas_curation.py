import json
import unittest
from pathlib import Path


ATLAS = Path(__file__).resolve().parents[1] / "public/enemy-data.json"


class EnemyAtlasCurationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atlas = json.loads(ATLAS.read_text(encoding="utf-8"))
        cls.rows = {str(row[1]): row for row in cls.atlas["rows"]}

    def test_exact_source_removals_and_snowfield_troll_retention(self):
        for source_id in ("45050010", "46020030", "46000110", "43511120", "43510040",
                          "46001000", "46008000", "46003000"):
            self.assertNotIn(source_id, self.rows)
            for field in ("extraLocations", "entityLocationsBySourceId", "displayLocationsBySourceId", "statLocationsBySourceId"):
                self.assertNotIn(source_id, self.atlas[field])
        for source_id in ("46020000", "46020010", "46020020", "46020040", "46021000", "46022000", "46020050"):
            self.assertIn(source_id, self.rows)
        self.assertIn("山顶", self.atlas["displayLocationsBySourceId"]["46020050"])
        for source_id, row in self.rows.items():
            if row[0] == "山妖":
                self.assertNotIn("山顶", self.atlas["displayLocationsBySourceId"][source_id])
        self.assertFalse(any(row[:3] == ["山妖", "山顶", "boss"] for row in self.atlas["scale"]["rows"]))

    def test_vanguard_is_not_the_night_boss(self):
        display = self.atlas["displayLocationsBySourceId"]
        for source_id, row in self.rows.items():
            if "前哨战" in row[0]:
                self.assertIn("夜晚Boss前哨战", display[source_id])
                self.assertNotIn("夜晚Boss", display[source_id])
        self.assertEqual(display["36000010"], ["夜晚Boss前哨战"])
        self.assertEqual(display["36000020"], ["封印监牢"])
        self.assertIn("夜晚Boss", display["46809010"])  # Actual Fallingstar Beast.

    def test_pumpkin_head_occurrences_are_specific_to_the_placed_form(self):
        display = self.atlas["displayLocationsBySourceId"]
        for source_id in ("43400610", "43401610"):
            self.assertEqual(self.rows[source_id][13], "Immune")
            self.assertEqual(display[source_id], ["“隐城”诺克拉缇欧"])
        for source_id, area in (("43401010a", "大型营地"), ("43401120", "矿洞")):
            self.assertEqual(self.rows[source_id][13], 112)
            self.assertEqual(display[source_id], [area])

    def test_night_roles_follow_individual_health_bars(self):
        for field in ("statLocationsBySourceId", "displayLocationsBySourceId"):
            locations = self.atlas[field]
            for source_id in ("45803010", "43531110", "50400120", "50700010", "52501220"):
                self.assertIn("夜晚Boss", locations[source_id])
            for source_id in ("40400010", "43531400", "30600020", "49801110", "31600020"):
                self.assertIn("夜晚Boss前哨战", locations[source_id])
                self.assertNotIn("夜晚Boss", locations[source_id])
            for source_id in ("45803000", "21300520", "35000110b"):
                self.assertFalse({"夜晚Boss", "夜晚Boss前哨战"}.intersection(locations[source_id]))
        self.assertEqual(self.rows["77100010"][0], "百足恶魔 (夜晚Boss)")
        for source_id in ("42410010", "42500030", "42400030", "42810010", "42800520",
                          "42800020", "45600030", "45500030"):
            self.assertNotIn(source_id, self.rows)
        self.assertIn("夜晚Boss前哨战", self.atlas["displayLocationsBySourceId"]["42500010"])

    def test_albinauric_appearance_and_forge_binding(self):
        normal, horned, silver = self.atlas["albinauricForms"]
        self.assertEqual(horned["forgeEncounter"], "血怪之首")
        self.assertNotIn("锻造村", normal["locations"] + silver["locations"])
        for form, sig in [(normal, (20, 84, 84, 84)), (horned, (40, 63, 84, 154)), (silver, (20, 84, 252, 84))]:
            self.assertIn(form["statId"], form["sourceIds"])
            for sid in form["sourceIds"]:
                r = self.rows[sid]
                self.assertEqual((r[10], *r[15:18]), sig)

    def test_public_locations_keep_distinct_valid_categories(self):
        for field in ("extraLocations", "entityLocationsBySourceId", "displayLocationsBySourceId", "statLocationsBySourceId"):
            locations = {location for values in self.atlas[field].values() for location in values}
            self.assertFalse(locations & {"小型营地", "教堂", "永夜Boss", "第三夜Boss"})
        display = self.atlas["displayLocationsBySourceId"]
        locations = {location for values in display.values() for location in values}
        self.assertTrue({"夜王", "夜晚Boss", "大教堂", "大型营地"} <= locations)
        scale_locations = {row[1] for row in self.atlas["scale"]["rows"]}
        self.assertTrue({"永夜Boss", "第三夜Boss", "夜晚Boss"} <= scale_locations)


if __name__ == "__main__":
    unittest.main()
