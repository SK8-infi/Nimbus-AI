"""CinePrism AI: Multi-Style Video Captioning Agent using Google ADK."""
import os
import tempfile
import json
import asyncio
import requests
import time
from dotenv import load_dotenv
import re


from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import BaseModel, Field

class AllCaptions(BaseModel):
    formal: str = Field(description="The formal style caption.")
    sarcastic: str = Field(description="The sarcastic style caption.")
    humorous_tech: str = Field(description="The humorous_tech style caption.")
    humorous_non_tech: str = Field(description="The humorous_non_tech style caption.")

class SingleCaption(BaseModel):
    caption: str = Field(description="The final regenerated caption in the requested style.")

class CaptionEvaluation(BaseModel):
    formal_critique: str = Field(description="Critique explaining any inaccuracies, tone errors, or boring writing. Write 'NONE' if absolutely perfect.")
    formal_passed: bool = Field(description="True only if the caption is completely flawless, highly creative, accurate, and ready to ship. False if there are any areas of improvement.")
    
    sarcastic_critique: str = Field(description="Critique explaining any inaccuracies, tone errors, or boring writing. Write 'NONE' if absolutely perfect.")
    sarcastic_passed: bool = Field(description="True only if the caption is completely flawless, highly creative, accurate, and ready to ship. False if there are any areas of improvement.")
    
    humorous_tech_critique: str = Field(description="Critique explaining any inaccuracies, tone errors, or boring writing. Write 'NONE' if absolutely perfect.")
    humorous_tech_passed: bool = Field(description="True only if the caption is completely flawless, highly creative, accurate, and ready to ship. False if there are any areas of improvement.")
    
    humorous_non_tech_critique: str = Field(description="Critique explaining any inaccuracies, tone errors, or boring writing. Write 'NONE' if absolutely perfect.")
    humorous_non_tech_passed: bool = Field(description="True only if the caption is completely flawless, highly creative, accurate, and ready to ship. False if there are any areas of improvement.")

# Initialize environment configurations and load variables
load_dotenv()

def clean_special_characters(text: str) -> str:
    if not text:
        return ""
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("—", "-").replace("–", "-")
    # Strip non-ASCII/emojis
    text = text.encode("ascii", "ignore").decode("ascii")
    # Clean double spaces
    text = " ".join(text.split())
    return text

STYLE_GUIDE = {
    "formal": "",
    "sarcastic": "",
    "humorous_tech": "",
    "humorous_non_tech": "",
}

PERSONAS = {
    "formal": "",
    "sarcastic": "",
    "humorous_tech": "",
    "humorous_non_tech": ""
}

CAPTION_EXEMPLARS = {
    "formal": [],
    "sarcastic": [],
    "humorous_tech": [],
    "humorous_non_tech": []
}

DESCRIBE_PROMPT = ""

DETAILED_DESCRIBE_PROMPT = ""

CONSENSUS_JUDGE_PROMPT = "{desc1} {desc2} {desc3} {desc4}"

EVALUATE_PROMPT = "{captions_block}"


