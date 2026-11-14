import math
import unittest
from unittest.mock import patch

from manim import MathTex, Text
from pydantic import ValidationError

from scene import create_formula, create_label
from app import VisualScene, make_captions
from scene_model import (
    ExpressionError,
    fit_frame_bounds,
    padded_y_range,
    sample_expression,
    split_discontinuous_samples,
    validate_expression,
)


class SceneModelTests(unittest.TestCase):
    def test_quadratic_sampling_includes_its_vertex(self):
        samples = sample_expression("x^2 - 3", -4, 4)

        self.assertEqual(len(samples), 161)
        self.assertIn((0, -3), samples)
        self.assertEqual(len(split_discontinuous_samples(samples)), 1)

    def test_non_finite_samples_and_tangent_discontinuity_split_the_curve(self):
        tangent_segments = split_discontinuous_samples(
            sample_expression("tan(x)", -2, 2)
        )
        domain_segments = split_discontinuous_samples(
            sample_expression("sqrt(x)", -2, 2)
        )

        self.assertGreaterEqual(len(tangent_segments), 2)
        self.assertEqual(len(domain_segments), 1)
        self.assertTrue(all(math.isfinite(y) for segment in domain_segments for _, y in segment))

    def test_expression_parser_rejects_unsupported_and_malformed_input(self):
        for expression in ("__import__(x)", "x+*2"):
            with self.subTest(expression=expression):
                with self.assertRaises(ExpressionError):
                    validate_expression(expression)
        validate_expression("x^2 - 3   ")

    def test_y_ranges_keep_data_outside_the_old_coordinate_limits(self):
        self.assertEqual(padded_y_range([12]), (11, 13))

    def test_api_schema_drops_only_invalid_plots_and_preserves_data_values(self):
        scene = VisualScene.model_validate(
            {
                "kind": "video",
                "duration": 2,
                "title": "座標",
                "items": [
                    {"type": "plot", "expression": "__import__(x)"},
                    {
                        "type": "point",
                        "positions": [[1, 12], [2, 13]],
                        "label": "点",
                    },
                ],
            }
        )

        self.assertEqual(len(scene.items), 1)
        self.assertEqual(scene.items[0].positions[0][1], 12)
        self.assertEqual(
            scene.model_dump(by_alias=True)["items"][0]["positions"][0][1],
            12,
        )

    def test_api_schema_rejects_legacy_positioned_elements(self):
        with self.assertRaises(ValidationError):
            VisualScene.model_validate(
                {
                    "kind": "video",
                    "title": "旧形式",
                    "elements": [{"type": "text", "text": "点", "x": 1, "y": 2}],
                }
            )

    def test_api_schema_rejects_still_image_scenes(self):
        with self.assertRaises(ValidationError):
            VisualScene.model_validate(
                {
                    "kind": "image",
                    "title": "静止画",
                    "items": [{"type": "axes"}],
                }
            )

    def test_api_schema_rejects_videos_without_animation(self):
        with self.assertRaises(ValidationError):
            VisualScene.model_validate(
                {
                    "kind": "video",
                    "title": "固定図",
                    "items": [
                        {"type": "axes"},
                        {"type": "plot", "expression": "x^2"},
                    ],
                }
            )

    def test_api_schema_accepts_plot_and_point_keyframes(self):
        scene = VisualScene.model_validate(
            {
                "kind": "video",
                "title": "判別式",
                "items": [
                    {
                        "type": "plot",
                        "expressions": ["x^2 - 2*x", "x^2 - 2*x + 1"],
                    },
                    {
                        "type": "point",
                        "positions": [[0, 0], [1, 0]],
                        "label": "頂点",
                    },
                ],
            }
        )

        self.assertEqual(scene.items[0].expressions, ["x^2 - 2*x", "x^2 - 2*x + 1"])
        self.assertEqual(scene.items[1].positions, [(0, 0), (1, 0)])

    def test_video_captions_include_step_transition_duration(self):
        scene = VisualScene.model_validate(
            {
                "kind": "video",
                "title": "式の変形",
                "duration": 2,
                "items": [
                    {"type": "steps", "latex": ["x", "x^2", "x^3", "x^4", "x^5", "x^6"]}
                ],
            }
        )

        self.assertIn("00:00:05.000", make_captions(scene))

    def test_video_captions_include_graph_keyframe_duration(self):
        scene = VisualScene.model_validate(
            {
                "kind": "video",
                "title": "放物線の移動",
                "duration": 2,
                "items": [
                    {
                        "type": "plot",
                        "expressions": ["x^2", "x^2 + 1", "x^2 + 2", "x^2 + 3"],
                    }
                ],
            }
        )

        self.assertIn("00:00:03.400", make_captions(scene))

    def test_fit_bounds_stay_inside_the_margin(self):
        left, bottom, right, top = fit_frame_bounds((-20, -5, 20, 5))

        self.assertLessEqual(right - left, 14.222 - 0.8)
        self.assertLessEqual(top - bottom, 8 - 0.8)
        self.assertAlmostEqual(left, -right)
        self.assertAlmostEqual(bottom, -top)

    def test_japanese_labels_and_formulas_use_their_native_manim_objects(self):
        with patch.object(Text, "__init__", return_value=None):
            self.assertIsInstance(create_label("頂点"), Text)
        with patch.object(MathTex, "__init__", return_value=None):
            self.assertIsInstance(create_formula("x^2"), MathTex)


if __name__ == "__main__":
    unittest.main()
