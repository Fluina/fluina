import json
import math
import os
from pathlib import Path

from manim import (
    Axes,
    DOWN,
    Dot,
    Ellipse,
    FadeIn,
    FadeOut,
    LEFT,
    Line,
    MathTex,
    ORIGIN,
    Scene,
    Text,
    TransformMatchingTex,
    UP,
    VGroup,
    VMobject,
    config,
)

from scene_model import (
    fit_frame_bounds,
    padded_y_range,
    sample_expression,
    split_discontinuous_samples,
)

SAFE_LATEX_COMMANDS = {
    "alpha",
    "angle",
    "approx",
    "beta",
    "cdot",
    "circ",
    "cos",
    "delta",
    "div",
    "frac",
    "gamma",
    "ge",
    "infty",
    "int",
    "le",
    "left",
    "ln",
    "log",
    "lambda",
    "mu",
    "neq",
    "omega",
    "pi",
    "pm",
    "right",
    "sigma",
    "sin",
    "sqrt",
    "sum",
    "tan",
    "theta",
    "times",
}

MARGIN = 0.4
COLOR = "#4DA3FF"


def create_label(text, color=COLOR):
    return Text(text, color=color)


def create_formula(latex, color=COLOR):
    return MathTex(latex, color=color)


def _tick_step(value_range):
    rough_step = value_range / 6
    power = 10 ** int(math.floor(math.log10(rough_step)))
    normalized = rough_step / power
    multiplier = 1 if normalized <= 1 else 2 if normalized <= 2 else 5
    return multiplier * power


def _place_formula(formula, max_width):
    if formula.width > max_width:
        scale = max_width / formula.width
        if scale < 0.35:
            raise ValueError("Formula is too wide to fit in the scene.")
        formula.scale(scale)
    return formula


def _formula_layout(items, region_width, center_x, top_y, is_video):
    transitions = []
    visible_blocks = []
    video_step_blocks = []
    for item in items:
        if item["type"] not in ("formula", "steps"):
            continue
        formulas = (
            [create_formula(item["latex"], item.get("color", COLOR))]
            if item["type"] == "formula"
            else [
                create_formula(step, item.get("color", COLOR))
                for step in item["latex"]
            ]
        )
        for formula in formulas:
            _place_formula(formula, region_width)

        if item["type"] == "steps" and is_video:
            block = VGroup(formulas[0])
            visible_blocks.append(block)
            video_step_blocks.append((formulas, block))
            transitions.extend(zip(formulas, formulas[1:]))
        else:
            block = VGroup(*formulas).arrange(DOWN, buff=0.35, aligned_edge=LEFT)
            visible_blocks.append(block)
    if not visible_blocks:
        return VGroup(), transitions

    visible = VGroup(*visible_blocks).arrange(DOWN, buff=0.35, aligned_edge=LEFT)
    visible.move_to([center_x, top_y - visible.height / 2, 0])

    for formulas, block in video_step_blocks:
        for formula in formulas:
            formula.move_to(block.get_center())

    return visible, transitions