class VideoCaptioningAgent:
    def __init__(self, use_ai_studio: bool = False):
        self.use_ai_studio = use_ai_studio
        self.studio_key = os.environ.get("STUDIO_KEY", "")
        self.ai_key = os.environ.get("AI_KEY", "")
        self.project_id = os.environ.get("PROJECT_ID", "")
        self.location = os.environ.get("GCP_LOCATION", "asia-northeast1")
        self.model_id = os.environ.get("GEMINI_MODEL_ID", "gemini-3.5-flash")

        if self.use_ai_studio:
            print("[AGENT] Routing worker to Google AI Studio API")
            # Clear Vertex credentials in this process environment
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            os.environ.pop("PROJECT_ID", None)
            os.environ["GEMINI_API_KEY"] = self.studio_key
            # Use bare model name for AI Studio
            if self.model_id.startswith("projects/"):
                self.model_id = self.model_id.split("/")[-1]
        else:
            print("[AGENT] Routing worker to GCP Vertex AI")
            # Clear AI Studio credentials in this process environment
            os.environ.pop("GEMINI_API_KEY", None)

            # GCP Vertex AI doesn't support gemini-3.5-flash natively in this pipeline/region
            # Force fall back to gemini-3.1-flash-lite for GCP workers
            if "3.5-flash" in self.model_id.lower():
                if self.location != "asia-northeast1":
                    print(f"[AGENT] GCP Vertex AI does not support gemini-3.5-flash or Gemma models in {self.location}. Falling back to gemini-3.1-flash-lite.")
                    self.model_id = "gemini-3.1-flash-lite"

            # Map credentials dynamically
            if self.ai_key:
                # Handle Base64 encoded keys to prevent shell/quote parsing issues
                if not self.ai_key.strip().startswith("{"):
                    try:
                        import base64
                        decoded = base64.b64decode(self.ai_key.strip()).decode("utf-8")
                        if decoded.strip().startswith("{"):
                            json.loads(decoded)
                            self.ai_key = decoded
                    except Exception:
                        pass

                if self.ai_key.strip().startswith("{"):
                    try:
                        # Parse to ensure it is valid JSON
                        json.loads(self.ai_key)
                        # Write to a secure temp path
                        temp_dir = tempfile.gettempdir()
                        temp_path = os.path.join(temp_dir, "gcp_service_account.json")
                        with open(temp_path, "w") as f:
                            f.write(self.ai_key)
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
                    except Exception:
                        pass
                else:
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.ai_key

            # Construct the Vertex AI model resource path if PROJECT_ID is provided
            if self.project_id:
                if not self.model_id.startswith("projects/"):
                    self.model_id = f"projects/{self.project_id}/locations/{self.location}/publishers/google/models/{self.model_id}"

    def toggle_backend(self):
        # We can only toggle if both credentials exist
        if not self.studio_key or not self.ai_key:
            return
        self.use_ai_studio = not self.use_ai_studio
        print(f"[AGENT] Toggling backend. New backend: {'Google AI Studio' if self.use_ai_studio else 'GCP Vertex AI'}", flush=True)

        if self.use_ai_studio:
            # Clear Vertex credentials in this process environment
            os.environ.pop("GOOGLE_APPLICATION_CREDENTIALS", None)
            os.environ.pop("PROJECT_ID", None)
            os.environ["GEMINI_API_KEY"] = self.studio_key
            # Fallback back to original configured model ID (or gemma-4-31b-it if we started with gemma)
            orig_model = os.environ.get("GEMINI_MODEL_ID", "gemini-3.5-flash")
            if orig_model.startswith("projects/"):
                orig_model = orig_model.split("/")[-1]
            self.model_id = orig_model
        else:
            # Clear AI Studio credentials in this process environment
            os.environ.pop("GEMINI_API_KEY", None)
            if self.project_id:
                os.environ["PROJECT_ID"] = self.project_id

            # Map credentials dynamically
            if self.ai_key:
                temp_dir = tempfile.gettempdir()
                temp_path = os.path.join(temp_dir, "gcp_service_account.json")
                if os.path.exists(temp_path):
                    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
                else:
                    if self.ai_key.strip().startswith("{"):
                        try:
                            with open(temp_path, "w") as f:
                                f.write(self.ai_key)
                            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = temp_path
                        except Exception:
                            pass
                    else:
                        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = self.ai_key

            # Fall back to stable gemini-3.1-flash-lite or gemini-3.1-pro on Vertex AI
            orig_model = os.environ.get("GEMINI_MODEL_ID", "gemini-3.5-flash")
            if "pro" in orig_model.lower():
                self.model_id = "gemini-3.1-pro"
            else:
                if self.location == "asia-northeast1":
                    self.model_id = "gemini-3.5-flash"
                else:
                    self.model_id = "gemini-3.1-flash-lite"
            if self.project_id:
                self.model_id = f"projects/{self.project_id}/locations/{self.location}/publishers/google/models/{self.model_id}"

    def download_video(self, url: str, dest_path: str, timeout: int = 120) -> None:
        with requests.get(url, stream=True, timeout=timeout) as r:
            r.raise_for_status()
            with open(dest_path, "wb") as f:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    f.write(chunk)

    def _describe_video_bytes(self, video_bytes: bytes, instruction_prompt: str, max_tokens: int = 1024) -> str:
        parts = [
            types.Part.from_bytes(
                data=video_bytes,
                mime_type="video/mp4"
            ),
            types.Part.from_text(text=instruction_prompt)
        ]

        async def _run():
            agent = LlmAgent(
                name="video_describer",
                model=self.model_id,
                instruction="",
                generate_content_config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="high")
                )
            )
            message = types.Content(role="user", parts=parts)
            runner = InMemoryRunner(agent=agent)
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id="user")
            
            final_text = ""
            async for event in runner.run_async(
                user_id="user",
                session_id=session.id,
                new_message=message
            ):
                if event.is_final_response():
                    if event.content and event.content.parts:
                        final_text = event.content.parts[0].text
            return final_text

        return asyncio.run(_run())


    def describe_video(self, video_url: str) -> str:
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = os.path.join(tmp_dir, "clip.mp4")
            self.download_video(video_url, video_path)
            with open(video_path, "rb") as f:
                video_bytes = f.read()
            return self._describe_video_bytes(video_bytes, DESCRIBE_PROMPT)

    def describe_video_detailed(self, video_url: str) -> str:
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = os.path.join(tmp_dir, "clip.mp4")
            self.download_video(video_url, video_path)
            with open(video_path, "rb") as f:
                video_bytes = f.read()
            return self._describe_video_bytes(video_bytes, DETAILED_DESCRIBE_PROMPT, max_tokens=2048)

    def _all_styles_prompt(self, description: str, styles: list[str]) -> str:
        return f"{description}"

    def _generate_all_styles(self, description: str, styles: list[str]) -> dict:
        """Generate captions for all styles in a single LLM call."""
        prompt = self._all_styles_prompt(description, styles)

        async def _run():
            agent = LlmAgent(
                name="all_styles_captioner",
                model=self.model_id,
                instruction="",
                output_schema=AllCaptions,
                generate_content_config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="high")
                )
            )
            message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
            runner = InMemoryRunner(agent=agent)
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id="user")

            final_text = ""
            async for event in runner.run_async(
                user_id="user",
                session_id=session.id,
                new_message=message
            ):
                if event.is_final_response():
                    if event.content and event.content.parts:
                        final_text = event.content.parts[0].text

            res_dict = json.loads(final_text)
            result = {}
            for s in styles:
                caption = res_dict.get(s, "").strip()
                result[s] = clean_special_characters(caption)
            return result

        return asyncio.run(_run())

    def _evaluate_captions(self, video_bytes: bytes, captions: dict, styles: list[str]) -> dict:
        """Evaluate captions against the actual video. Returns {style: {accuracy, style_match}}."""
        captions_block = ""
        for s in styles:
            captions_block += f'<caption style="{s}">\n{captions.get(s, "")}\n</caption>\n\n'

        eval_prompt = EVALUATE_PROMPT.format(captions_block=captions_block)

        parts = [
            types.Part.from_bytes(data=video_bytes, mime_type="video/mp4"),
            types.Part.from_text(text=eval_prompt)
        ]

        async def _run():
            agent = LlmAgent(
                name="caption_evaluator",
                model=self.model_id,
                instruction="",
                output_schema=CaptionEvaluation,
                generate_content_config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="high")
                )
            )
            message = types.Content(role="user", parts=parts)
            runner = InMemoryRunner(agent=agent)
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id="user")

            final_text = ""
            async for event in runner.run_async(
                user_id="user",
                session_id=session.id,
                new_message=message
            ):
                if event.is_final_response():
                    if event.content and event.content.parts:
                        final_text = event.content.parts[0].text

            eval_dict = json.loads(final_text)
            scores = {}
            for s in styles:
                scores[s] = {
                    "passed": eval_dict.get(f"{s}_passed", True),
                    "critique": eval_dict.get(f"{s}_critique", "")
                }
            return scores

        return asyncio.run(_run())

    def _regenerate_caption(self, description: str, style: str, feedback: str) -> str:
        """Regenerate a single caption for a failing style with targeted feedback."""
        style_guide = STYLE_GUIDE.get(style, "")
        persona = PERSONAS.get(style, "")
        exemplars = CAPTION_EXEMPLARS.get(style, [])
        ex_block = ""
        if exemplars:
            ex_lines = "\n".join(f'- "{e}"' for e in exemplars)
            ex_block = f"Tone calibration examples for reference:\n{ex_lines}\n"

        prompt = f"{description} {feedback}"

        async def _run():
            agent = LlmAgent(
                name="caption_regenerator",
                model=self.model_id,
                instruction="",
                output_schema=SingleCaption,
                generate_content_config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="high")
                )
            )
            message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
            runner = InMemoryRunner(agent=agent)
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id="user")

            final_text = ""
            async for event in runner.run_async(
                user_id="user",
                session_id=session.id,
                new_message=message
            ):
                if event.is_final_response():
                    if event.content and event.content.parts:
                        final_text = event.content.parts[0].text
            
            res_dict = json.loads(final_text)
            return res_dict.get("caption", "").strip()

        return asyncio.run(_run())

    def caption_video(self, video_url: str, styles: list[str]) -> dict:
        """Downloads the video and generates styled captions in a single call."""
        empty_result = {s: "" for s in styles}
        max_retries = 15
        base_delay = 5

        # Download video bytes
        video_bytes = None
        with tempfile.TemporaryDirectory() as tmp_dir:
            video_path = os.path.join(tmp_dir, "clip.mp4")
            for attempt in range(max_retries):
                try:
                    self.download_video(video_url, video_path)
                    with open(video_path, "rb") as f:
                        video_bytes = f.read()
                    break
                except Exception as e:
                    print(f"Failed to download video on attempt {attempt+1}: {e}")
                    if attempt == max_retries - 1:
                        return empty_result
                    time.sleep(min(30, base_delay * (2 ** attempt)))

        if not video_bytes:
            return empty_result

        # Call Gemini with video bytes and the instruction prompt
        prompt = """Analyze the video and understand the scene as a coherent whole.
First, extract the 2–4 most salient entities/actions from the video. Then, write a single caption that mentions at least one of them.
For creative and humorous styles, you must anchor your metaphors and narratives in specific visual details from the video (e.g., instead of a generic joke, incorporate specific visible elements like the river, sunset colors, unique subjects, or actions directly into the humorous or sarcastic narrative). Do not provide scene-specific examples or stock jokes.

Follow these style-specific directives:
- formal: "Write one sentence in a professional, objective tone that summarizes the most salient subjects, setting, and action in the video. Be specific and factual; do not add interpretation or humor."
- sarcastic: "Write one sentence that accurately reflects the scene while making a light, ironic observation. Use original sarcasm rather than stock phrases, and avoid contradicting the visible content."
- humorous_tech: "Write one sentence that describes the scene through an original computing or engineering metaphor. Use technical vocabulary naturally, while keeping the underlying scene recognizable."
- humorous_non_tech: "Write one sentence with a playful, everyday joke, analogy, or personification inspired by the scene. Keep the humor relatable and grounded in what is visible."
"""

        parts = [
            types.Part.from_bytes(data=video_bytes, mime_type="video/mp4"),
            types.Part.from_text(text=prompt)
        ]

        async def _run():
            agent = LlmAgent(
                name="video_captioner",
                model=self.model_id,
                instruction="You are a helpful assistant that generates styled video captions based on the instructions.",
                output_schema=AllCaptions,
                generate_content_config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_level="high")
                )
            )
            message = types.Content(role="user", parts=parts)
            runner = InMemoryRunner(agent=agent)
            session = await runner.session_service.create_session(app_name=runner.app_name, user_id="user")

            final_text = ""
            async for event in runner.run_async(
                user_id="user",
                session_id=session.id,
                new_message=message
            ):
                if event.is_final_response():
                    if event.content and event.content.parts:
                        final_text = event.content.parts[0].text

            res_dict = json.loads(final_text)
            result = {}
            for s in styles:
                caption = res_dict.get(s, "").strip()
                result[s] = clean_special_characters(caption)
            return result

        for attempt in range(max_retries):
            try:
                return asyncio.run(_run())
            except Exception as e:
                print(f"Failed to generate captions on attempt {attempt+1}: {e}")
                self.toggle_backend()
                if attempt == max_retries - 1:
                    return empty_result
                time.sleep(min(30, base_delay * (2 ** attempt)))

        return empty_result

