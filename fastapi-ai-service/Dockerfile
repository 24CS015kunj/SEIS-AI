FROM python:3.11-slim

# Prevent Python from writing pyc files to disk and from buffering stdout and stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies if any are needed
# curl is required by docker-compose.yml's healthcheck (CMD-SHELL curl ...) --
# python:3.11-slim ships without it, which left the api container permanently
# "unhealthy" (every check failing with "curl: not found") despite the app
# itself working correctly.
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt requirements-dev.txt requirements-vectorstore.txt ./
# For development, we install all requirements
RUN pip install --no-cache-dir -r requirements.txt -r requirements-dev.txt -r requirements-vectorstore.txt

# Copy the application source code
COPY . .

# Expose the application port
EXPOSE 8000

# Command to run the application in development mode with reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
