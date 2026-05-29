#!/usr/bin/env python3
"""Summarize and compare V8 heap sampling profiles."""

import argparse
from collections import defaultdict
import json
from pathlib import Path


def frame_key(call_frame):
    function = call_frame.get("functionName") or "(anonymous)"
    url = call_frame.get("url") or "(unknown)"
    line = call_frame.get("lineNumber")
    location = f"{url}:{line + 1}" if isinstance(line, int) and line >= 0 else url
    return function, location


def iter_nodes(node):
    yield node
    for child in node.get("children", []) or []:
        yield from iter_nodes(child)


def allocation_totals(profile):
    head = profile.get("head") or {}
    totals = defaultdict(int)
    for node in iter_nodes(head):
        size = node.get("selfSize") or node.get("self_size") or 0
        if not isinstance(size, int) or size <= 0:
            continue
        totals[frame_key(node.get("callFrame", {}))] += size
    return totals


def format_rows(totals, total_bytes, byte_key="bytes", percent_key="byte_percent"):
    rows = []
    for (function, location), size in totals.items():
        row = {
            "function": function,
            "location": location,
            byte_key: size,
        }
        if total_bytes > 0:
            row[percent_key] = round(size * 100.0 / total_bytes, 2)
        else:
            row[percent_key] = 0.0
        rows.append(row)
    rows.sort(key=lambda row: (-row[byte_key], row["function"], row["location"]))
    return rows


def summarize_profile(profile, limit=20):
    totals = allocation_totals(profile)
    total_bytes = sum(totals.values())
    return {
        "total_bytes": total_bytes,
        "top_allocations": format_rows(totals, total_bytes)[:limit],
    }


def compare_profiles(before, after, limit=20):
    before_totals = allocation_totals(before)
    after_totals = allocation_totals(after)
    all_keys = set(before_totals) | set(after_totals)
    growth = {
        key: after_totals.get(key, 0) - before_totals.get(key, 0)
        for key in all_keys
    }
    positive_growth = {
        key: value
        for key, value in growth.items()
        if value > 0
    }
    before_total = sum(before_totals.values())
    after_total = sum(after_totals.values())
    positive_growth_total = sum(positive_growth.values())
    rows = format_rows(positive_growth, positive_growth_total, "growth_bytes", "growth_percent")
    return {
        "before_total_bytes": before_total,
        "after_total_bytes": after_total,
        "total_growth_bytes": after_total - before_total,
        "positive_growth_bytes": positive_growth_total,
        "top_growth": rows[:limit],
    }


def print_summary(summary):
    print(f"Total bytes: {summary['total_bytes']}")
    print()
    print("| Rank | Function | Location | Bytes | Byte % |")
    print("| ---: | --- | --- | ---: | ---: |")
    for index, row in enumerate(summary["top_allocations"], start=1):
        print(
            f"| {index} | {row['function']} | {row['location']} | "
            f"{row['bytes']} | {row['byte_percent']} |"
        )


def print_comparison(comparison):
    print(f"Before total bytes: {comparison['before_total_bytes']}")
    print(f"After total bytes: {comparison['after_total_bytes']}")
    print(f"Total growth bytes: {comparison['total_growth_bytes']}")
    print(f"Positive growth bytes: {comparison['positive_growth_bytes']}")
    print()
    print("| Rank | Function | Location | Growth bytes | Growth % |")
    print("| ---: | --- | --- | ---: | ---: |")
    for index, row in enumerate(comparison["top_growth"], start=1):
        print(
            f"| {index} | {row['function']} | {row['location']} | "
            f"{row['growth_bytes']} | {row['growth_percent']} |"
        )


def main():
    parser = argparse.ArgumentParser(description="Summarize or compare V8 heap sampling profiles.")
    parser.add_argument("profile", type=Path)
    parser.add_argument("after_profile", nargs="?", type=Path)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    args = parser.parse_args()

    with args.profile.open() as file:
        profile = json.load(file)
    if args.after_profile:
        with args.after_profile.open() as file:
            after = json.load(file)
        result = compare_profiles(profile, after, limit=args.limit)
        if args.json:
            print(json.dumps(result, indent=2, sort_keys=True))
        else:
            print_comparison(result)
        return

    result = summarize_profile(profile, limit=args.limit)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print_summary(result)


if __name__ == "__main__":
    main()
