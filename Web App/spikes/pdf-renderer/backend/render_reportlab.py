"""Spike: render the PDF worksheet server-side with reportlab.

Renders `sample_fixture.json` (see `../generate_fixture.py`) into an A4 PDF
following `Web App/docs/pdf_design_spec.md` (the pixel-measured design spec —
implement against that doc's sections, referenced below by number) and
`Web App/docs/pdf_export_spec.md` §1-§6 (document structure). Produces a
question-only PDF and an answer-key PDF (`--answer-key`).

This is throwaway spike code for comparing renderer technology (backend vs.
frontend print-CSS, see `pdf_export_spec.md` §7 item 5 /
`level_dashboard_pagination_spec.md` §8 item 1) — not wired into the real
`maze_api` app, not meant to become the production renderer as-is.

Reuses `pickaxe_maze.grid.parse_rows` for wall/S-G parsing (rather than
re-deriving that logic) since this script lives next to a real editable
install of that package. A real backend renderer would need its own small
solution-trace parser like `_parse_trace` below — no Python equivalent of the
frontend's `wizardMaze.ts#parseTrace` exists in `pickaxe_maze` yet.

Run from repo root (venv needs `reportlab` — see this folder's README):
    .venv/bin/python "Web App/spikes/pdf-renderer/backend/render_reportlab.py"
    .venv/bin/python "Web App/spikes/pdf-renderer/backend/render_reportlab.py" --answer-key
"""

import argparse
import json
import math
import re
import sys
from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "Maze-All-Contents" / "pickaxe-maze-creation"))

from pickaxe_maze.grid import parse_rows  # noqa: E402

SPIKE_DIR = Path(__file__).resolve().parents[1]
PAGE_W, PAGE_H = A4
MARGIN = 10 * mm

# pdf_design_spec.md §1 — the only three colors in the whole document.
INK = HexColor("#111111")
GRAY = HexColor("#9D9F9E")  # walls, outer border, dots, title banner, pill fill
WHITE = white

# pdf_design_spec.md §6.1/§6.2 — measured, not estimated.
BORDER_W = 1.6 * mm
WALL_W = 0.9 * mm
DOT_R = 1.1 * mm

