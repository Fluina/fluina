import asyncio
import hmac
import math
import os
import re
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Literal, Union

import boto3
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, model_validator

from scene import SAFE_LATEX_COMMANDS, TRANSITION_TIME
from scene_model import ExpressionError, validate_expression


R2_ACCOUNT_ID = os.environ.get("R2_ACCOUNT_ID", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_KEY_PREFIX = "media/"
MEDIA_URL_EXPIRES_IN = 24 * 60 * 60
RENDER_TOKEN = os.environ.get("RENDER_TOKEN", "")
MAX_REQUEST_BYTES = 64 * 1024
r2_client = None
LATEX_COMMAND_PATTERN = re.compile(r"\\([A-Za-z]+)")
SAFE_LATEX_CHARACTERS = re.compile(r"^[A-Za-z0-9\s{}_^=+\-*/().,\\|<>]+$")
RENDER_SEMAPHORE = asyncio.Semaphore(1)

app = FastAPI()


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class View(StrictModel):
    xMin: float = Field(allow_inf_nan=False)
    xMax: float = Field(allow_inf_nan=False)

    @model_validator(mode="after")
    def check_range(self):
        width = self.xMax - self.xMin
        if self.xMin >= self.xMax or not 0.5 <= width <= 40:
            raise ValueError("Invalid horizontal view range")
        return self


class AxesItem(StrictModel):
    type: Literal["axes"]


class PlotItem(StrictModel):
    type: Literal["plot"]
    expression: str | None = Field(default=None, min_length=1, max_length=200)
    expressions: list[str] | None = Field(default=None, min_length=2, max_length=6)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def check_expression_keyframes(self):
        if (self.expression is None) == (self.expressions is None):
            raise ValueError("Provide either an expression or expression keyframes")
        expressions = [self.expression] if self.expression is not None else self.expressions
        for expression in expressions:
            validate_expression(expression)
        return self


class PointItem(StrictModel):
    type: Literal["point"]
    x: float | None = Field(default=None, allow_inf_nan=False)
    y: float | None = Field(default=None, allow_inf_nan=False)
    positions: list[tuple[float, float]] | None = Field(
        default=None, min_length=2, max_length=6
    )
    label: str | None = Field(default=None, min_length=1, max_length=200)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def check_positions(self):
        has_coordinates = self.x is not None or self.y is not None
        if has_coordinates and (self.x is None or self.y is None):
            raise ValueError("Both x and y are required")
        if has_coordinates == (self.positions is not None):
            raise ValueError("Provide coordinates or position keyframes")
        if self.positions and any(
            not math.isfinite(value) for position in self.positions for value in position
        ):
            raise ValueError("Invalid point positions")
        return self


class SegmentItem(StrictModel):
    type: Literal["segment"]
    from_: tuple[float, float] = Field(alias="from")
    to: tuple[float, float]
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @model_validator(mode="after")
    def check_coordinates(self):
        if any(not math.isfinite(value) for value in (*self.from_, *self.to)):
            raise ValueError("Invalid segment coordinates")
        return self


class CircleItem(StrictModel):
    type: Literal["circle"]
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)
    radius: float = Field(gt=0, allow_inf_nan=False)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")


class FormulaItem(StrictModel):
    type: Literal["formula"]
    latex: str = Field(min_length=1, max_length=200)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def check_formula(self):
        if not SAFE_LATEX_CHARACTERS.fullmatch(self.latex):
            raise ValueError("Invalid formula")
        commands = LATEX_COMMAND_PATTERN.findall(self.latex)
        if any(command not in SAFE_LATEX_COMMANDS for command in commands):
            raise ValueError("Unsupported formula command")
        return self


class StepsItem(StrictModel):
    type: Literal["steps"]
    latex: list[str] = Field(min_length=2, max_length=6)
    color: str = Field(default="#4DA3FF", pattern=r"^#[0-9A-Fa-f]{6}$")

    @model_validator(mode="after")
    def check_formulas(self):
        for formula in self.latex:
            if not SAFE_LATEX_CHARACTERS.fullmatch(formula):
                raise ValueError("Invalid formula")
            commands = LATEX_COMMAND_PATTERN.findall(formula)
            if any(command not in SAFE_LATEX_COMMANDS for command in commands):
                raise ValueError("Unsupported formula command")
        return self


