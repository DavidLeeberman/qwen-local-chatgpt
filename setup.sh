#!/bin/bash

# 1. install docker
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 2. GPU support
sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker

# 3. start services
sudo docker compose up -d --build

# rebuild
# sudo docker compose build --no-cache
# sudo docker compose up -d

# 4. pull model
sleep 10
CONTAINER=$(sudo docker ps | grep ollama | awk '{print $1}')
sudo docker exec -it $CONTAINER ollama pull qwen3.5:9b

# done