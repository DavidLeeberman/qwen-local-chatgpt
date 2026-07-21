import os
from flask import Flask

# Import the domain Blueprints
from routes.auth_routes import auth_bp
from routes.conv_routes import conv_bp
from routes.chat_routes import chat_bp

app = Flask(__name__)

# Register Blueprints with the Flask App
app.register_blueprint(auth_bp)
app.register_blueprint(conv_bp)
app.register_blueprint(chat_bp)

if __name__ == '__main__':
    # Toggle debug setting safely for containerized runtimes
    flask_debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=5000, debug=flask_debug)