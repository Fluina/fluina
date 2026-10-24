import json
import os
from pathlib import Path

from manim import (
    Create,
    FadeIn,
    MathTex,
    MovingCameraScene,
    Rectangle,
    Circle,
    Text,
    VMobject,
    Write,
)

from geometry import compact_points

SAFE_LATEX_COMMANDS = {
    "cdot",
    "cos",
    "frac",
    "ge",
    "infty",
    "int",
    "le",
    "left",
    "neq",
    "pi",
    "right",
    "sin",
    "sqrt",
    "sum",
    "theta",
    "times",
}


class GeneratedScene(MovingCameraScene):
    def construct(self):
        scene_data = json.loads(
            Path(os.environ["FLUINA_SCENE_PATH"]).read_text(encoding="utf-8")
        )
        is_video = scene_data["kind"] == "video"
        animation_count = 0

        for element in scene_data["elements"]:
            visual = self.create_element(element)
            animation_name = element.get("animation")
            if is_video:
                if animation_name == "fade_in":
                    self.play(FadeIn(visual), run_time=0.5)
                elif animation_name == "write" and element["type"] in (
                    "text",
                    "formula",
                ):
                    self.play(Write(visual), run_time=0.5)
                else:
                    self.play(Create(visual), run_time=0.5)
                animation_count += 1
            else:
                self.add(visual)

        if is_video:
            self.wait(max(1, scene_data.get("duration", 6) - animation_count * 0.5))

    @staticmethod
    def create_element(element):
        element_type = element["type"]
        color = element.get("color", "#4DA3FF")
        if element_type == "text":
            visual = Text(element["text"], color=color)
        elif element_type == "formula":
            visual = MathTex(element["latex"], color=color)
        elif element_type == "circle":
            visual = Circle(radius=element["radius"], color=color)
        elif element_type == "rectangle":
            visual = Rectangle(
                width=element["width"], height=element["height"], color=color
            )
        elif element_type in ("line", "graph"):
            points = compact_points(element["points"])
            visual = VMobject(color=color)
            visual.set_points_as_corners([[x, y, 0] for x, y in points])
        else:
            raise ValueError("Unsupported visual element")

        if "x" in element and "y" in element:
            visual.move_to([element["x"], element["y"], 0])
        if "scale" in element:
            visual.scale(element["scale"])
        return visual
