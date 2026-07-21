#!/usr/bin/env python3
from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

API_URL = "https://api.github.com"

DEFAULT_QUERIES = [
    '"Sponsored by"',
    '"Thanks to our sponsors"',
    '"Supported by"',
    '"Brought to you by"',
    '"Project sponsors"',
    '"Our sponsors"',
    '"Sponsored_By"',
]

LIMIT_PER_QUERY = int(os.environ.get("SPONSOR_MINER_LIMIT_PER_QUERY", "50"))
MAX_READMES = int(os.environ.get("SPONSOR_MINER_MAX_READMES", "100"))
MIN_STARS = int(os.environ.get("SPONSOR_MINER_MIN_STARS", "50"))
SEARCH_SLEEP_SECONDS = float(os.environ.get("SPONSOR_MINER_SEARCH_SLEEP_SECONDS", "7"))
FETCH_SLEEP_SECONDS = float(os.environ.get("SPONSOR_MINER_FETCH_SLEEP_SECONDS", "0.5"))

SPONSOR_RE = re.compile(
    r"sponsored[_\s-]*by|thanks to our sponsors?|supported by|brought to you by|"
    r"project sponsors?|our sponsors?|advertisement|promoted|partner",
    re.IGNORECASE,
)
URL_RE = re.compile(r"https?://[^\s<>\]\"')]+")
RELEVANT_TERM_RE = re.compile(r"\b(ai|developer|devtool|dev\s+tool|github|security|code|cli|open\s+source|agent)\b")

IGNORED_SPONSOR_DOMAINS = {
    "badge.fury.io",
    "cdn.jsdelivr.net",
    "github.com",
    "img.shields.io",
    "m.do.co",
    "nodei.co",
    "npmjs.com",
    "paypalobjects.com",
    "raw.githubusercontent.com",
    "shields.io",
    "tbrd.co",
    "user-images.githubusercontent.com",
}

CANDIDATE_FIELDS = [
    "source_repo",
    "source_repo_stars",
    "readme_line",
    "source_url",
    "query",
    "sponsor_domains",
    "urls",
    "fit_score",
    "reject_reason",
    "context",
]

LEAD_FIELDS = [
    "company",
    "domain",
    "source_repo",
    "evidence_url",
    "fit_score",
    "fit_notes",
    "contact_url",
    "status",
]


class GitHubError(RuntimeError):
    pass


class GitHubRateLimitError(GitHubError):
    pass


