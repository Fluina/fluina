FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    dvisvgm \
    ffmpeg \
    fonts-noto-cjk \
    libcairo2-dev \
    libpango1.0-dev \
    pkg-config \
    texlive-fonts-recommended \
    texlive-latex-extra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt pyproject.toml setup.py geometry.pyx ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir .

COPY app.py scene.py ./

EXPOSE 10000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "10000"]
