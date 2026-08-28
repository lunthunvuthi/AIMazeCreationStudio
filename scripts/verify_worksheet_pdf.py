#!/usr/bin/env python3
"""Check an exported worksheet against PRODUCTION_PROCESS.md §4's page contract.

`phase_b_run.mjs` drives the app and saves what came out; this reads those
artifacts back and says whether the PDF is actually shaped the way §4 says it
should be. Splitting it this way is deliberate — the driver knows how to click
the app, and this knows how to read a PDF, and neither needs the other's
dependencies.

What it checks, all of it derived from the run's own saved progress JSON rather
than hardcoded, so it works for any level:

1. Page count is `len(pages) + 2` — one cover, one page per PageRow, one last
   page.
2. The cover prints this sheet's level and month/week.
3. Each question page carries badge `i + 1`, and badges alternate left/right by
   parity (`pdf_export_spec.md` §4).
4. The answer key is the same document with solutions added: cover and last
   page pixel-identical, every question page different.

Point 4 is the one worth having. The key is a second render, not an overlay
applied to the first, so "identical except for the solution" is an assumption
until something compares the pixels.

Usage:
    python scripts/verify_worksheet_pdf.py phase-b-out/primary-mixed
    python scripts/verify_worksheet_pdf.py <dir> --png    # also dump page PNGs

Needs PyMuPDF:  pip install -e ".[phase-b]"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import pymupdf
except ImportError:  # pragma: no cover - dependency guidance
    sys.exit('PyMuPDF is required.  Install it with:  pip install -e ".[phase-b]"')

MONTH_ABBR = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]


class Report:
    """Collects pass/fail lines so one bad check does not hide the rest."""

    def __init__(self) -> None:
        self.failures = 0

    def check(self, ok: bool, message: str) -> bool:
        print(f'  {"PASS" if ok else "FAIL"}  {message}')
        if not ok:
            self.failures += 1
        return ok

    def note(self, message: str) -> None:
        print(f'        {message}')


def find_artifacts(out_dir: Path) -> tuple[Path, Path, dict]:
    """Pick one export's three files: worksheet, its answer key, its progress JSON.

    Every export filename carries its own timestamp, so two runs into one folder
    coexist silently — and picking each file independently is how this ends up
    checking last run's worksheet against this run's key and reporting green.
    The three files of a single export share a stem (`buildExportFilename`
    appends only a suffix), so the key and the progress file are *derived* from
    the chosen worksheet rather than searched for.
    """
    sheets = sorted(
        (p for p in out_dir.glob('*.pdf') if not p.stem.endswith('-answer-key')),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if not sheets:
        sys.exit(f'{out_dir}: no worksheet PDF here (the driver writes one on Download)')

    sheet = sheets[0]
    if len(sheets) > 1:
        print(f'NOTE: {len(sheets)} worksheets in this folder — checking the newest, {sheet.name}.')
        print('      Re-run the driver with --clean so an older run cannot be mistaken for this one.\n')

    key = sheet.with_name(f'{sheet.stem}-answer-key.pdf')
    progress = sheet.with_suffix('.json')
    for path_, what in ((key, 'answer key'), (progress, 'saved-progress JSON')):
        if not path_.exists():
            sys.exit(f'{out_dir}: no {what} for {sheet.name} (expected {path_.name})')
    return sheet, key, json.loads(progress.read_text())


def page_differs(a, b, dpi: int = 72) -> int:
    """How many pixels differ between two rendered pages, or -1 if incomparable.

    Compares every channel of every pixel. Stepping through one byte per pixel
    would only ever read red, which passes a page whose difference is green or
    blue alone — fine for today's grey solution overlay, wrong as a guarantee.
    """
    pa, pb = a.get_pixmap(dpi=dpi), b.get_pixmap(dpi=dpi)
    if pa.n != pb.n or len(pa.samples) != len(pb.samples):
        return -1
    sa, sb = pa.samples, pb.samples
    if sa == sb:  # whole-buffer compare first: identical pages are the common case
        return 0
    n = pa.n
    return sum(1 for i in range(0, len(sa), n) if sa[i:i + n] != sb[i:i + n])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('out_dir', type=Path, help='folder written by phase_b_run.mjs')
    parser.add_argument('--png', action='store_true', help='also write one PNG per page, for eyeballing')
    parser.add_argument('--dpi', type=int, default=100, help='PNG resolution (default 100)')
    args = parser.parse_args()

    sheet_path, key_path, progress = find_artifacts(args.out_dir)
    rows = progress['pages']
    expected_pages = len(rows) + 2

    print(f'worksheet : {sheet_path.name}')
    print(f'answer key: {key_path.name}')
    print(f'level     : {progress["level"]}  {len(rows)} rows, '
          f'{sum(len(r["questions"]) for r in rows)} questions')
    print()

    sheet = pymupdf.open(sheet_path)
    key = pymupdf.open(key_path)
    report = Report()

    print('§4 page sequence')
    report.check(
        sheet.page_count == expected_pages,
        f'{sheet.page_count} pages == 1 cover + {len(rows)} question pages + 1 last page',
    )
    report.check(key.page_count == sheet.page_count, f'answer key has the same {key.page_count} pages')

    print('\ncover')
    cover_text = sheet[0].get_text()
    report.check(progress['level'].capitalize() in cover_text, f'names the level "{progress["level"].capitalize()}"')
    header = f'{MONTH_ABBR[progress["month"] - 1]} / Week{progress["week"]}'
    report.check(header in cover_text, f'prints "{header}"')

    print('\nquestion pages — badge number and side (pdf_export_spec.md §4)')
    width = sheet[0].rect.width
    for i in range(1, sheet.page_count - 1):
        digits = [w for w in sheet[i].get_text('words') if w[4].isdigit()]
        if not digits:
            report.check(False, f'page {i + 1}: no badge digit found')
            continue
        # The badge is the topmost digit on the page; the pickaxe counters sit
        # lower, beside the maze.
        x0, _, x1, _, text = min(digits, key=lambda w: w[1])[:5]
        side = 'left' if (x0 + x1) / 2 < width / 2 else 'right'
        expected_side = 'left' if int(text) % 2 else 'right'
        report.check(
            text == str(i) and side == expected_side,
            f'page {i + 1}: badge "{text}" (want "{i}") on the {side} (want {expected_side})',
        )

    print('\nanswer key is the same document plus solutions')
    for i in range(min(sheet.page_count, key.page_count)):
        diff = page_differs(sheet[i], key[i])
        if diff < 0:
            report.check(False, f'page {i + 1}: renders to different dimensions in the two PDFs')
        elif i == 0:
            report.check(diff == 0, 'page 1 (cover) identical')
        elif i == sheet.page_count - 1:
            report.check(diff == 0, f'page {i + 1} (last page) identical')
        else:
            report.check(diff > 0, f'page {i + 1} carries a solution overlay ({diff} px differ)')

    if args.png:
        print()
        for doc, tag in ((sheet, 'sheet'), (key, 'key')):
            for i, page in enumerate(doc):
                dest = args.out_dir / f'{tag}-p{i + 1}.png'
                page.get_pixmap(dpi=args.dpi).save(dest)
            print(f'  wrote {doc.page_count} PNGs for {tag}')

    print()
    if report.failures:
        print(f'{report.failures} check(s) FAILED')
        return 1
    print('all checks passed')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