@dataclass
class Candidate:
    source_repo: str
    source_repo_stars: int
    readme_line: int
    source_url: str
    query: str
    urls: list[str]
    sponsor_domains: list[str]
    context: str
    fit_score: int = 0
    reject_reason: str = ""

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class GitHubClient:
    def __init__(self, token: str) -> None:
        self.token = token

    def search_code(self, query: str, limit: int) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        page = 1
        while len(results) < limit:
            per_page = min(100, limit - len(results))
            payload = self.request_json(
                "/search/code",
                params=[
                    ("q", f"{query} filename:README.md"),
                    ("per_page", str(per_page)),
                    ("page", str(page)),
                ],
                accept="application/vnd.github.text-match+json",
            )
            items = payload.get("items", [])
            if not items:
                break
            results.extend(items)
            if len(items) < per_page:
                break
            page += 1
        return results[:limit]

    def fetch_repo(self, repo: str) -> dict[str, Any]:
        return self.request_json(f"/repos/{repo}")

    def fetch_readme(self, repo: str) -> str:
        return self.request_text(f"/repos/{repo}/readme", accept="application/vnd.github.raw")

    def request_json(
        self,
        path: str,
        params: list[tuple[str, str]] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> dict[str, Any]:
        return json.loads(self.request(path, params=params, accept=accept).decode())

    def request_text(
        self,
        path: str,
        params: list[tuple[str, str]] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> str:
        return self.request(path, params=params, accept=accept).decode("utf-8", errors="replace")

    def request(
        self,
        path: str,
        params: list[tuple[str, str]] | None = None,
        accept: str = "application/vnd.github+json",
    ) -> bytes:
        query = f"?{urlencode(params)}" if params else ""
        request = Request(
            f"{API_URL}{path}{query}",
            headers={
                "Accept": accept,
                "Authorization": f"Bearer {self.token}",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "sponsor-miner-skill/0.1.0",
            },
        )
        try:
            with urlopen(request, timeout=30) as response:
                return response.read()
        except HTTPError as error:
            remaining = error.headers.get("x-ratelimit-remaining", "") if error.headers else ""
            if error.code in {403, 429} and remaining == "0":
                raise GitHubRateLimitError("GitHub API rate limit exceeded") from error
            raise GitHubError(f"GitHub API request failed: {error.code} {error.reason}") from error
        except (OSError, URLError) as error:
            raise GitHubError(f"GitHub API request failed: {error}") from error


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("usage: sponsor_miner.py <target_github_repo_url>", file=sys.stderr)
        return 2

    try:
        target_repo = parse_github_repo_url(argv[1])
        token = get_gh_token()
        client = GitHubClient(token)
        output_dir = unique_session_dir(Path.cwd() / "sponsor-hunt", target_repo.replace("/", "__"))
        summary = run_mining(client, target_repo, output_dir)
    except (GitHubError, ValueError, OSError) as error:
        print(f"sponsor-miner: {error}", file=sys.stderr)
        return 1

    print(f"Wrote {summary['candidate_count']} candidates and {summary['shortlist_count']} shortlisted leads to {output_dir}")
    if summary["errors"]:
        print(f"Completed with {len(summary['errors'])} non-fatal errors. See {output_dir / 'run-summary.md'}.", file=sys.stderr)
    print(f"SESSION_PATH={output_dir}")
    return 0


def run_mining(client: GitHubClient, target_repo: str, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=False)
    readmes_dir = output_dir / "readmes"
    readmes_dir.mkdir()

    errors: list[str] = []
    target = fetch_target_context(client, target_repo, errors)
    hits: list[dict[str, object]] = []
    repo_queries: dict[str, str] = {}

    for query in DEFAULT_QUERIES:
        try:
            items = client.search_code(query, LIMIT_PER_QUERY)
        except GitHubRateLimitError as error:
            errors.append(f"search rate limited for {query}: {error}")
            break
        except GitHubError as error:
            errors.append(f"search failed for {query}: {error}")
            continue

        for item in items:
            try:
                repo = repo_from_search_item(item)
            except GitHubError as error:
                errors.append(str(error))
                continue
            hit = {
                "query": query,
                "repo": repo,
                "source_url": str(item.get("html_url") or item.get("url") or ""),
                "path": item.get("path", "README.md"),
                "text_matches": item.get("text_matches") or item.get("textMatches") or [],
            }
            hits.append(hit)
            repo_queries.setdefault(repo, query)

        if SEARCH_SLEEP_SECONDS:
            time.sleep(SEARCH_SLEEP_SECONDS)

    write_jsonl(output_dir / "hits.jsonl", hits)

    candidates: list[Candidate] = []
    readmes_fetched = 0
    repos_considered = 0
    for repo in sorted(repo_queries):
        if readmes_fetched >= MAX_READMES:
            break
        repos_considered += 1
        try:
            repo_info = client.fetch_repo(repo)
            stars = int(repo_info.get("stargazers_count") or 0)
        except GitHubRateLimitError as error:
            errors.append(f"repo metadata rate limited for {repo}: {error}")
            break
        except GitHubError as error:
            errors.append(f"repo metadata failed for {repo}: {error}")
            continue
        if stars < MIN_STARS:
            continue
        try:
            readme = client.fetch_readme(repo)
        except GitHubRateLimitError as error:
            errors.append(f"README fetch rate limited for {repo}: {error}")
            break
        except GitHubError as error:
            errors.append(f"README fetch failed for {repo}: {error}")
            continue

        (readmes_dir / sanitize_repo_filename(repo)).write_text(readme, encoding="utf-8")
        readmes_fetched += 1
        candidates.extend(
            extract_candidates_from_readme(
                repo=repo,
                source_repo_stars=stars,
                source_url=f"https://github.com/{repo}/blob/HEAD/README.md",
                query=repo_queries[repo],
                readme=readme,
            )
        )
        if FETCH_SLEEP_SECONDS:
            time.sleep(FETCH_SLEEP_SECONDS)

    candidates = dedupe_candidates(candidates)
    candidates.sort(key=lambda candidate: (candidate.reject_reason != "", -candidate.fit_score, candidate.source_repo))
    write_candidates_jsonl(output_dir / "sponsor-candidates.jsonl", candidates)
    write_candidates_csv(output_dir / "sponsor-candidates.csv", candidates)
    shortlist_count = write_shortlist(output_dir / "sponsor-candidates.csv", output_dir / "shortlist.csv")
    write_verified_leads_template(output_dir / "verified-leads.csv")

    summary = {
        "target_repo": target_repo,
        "target": target,
        "queries": DEFAULT_QUERIES,
        "search_hits": len(hits),
        "repos_considered": repos_considered,
        "readmes_fetched": readmes_fetched,
        "candidate_count": len(candidates),
        "shortlist_count": shortlist_count,
        "errors": errors,
    }
    write_run_summary(output_dir / "run-summary.md", summary)
    return summary


def fetch_target_context(client: GitHubClient, target_repo: str, errors: list[str]) -> dict[str, Any]:
    try:
        repo = client.fetch_repo(target_repo)
    except GitHubError as error:
        errors.append(f"target repo metadata failed for {target_repo}: {error}")
        return {"repo": target_repo}

    context: dict[str, Any] = {
        "repo": target_repo,
        "description": repo.get("description") or "",
        "homepage": repo.get("homepage") or "",
        "stars": repo.get("stargazers_count") or 0,
        "topics": repo.get("topics") or [],
        "language": repo.get("language") or "",
    }
    try:
        readme = client.fetch_readme(target_repo)
        context["readme_excerpt"] = " ".join(readme.split())[:1200]
    except GitHubError as error:
        errors.append(f"target README fetch failed for {target_repo}: {error}")
    return context


def get_gh_token() -> str:
    try:
        completed = subprocess.run(["gh", "auth", "token"], check=True, capture_output=True, text=True)
    except (FileNotFoundError, subprocess.SubprocessError) as error:
        details = getattr(error, "stderr", "") or str(error)
        raise GitHubError(f"gh auth token failed: {details}") from error
    token = completed.stdout.strip()
    if not token:
        raise GitHubError("gh auth token returned an empty token")
    return token


def parse_github_repo_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() != "github.com":
        raise ValueError("target must be a GitHub repo URL like https://github.com/owner/repo")
    parts = [part for part in parsed.path.strip("/").split("/") if part]
    if len(parts) < 2:
        raise ValueError("target must include both owner and repo")
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]
    return f"{parts[0]}/{repo}"


def unique_session_dir(root: Path, session_name: str) -> Path:
    base = f"{sanitize_session_name(session_name)}-{session_timestamp()}"
    candidate = root / base
    if not candidate.exists():
        return candidate
    index = 2
    while True:
        candidate = root / f"{base}-{index}"
        if not candidate.exists():
            return candidate
        index += 1


def session_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def sanitize_session_name(name: str) -> str:
    safe = "".join(char if char.isalnum() or char in {"-", "_", "."} else "-" for char in name.strip())
    safe = safe.strip("-")
    return safe if safe not in {"", ".", ".."} else "target"


def repo_from_search_item(item: dict[str, Any]) -> str:
    repository = item.get("repository") or {}
    for key in ("full_name", "nameWithOwner"):
        value = repository.get(key)
        if value:
            return str(value)
    url = item.get("html_url") or item.get("url") or ""
    marker = "github.com/"
    if marker in url:
        parts = url.split(marker, 1)[1].split("/")
        if len(parts) >= 2:
            return f"{parts[0]}/{parts[1]}"
    raise GitHubError(f"Could not determine repository from search item: {item!r}")


def sanitize_repo_filename(repo: str) -> str:
    safe = repo.replace("/", "__")
    safe = re.sub(r"[^A-Za-z0-9_.-]", "_", safe)
    return f"{safe}.md"


def extract_candidates_from_readme(
    *,
    repo: str,
    source_url: str,
    query: str,
    readme: str,
    source_repo_stars: int,
) -> list[Candidate]:
    lines = readme.splitlines()
    candidates: list[Candidate] = []
    for index, line in enumerate(lines):
        if not SPONSOR_RE.search(line):
            continue
        start = max(0, index - 3)
        end = min(len(lines), index + 8)
        context = " ".join("\n".join(lines[start:end]).split())
        urls = extract_urls(context)
        reject_reason = reject_reason_for_context(context)
        candidate = Candidate(
            source_repo=repo,
            source_repo_stars=source_repo_stars,
            readme_line=index + 1,
            source_url=f"{source_url.split('#', 1)[0]}#L{index + 1}",
            query=query,
            urls=urls,
            sponsor_domains=sponsor_domains_from_urls(urls),
            context=context,
            reject_reason=reject_reason,
        )
        candidate.fit_score = score_candidate(candidate)
        candidates.append(candidate)
    return candidates


def extract_urls(text: str) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    for match in URL_RE.finditer(text):
        url = match.group(0).rstrip(".,;:")
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def sponsor_domains_from_urls(urls: list[str]) -> list[str]:
    domains: list[str] = []
    seen: set[str] = set()
    for url in urls:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        if not domain or domain in IGNORED_SPONSOR_DOMAINS:
            continue
        if domain not in seen:
            seen.add(domain)
            domains.append(domain)
    return domains


def reject_reason_for_context(context: str) -> str:
    text = context.lower()
    if any(term in text for term in ("github sponsors", "patreon", "open collective", "opencollective", "buy me a coffee", "ko-fi")):
        return "donation_platform"
    if "podcast" in text and any(term in text for term in ("sponsor reads", "ad cleaner", "ad detection", "transcribe", "promo codes")):
        return "podcast_or_ad_detection_example"
    if any(term in text for term in ("conference", "template", "hosted by")):
        return "conference_or_template"
    if any(term in text for term in ("academic", "paper", "research", "grant", "orcid")):
        return "academic_acknowledgement"
    if any(term in text for term in ("example", "placeholder", "sample")):
        return "sample_or_placeholder"
    return ""


def score_candidate(candidate: Candidate) -> int:
    if candidate.reject_reason:
        return -10
    text = candidate.context.lower()
    score = 0
    if candidate.urls:
        score += 1
    if candidate.sponsor_domains:
        score += 2
    if candidate.source_repo_stars >= 1000:
        score += 3
    elif candidate.source_repo_stars >= 100:
        score += 2
    elif candidate.source_repo_stars >= 10:
        score += 1
    score += min(4, len(set(RELEVANT_TERM_RE.findall(text))))
    if any(domain.endswith((".ai", ".dev")) for domain in candidate.sponsor_domains):
        score += 2
    return score


def dedupe_candidates(candidates: list[Candidate]) -> list[Candidate]:
    deduped: list[Candidate] = []
    seen: set[tuple[str, str, str]] = set()
    for candidate in candidates:
        sponsor_identity = candidate.sponsor_domains[0] if candidate.sponsor_domains else candidate.urls[0] if candidate.urls else ""
        context_hash = hashlib.sha256(candidate.context.lower().encode()).hexdigest()[:12]
        key = (candidate.source_repo, sponsor_identity, context_hash)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(candidate)
    return deduped


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for row in rows:
            file.write(json.dumps(row, sort_keys=True) + "\n")


def write_candidates_jsonl(path: Path, candidates: list[Candidate]) -> None:
    with path.open("w", encoding="utf-8") as file:
        for candidate in candidates:
            file.write(json.dumps(candidate.to_dict(), sort_keys=True) + "\n")


def write_candidates_csv(path: Path, candidates: list[Candidate]) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=CANDIDATE_FIELDS)
        writer.writeheader()
        for candidate in candidates:
            row = candidate.to_dict()
            row["sponsor_domains"] = "; ".join(candidate.sponsor_domains)
            row["urls"] = "; ".join(candidate.urls)
            writer.writerow({field: row[field] for field in CANDIDATE_FIELDS})


