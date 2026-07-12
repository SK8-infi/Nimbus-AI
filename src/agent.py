"""CinePrism AI: Multi-Style Video Captioning Agent using Google ADK."""
import os
import tempfile
import json
import asyncio
import requests
from dotenv import load_dotenv

from google.adk.agents import LlmAgent
from google.adk.runners import InMemoryRunner
from google.genai import types
from pydantic import create_model

# Initialize environment configurations and load variables
load_dotenv()

STYLE_GUIDE = {
    "formal": (
        "Cinematic, authoritative, and evocative. Write with the gravitas of a Pulitzer-winning photojournalist or a high-end BBC documentary narrator. Use elevated, precise vocabulary and focus heavily on the interplay of light, subject, and environment."
    ),
    "sarcastic": (
        "Bitingly cynical, dry, and brutally deadpan. Channel the tone of a deeply unimpressed, world-weary critic. Use sharp irony and mock admiration to completely trivialize the events shown, playfully exposing the sheer mundanity of the visual subject."
    ),
    "humorous_tech": (
        "Hilariously geeky and overly analytical. Describe the physical, real-world scene ENTIRELY through the lens of a frantic Senior DevOps Engineer or Systems Architect. Liberally use aggressive tech jargon (e.g., packet loss, legacy spaghetti code, kernel panics, bandwidth throttling) as metaphors for everyday actions."
    ),
    "humorous_non_tech": (
        "Peak observational comedy. Channel the highly relatable, slightly self-deprecating voice of a viral internet comedian. Uncover the hilarious, unspoken universal truths hidden in the scene. Make it sound like a wildly popular, painfully accurate meme about the struggles of daily life."
    ),
}

DESCRIBE_PROMPT = """
You are an expert video analyst and forensic observer. Your task is to provide an exhaustively detailed, objective, and chronological description of the provided video clip.

Analyze the video and describe the following elements with high precision:
- **Setting & Environment**: Describe the background, location, lighting, weather, and atmosphere.
- **Subjects**: Detail the appearance, clothing, age, colors, and physical characteristics of any people, animals, or main objects.
- **Actions & Movement**: Chronologically describe what happens. Detail the micro-expressions, gestures, interactions, and physical movements of the subjects.
- **Camera Details**: Note any camera movements (panning, zooming), angles, or focus shifts.

**Constraints:**
- Do NOT include any subjective commentary, assumptions, or personal opinions.
- Do NOT mention "In this video", "The video shows", or that you are analyzing a video. Treat the scene as a direct observation of reality.
- Be extremely factual and literal.
"""

DETAILED_DESCRIBE_PROMPT = DESCRIBE_PROMPT


class VideoCaptioningAgent:
    def __init__(self):
        self.ai_key = os.environ.get("AI_KEY", "")
        self.project_id = os.environ.get("PROJECT_ID", "")
        self.location = os.environ.get("GCP_LOCATION", "asia-northeast1")
        self.model_id = os.environ.get("GEMINI_MODEL_ID", "gemini-3.5-flash")

        # Force google-genai and google-adk to route through the Vertex AI backend using our service account
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
        if self.project_id:
            os.environ["GOOGLE_CLOUD_PROJECT"] = self.project_id
            os.environ["GOOGLE_CLOUD_LOCATION"] = self.location

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
        
        # Instantiate description agent
        agent = LlmAgent(
            name="video_describer",
            model=self.model_id,
            instruction="You are a helpful assistant specialized in detailing video clips.",
            generate_content_config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(
                    thinking_level="high"
                )
            )
        )
        message = types.Content(role="user", parts=parts)

        async def _run():
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

    def _generate_styled_json(self, prompt: str, schema_model) -> dict:
        # Instantiate styling agent
        agent = LlmAgent(
            name="styled_captioner",
            model=self.model_id,
            instruction="You are a helpful assistant specialized in rewriting factual descriptions into styled captions.",
            output_schema=schema_model,
            generate_content_config=types.GenerateContentConfig(
                thinking_config=types.ThinkingConfig(
                    thinking_level="high"
                )
            )
        )
        message = types.Content(role="user", parts=[types.Part.from_text(text=prompt)])

        async def _run():
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

        json_str = asyncio.run(_run())
        return json.loads(json_str)

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

    def _style_prompt(self, description: str, styles: list[str]) -> str:
        style_lines = "\n".join(f'<style name="{s}">\n{STYLE_GUIDE[s]}\n</style>' for s in styles)
        return f"""
You are an elite, highly versatile copywriter capable of adapting your tone instantly while maintaining strict factual accuracy.

Below is an exhaustive, factual description of a visual scene:
<scene_description>
{description}
</scene_description>

Your task is to write ONE distinct caption for this scene in EACH of the requested styles below:
<requested_styles>
{style_lines}
</requested_styles>

### CRITICAL REQUIREMENTS FOR EVERY CAPTION:
1. **Factual Grounding**: The caption MUST accurately reflect the specific subjects, setting, and actions described in the `<scene_description>`. Do not invent actions or entities that are not present.
2. **Tone Adherence**: The caption MUST perfectly embody the requested style. Go all-in on the tone without being repetitive.
3. **Standalone Quality**: Each caption must make sense on its own. Do not reference the other captions.
4. **Immersion**: Do NOT use meta-language. Never use phrases like "This video shows", "In this scene", "The image depicts", "Based on the description", or "Here is a caption". Speak directly about the scene as if you are experiencing it.
5. **Format**: Write in plain text, English language only.
"""

    def _caption_pydantic_model(self, styles: list[str]):
        return create_model(
            "StyledCaptions",
            **{s: (str, ...) for s in styles}
        )

    def caption_video(self, video_url: str, styles: list[str]) -> dict:
        description = self.describe_video(video_url)
        schema_model = self._caption_pydantic_model(styles)
        captions = self._generate_styled_json(self._style_prompt(description, styles), schema_model)
        result = {s: str(captions.get(s, "")).strip() for s in styles}

        # Retry empty captions once
        missing = [s for s in styles if not result[s]]
        if missing:
            retry_schema_model = self._caption_pydantic_model(missing)
            retry = self._generate_styled_json(self._style_prompt(description, missing), retry_schema_model)
            for s in missing:
                result[s] = str(retry.get(s, "")).strip()

        return result
