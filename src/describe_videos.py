"""Local-only helper: print/save a long, detailed factual description for each task's
video. Uses its own richer prompt. Not part of the graded pipeline."""
import json
import os
import sys

from agent import VideoCaptioningAgent

INPUT_PATH = os.environ.get("INPUT_PATH", "/input/tasks.json")
OUTPUT_PATH = os.environ.get("DESCRIBE_OUTPUT_PATH", "descriptions.json")


def main() -> int:
    with open(INPUT_PATH, "r") as f:
        tasks = json.load(f)

    # Initialize the unified agent
    agent = VideoCaptioningAgent()

    results = []
    for task in tasks:
        task_id = task["task_id"]
        video_url = task["video_url"]
        print(f"[{task_id}] describing...", file=sys.stderr)
        description = agent.describe_video_detailed(video_url)
        print(f"[{task_id}] {description}\n", file=sys.stderr)
        results.append({"task_id": task_id, "description": description})

    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    return 0


if __name__ == "__main__":
    sys.exit(main())
