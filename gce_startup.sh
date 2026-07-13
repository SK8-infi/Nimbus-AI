#!/bin/bash
# 1. Update and install Docker
apt-get update
apt-get install -y docker.io

# 2. Start Docker service
systemctl start docker
systemctl enable docker

# 3. Create mount directories
mkdir -p /mnt/input /mnt/output
chmod 777 /mnt/input /mnt/output

# 4. Download input tasks.json from GCS
gsutil cp gs://centered-accord-498520-s8_cloudbuild/tasks.json /mnt/input/tasks.json

# 5. Log start time
START_TIME=$(date +"%Y-%m-%d %H:%M:%S")
echo "VM_START_TIME: $START_TIME" > /mnt/output/time.log

# 6. Run the docker container under grader mounts
docker run --rm \
  -v "/mnt/input:/input:ro" \
  -v "/mnt/output:/output" \
  ghcr.io/sk8-infi/video-captioner@sha256:fc3ff0adb06262bd487ead7f368ef4cc8565da946e3af1b0dedffeae2b4fb1e1

# 7. Log end time
END_TIME=$(date +"%Y-%m-%d %H:%M:%S")
echo "VM_END_TIME: $END_TIME" >> /mnt/output/time.log

# 8. Upload output results.json and logs back to GCS
gsutil cp /mnt/output/results.json gs://centered-accord-498520-s8_cloudbuild/results.json
gsutil cp /mnt/output/time.log gs://centered-accord-498520-s8_cloudbuild/time.log

# 9. Self-terminate the VM to prevent any extra billing
ZONE=$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/zone | awk -F/ '{print $NF}')
NAME=$(curl -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/name)
gcloud compute instances delete "$NAME" --zone="$ZONE" --quiet
