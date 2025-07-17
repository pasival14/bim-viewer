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
from dotenv import load_dotenv

load_dotenv()

# --- Import Auth Decorator ---
from auth import token_required

# --- Configuration ---
ALLOWED_EXTENSIONS = {'glb'}
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')
COGNITO_USER_POOL_ID = os.environ.get('COGNITO_USER_POOL_ID') # <-- NEW

# --- Table Names ---
DYNAMODB_ISSUES_TABLE = 'bim-viewer-issues'
DYNAMODB_PROJECTS_TABLE = 'bim-viewer-projects'
DYNAMODB_PERMISSIONS_TABLE = 'bim-viewer-project-permissions'

if not S3_BUCKET_NAME or not COGNITO_USER_POOL_ID:
    raise ValueError("Error: S3_BUCKET_NAME and COGNITO_USER_POOL_ID environment variables must be set.")

S3_LOCATION = f'https://{S3_BUCKET_NAME}.s3.amazonaws.com/'

# --- Initialize Flask & Services ---
app = Flask(__name__)
CORS(app)

session = boto3.Session(region_name=AWS_REGION)
s3_client = session.client('s3')
cognito_client = session.client('cognito-idp') # <-- NEW Cognito client
dynamodb = session.resource('dynamodb')

# --- Connect to DynamoDB Tables ---
issues_table = dynamodb.Table(DYNAMODB_ISSUES_TABLE)
projects_table = dynamodb.Table(DYNAMODB_PROJECTS_TABLE)
permissions_table = dynamodb.Table(DYNAMODB_PERMISSIONS_TABLE)

# --- Helper Functions (Unchanged) ---
# ... (json_serial, allowed_file, etc.)
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def json_serial(obj):
    if isinstance(obj, (datetime, timezone)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def generate_presigned_url(bucket_name, object_key, expiration=3600):
    try:
        return s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=expiration
        )
    except ClientError as e:
        print(f"Error generating presigned URL: {e}")
        return None
# --- Projects Endpoints ---

# POST /api/projects (Unchanged)
@app.route('/api/projects', methods=['POST'])
@token_required
def create_project(current_user_sub):
    #... (Your existing create_project code remains here)
    if 'model' not in request.files or 'projectName' not in request.form:
        return jsonify(error="Request must include 'model' file and 'projectName' form field"), 400
    
    file = request.files['model']
    project_name = request.form.get('projectName')

    if file.filename == '' or not allowed_file(file.filename):
        return jsonify(error="Invalid or no file selected"), 400

    filename = f"{uuid.uuid4()}-{secure_filename(file.filename)}"
    
    try:
        s3_client.upload_fileobj(file, S3_BUCKET_NAME, filename)
    except ClientError as e:
        return jsonify(error=f"Failed to upload model: {e}"), 500

    project_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    project = {
        'projectId': project_id,
        'projectName': project_name,
        'modelKey': filename,
        'ownerId': current_user_sub,
        'createdAt': created_at,
    }

    permission = {
        'permissionId': str(uuid.uuid4()),
        'projectId': project_id,
        'userId': current_user_sub,
        'role': 'owner',
    }
    
    try:
        projects_table.put_item(Item=project)
        permissions_table.put_item(Item=permission)
    except ClientError as e:
        return jsonify(error=f"Failed to create project records: {e}"), 500

    return jsonify(project), 201
# GET /api/projects (Unchanged)
@app.route('/api/projects', methods=['GET'])
@token_required
def get_projects(current_user_sub):
    #... (Your existing get_projects code remains here)
    try:
        permissions_response = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(current_user_sub)
        )
        project_ids = [perm['projectId'] for perm in permissions_response.get('Items', [])]

        if not project_ids:
            return jsonify([])
        
        batch_keys = {'Keys': [{'projectId': pid} for pid in project_ids]}
        projects_response = dynamodb.batch_get_item(RequestItems={DYNAMODB_PROJECTS_TABLE: batch_keys})
        
        project_details = projects_response.get('Responses', {}).get(DYNAMODB_PROJECTS_TABLE, [])
        
        for project in project_details:
            if 'modelKey' in project:
                project['modelUrl'] = generate_presigned_url(S3_BUCKET_NAME, project['modelKey'])

        sorted_projects = sorted(project_details, key=lambda p: p['createdAt'], reverse=True)
        
        return jsonify(json.loads(json.dumps(sorted_projects, default=json_serial))), 200
    except ClientError as e:
        return jsonify(error=f"Could not retrieve projects: {e}"), 500
# --- NEW: Invite User Endpoint ---
@app.route('/api/projects/<string:project_id>/invite', methods=['POST'])
@token_required
def invite_user_to_project(current_user_sub, project_id):
    """
    Invites a user (by email) to collaborate on a project.
    """
    # 1. Check if the current user is the owner of the project
    try:
        project_item = projects_table.get_item(Key={'projectId': project_id}).get('Item')
        if not project_item or project_item.get('ownerId') != current_user_sub:
            return jsonify(error="Not authorized to share this project"), 403
    except ClientError as e:
        return jsonify(error=f"Database error: {e}"), 500

    # 2. Get the email of the user to invite from the request body
    data = request.get_json()
    if not data or 'email' not in data:
        return jsonify(error="Email of the user to invite is required"), 400
    
    invitee_email = data['email']

    # 3. Find the user in Cognito by their email
    try:
        cognito_response = cognito_client.list_users(
            UserPoolId=COGNITO_USER_POOL_ID,
            Filter=f"email = \"{invitee_email}\""
        )
        users = cognito_response.get('Users', [])
        if not users:
            return jsonify(error=f"User with email '{invitee_email}' not found"), 404
        
        # Extract the user's unique 'sub' identifier
        invitee_sub = next((attr['Value'] for attr in users[0]['Attributes'] if attr['Name'] == 'sub'), None)
        if not invitee_sub:
            return jsonify(error="Could not identify user attribute"), 500

    except ClientError as e:
        return jsonify(error=f"Cognito API error: {e}"), 500

    # 4. Create the new permission in DynamoDB
    permission = {
        'permissionId': str(uuid.uuid4()),
        'projectId': project_id,
        'userId': invitee_sub,
        'role': 'collaborator' # Assign the 'collaborator' role
    }
    
    try:
        permissions_table.put_item(Item=permission)
    except ClientError as e:
        return jsonify(error=f"Failed to save permission: {e}"), 500

    return jsonify(message=f"Successfully invited {invitee_email} to the project"), 200


# --- Issues Endpoints (Unchanged) ---
# ...
# ...

# --- Run App ---
if __name__ == "__main__":
    print("Starting BIM Viewer API Server...")
    app.run(host="0.0.0.0", port=4000, debug=True)