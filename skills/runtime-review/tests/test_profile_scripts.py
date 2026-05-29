import importlib.util
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def load_script(name):
    path = ROOT / "scripts" / name
    spec = importlib.util.spec_from_file_location(path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CpuProfileTests(unittest.TestCase):
    def test_summarizes_top_functions_by_sample_weight(self):
        cpu = load_script("analyze_v8_cpu_profile.py")
        with (FIXTURES / "cpu_profile.cpuprofile").open() as file:
            profile = json.load(file)

        summary = cpu.summarize_profile(profile, limit=3)

        self.assertEqual(summary["total_samples"], 5)
        self.assertEqual(summary["top_functions"][0]["function"], "expensiveLoop")
        self.assertEqual(summary["top_functions"][0]["samples"], 3)
        self.assertEqual(summary["top_functions"][0]["sample_percent"], 60.0)
        self.assertEqual(summary["top_functions"][0]["location"], "/app/server.js:42")
        self.assertIn("handleRequest", summary["top_functions"][0]["stack"])

    def test_handles_profiles_without_samples(self):
        cpu = load_script("analyze_v8_cpu_profile.py")

        summary = cpu.summarize_profile({"nodes": []})

        self.assertEqual(summary["total_samples"], 0)
        self.assertEqual(summary["top_functions"], [])


class HeapProfileTests(unittest.TestCase):
    def test_summarizes_allocations_by_location(self):
        heap = load_script("analyze_v8_heap_profile.py")
        with (FIXTURES / "heap_after.heapprofile").open() as file:
            profile = json.load(file)

        summary = heap.summarize_profile(profile, limit=2)

        self.assertEqual(summary["total_bytes"], 8704)
        self.assertEqual(summary["top_allocations"][0]["function"], "cacheUser")
        self.assertEqual(summary["top_allocations"][0]["bytes"], 8192)
        self.assertEqual(summary["top_allocations"][0]["location"], "/app/cache.js:12")

    def test_compares_heap_profiles_by_growth(self):
        heap = load_script("analyze_v8_heap_profile.py")
        with (FIXTURES / "heap_before.heapprofile").open() as file:
            before = json.load(file)
        with (FIXTURES / "heap_after.heapprofile").open() as file:
            after = json.load(file)

        comparison = heap.compare_profiles(before, after, limit=2)

        self.assertEqual(comparison["before_total_bytes"], 3072)
        self.assertEqual(comparison["after_total_bytes"], 8704)
        self.assertEqual(comparison["total_growth_bytes"], 5632)
        self.assertEqual(comparison["top_growth"][0]["function"], "cacheUser")
        self.assertEqual(comparison["top_growth"][0]["growth_bytes"], 6144)


if __name__ == "__main__":
    unittest.main()
