#!/bin/bash

# Configuration
IMAGE_NAME="sophoun/gitlab_webhook_to_telegram_bot_proxy"
TAG="latest"

echo "Building Docker image: $IMAGE_NAME:$TAG..."
docker build -t "$IMAGE_NAME:$TAG" .

if [ $? -eq 0 ]; then
    echo "Build successful. Publishing to Docker Hub..."
    docker push "$IMAGE_NAME:$TAG"
    
    if [ $? -eq 0 ]; then
        echo "Successfully published $IMAGE_NAME:$TAG to Docker Hub."
    else
        echo "Failed to push image to Docker Hub."
        exit 1
    fi
else
    echo "Docker build failed."
    exit 1
fi