def write_shortlist(input_path: Path, output_path: Path, min_fit_score: int = 6) -> int:
    with input_path.open(encoding="utf-8", newline="") as file:
        candidates = list(csv.DictReader(file))
    rows: list[dict[str, str]] = []
    for candidate in candidates:
        if candidate.get("reject_reason", ""):
            continue
        fit_score = int(candidate.get("fit_score") or 0)
        if fit_score < min_fit_score:
            continue
        domains = [domain.strip() for domain in candidate.get("sponsor_domains", "").split(";") if domain.strip()]
        if not domains:
            continue
        for domain in domains:
            rows.append(
                {
                    "company": company_name_from_domain(domain),
                    "domain": domain,
                    "source_repo": candidate.get("source_repo", ""),
                    "evidence_url": candidate.get("source_url", ""),
                    "fit_score": str(fit_score),
                    "fit_notes": shortlist_fit_notes(candidate),
                    "contact_url": "",
                    "status": "needs_review",
                }
            )
    with output_path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=LEAD_FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    return len(rows)


def write_verified_leads_template(path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        csv.DictWriter(file, fieldnames=LEAD_FIELDS).writeheader()


def company_name_from_domain(domain: str) -> str:
    if not domain:
        return ""
    name = domain.split(".")[0]
    if name in {"app", "blog", "docs", "get", "go", "login", "m", "try", "use", "www", "www2"}:
        parts = domain.split(".")
        if len(parts) > 1:
            name = parts[1]
    return name.replace("-", " ").title()


def shortlist_fit_notes(candidate: dict[str, str]) -> str:
    context = " ".join(candidate.get("context", "").split())
    if len(context) > 280:
        context = f"{context[:277]}..."
    return f"Needs review: {context}"


def write_run_summary(path: Path, summary: dict[str, Any]) -> None:
    target = summary["target"]
    lines = [
        "# Sponsor Miner Run Summary",
        "",
        f"- Target repo: {summary['target_repo']}",
        f"- Target description: {target.get('description', '')}",
        f"- Target stars: {target.get('stars', '')}",
        f"- Search hits: {summary['search_hits']}",
        f"- Repos considered: {summary['repos_considered']}",
        f"- READMEs fetched: {summary['readmes_fetched']}",
        f"- Candidates exported: {summary['candidate_count']}",
        f"- Shortlisted leads: {summary['shortlist_count']}",
        "",
        "Next: verify rows in `shortlist.csv` and fill `verified-leads.csv`.",
    ]
    if summary["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in summary["errors"])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