MONTH_NAMES = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _parse_trace(trace, width):
    """Mirrors frontend/src/registry/pickaxe/wizardMaze.ts#parseTrace — no
    Python equivalent exists in pickaxe_maze yet (see module docstring)."""
    points = []
    for token in trace.split("->"):
        match = re.search(r"(\d+)", token)
        index = int(match.group(1)) - 1
        points.append((index % width, index // width))
    return points


def _polygon_points(cx, cy, n, r_outer, r_inner, phase=math.pi / 2):
    points = []
    for i in range(n * 2):
        angle = phase + i * math.pi / n
        r = r_outer if i % 2 == 0 else r_inner
        points.append((cx + r * math.cos(angle), cy + r * math.sin(angle)))
    return points


def _draw_polygon(c, points, fill=True, stroke=True):
    """reportlab's Canvas has no .polygon() — build a closed Path instead."""
    path = c.beginPath()
    path.moveTo(*points[0])
    for point in points[1:]:
        path.lineTo(*point)
    path.close()
    c.drawPath(path, fill=fill, stroke=stroke)


def draw_start_icon(c, cx, cy, size):
    """Walking stick figure — pdf_design_spec.md §6.3."""
    c.saveState()
    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    head_r = size * 0.14
    head_cy = cy + size * 0.28
    c.circle(cx, head_cy, head_r, stroke=1, fill=0)
    body_top = head_cy - head_r
    body_bottom = cy - size * 0.22
    c.line(cx, body_top, cx, body_bottom)
    c.line(cx, body_top - size * 0.08, cx - size * 0.18, body_top - size * 0.22)
    c.line(cx, body_top - size * 0.08, cx + size * 0.18, body_top - size * 0.22)
    c.line(cx, body_bottom, cx - size * 0.16, cy - size * 0.4)
    c.line(cx, body_bottom, cx + size * 0.16, cy - size * 0.4)
    c.restoreState()


def draw_goal_icon(c, cx, cy, size):
    """Pole + square frame + star — pdf_design_spec.md §6.3. The standard
    Goal icon for every real panel (question and answer-key alike); the
    cover's incorrect-example uses a *different*, deliberately "broken" flag
    (draw_broken_flag below) that must not be reused here."""
    c.saveState()
    c.setStrokeColor(INK)
    c.setFillColor(INK)
    pole_bottom = cy - size * 0.32
    pole_top = cy + size * 0.34
    c.setLineWidth(1.4)
    c.line(cx - size * 0.22, pole_bottom, cx - size * 0.22, pole_top)
    ball_r = size * 0.045
    c.circle(cx - size * 0.22, pole_top + ball_r, ball_r, stroke=0, fill=1)

    frame_size = size * 0.44
    frame_x = cx - size * 0.1
    frame_y = pole_top - frame_size
    c.setLineWidth(1.3)
    c.rect(frame_x, frame_y, frame_size, frame_size, stroke=1, fill=0)
    star = _polygon_points(frame_x + frame_size / 2, frame_y + frame_size / 2, 5, frame_size * 0.34, frame_size * 0.15)
    _draw_polygon(c, star, stroke=False, fill=True)
    c.restoreState()


def draw_broken_flag(c, cx, cy, size):
    """Deliberately "damaged" pennant flag — cover incorrect-example only
    (pdf_design_spec.md §5). Tilted triangular pennant, no square frame."""
    c.saveState()
    c.setStrokeColor(INK)
    c.setFillColor(INK)
    c.translate(cx, cy)
    c.rotate(-18)
    pole_bottom = -size * 0.32
    pole_top = size * 0.3
    c.setLineWidth(1.2)
    c.line(-size * 0.1, pole_bottom, -size * 0.1, pole_top)
    _draw_polygon(
        c,
        [(-size * 0.1, pole_top), (-size * 0.1, pole_top - size * 0.22), (size * 0.3, pole_top - size * 0.1)],
        stroke=True, fill=True,
    )
    c.restoreState()


def draw_laurel(c, cx, cy, half_h):
    """Plain ink-black laurel sprigs flanking the page number — pdf_design_spec.md
    §7 (corrects the first spike's colored-wreath guess). `cy`/`half_h` keep the
    whole sprig within the number box's own vertical span so it doesn't clip off
    the page margin above it."""
    c.saveState()
    c.setFillColor(INK)
    c.setStrokeColor(INK)
    c.setLineWidth(0.5)
    leaf_w, leaf_h = half_h * 0.32, half_h * 0.14
    for side in (-1, 1):
        stem_x = cx + side * half_h * 0.75
        points = [(stem_x, cy - half_h * 0.85 + i * half_h * 0.55) for i in range(4)]
        path = c.beginPath()
        path.moveTo(*points[0])
        for p in points[1:]:
            path.lineTo(*p)
        c.drawPath(path, stroke=1, fill=0)
        for lx, ly in points[1:]:
            c.saveState()
            c.translate(lx + side * leaf_w * 0.3, ly)
            c.rotate(side * 35)
            c.ellipse(-leaf_w / 2, -leaf_h / 2, leaf_w / 2, leaf_h / 2, stroke=0, fill=1)
            c.restoreState()
    c.restoreState()


def draw_pickaxe_icon(c, cx, cy, size):
    c.saveState()
    c.setStrokeColor(INK)
    c.setLineWidth(size * 0.16)
    c.setLineCap(1)
    c.line(cx - size * 0.28, cy - size * 0.32, cx + size * 0.3, cy + size * 0.32)
    c.setLineWidth(size * 0.22)
    c.line(cx - size * 0.4, cy + size * 0.1, cx - size * 0.08, cy + size * 0.42)
    c.restoreState()


def draw_bubble(c, x, y, w, h, tail="left", r=None):
    """Rounded-rect speech bubble with a small triangular tail, used for the
    pickaxe-count badge and (cover-only) the wall-break callout."""
    r = r or min(w, h) * 0.28
    c.roundRect(x, y, w, h, r, stroke=1, fill=1)
    if tail == "left":
        _draw_polygon(c, [(x, y + h * 0.65), (x, y + h * 0.35), (x - w * 0.18, y + h * 0.5)], stroke=1, fill=1)
    elif tail == "bottom-left":
        _draw_polygon(c, [(x + w * 0.15, y), (x + w * 0.35, y), (x - w * 0.05, y - h * 0.4)], stroke=1, fill=1)


def draw_pickaxe_badge(c, x, y, count):
    """Row of pickaxe icons + a speech-bubble count label, pdf_design_spec.md §6.4."""
    icon_size = 6 * mm
    c.setFillColor(INK)
    for i in range(count):
        draw_pickaxe_icon(c, x + icon_size * (i + 0.5), y + icon_size * 0.5, icon_size)
    bubble_x = x + icon_size * count + 3 * mm
    c.setFillColor(WHITE)
    c.setStrokeColor(INK)
    c.setLineWidth(1)
    draw_bubble(c, bubble_x, y, 9 * mm, icon_size, tail="left")
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(bubble_x + 4.5 * mm, y + icon_size * 0.32, str(count))
    return icon_size * count + 3 * mm + 9 * mm


def draw_sparkle(c, cx, cy, r):
    """8-point burst/sparkle outline marking a wall-break point — cover
    correct-example only (pdf_design_spec.md §5)."""
    c.saveState()
    c.setStrokeColor(GRAY)
    c.setFillColor(WHITE)
    c.setLineWidth(0.8)
    pts = _polygon_points(cx, cy, 8, r, r * 0.55)
    _draw_polygon(c, pts, stroke=True, fill=True)
    c.restoreState()


def draw_break_callout(c, tip_x, tip_y, size):
    """Pickaxe-in-bubble callout pointing at a wall-break point — cover
    correct-example only (pdf_design_spec.md §5)."""
    c.saveState()
    w, h = size, size * 0.85
    x = tip_x - w * 0.3
    y = tip_y + size * 0.35
    c.setFillColor(WHITE)
    c.setStrokeColor(GRAY)
    c.setLineWidth(1)
    draw_bubble(c, x, y, w, h, tail="bottom-left", r=size * 0.22)
    draw_pickaxe_icon(c, x + w / 2, y + h / 2, size * 0.55)
    c.restoreState()


def draw_wavy_path(c, points, cell_center_fn, thickness):
    """Rounded "hand-drawn road" stroke — cover correct-example only
    (pdf_design_spec.md §5); the real answer-key uses draw_straight_path."""
    c.saveState()
    c.setStrokeColor(INK)
    c.setLineWidth(thickness)
    c.setLineCap(1)
    c.setLineJoin(1)
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        x1, y1 = cell_center_fn(ax, ay)
        x2, y2 = cell_center_fn(bx, by)
        steps = 10
        prev = (x1, y1)
        for s in range(1, steps + 1):
            t = s / steps
            perp = math.sin(t * math.pi * 3) * thickness * 0.35
            dx, dy = x2 - x1, y2 - y1
            length = math.hypot(dx, dy) or 1
            nx, ny = -dy / length, dx / length
            px = x1 + dx * t + nx * perp
            py = y1 + dy * t + ny * perp
            c.line(*prev, px, py)
            prev = (px, py)
    c.restoreState()


def draw_straight_path(c, points, cell_center_fn, thickness):
    """Plain straight ink-black line — the real answer-key style
    (pdf_design_spec.md §8), distinct from the cover's wavy tutorial stroke."""
    c.saveState()
    c.setStrokeColor(INK)
    c.setLineWidth(thickness)
    c.setLineCap(0)
    c.setLineJoin(0)
    for (ax, ay), (bx, by) in zip(points, points[1:]):
        x1, y1 = cell_center_fn(ax, ay)
        x2, y2 = cell_center_fn(bx, by)
        c.line(x1, y1, x2, y2)
    c.restoreState()


def draw_maze_panel(c, maze_data, x0, y0, size, solution_trace=None, tutorial_decorations=False):
    """Bordered grid — walls only, no background grid (pdf_design_spec.md
    §6.2) — with S/G icons and an optional solution-path overlay.
    `tutorial_decorations` draws the cover-only sparkle/pickaxe-callout
    markers (§5) and must stay False for every real question/answer-key panel.
    """
    grid = parse_rows(maze_data["maze"])
    width, height = grid.width, grid.height
    cell_w, cell_h = size / width, size / height

    def lattice(gx, gy):
        return x0 + gx * cell_w, y0 + size - gy * cell_h

    def cell_center(cx, cy):
        left, top = lattice(cx, cy)
        return left + cell_w / 2, top - cell_h / 2

    # Path drawn before the border/wall pass so wall dots still render on top
    # of it, matching the sample's layered look.
    trace_points = _parse_trace(solution_trace, width) if solution_trace else None
    if trace_points and tutorial_decorations:
        draw_wavy_path(c, trace_points, cell_center, size * 0.045)
    elif trace_points:
        draw_straight_path(c, trace_points, cell_center, BORDER_W)

    c.setStrokeColor(GRAY)
    c.setLineWidth(BORDER_W)
    c.rect(x0, y0, size, size, stroke=1, fill=0)

    dot_points = set()
    c.setLineWidth(WALL_W)
    for gy in range(height):
        for gx in range(width):
            cell = grid.cell(gx, gy)
            if cell.right_wall:
                x, y1 = lattice(gx + 1, gy)
                _, y2 = lattice(gx + 1, gy + 1)
                c.line(x, y1, x, y2)
                if gy > 0:
                    dot_points.add((gx + 1, gy))
                if gy + 1 < height:
                    dot_points.add((gx + 1, gy + 1))
            if cell.bottom_wall:
                x1, y = lattice(gx, gy + 1)
                x2, _ = lattice(gx + 1, gy + 1)
                c.line(x1, y, x2, y)
                if gx > 0:
                    dot_points.add((gx, gy + 1))
                if gx + 1 < width:
                    dot_points.add((gx + 1, gy + 1))

    c.setFillColor(GRAY)
    for gx, gy in dot_points:
        px, py = lattice(gx, gy)
        c.circle(px, py, DOT_R, stroke=0, fill=1)

    if grid.start:
        cx, cy = cell_center(*grid.start)
        draw_start_icon(c, cx, cy, min(cell_w, cell_h) * 0.8)
    if grid.goal:
        cx, cy = cell_center(*grid.goal)
        draw_goal_icon(c, cx, cy, min(cell_w, cell_h) * 0.85)

    if tutorial_decorations and trace_points:
        pickaxes_left = maze_data["pickaxe_count"]
        for (ax, ay), (bx, by) in zip(trace_points, trace_points[1:]):
            wall = grid.wall_between(ax, ay, bx, by) if abs(ax - bx) + abs(ay - by) == 1 else None
            if wall:
                bx_mid, by_mid = (cell_center(ax, ay)[0] + cell_center(bx, by)[0]) / 2, (
                    cell_center(ax, ay)[1] + cell_center(bx, by)[1]
                ) / 2
                draw_sparkle(c, bx_mid, by_mid, min(cell_w, cell_h) * 0.18)
                if pickaxes_left > 0:
                    draw_break_callout(c, bx_mid, by_mid, min(cell_w, cell_h) * 0.5)
                    pickaxes_left -= 1



# --- Per-maze-type "question" composition -----------------------------
# A "question" is the full self-contained unit a page arranges N of — for
# PickAxe that's the pickaxe-count badge plus the maze panel beneath it
# (pdf_design_spec.md §6.4 + §6), not just the bare grid. A different maze
# type could compose an entirely different unit (no badge, a non-square
# panel, extra data-driven decoration) — this dict is the extensibility seam
# a real renderer needs as more maze types ship, mirroring the frontend
# registry's MazeTypeDefinition pattern (frontend/src/registry/mazeTypes.ts)
# instead of hardcoding PickAxe's layout into the page-composition function
# below. Today only "pickaxe" is registered, matching the backend's actual
# SUPPORTED_TYPES = {"pickaxe"} (Web App/docs/backend/backend_reference.md §4).

PICKAXE_BADGE_H = 10 * mm  # 6mm icon row + margin, pdf_design_spec.md §6.4


def pickaxe_question_height(box_size):
    """How tall one PickAxe question unit (badge + panel) is at a given
    panel width — the generic page composer needs this to lay out N
    questions without knowing anything PickAxe-specific."""
    return PICKAXE_BADGE_H + box_size


def draw_pickaxe_question(c, cx, top_y, box_size, question, answer_key=False, tutorial_decorations=False):
    """Draws one PickAxe question unit — badge above, maze panel below —
    centered horizontally at `cx` with its top edge at `top_y`. Returns the
    total height actually used, matching pickaxe_question_height. This is
    the one function a PickAxe-specific PDF question design lives in; a new
    maze type would add its own equivalent function + register it below
    rather than branch inside this one."""
    px = cx - box_size / 2
    badge_y = top_y - PICKAXE_BADGE_H + 2 * mm
    draw_pickaxe_badge(c, px, badge_y, question["maze"]["pickaxe_count"])
    panel_y = badge_y - box_size
    trace = question["solutionTrace"] if (answer_key or tutorial_decorations) else None
    draw_maze_panel(c, question["maze"], px, panel_y, box_size, trace, tutorial_decorations=tutorial_decorations)
    return pickaxe_question_height(box_size)


QUESTION_TYPES = {
    "pickaxe": {"height": pickaxe_question_height, "draw": draw_pickaxe_question},
}


def compose_question_page(c, maze_type, page_number, page, is_top_difficulty, answer_key=False):
    """Generic per-page layout — draws the shared page-number/wreath chrome
    (not maze-type-specific, every sheet gets this regardless of content),
    then arranges however many questions this row holds: big and centered
    for 1, smaller and stacked for 2 (pdf_design_spec.md §7), using whichever
    maze type's question unit is registered in QUESTION_TYPES. This function
    has NO PickAxe-specific knowledge — it only calls the registered
    `height`/`draw` functions, so a second maze type needs zero changes here."""
    number_box = 12.7 * mm
    box_x = MARGIN
    box_y = PAGE_H - MARGIN - number_box
    c.setStrokeColor(INK)
    c.setLineWidth(0.4)
    c.rect(box_x, box_y, number_box, number_box, stroke=1, fill=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(box_x + number_box / 2, box_y + number_box * 0.3, str(page_number))
    if is_top_difficulty:
        draw_laurel(c, box_x + number_box / 2, box_y + number_box * 0.5, number_box * 0.65)

    renderer = QUESTION_TYPES[maze_type]
    questions = page["questions"]
    n = len(questions)
    box_size = 150 * mm if n == 1 else 85 * mm
    gap = 14 * mm

    unit_h = renderer["height"](box_size)
    total_h = n * unit_h + (n - 1) * gap
    top_y = PAGE_H / 2 + total_h / 2

    for question in questions:
        used_h = renderer["draw"](c, PAGE_W / 2, top_y, box_size, question, answer_key=answer_key)
        top_y -= used_h + gap

    c.showPage()


def render_question_preview(question, maze_type, out_path, answer_key=False, box_size=120 * mm):
    """Standalone single-question preview — the per-maze-type unit in
    isolation, no page/badge/wreath chrome, no sheet context. Lets a new
    maze type's question design be built and checked on its own before it's
    ever arranged onto a sheet page (compose_question_page above), and lets
    an existing one be sanity-checked without regenerating a whole document."""
    c = canvas.Canvas(str(out_path), pagesize=A4)
    renderer = QUESTION_TYPES[maze_type]
    top_y = PAGE_H / 2 + renderer["height"](box_size) / 2
    renderer["draw"](c, PAGE_W / 2, top_y, box_size, question, answer_key=answer_key)
    c.showPage()
    c.save()


def draw_page_border(c):
    """Full-page ink-black rule, just inside the margin — cover/bonus pages
    only (pdf_design_spec.md §1); question pages have no page border."""
    c.setStrokeColor(INK)
    c.setLineWidth(1.2)
    c.rect(MARGIN * 0.5, MARGIN * 0.5, PAGE_W - MARGIN, PAGE_H - MARGIN, stroke=1, fill=0)


def draw_mascot_bust(c, cx, cy, size):
    """Hatenyan, bust/chest-height crop — title banner (pdf_design_spec.md §4).
    This company's own confirmed-safe-to-reproduce IP, simplified to flat
    vector shapes for this spike."""
    c.saveState()
    c.setFillColor(INK)
    head_r = size * 0.42
    c.circle(cx, cy + size * 0.15, head_r, stroke=0, fill=1)
    _draw_polygon(c, [(cx - head_r * 0.7, cy + head_r), (cx - head_r * 1.15, cy + head_r * 1.7), (cx - head_r * 0.15, cy + head_r * 1.15)], stroke=0, fill=1)
    _draw_polygon(c, [(cx + head_r * 0.7, cy + head_r), (cx + head_r * 1.15, cy + head_r * 1.7), (cx + head_r * 0.15, cy + head_r * 1.15)], stroke=0, fill=1)
    body_w, body_h = size * 0.85, size * 0.55
    c.roundRect(cx - body_w / 2, cy - body_h * 0.7, body_w, body_h, body_w * 0.2, stroke=0, fill=1)

    c.setFillColor(WHITE)
    eye_r = head_r * 0.22
    for side in (-1, 1):
        ex = cx + side * head_r * 0.42
        ey = cy + size * 0.18
        c.circle(ex, ey, eye_r, stroke=0, fill=1)
    c.setFillColor(INK)
    for side in (-1, 1):
        ex = cx + side * head_r * 0.42
        ey = cy + size * 0.18
        c.circle(ex, ey, eye_r * 0.45, stroke=0, fill=1)
        c.saveState()
        c.translate(ex, ey + eye_r * 1.6)
        c.rotate(side * 12)
        c.rect(-eye_r * 0.6, -eye_r * 0.12, eye_r * 1.2, eye_r * 0.24, stroke=0, fill=1)
        c.restoreState()

    c.setFillColor(HexColor("#f5f5f5"))
    c.ellipse(cx - head_r * 0.3, cy - head_r * 0.15, cx + head_r * 0.3, cy + head_r * 0.15, stroke=0, fill=1)

    c.setStrokeColor(INK)
    c.setLineWidth(size * 0.05)
    c.line(cx - size * 0.55, cy - size * 0.5, cx - size * 0.3, cy - size * 0.1)
    c.restoreState()


def draw_mascot_full(c, cx, cy, size):
    """Hatenyan, full-body pose with squinting >< eyes — bonus page
    (pdf_design_spec.md §9)."""
    c.saveState()
    c.setFillColor(HexColor("#d9d9d9"))
    c.ellipse(cx - size * 0.4, cy - size * 0.62, cx + size * 0.4, cy - size * 0.52, stroke=0, fill=1)

    c.setFillColor(INK)
    head_r = size * 0.32
    head_cy = cy + size * 0.05
    c.circle(cx, head_cy, head_r, stroke=0, fill=1)
    _draw_polygon(c, [(cx - head_r * 0.7, head_cy + head_r * 0.9), (cx - head_r * 1.15, head_cy + head_r * 1.6), (cx - head_r * 0.15, head_cy + head_r * 1.1)], stroke=0, fill=1)
    _draw_polygon(c, [(cx + head_r * 0.7, head_cy + head_r * 0.9), (cx + head_r * 1.15, head_cy + head_r * 1.6), (cx + head_r * 0.15, head_cy + head_r * 1.1)], stroke=0, fill=1)
    body_w, body_h = size * 0.6, size * 0.45
    c.roundRect(cx - body_w / 2, cy - size * 0.45, body_w, body_h, body_w * 0.25, stroke=0, fill=1)

    c.setFont("Helvetica-Bold", head_r * 0.5)
    c.setFillColor(WHITE)
    c.drawCentredString(cx - head_r * 0.4, head_cy - head_r * 0.12, ">")
    c.drawCentredString(cx + head_r * 0.4, head_cy - head_r * 0.12, "<")

    c.setFillColor(HexColor("#f5f5f5"))
    c.ellipse(cx - head_r * 0.28, head_cy - head_r * 0.35, cx + head_r * 0.28, head_cy - head_r * 0.05, stroke=0, fill=1)
    c.restoreState()


def draw_cover(c, fixture, cover_question):
    draw_page_border(c)
    header_top = PAGE_H - MARGIN - 6 * mm
    c.setFillColor(INK)
    c.setFont("Helvetica", 7)
    c.drawString(MARGIN + 2 * mm, header_top + 4 * mm, "Think! Think!")  # katakana placeholder
    c.setFont("Helvetica-Bold", 20)
    c.drawString(MARGIN + 2 * mm, header_top - 8 * mm, "Think!")
    c.drawString(MARGIN + 2 * mm, header_top - 16 * mm, "Think!")

    c.setFont("Helvetica", 11)
    c.drawString(MARGIN + 45 * mm, header_top - 4 * mm, "Name:")
    c.setStrokeColor(HexColor("#999999"))
    c.setDash(2, 2)
    c.setLineWidth(0.7)
    c.line(MARGIN + 62 * mm, header_top - 5 * mm, MARGIN + 130 * mm, header_top - 5 * mm)
    c.setDash()

    c.setStrokeColor(INK)
    c.setLineWidth(0.6)
    c.line(MARGIN + 135 * mm, header_top - 15 * mm, MARGIN + 135 * mm, header_top + 3 * mm)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    level_label = fixture["level"].capitalize()
    c.drawString(MARGIN + 140 * mm, header_top - 4 * mm, level_label)
    c.setFont("Helvetica-Bold", 10)
    period = f"{MONTH_NAMES[fixture['month']]} / Week{fixture['week']}"
    c.drawString(MARGIN + 140 * mm, header_top - 11 * mm, period)

    rule_y = header_top - 20 * mm
    c.setLineWidth(0.8)
    c.line(MARGIN, rule_y, PAGE_W - MARGIN, rule_y)

    banner_h = 20 * mm
    banner_top = rule_y - 5 * mm
    c.setFillColor(GRAY)
    c.rect(MARGIN, banner_top - banner_h, PAGE_W - 2 * MARGIN, banner_h, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 30)
    c.drawString(MARGIN + 8 * mm, banner_top - banner_h * 0.62, "Let's do it")
    draw_mascot_bust(c, PAGE_W - MARGIN - 20 * mm, banner_top - banner_h * 0.5, 16 * mm)

    box_top = banner_top - banner_h - 8 * mm
    box_h = 100 * mm
    box_left = MARGIN
    box_w = PAGE_W - 2 * MARGIN
    c.setStrokeColor(GRAY)
    c.setLineWidth(BORDER_W)
    c.roundRect(box_left, box_top - box_h, box_w, box_h, 5 * mm, stroke=1, fill=0)

    c.setFillColor(GRAY)
    c.roundRect(box_left + 6 * mm, box_top - 6 * mm, 30 * mm, 9 * mm, 3 * mm, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(box_left + 21 * mm, box_top - 4.2 * mm, "Direction")

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W / 2, box_top - 16 * mm, "Let's break the walls with a pickaxe and reach the goal!")

    panel_size = 52 * mm
    panel_y = box_top - box_h + 14 * mm
    left_x = box_left + 14 * mm
    # Reuses the same registered PickAxe question unit as every real question
    # page (draw_pickaxe_question below) — the cover's "correct example" is
    # literally one instance of it, just smaller and with tutorial_decorations
    # turned on, not a separately-coded illustration.
    draw_pickaxe_question(
        c, left_x + panel_size / 2, panel_y + panel_size + PICKAXE_BADGE_H, panel_size,
        cover_question, tutorial_decorations=True,
    )

    right_x = box_left + box_w - panel_size - 14 * mm
    cross_r = 9 * mm
    cross_cx = (left_x + panel_size + right_x) / 2
    c.setStrokeColor(GRAY)
    c.setFillColor(GRAY)
    c.circle(cross_cx, panel_y + panel_size * 0.75, cross_r, stroke=0, fill=1)
    c.setStrokeColor(WHITE)
    c.setLineWidth(2.2)
    c.line(cross_cx - cross_r * 0.5, panel_y + panel_size * 0.75 - cross_r * 0.5, cross_cx + cross_r * 0.5, panel_y + panel_size * 0.75 + cross_r * 0.5)
    c.line(cross_cx - cross_r * 0.5, panel_y + panel_size * 0.75 + cross_r * 0.5, cross_cx + cross_r * 0.5, panel_y + panel_size * 0.75 - cross_r * 0.5)
    c.setFillColor(INK)
    c.setFont("Helvetica", 8)
    c.drawString(right_x, panel_y + panel_size * 0.35, "You can only break the same")
    c.drawString(right_x, panel_y + panel_size * 0.28, "number of walls as the")
    c.drawString(right_x, panel_y + panel_size * 0.21, "pickaxes you have.")

    c.showPage()



# draw_question_page / draw_answer_key_page used to live here as two
# hand-duplicated, PickAxe-hardcoded page-layout functions. Replaced by the
# generic compose_question_page (above, alongside QUESTION_TYPES) — both the
# question and answer-key variant now go through the same function, since the
# only difference is the `answer_key` flag it forwards to the registered
# question renderer.


def draw_bonus_page(c):
    draw_page_border(c)
    ribbon_w, ribbon_h = 60 * mm, 14 * mm
    ribbon_x, ribbon_y = MARGIN + 3 * mm, PAGE_H - MARGIN - 6 * mm - ribbon_h
    c.setFillColor(GRAY)
    notch = 4 * mm
    _draw_polygon(
        c,
        [
            (ribbon_x, ribbon_y), (ribbon_x + ribbon_w, ribbon_y),
            (ribbon_x + ribbon_w - notch, ribbon_y + ribbon_h / 2), (ribbon_x + ribbon_w, ribbon_y + ribbon_h),
            (ribbon_x, ribbon_y + ribbon_h), (ribbon_x + notch, ribbon_y + ribbon_h / 2),
        ],
        stroke=False, fill=True,
    )
    c.setFillColor(WHITE)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(ribbon_x + ribbon_w / 2, ribbon_y + ribbon_h / 2 - 4, "Bonus Challenge")

    title_y = ribbon_y - 16 * mm
    c.setFont("Helvetica-Bold", 24)
    for dx, dy in [(-0.6, 0), (0.6, 0), (0, -0.6), (0, 0.6), (-0.4, -0.4), (0.4, 0.4), (-0.4, 0.4), (0.4, -0.4)]:
        c.setFillColor(WHITE)
        c.drawCentredString(PAGE_W / 2 + dx, title_y + dy, "Be a mission maker!")
    c.setFillColor(INK)
    c.drawCentredString(PAGE_W / 2, title_y, "Be a mission maker!")

    sub_y = title_y - 8 * mm
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W / 2, sub_y, "Let's create your own original mission!")
    text_w = c.stringWidth("Let's create your own original mission!", "Helvetica-Bold", 11)
    c.setLineWidth(0.8)
    c.line(PAGE_W / 2 - text_w / 2 - 20 * mm, sub_y + 3, PAGE_W / 2 - text_w / 2 - 6 * mm, sub_y + 3)
    c.line(PAGE_W / 2 + text_w / 2 + 6 * mm, sub_y + 3, PAGE_W / 2 + text_w / 2 + 20 * mm, sub_y + 3)

    footer_y = MARGIN + 55 * mm
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(INK)
    c.drawCentredString(PAGE_W / 2, footer_y, "I did it!")
    draw_mascot_full(c, PAGE_W / 2, footer_y - 30 * mm, 40 * mm)

    c.showPage()


def render(fixture, out_path, answer_key):
    c = canvas.Canvas(str(out_path), pagesize=A4)
    cover_question = fixture["pages"][0]["questions"][0]
    draw_cover(c, fixture, cover_question)

    question_pages = fixture["pages"][1:]
    max_star = max(q["difficulty_star"] for page in question_pages for q in page["questions"])
    for i, page in enumerate(question_pages, start=1):
        is_top = any(q["difficulty_star"] == max_star for q in page["questions"])
        compose_question_page(c, fixture["mazeType"], i, page, is_top, answer_key=answer_key)

    draw_bonus_page(c)
    c.save()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--answer-key", action="store_true", help="overlay each panel's solution path")
    parser.add_argument("--fixture", default=str(SPIKE_DIR / "sample_fixture.json"))
    parser.add_argument("--out", default=None)
    parser.add_argument(
        "--preview-question", type=int, default=None,
        help="render ONE question (0-based index into the flattened pages[].questions[]) in isolation, "
        "no sheet/page chrome — proves out a maze type's question unit before it's arranged onto a page",
    )
    args = parser.parse_args()

    fixture = json.loads(Path(args.fixture).read_text())

    if args.preview_question is not None:
        all_questions = [q for page in fixture["pages"] for q in page["questions"]]
        question = all_questions[args.preview_question]
        suffix = "_answer_key" if args.answer_key else ""
        out_path = Path(args.out) if args.out else SPIKE_DIR / "output" / f"question_preview_{args.preview_question}{suffix}.pdf"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        render_question_preview(question, fixture["mazeType"], out_path, answer_key=args.answer_key)
        print(f"wrote {out_path}")
        return

    out_name = "output_answer_key.pdf" if args.answer_key else "output_question.pdf"
    out_path = Path(args.out) if args.out else SPIKE_DIR / "output" / out_name
    out_path.parent.mkdir(parents=True, exist_ok=True)

    render(fixture, out_path, args.answer_key)
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
