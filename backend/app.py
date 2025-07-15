import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
# We will only allow .glb files, as they are self-contained
ALLOWED_EXTENSIONS = {'glb'}

# Initialize the Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Setup CORS
CORS(app)

# --- Helper Function ---
def allowed_file(filename):
    # Check if the file has an extension and if it's in our allowed set
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- API Endpoints ---

@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify(status="ok", message="Server is healthy")

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'model' not in request.files:
        return jsonify(error="No file part in the request"), 400
    
    file = request.files['model']
    
    if file.filename == '':
        return jsonify(error="No file selected"), 400
    
    # Check if the file is a .glb file
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        return jsonify(
            message="File uploaded successfully",
            url=f"/models/{filename}"
        )
    else:
        return jsonify(error="Invalid file type. Please upload a .glb file."), 400

@app.route('/models/<filename>')
def serve_model(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# --- Run the App ---
if __name__ == "__main__":
    app.run(port=4000, debug=True)