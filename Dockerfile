FROM --platform=linux/amd64 python:3.11-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

# Credentials ship inside the image or are supplied at run/build time.
# The credentials key is supplied at build time (--build-arg), never committed to git.
ARG AI_KEY=""
ENV AI_KEY=${AI_KEY}

ARG PROJECT_ID=""
ENV PROJECT_ID=${PROJECT_ID}

ARG GCP_LOCATION="asia-northeast1"
ENV GCP_LOCATION=${GCP_LOCATION}

ARG GEMINI_MODEL_ID="gemini-3.5-flash"
ENV GEMINI_MODEL_ID=${GEMINI_MODEL_ID}

ARG STUDIO_KEY=""
ENV STUDIO_KEY=${STUDIO_KEY}

CMD ["python", "src/main.py"]
