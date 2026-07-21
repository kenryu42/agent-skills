---
name: sponsor-miner
description: "Find and verify potential sponsors for a GitHub repository by mining GitHub README sponsorship placements. Use when the user provides a target GitHub repo URL and wants sponsor leads, README sponsor discovery, sponsor verification, contact URLs, or a verified-leads.csv for outreach planning. The skill expects exactly one user-facing input: the target repo URL."
---

# Sponsor Miner

Use this skill to find companies that already sponsor developer-facing open source READMEs and may be good sponsors for a target GitHub repository.

Prerequisites:

- `python3` 3.9 or newer
- GitHub CLI installed and authenticated so `gh auth token` succeeds

## Workflow

1. Extract the single target repo URL from the user request.
   - If no repo URL is provided, ask for one.
   - If multiple repo URLs are provided, ask the user to choose one.
2. Run the bundled miner from the current workspace:
   ```bash
   python3 <this-skill-dir>/scripts/sponsor_miner.py <target_repo_url>
   ```
   Resolve `<this-skill-dir>` from the path of this `SKILL.md`.
3. Read the session path printed by the script.
4. Review:
   - `<session>/run-summary.md`
   - `<session>/shortlist.csv`
   - `<session>/sponsor-candidates.csv` when evidence needs auditing
5. Verify each promising lead:
   - open `evidence_url` and confirm it shows real sponsorship, support, or promotion
   - check whether the sponsor's audience overlaps with the target repo's users
   - find the best public contact, sponsorship, founder, DevRel, marketing, or company contact URL
6. Fill `<session>/verified-leads.csv`; the script creates it with headers only.

## Output

Write final verified leads to:

```text
<session>/verified-leads.csv
```

Use this exact schema:

```text
company,domain,source_repo,evidence_url,fit_score,fit_notes,contact_url,status
```

Use these statuses:

- `verified`: good lead and contact URL found
- `contact_missing`: good lead but no usable contact URL found
- `needs_review`: plausible lead but evidence or fit remains uncertain
- `rejected`: not a real sponsor lead or no plausible audience overlap

Rewrite `fit_notes` as an actual one-sentence rationale. Do not leave the raw README snippet from `shortlist.csv` as the final note.

Reject leads when they are only donation links, generic badges, CDN/package registry links, conference templates, academic acknowledgements, placeholders, podcast/ad-detection examples, or companies with no plausible audience overlap with the target repo.

Do not send outreach unless the user explicitly asks.
