#!/usr/bin/env python3
"""Summarize V8 CPU profiles by sampled stack weight."""

import argparse
from collections import Counter
import json
from pathlib import Path


def frame_label(call_frame):
    function = call_frame.get("functionName") or "(anonymous)"
    url = call_frame.get("url") or "(unknown)"
    line = call_frame.get("lineNumber")
    if url == "(unknown)":
        return function
    if isinstance(line, int) and line >= 0:
        return f"{function} ({url}:{line + 1})"
    return f"{function} ({url})"


def frame_location(call_frame):
    url = call_frame.get("url") or "(unknown)"
    line = call_frame.get("lineNumber")
    if isinstance(line, int) and line >= 0:
        return f"{url}:{line + 1}"
    return url


def build_parent_map(nodes):
    parents = {}
    by_id = {}
    for node in nodes:
        node_id = node.get("id")
        if node_id is None:
            continue
        by_id[node_id] = node
        for child_id in node.get("children", []):
            parents[child_id] = node_id
    return by_id, parents


def stack_for(node_id, by_id, parents):
    stack = []
    current_id = node_id
    seen = set()
    while current_id in by_id and current_id not in seen:
        seen.add(current_id)
        node = by_id[current_id]
        stack.append(frame_label(node.get("callFrame", {})))
        current_id = parents.get(current_id)
    return list(reversed(stack))


def summarize_profile(profile, limit=20):
    nodes = profile.get("nodes") or []
    samples = profile.get("samples") or []
    total_samples = len(samples)
    if total_samples == 0:
        return {"total_samples": 0, "top_functions": []}

    by_id, parents = build_parent_map(nodes)
    counts = Counter(samples)
    rows = []
    for node_id, samples_for_node in counts.items():
        node = by_id.get(node_id)
        if not node:
            continue
        call_frame = node.get("callFrame", {})
        rows.append(
            {
                "function": call_frame.get("functionName") or "(anonymous)",
                "location": frame_location(call_frame),
                "samples": samples_for_node,
                "sample_percent": round(samples_for_node * 100.0 / total_samples, 2),
                "stack": " > ".join(stack_for(node_id, by_id, parents)),
            }
        )

    rows.sort(key=lambda row: (-row["samples"], row["function"], row["location"]))
    return {"total_samples": total_samples, "top_functions": rows[:limit]}


def print_markdown(summary):
    print(f"Total samples: {summary['total_samples']}")
    print()
    print("| Rank | Function | Location | Samples | Sample % | Stack |")
    print("| ---: | --- | --- | ---: | ---: | --- |")
    for index, row in enumerate(summary["top_functions"], start=1):
        print(
            f"| {index} | {row['function']} | {row['location']} | "
            f"{row['samples']} | {row['sample_percent']} | {row['stack']} |"
        )


def main():
    parser = argparse.ArgumentParser(description="Summarize a V8 .cpuprofile file.")
    parser.add_argument("profile", type=Path)
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    args = parser.parse_args()

    with args.profile.open() as file:
        profile = json.load(file)
    summary = summarize_profile(profile, limit=args.limit)

    if args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print_markdown(summary)


if __name__ == "__main__":
    main()
