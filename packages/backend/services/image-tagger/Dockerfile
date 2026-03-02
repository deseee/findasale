FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Add simple health endpoint file
RUN printf "from flask import Flask\napp = Flask(__name__)\n@app.route('/health')\ndef health():\n    return 'ok'\n" > health.py

EXPOSE 5000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5000"]