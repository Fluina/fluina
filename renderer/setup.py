from Cython.Build import cythonize
from setuptools import Extension, setup

setup(
    name="fluina-render-geometry",
    ext_modules=cythonize(
        [Extension("geometry", ["geometry.pyx"])],
        compiler_directives={"language_level": "3"},
    ),
)
