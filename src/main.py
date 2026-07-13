"""CinePrism AI Main Pipeline: read /input/tasks.json, caption each video concurrently, write /output/results.json."""
import json
import os
import sys
import traceback
from concurrent.futures import ProcessPoolExecutor

from agent import VideoCaptioningAgent

INPUT_PATH = os.environ.get("INPUT_PATH", "/input/tasks.json")
OUTPUT_PATH = os.environ.get("OUTPUT_PATH", "/output/results.json")
MAX_WORKERS = int(os.environ.get("MAX_WORKERS", "12"))


def run_task(task_and_index: tuple) -> dict:
    task, index = task_and_index
    task_id = task["task_id"]
    styles = task["styles"]
    use_ai_studio = False
    try:
        agent = VideoCaptioningAgent(use_ai_studio=use_ai_studio)
        captions = agent.caption_video(task["video_url"], styles)
    except Exception:
        print(f"[{task_id}] FAILED: {traceback.format_exc()}", file=sys.stderr)
        captions = {s: "" for s in styles}
    return {"task_id": task_id, "captions": captions}


def main() -> int:
    with open(INPUT_PATH, "r") as f:
        tasks = json.load(f)

    tasks_with_index = [(task, i) for i, task in enumerate(tasks)]

    # Clips are independent; run them in parallel to stay inside the 10-minute cap.
    with ProcessPoolExecutor(max_workers=max(1, min(MAX_WORKERS, len(tasks)))) as pool:
        results = list(pool.map(run_task, tasks_with_index))

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(results, f, indent=2)

    return 0


if __name__ == "__main__":
    sys.exit(main())