def build_scene_content(scene_data, frame_width=14.222, frame_height=8):
    items = scene_data["items"]
    spatial_items = [
        item
        for item in items
        if item["type"] in ("axes", "plot", "point", "segment", "circle")
    ]
    has_graph = bool(spatial_items)
    view = scene_data.get("view") or {"xMin": -5, "xMax": 5}
    x_min, x_max = view["xMin"], view["xMax"]

    plots = []
    data_y = []
    for item in items:
        if item["type"] == "plot":
            samples = sample_expression(item["expression"], x_min, x_max)
            segments = split_discontinuous_samples(samples)
            if segments:
                plots.append((segments, item.get("color", COLOR)))
                data_y.extend(y for segment in segments for _, y in segment)
        elif item["type"] == "point":
            data_y.append(item["y"])
        elif item["type"] == "segment":
            data_y.extend((item["from"][1], item["to"][1]))
        elif item["type"] == "circle":
            data_y.extend((item["y"] - item["radius"], item["y"] + item["radius"]))

    y_min, y_max = padded_y_range(data_y)
    margin = MARGIN
    available_width = frame_width - 2 * margin
    graph_width = available_width * 0.6
    graph_height = frame_height - 2 * margin - 1.7
    if has_graph:
        graph_left = -frame_width / 2 + margin
        graph_center_x = graph_left + graph_width / 2
        axes = Axes(
            x_range=[x_min, x_max, _tick_step(x_max - x_min)],
            y_range=[y_min, y_max, _tick_step(y_max - y_min)],
            x_length=graph_width,
            y_length=graph_height,
            tips=False,
            axis_config={
                "include_numbers": True,
                "font_size": 16,
                "stroke_width": 1,
            },
        )
        axes.move_to([graph_center_x, -0.3, 0])
        spatial = VGroup(axes)

        for segments, color in plots:
            for segment in segments:
                points = segment
                if len(points) < 2:
                    continue
                curve = VMobject(color=color, stroke_width=3)
                curve.set_points_as_corners(
                    [axes.c2p(x, y) for x, y in points]
                )
                spatial.add(curve)

        x_unit = graph_width / (x_max - x_min)
        y_unit = graph_height / (y_max - y_min)
        for item in items:
            if item["type"] == "point":
                point = Dot(
                    axes.c2p(item["x"], item["y"]),
                    radius=0.045,
                    color=item.get("color", COLOR),
                )
                spatial.add(point)
                if item.get("label"):
                    label = create_label(item["label"], item.get("color", COLOR))
                    if label.width > graph_width * 0.4:
                        label.scale(graph_width * 0.4 / label.width)
                    label.move_to(point.get_center() + UP * 0.22)
                    spatial.add(label)
            elif item["type"] == "segment":
                spatial.add(
                    Line(
                        axes.c2p(*item["from"]),
                        axes.c2p(*item["to"]),
                        color=item.get("color", COLOR),
                        stroke_width=3,
                    )
                )
            elif item["type"] == "circle":
                spatial.add(
                    Ellipse(
                        width=2 * item["radius"] * x_unit,
                        height=2 * item["radius"] * y_unit,
                        color=item.get("color", COLOR),
                    ).move_to(axes.c2p(item["x"], item["y"]))
                )
    else:
        spatial = VGroup()

    title = create_label(scene_data["title"])
    if title.width > frame_width - 2 * margin:
        title.scale((frame_width - 2 * margin) / title.width)
    title.move_to(
        [0, frame_height / 2 - margin - title.height / 2, 0]
    )

    if has_graph:
        formula_left = -frame_width / 2 + margin + graph_width + 0.35
        formula_width = frame_width / 2 - margin - formula_left
        formula_center_x = formula_left + formula_width / 2
    else:
        formula_width = frame_width - 2 * margin
        formula_center_x = 0
    formula_top = frame_height / 2 - margin - title.height - 0.35
    formulas, transitions = _formula_layout(
        items,
        formula_width,
        formula_center_x,
        formula_top,
        scene_data["kind"] == "video",
    )
    visible = VGroup(spatial, formulas, title)
    hidden_targets = {id(target): target for _, target in transitions}
    layout = VGroup(visible, *hidden_targets.values())

    bounds = (
        layout.get_left()[0],
        layout.get_bottom()[1],
        layout.get_right()[0],
        layout.get_top()[1],
    )
    fitted_bounds = fit_frame_bounds(
        bounds, frame_width=frame_width, frame_height=frame_height, margin=margin
    )
    scale = min(
        (fitted_bounds[2] - fitted_bounds[0]) / max(bounds[2] - bounds[0], 1e-9),
        (fitted_bounds[3] - fitted_bounds[1]) / max(bounds[3] - bounds[1], 1e-9),
        1,
    )
    layout.scale(scale, about_point=ORIGIN)
    layout.move_to(ORIGIN)
    fitted = (
        layout.get_left()[0],
        layout.get_bottom()[1],
        layout.get_right()[0],
        layout.get_top()[1],
    )
    return visible, transitions, fitted


class GeneratedScene(Scene):
    def construct(self):
        scene_data = json.loads(
            Path(os.environ["FLUINA_SCENE_PATH"]).read_text(encoding="utf-8")
        )
        visible, transitions, _ = build_scene_content(
            scene_data, config.frame_width, config.frame_height
        )
        self.add(visible)

        if scene_data["kind"] == "video":
            transition_time = 0.5
            for current, target in transitions:
                try:
                    self.play(
                        TransformMatchingTex(
                            current,
                            target,
                            replace_mobject_with_target_in_scene=True,
                        ),
                        run_time=transition_time,
                    )
                    current = target
                except Exception:
                    self.remove(current)
                    self.add(current)
                    self.play(
                        FadeOut(current),
                        FadeIn(target),
                        run_time=transition_time,
                    )
                    current = target
            duration = scene_data.get("duration") or 6
            self.wait(max(1, duration - transition_time * len(transitions)))
