# Use official lightweight Python image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MLFLOW_TRACKING_URI=http://mlflow-service.modelforge.svc.cluster.local:5000 \
    BENTOML_PORT=3000

# Set working directory
WORKDIR /app

# Copy requirements and install python packages (uses pre-compiled wheels, no build-essential needed!)
COPY pipeline/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all pipeline files (scripts and data structure templates)
COPY pipeline/ ./pipeline/

# Expose BentoML serving port
EXPOSE 3000

# By default, run the BentoML serving API
CMD ["bentoml", "serve", "pipeline/service.py:svc", "--host", "0.0.0.0", "--port", "3000"]
