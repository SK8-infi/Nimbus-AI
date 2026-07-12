# Docker Build & Push Instructions

This document contains the exact PowerShell commands needed to rebuild and push the `video-captioner` Docker image to the GitHub Container Registry (GHCR).

## Prerequisites
- Docker Desktop must be running.
- You must be authenticated with GHCR (`docker login ghcr.io -u <YOUR_GITHUB_USERNAME> -p <YOUR_PAT>`).
- The GCP Service Account Key (`centered-accord-498520-s8-a9ac293ae5ef.json`) must be present in the root of the project directory.

## Build and Push Steps

Run these commands in PowerShell from the root directory of the project (`c:\Github\AMD Hackathon`):

### 1. Encode the Service Account Key
To prevent Windows PowerShell from corrupting JSON quotes during the Docker build process, encode the service account key to Base64:
```powershell
$KeyContent = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Raw -Path "centered-accord-498520-s8-a9ac293ae5ef.json")))
```

### 2. Build the Docker Image
Build the image, pass the Base64 key as a build argument, and tag it as both `latest` and a specific version (e.g., `v1`):
```powershell
docker build --pull=false --build-arg AI_KEY=$KeyContent --build-arg PROJECT_ID=centered-accord-498520-s8 -t ghcr.io/sk8-infi/video-captioner:v1 -t ghcr.io/sk8-infi/video-captioner:latest .
```

### 3. Push to GHCR
Push both the specific version tag and the latest tag to the registry:
```powershell
docker push ghcr.io/sk8-infi/video-captioner:v1
docker push ghcr.io/sk8-infi/video-captioner:latest
```

## Running the Container Locally
To verify the container works locally and mount the input/output sample volumes:
```powershell
docker run --rm -v "C:/Github/AMD Hackathon/sample/sample_input:/input:ro" -v "C:/Github/AMD Hackathon/sample/sample_output:/output" ghcr.io/sk8-infi/video-captioner:latest
```