VisualItem = Annotated[
    Union[
        AxesItem,
        PlotItem,
        PointItem,
        SegmentItem,
        CircleItem,
        FormulaItem,
        StepsItem,
    ],
    Field(discriminator="type"),
]


class VisualScene(StrictModel):
    kind: Literal["video"]
    title: str = Field(min_length=1, max_length=120)
    view: View | None = None
    duration: float | None = Field(default=None, ge=2, le=20, allow_inf_nan=False)
    items: list[VisualItem] = Field(min_length=1, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def omit_invalid_plots(cls, value):
        if not isinstance(value, dict) or not isinstance(value.get("items"), list):
            return value
        if len(value["items"]) > 20:
            return value
        normalized = dict(value)
        normalized["items"] = [
            item
            for item in value["items"]
            if not (
                isinstance(item, dict)
                and item.get("type") == "plot"
                and _is_invalid_plot(item)
            )
        ]
        return normalized

    @model_validator(mode="after")
    def require_animation(self):
        for item in self.items:
            if isinstance(item, StepsItem) and any(
                formula != item.latex[0] for formula in item.latex[1:]
            ):
                return self
            if isinstance(item, PlotItem) and item.expressions and any(
                expression != item.expressions[0]
                for expression in item.expressions[1:]
            ):
                return self
            if isinstance(item, PointItem) and item.positions and any(
                position != item.positions[0] for position in item.positions[1:]
            ):
                return self
        raise ValueError("Video scenes must contain an animated item")


def _is_invalid_plot(item):
    expressions = item.get("expressions")
    if expressions is not None:
        return not isinstance(expressions, list) or any(
            _is_invalid_expression(expression) for expression in expressions
        )
    return _is_invalid_expression(item.get("expression"))


def _is_invalid_expression(expression):
    try:
        validate_expression(expression)
        return False
    except ExpressionError:
        return True


def r2_configured() -> bool:
    return all(
        (
            R2_ACCOUNT_ID,
            R2_ACCESS_KEY_ID,
            R2_SECRET_ACCESS_KEY,
            R2_BUCKET,
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
        CacheControl=f"private, max-age={MEDIA_URL_EXPIRES_IN}",
    )


def create_media_url(filename: str) -> str:
    return get_r2_client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": R2_BUCKET,
            "Key": f"{R2_KEY_PREFIX}{filename}",
        },
        ExpiresIn=MEDIA_URL_EXPIRES_IN,
    )


def authorize(authorization: str | None):
    if not RENDER_TOKEN:
        raise HTTPException(
            status_code=503, detail="Renderer authentication is not configured"
        )
    expected = f"Bearer {RENDER_TOKEN}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


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
    for item in scene.items:
        if isinstance(item, FormulaItem):
            labels.append(item.latex)
        elif isinstance(item, StepsItem):
            labels.extend(item.latex)
        elif isinstance(item, PointItem) and item.label:
            labels.append(item.label)
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
    transition_count = max(
        [
            len(item.latex) - 1
            for item in scene.items
            if isinstance(item, StepsItem)
        ]
        + [
            len(item.expressions) - 1
            for item in scene.items
            if isinstance(item, PlotItem) and item.expressions is not None
        ]
        + [
            len(item.positions) - 1
            for item in scene.items
            if isinstance(item, PointItem) and item.positions is not None
        ]
        + [0]
    )
    duration = max(
        scene.duration or 6,
        transition_count * TRANSITION_TIME + 1,
    )
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
    if not r2_configured():
        raise HTTPException(status_code=503, detail="Media storage is not configured")

    async with RENDER_SEMAPHORE:
        extension = "mp4"
        filename = f"{uuid.uuid4().hex}.{extension}"
        with tempfile.TemporaryDirectory(prefix="fluina-manim-") as working_dir:
            work_path = Path(working_dir)
            scene_path = work_path / "scene.json"
            scene_path.write_text(
                scene.model_dump_json(by_alias=True), encoding="utf-8"
            )
            output_stem = filename.rsplit(".", 1)[0]
            command = [
                "manim",
                "-qh",
                "--media_dir",
                str(work_path / "media"),
                "-o",
                output_stem,
            ]
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
        "url": create_media_url(filename),
        "alt": scene.title,
        "captions_url": create_media_url(f"{output_stem}.vtt"),
    }
