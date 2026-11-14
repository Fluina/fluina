import math
import re


EXPRESSION_NAMES = {
    "x",
    "pi",
    "sqrt",
    "abs",
    "sin",
    "cos",
    "tan",
    "ln",
    "log",
    "exp",
}
TOKEN_PATTERN = re.compile(
    r"\s*(?:(?:\d+(?:\.\d*)?|\.\d+)|([A-Za-z]+)|([()+\-*/^]))"
)
SAMPLE_COUNT = 161


class ExpressionError(ValueError):
    pass


class ExpressionParser:
    def __init__(self, expression):
        self.tokens = []
        position = 0
        while position < len(expression):
            if not expression[position:].strip():
                break
            match = TOKEN_PATTERN.match(expression, position)
            if not match:
                raise ExpressionError("Unsupported expression character")
            token = match.group(0).strip()
            self.tokens.append(token)
            position = match.end()
        if not self.tokens:
            raise ExpressionError("Expression is empty")
        if any(
            token.isalpha() and token not in EXPRESSION_NAMES
            for token in self.tokens
        ):
            raise ExpressionError("Unsupported expression name")
        self.index = 0

    def parse(self):
        node = self.parse_expression()
        if self.index != len(self.tokens):
            raise ExpressionError("Unexpected expression token")
        return node

    def parse_expression(self):
        node = self.parse_term()
        while self.peek() in ("+", "-"):
            operator = self.take()
            node = ("binary", operator, node, self.parse_term())
        return node

    def parse_term(self):
        node = self.parse_unary()
        while self.peek() in ("*", "/"):
            operator = self.take()
            node = ("binary", operator, node, self.parse_unary())
        return node

    def parse_unary(self):
        if self.peek() in ("+", "-"):
            return ("unary", self.take(), self.parse_unary())
        return self.parse_power()

    def parse_power(self):
        node = self.parse_primary()
        if self.peek() == "^":
            self.take()
            node = ("binary", "^", node, self.parse_unary())
        return node

    def parse_primary(self):
        token = self.peek()
        if token is None:
            raise ExpressionError("Expected expression value")
        if token == "(":
            self.take()
            node = self.parse_expression()
            if self.take() != ")":
                raise ExpressionError("Expected closing parenthesis")
            return node
        if re.fullmatch(r"(?:\d+(?:\.\d*)?|\.\d+)", token):
            self.take()
            return ("number", float(token))
        if token.isalpha():
            self.take()
            if token == "x":
                return ("x",)
            if token == "pi":
                return ("number", math.pi)
            if self.take() != "(":
                raise ExpressionError("Function arguments must be parenthesized")
            argument = self.parse_expression()
            if self.take() != ")":
                raise ExpressionError("Expected closing parenthesis")
            return ("call", token, argument)
        raise ExpressionError("Expected expression value")

    def peek(self):
        return self.tokens[self.index] if self.index < len(self.tokens) else None

    def take(self):
        token = self.peek()
        if token is None:
            raise ExpressionError("Unexpected end of expression")
        self.index += 1
        return token


def parse_expression(expression):
    if not isinstance(expression, str) or len(expression) > 200:
        raise ExpressionError("Expression must contain at most 200 characters")
    return ExpressionParser(expression).parse()


def validate_expression(expression):
    parse_expression(expression)


def evaluate_expression(node, x):
    kind = node[0]
    if kind == "number":
        return node[1]
    if kind == "x":
        return x
    if kind == "unary":
        value = evaluate_expression(node[2], x)
        return value if node[1] == "+" else -value
    if kind == "binary":
        left = evaluate_expression(node[2], x)
        right = evaluate_expression(node[3], x)
        if node[1] == "+":
            return left + right
        if node[1] == "-":
            return left - right
        if node[1] == "*":
            return left * right
        if node[1] == "/":
            return left / right
        return math.pow(left, right)

    value = evaluate_expression(node[2], x)
    functions = {
        "sqrt": math.sqrt,
        "abs": abs,
        "sin": math.sin,
        "cos": math.cos,
        "tan": math.tan,
        "ln": math.log,
        "log": math.log,
        "exp": math.exp,
    }
    return functions[node[1]](value)


def sample_expression(expression, x_min, x_max):
    node = parse_expression(expression)
    samples = []
    for index in range(SAMPLE_COUNT):
        x = x_min + (x_max - x_min) * index / (SAMPLE_COUNT - 1)
        try:
            y = evaluate_expression(node, x)
            if not math.isfinite(y) or abs(y) > 1000:
                y = math.nan
        except (ArithmeticError, OverflowError, ValueError):
            y = math.nan
        samples.append((x, y))
    return samples


def split_discontinuous_samples(samples):
    finite_y = sorted(y for _, y in samples if math.isfinite(y))
    if not finite_y:
        return []

    low = finite_y[int((len(finite_y) - 1) * 0.05)]
    high = finite_y[int((len(finite_y) - 1) * 0.95)]
    # Keep isolated near-asymptote values from masking a discontinuity jump.
    reference_range = high - low
    if reference_range == 0:
        reference_range = 2
    jump_limit = reference_range * 8

    segments = []
    current = []
    previous_y = None
    for x, y in samples:
        if not math.isfinite(y):
            if len(current) > 1:
                segments.append(current)
            current = []
            previous_y = None
            continue
        if previous_y is not None and abs(y - previous_y) > jump_limit:
            if len(current) > 1:
                segments.append(current)
            current = []
        current.append((x, y))
        previous_y = y
    if len(current) > 1:
        segments.append(current)
    return segments


def padded_y_range(values):
    finite_values = [value for value in values if math.isfinite(value)]
    if not finite_values:
        return (-5, 5)
    minimum = min(finite_values)
    maximum = max(finite_values)
    value_range = maximum - minimum
    if value_range == 0:
        return (minimum - 1, maximum + 1)
    padding = value_range * 0.1
    return (minimum - padding, maximum + padding)


def fit_frame_bounds(bounds, frame_width=14.222, frame_height=8, margin=0.4):
    left, bottom, right, top = bounds
    width = max(0, right - left)
    height = max(0, top - bottom)
    available_width = frame_width - 2 * margin
    available_height = frame_height - 2 * margin
    scale = min(
        1,
        available_width / width if width else 1,
        available_height / height if height else 1,
    )
    half_width = width * scale / 2
    half_height = height * scale / 2
    return (-half_width, -half_height, half_width, half_height)
