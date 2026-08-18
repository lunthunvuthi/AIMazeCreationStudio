"""Command-line entry points for generating and validating PickAxe Mazes.

Three subcommands, backed entirely by generator.py / validator.py:
  pickaxe-maze generate        one maze -> JSON, in output/
  pickaxe-maze generate-level  a full level's questions -> a LevelProgress
                                JSON (Web App/development_plan.md §4.3), in output/
  pickaxe-maze validate        a MazeData or LevelProgress JSON (typically
                                from input/) -> a Markdown report next to it
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .difficulty import LEVEL_DISTRIBUTIONS, STAR_PARAMS
from .generator import GenerationError, generate_maze
from .models import MazeData
from .validator import validate_maze

PROJECT_DIR = Path(__file__).resolve().parent.parent  # "pickaxe-maze-creation/"
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "output"
DEFAULT_INPUT_DIR = PROJECT_DIR / "input"


def _timestamp():
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def _write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n")


def cmd_generate(args):
    try:
        result = generate_maze(
            star=args.star, sg_seed=args.sg_seed, path_seed=args.path_seed, wall_seed=args.wall_seed
        )
    except GenerationError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    timestamp = _timestamp()
    out_path = args.out or (DEFAULT_OUTPUT_DIR / f"star{args.star}_{timestamp}.json")
    data = {
        "question_id": f"star{args.star}-{timestamp}",
        "difficulty_star": args.star,
        **result.maze.to_dict(),
        "solutionTrace": result.solution_trace,
        "seeds": {"sgSeed": result.sg_seed, "pathSeed": result.path_seed, "wallSeed": result.wall_seed},
    }
    _write_json(out_path, data)
    print(f"wrote {out_path}")
    return 0


def cmd_generate_level(args):
    stars = LEVEL_DISTRIBUTIONS[args.level]
    star_occurrence = {}
    questions = []
    for star in stars:
        star_occurrence[star] = star_occurrence.get(star, 0) + 1
        question_id = f"{args.level}-{star}star-{star_occurrence[star]}"
        try:
            result = generate_maze(star=star)
        except GenerationError as e:
            print(f"error generating {question_id}: {e}", file=sys.stderr)
            return 1
        questions.append(
            {
                "question_id": question_id,
                "difficulty_star": star,
                "status": "complete",
                "origin": "random",
                "maze": result.maze.to_dict(),
                "solutionTrace": result.solution_trace,
                "seeds": {
                    "sgSeed": result.sg_seed,
                    "pathSeed": result.path_seed,
                    "wallSeed": result.wall_seed,
                },
            }
        )
        print(f"generated {question_id}")

    now = datetime.now(timezone.utc).isoformat()
    level_progress = {
        "formatVersion": 1,
        "mazeType": "pickaxe",
        "level": args.level,
        "questions": questions,
        "createdAt": now,
        "updatedAt": now,
    }
    out_path = args.out or (DEFAULT_OUTPUT_DIR / f"{args.level}_{_timestamp()}.json")
    _write_json(out_path, level_progress)
    print(f"wrote {out_path}")
    return 0


def _report_for_maze(maze_data: MazeData) -> tuple[bool, list]:
    result = validate_maze(maze_data)
    lines = []
    if result.solution_count == 1:
        lines.append("**Result:** ✅ VALID — unique solution found")
    elif result.solution_count == 0:
        lines.append("**Result:** ❌ INVALID — no solution found")
    else:
        lines.append(f"**Result:** ❌ INVALID — {result.solution_count} solutions found (not unique)")
    lines.append("")
    lines.append(f"- Grid: {maze_data.width}x{maze_data.height}")
    lines.append(f"- Pickaxe count: {maze_data.pickaxe_count}")
    if result.trace:
        lines.append(f"- Solution trace: `{result.trace}`")
    if result.diagnostic:
        lines.append(f"- Diagnostic: {result.diagnostic}")
    if result.conflicting_paths:
        lines.append("- Conflicting paths:")
        for p in result.conflicting_paths:
            lines.append(f"  - `{p}`")
    return result.solution_count == 1, lines


def _build_single_maze_report(name, maze_data):
    ok, body_lines = _report_for_maze(maze_data)
    return "\n".join([f"# Validation Report: {name}", "", *body_lines]) + "\n"


def _build_level_report(name, level_progress):
    questions = level_progress.get("questions", [])
    rows = ["| Question ID | Star | Status | Result |", "|---|---|---|---|"]
    details = []
    valid_count = 0
    checked_count = 0

    for q in questions:
        qid = q.get("question_id", "?")
        star = q.get("difficulty_star", "?")
        status = q.get("status", "?")
        maze_dict = q.get("maze")
        if maze_dict is None:
            rows.append(f"| {qid} | {star} | {status} | _skipped (no maze)_ |")
            continue
        checked_count += 1
        maze_data = MazeData.from_dict(maze_dict)
        ok, body_lines = _report_for_maze(maze_data)
        if ok:
            valid_count += 1
        rows.append(f"| {qid} | {star} | {status} | {'✅ valid' if ok else '❌ invalid'} |")
        details.append(f"### {qid} ({star}★)\n\n" + "\n".join(body_lines))

    skipped = len(questions) - checked_count
    summary = f"**Summary:** {valid_count}/{checked_count} checked questions valid"
    if skipped:
        summary += f" ({skipped} skipped, no maze yet)"

    lines = [
        f"# Validation Report: {name}",
        "",
        f"**Level:** {level_progress.get('level', '?')}",
        summary,
        "",
        *rows,
    ]
    if details:
        lines += ["", "## Details", "", *[d + "\n" for d in details]]
    return "\n".join(lines) + "\n"


def cmd_validate(args):
    if not args.path.exists():
        print(f"error: {args.path} does not exist", file=sys.stderr)
        return 1

    data = json.loads(args.path.read_text())
    if "questions" in data:
        report = _build_level_report(args.path.name, data)
    else:
        report = _build_single_maze_report(args.path.name, MazeData.from_dict(data))

    out_dir = args.out_dir or args.path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / f"{args.path.stem}_report.md"
    report_path.write_text(report)
    print(f"wrote {report_path}")
    return 0


def build_parser():
    parser = argparse.ArgumentParser(prog="pickaxe-maze")
    sub = parser.add_subparsers(dest="command", required=True)

    gen = sub.add_parser("generate", help="Generate a single maze and write it as JSON")
    gen.add_argument("--star", type=int, required=True, choices=sorted(STAR_PARAMS))
    gen.add_argument("--sg-seed", type=int, default=None)
    gen.add_argument("--path-seed", type=int, default=None)
    gen.add_argument("--wall-seed", type=int, default=None)
    gen.add_argument("--out", type=Path, default=None, help="default: output/star<N>_<timestamp>.json")
    gen.set_defaults(func=cmd_generate)

    genlevel = sub.add_parser(
        "generate-level", help="Generate a full level's questions as a LevelProgress JSON"
    )
    genlevel.add_argument("--level", choices=sorted(LEVEL_DISTRIBUTIONS), required=True)
    genlevel.add_argument("--out", type=Path, default=None, help="default: output/<level>_<timestamp>.json")
    genlevel.set_defaults(func=cmd_generate_level)

    val = sub.add_parser(
        "validate", help="Validate a MazeData or LevelProgress JSON and write a Markdown report"
    )
    val.add_argument("path", type=Path, help="e.g. input/star3.json")
    val.add_argument("--out-dir", type=Path, default=None, help="default: next to the input file")
    val.set_defaults(func=cmd_validate)

    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
