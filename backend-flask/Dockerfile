FROM python:3.11

# Set the working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt ./
# RUN pip install -r requirements.txt
RUN pip install -r requirements.txt \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --timeout 100

# Copy Flask app code
COPY . .

# Expose the Flask app port
EXPOSE 5000

# Run the Flask app
CMD ["python", "app.py"]