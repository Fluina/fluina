import asyncio
import hmac
import os
import re
import tempfile
import uuid
from pathlib import Path

import boto3
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from scene import SAFE_LATEX_COMMANDS


R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")
R2_KEY_PREFIX = "media/"
RENDER_TOKEN = os.environ.get("RENDER_TOKEN", "")
MAX_REQUEST_BYTES = 64 * 1024
r2_client = None
LATEX_COMMAND_PATTERN = re.compile(r"\\([A-Za-z]+)")
SAFE_LATEX_CHARACTERS = re.compile(r"^[A-Za-z0-9\s{}_^=+\-*/().,\\|<>]+$")
RENDER_SEMAPHORE = asyncio.Semaphore(1)

app = FastAPI()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TextElement(StrictModel):
    type: str = "text"
    text: str = Field(min_length=1, max_length=200)
    x: float = Field(ge=-7, le=7)
    y: float = Field(ge=-7, le=7)
    scale: float = Field(default=1, ge=0.25, le=2)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")
    animation: str | None = None

    @model_validator(mode="after")
    def check_type(self):
        if self.type != "text":
            raise ValueError("Invalid text element type")
        return self


class FormulaElement(TextElement):
    type: str = "formula"
    text: str = Field(default="", exclude=True)
    latex: str = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def check_formula(self):
        if self.type != "formula" or not SAFE_LATEX_CHARACTERS.fullmatch(self.latex):
            raise ValueError("Invalid formula")
        commands = LATEX_COMMAND_PATTERN.findall(self.latex)
        if any(command not in SAFE_LATEX_COMMANDS for command in commands):
            raise ValueError("Unsupported formula command")
        return self


class ShapeElement(StrictModel):
    type: str
    x: float = Field(ge=-7, le=7)
    y: float = Field(ge=-7, le=7)
    radius: float | None = Field(default=None, ge=0.05, le=3)
    width: float | None = Field(default=None, ge=0.05, le=10)
    height: float | None = Field(default=None, ge=0.05, le=10)
    scale: float = Field(default=1, ge=0.25, le=2)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")
    animation: str | None = None

    @model_validator(mode="after")
    def check_shape(self):
        valid = (
            self.type == "circle"
            and self.radius is not None
            or self.type == "rectangle"
            and self.width is not None
            and self.height is not None
        )
        if not valid:
            raise ValueError("Invalid shape")
        return self


class PointElement(StrictModel):
    type: str
    points: list[tuple[float, float]] = Field(min_length=2, max_length=500)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")
    animation: str | None = None

    @model_validator(mode="after")
    def check_points(self):
        if self.type not in ("line", "graph") or any(
            not -7 <= x <= 7 or not -7 <= y <= 7 for x, y in self.points
        ):
            raise ValueError("Invalid line or graph")
        return self


class VisualScene(StrictModel):
    kind: str
    title: str = Field(min_length=1, max_length=120)
    duration: float | None = Field(default=None, ge=2, le=20)
    elements: list[TextElement | FormulaElement | ShapeElement | PointElement] = Field(
        min_length=1, max_length=40
    )

    @model_validator(mode="after")
    def check_scene(self):
        if self.kind not in ("image", "video"):
            raise ValueError("Invalid scene kind")
        if any(
            element.animation not in (None, "create", "fade_in", "write")
            for element in self.elements
        ):
            raise ValueError("Invalid animation")
        return self


def r2_configured() -> bool:
    return all(
        (
            R2_ACCOUNT_ID,
            R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY,
            R2_BUCKET,
            R2_PUBLIC_URL,
        )
    )


def get_r2_client():
    global r2_client
    if r2_client is None:
        r2_client = boto3.client(
            "s3",
            endpoint_url=f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            region_name="auto",
        )
    return r2_client


def upload_to_r2(body: bytes, filename: str, content_type: str):
    get_r2_client().put_object(
        Bucket=R2_BUCKET,
        Key=f"{R2_KEY_PREFIX}{filename}",
        Body=body,
        ContentType=content_type,
        CacheControl="public, max-age=31536000, immutable",
    )


def authorize(authorization: str | None):
    if not RENDER_TOKEN:
        raise HTTPException(
            status_code=503, detail="Renderer authentication is not configured"
        )
    expected = f"Bearer {RENDER_TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def validate_scene(scene: VisualScene):
    for element in scene.elements:
        if isinstance(element, FormulaElement):
            continue
        if isinstance(element, TextElement) and element.type != "text":
            raise HTTPException(status_code=422, detail="Invalid text element")


