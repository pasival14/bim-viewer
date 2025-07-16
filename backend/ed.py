import os
import boto3
import uuid
from datetime import datetime, timezone
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename
from botocore.exceptions import ClientError
from decimal import Decimal
import json

# --- Load Environment Variables ---
from dotenv import load_dotenv
load_dotenv()

# --- Import Auth Decorator ---
from auth import token_required

# --- Configuration ---
ALLOWED_EXTENSIONS = {'glb'}
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')

# --- Table Names ---
DYNAMODB_ISSUES_TABLE = os.environ.get('DYNAMODB_TABLE_NAME', 'bim-viewer-issues')
DYNAMODB_PROJECTS_TABLE = 'bim-viewer-projects'
DYNAMODB_PERMISSIONS_TABLE = 'bim-viewer-project-permissions'

if not S3_BUCKET_NAME:
    raise ValueError("Error: S3_BUCKET_NAME environment variable is not set.")

S3_LOCATION = f'https://{S3_BUCKET_NAME}.s3.amazonaws.com/'

# --- Initialize Flask & Services ---
app = Flask(__name__)
CORS(app)

session = boto3.Session(region_name=AWS_REGION)
s3_client = session.client('s3')
dynamodb = session.resource('dynamodb')

# --- Connect to DynamoDB Tables ---
issues_table = dynamodb.Table(DYNAMODB_ISSUES_TABLE)
projects_table = dynamodb.Table(DYNAMODB_PROJECTS_TABLE)
permissions_table = dynamodb.Table(DYNAMODB_PERMISSIONS_TABLE)

# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# --- CORRECTED: Added the missing json_serial function ---
def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, timezone)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

# --- API Endpoints ---

@app.route('/api/projects', methods=['POST'])
@token_required
def create_project(current_user_sub):
    if 'model' not in request.files or 'projectName' not in request.form:
        return jsonify(error="Request must include 'model' file and 'projectName' form field"), 400
    
    file = request.files['model']
    project_name = request.form.get('projectName')

    if file.filename == '' or not allowed_file(file.filename):
        return jsonify(error="Invalid or no file selected"), 400

    # To ensure unique filenames in S3, prepend a UUID
    filename = f"{uuid.uuid4()}-{secure_filename(file.filename)}"
    
    try:
        s3_client.upload_fileobj(file, S3_BUCKET_NAME, filename)
        model_url = f"{S3_LOCATION}{filename}"
    except ClientError as e:
        return jsonify(error=f"Failed to upload model to cloud storage: {e}"), 500

    project_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    project = {
        'projectId': project_id,
        'projectName': project_name,
        'modelUrl': model_url,
        'ownerId': current_user_sub,
        'createdAt': created_at,
    }

    permission_id = str(uuid.uuid4())
    permission = {
        'permissionId': permission_id,
        'projectId': project_id,
        'userId': current_user_sub,
        'role': 'owner',
    }
    
    try:
        projects_table.put_item(Item=project)
        permissions_table.put_item(Item=permission)
    except ClientError as e:
        return jsonify(error=f"Failed to create project records in database: {e}"), 500

    return jsonify(project), 201


@app.route('/api/projects', methods=['GET'])
@token_required
def get_projects(current_user_sub):
    try:
        response = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(current_user_sub)
        )
        user_permissions = response.get('Items', [])

        if not user_permissions:
            return jsonify([])

        project_ids = [perm['projectId'] for perm in user_permissions]
        
        # Use DynamoDB's batch_get_item for efficiency
        batch_keys = [{'projectId': pid} for pid in project_ids]
        if not batch_keys:
            return jsonify([])

        project_response = dynamodb.batch_get_item(
            RequestItems={DYNAMODB_PROJECTS_TABLE: {'Keys': batch_keys}}
        )
        
        project_details = project_response['Responses'][DYNAMODB_PROJECTS_TABLE]
        sorted_projects = sorted(project_details, key=lambda p: p['createdAt'], reverse=True)
        
        return jsonify(json.loads(json.dumps(sorted_projects, default=json_serial))), 200
    except ClientError as e:
        return jsonify(error=f"Could not retrieve projects: {e}"), 500


@app.route('/api/issues', methods=['POST'])
@token_required
def create_issue(current_user_sub):
    data = request.get_json()
    
    required_fields = ['title', 'description', 'objectId', 'projectId']
    if not data or not all(field in data for field in required_fields):
        return jsonify(error="Missing required fields, including projectId"), 400

    issue_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    issue = {
        'id': issue_id,
        'projectId': data['projectId'],
        'objectId': data['objectId'],
        'sortKey': f"{created_at}#{issue_id}",
        'title': data['title'],
        'description': data['description'],
        'author': data.get('author', 'Unknown'),
        'priority': data.get('priority', 'medium'),
        'status': 'open',
        'createdAt': created_at,
        'updatedAt': created_at,
    }
    
    try:
        # CORRECTED: Use the specific 'issues_table' variable
        issues_table.put_item(Item=issue)
        return jsonify(json.loads(json.dumps(issue, default=json_serial))), 201
    except ClientError as e:
        return jsonify(error=f"Database error occurred: {e}"), 500

# You can add the other issue routes (GET by project, PUT, DELETE) here later.

# --- Health Check ---
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify(status="ok")

# --- Run the App ---
if __name__ == "__main__":
    print("Starting BIM Viewer API Server...")
    app.run(host="0.0.0.0", port=4000, debug=True)