def format_vtt_time(seconds: float) -> str:
    milliseconds = round(seconds * 1000)
    hours, milliseconds = divmod(milliseconds, 3_600_000)
    minutes, milliseconds = divmod(milliseconds, 60_000)
    whole_seconds, milliseconds = divmod(milliseconds, 1000)
    return (
        f"{hours:02}:{minutes:02}:{whole_seconds:02}."
        f"{milliseconds:03}"
    )


def make_captions(scene: VisualScene) -> str:
    labels = []
    for element in scene.elements:
        if isinstance(element, FormulaElement):
            labels.append(element.latex)
        elif isinstance(element, TextElement):
            labels.append(element.text)
    description = " — ".join([scene.title, *labels])
    description = (
        description.replace("-->", "—>")
        .replace("&", "＆")
        .replace("<", "＜")
        .replace(">", "＞")
        .replace("\r", " ")
        .replace("\n", " ")
    )
    description = description[:2000]
    duration = max(scene.duration or 6, len(scene.elements) * 0.5 + 1)
    return (
        "WEBVTT\n\n"
        f"{format_vtt_time(0)} --> {format_vtt_time(duration)}\n"
        f"{description}\n"
    )


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/render")
async def render(
    scene: VisualScene,
    request: Request,
    authorization: str | None = Header(default=None),
):
    authorize(authorization)
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            request_size = int(content_length)
        except ValueError as error:
            raise HTTPException(
                status_code=400, detail="Invalid content length"
            ) from error
        if request_size > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="Scene is too large")
    validate_scene(scene)

    if not r2_configured():
        raise HTTPException(status_code=503, detail="Media storage is not configured")

    async with RENDER_SEMAPHORE:
        extension = "png" if scene.kind == "image" else "mp4"
        filename = f"{uuid.uuid4().hex}.{extension}"
        with tempfile.TemporaryDirectory(prefix="fluina-manim-") as working_dir:
            work_path = Path(working_dir)
            scene_path = work_path / "scene.json"
            scene_path.write_text(scene.model_dump_json(), encoding="utf-8")
            output_stem = filename.rsplit(".", 1)[0]
            command = [
                "manim",
                "-ql",
                "--media_dir",
                str(work_path / "media"),
                "-o",
                output_stem,
            ]
            if scene.kind == "image":
                command.extend(["-s", "--format", "png"])
            command.extend(
                [str(Path(__file__).parent / "scene.py"), "GeneratedScene"]
            )
            environment = os.environ.copy()
            environment["FLUINA_SCENE_PATH"] = str(scene_path)
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=work_path,
                env=environment,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.PIPE,
            )
            try:
                _, stderr = await asyncio.wait_for(
                    process.communicate(), timeout=90
                )
            except TimeoutError:
                process.kill()
                await process.wait()
                raise HTTPException(status_code=504, detail="Rendering timed out")

            if process.returncode != 0:
                print(
                    "Manim rendering failed:",
                    stderr.decode("utf-8", errors="replace")[-4000:],
                )
                raise HTTPException(status_code=500, detail="Rendering failed")

            candidates = list(
                (work_path / "media").rglob(f"{output_stem}.{extension}")
            )
            if len(candidates) != 1:
                raise HTTPException(
                    status_code=500, detail="Rendered media was not found"
                )
            content_types = {
                "png": "image/png",
                "mp4": "video/mp4",
                "vtt": "text/vtt",
            }
            try:
                await asyncio.to_thread(
                    upload_to_r2,
                    candidates[0].read_bytes(),
                    filename,
                    content_types[extension],
                )
                if scene.kind == "video":
                    await asyncio.to_thread(
                        upload_to_r2,
                        make_captions(scene).encode("utf-8"),
                        f"{output_stem}.vtt",
                        content_types["vtt"],
                    )
            except Exception as error:
                print("R2 upload failed:", error)
                raise HTTPException(
                    status_code=502, detail="Media upload failed"
                ) from error

    return {
        "kind": scene.kind,
        "url": f"{R2_PUBLIC_URL}/{R2_KEY_PREFIX}{filename}",
        "alt": scene.title,
        **(
            {"captions_url": f"{R2_PUBLIC_URL}/{R2_KEY_PREFIX}{output_stem}.vtt"}
            if scene.kind == "video"
            else {}
        ),
    }
