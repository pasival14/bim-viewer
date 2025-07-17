import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from datetime import datetime, timezone
from werkzeug.utils import secure_filename
import boto3
from botocore.exceptions import ClientError
import json
import uuid
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv()

# --- Import the new authentication decorator ---
from auth import token_required

# --- Configuration ---
ALLOWED_EXTENSIONS = {'glb'}
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.environ.get('S3_BUCKET_NAME')
COGNITO_USER_POOL_ID = os.environ.get('COGNITO_USER_POOL_ID')

# --- NEW: Define all table names ---
DYNAMODB_ISSUES_TABLE = os.environ.get('DYNAMODB_TABLE_NAME', 'bim-viewer-issues')
DYNAMODB_PROJECTS_TABLE = 'bim-viewer-projects'
DYNAMODB_PERMISSIONS_TABLE = 'bim-viewer-project-permissions'

# --- NEW: Add a check to ensure the S3 bucket name is set ---
if not S3_BUCKET_NAME:
    raise ValueError("Error: S3_BUCKET_NAME environment variable is not set.")

S3_LOCATION = f'https://{S3_BUCKET_NAME}.s3.amazonaws.com/'

# DynamoDB Configuration
DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'bim-viewer-issues')

# Initialize the Flask app
app = Flask(__name__)

# Setup CORS
CORS(app)

# Initialize DynamoDB connection
try:
    session = boto3.Session()
    dynamodb = session.resource('dynamodb', region_name=AWS_REGION)
    table = dynamodb.Table(DYNAMODB_TABLE_NAME)
    table.load()
    print(f"DynamoDB connection successful! Table: {DYNAMODB_TABLE_NAME}")
except Exception as e:
    print(f"DynamoDB connection failed: {e}")
    table = None

# Initialize S3 Client
s3_client = session.client('s3')
cognito_client = session.client('cognito-idp')

issues_table = dynamodb.Table(DYNAMODB_ISSUES_TABLE)
projects_table = dynamodb.Table(DYNAMODB_PROJECTS_TABLE)
permissions_table = dynamodb.Table(DYNAMODB_PERMISSIONS_TABLE)

# --- Helper Functions (Unchanged) ---
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def decimal_to_float(obj):
    if isinstance(obj, list):
        return [decimal_to_float(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: decimal_to_float(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

def serialize_issue(issue):
    if issue is None:
        return None
    serialized = decimal_to_float(issue)
    if 'createdAt' in serialized:
        serialized['createdAt'] = serialized['createdAt']
    if 'updatedAt' in serialized:
        serialized['updatedAt'] = serialized['updatedAt']
    return serialized

def validate_issue_data(data):
    required_fields = ['title', 'description', 'objectId', 'author']
    for field in required_fields:
        if field not in data or not data[field].strip():
            return False, f"Missing or empty field: {field}"
    if 'priority' in data and data['priority'] not in ['low', 'medium', 'high']:
        return False, "Priority must be 'low', 'medium', or 'high'"
    if 'status' in data and data['status'] not in ['open', 'in-progress', 'resolved']:
        return False, "Status must be 'open', 'in-progress', or 'resolved'"
    return True, ""

def json_serial(obj):
    """JSON serializer for objects not serializable by default json code"""
    if isinstance(obj, (datetime, timezone)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def generate_sort_key():
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')

# --- API Endpoints ---

# FIXED: Add better error handling and validation
def generate_presigned_url(bucket_name, object_key, expiration=3600):
    """Generate a presigned URL for S3 object"""
    try:
        # Validate inputs
        if not bucket_name or not object_key:
            print(f"Invalid parameters: bucket_name={bucket_name}, object_key={object_key}")
            return None
            
        # Check if object exists
        try:
            s3_client.head_object(Bucket=bucket_name, Key=object_key)
        except ClientError as e:
            if e.response['Error']['Code'] == '404':
                print(f"Object not found: {object_key}")
                return None
            else:
                print(f"Error checking object existence: {e}")
                return None
        
        # Generate presigned URL
        response = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': object_key},
            ExpiresIn=expiration
        )
        return response
    except ClientError as e:
        print(f"Error generating presigned URL: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error generating presigned URL: {e}")
        return None

# Modified create_project endpoint
@app.route('/api/projects', methods=['POST'])
@token_required
def create_project(current_user_sub):
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
    
    # --- MODIFIED: Store the permanent S3 key, NOT the temporary URL ---
    project = {
        'projectId': project_id,
        'projectName': project_name,
        'modelKey': filename,  # <-- Storing the permanent key
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

@app.route('/api/projects', methods=['GET'])
@token_required
def get_projects(current_user_sub):
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

        # --- FIXED: Generate presigned URL with proper error handling ---
        valid_projects = []
        for project in project_details:
            if 'modelKey' in project:
                presigned_url = generate_presigned_url(S3_BUCKET_NAME, project['modelKey'])
                if presigned_url:
                    project['modelUrl'] = presigned_url
                    valid_projects.append(project)
                else:
                    print(f"Warning: Could not generate presigned URL for project {project.get('projectId', 'unknown')}")
                    # Optionally include projects without valid URLs, or skip them
                    # For now, we'll skip projects with invalid URLs
                    continue
            else:
                print(f"Warning: Project {project.get('projectId', 'unknown')} has no modelKey")
                continue

        sorted_projects = sorted(valid_projects, key=lambda p: p['createdAt'], reverse=True)
        
        return jsonify(json.loads(json.dumps(sorted_projects, default=json_serial))), 200
    except ClientError as e:
        print(f"DynamoDB error: {e}")
        return jsonify(error=f"Could not retrieve projects: {e}"), 500
    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify(error="An unexpected error occurred"), 500

# ADDED: New endpoint to get a single project with fresh presigned URL
@app.route('/api/projects/<project_id>', methods=['GET'])
@token_required
def get_project(current_user_sub, project_id):
    try:
        # Check if user has permission to access this project
        permissions_response = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('projectId').eq(project_id) & 
                           boto3.dynamodb.conditions.Attr('userId').eq(current_user_sub)
        )
        
        if not permissions_response.get('Items', []):
            return jsonify(error="Project not found or access denied"), 404
        
        # Get project details
        project_response = projects_table.get_item(Key={'projectId': project_id})
        project = project_response.get('Item')
        
        if not project:
            return jsonify(error="Project not found"), 404
        
        # Generate fresh presigned URL
        if 'modelKey' in project:
            presigned_url = generate_presigned_url(S3_BUCKET_NAME, project['modelKey'])
            if presigned_url:
                project['modelUrl'] = presigned_url
            else:
                return jsonify(error="Could not generate access URL for model"), 500
        else:
            return jsonify(error="Project has no associated model"), 500
        
        return jsonify(json.loads(json.dumps(project, default=json_serial))), 200
        
    except ClientError as e:
        print(f"DynamoDB error: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Unexpected error: {e}")
        return jsonify(error="An unexpected error occurred"), 500
    
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

# --- Issues Endpoints (MODIFIED) ---

@app.route('/api/issues', methods=['POST'])
@token_required
def create_issue(current_user_sub):
    data = request.get_json()
    
    required_fields = ['title', 'description', 'objectId', 'author', 'projectId']
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
        'author': data['author'],
        'priority': data.get('priority', 'medium'),
        'status': data.get('status', 'open'),
        'createdAt': created_at,
        'updatedAt': created_at,
        'owner_sub': current_user_sub
    }
    
    try:
        issues_table.put_item(Item=issue)
        return jsonify(json.loads(json.dumps(issue, default=json_serial))), 201
    except ClientError as e:
        return jsonify(error="Database error occurred"), 500

@app.route('/api/issues/<object_id>', methods=['GET'])
@token_required
def get_issues_for_object(current_user_sub, object_id):
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('objectId').eq(object_id),
            ScanIndexForward=False
        )
        issues = response.get('Items', [])
        serialized_issues = [serialize_issue(issue) for issue in issues]
        return jsonify(serialized_issues)
        
    except ClientError as e:
        print(f"DynamoDB error fetching issues: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching issues: {e}")
        return jsonify(error="Failed to fetch issues"), 500

@app.route('/api/issues/<issue_id>', methods=['PUT'])
@token_required
def update_issue(current_user_sub, issue_id):
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No data provided"), 400
        
        response = table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id))
        items = response.get('Items', [])
        if not items:
            return jsonify(error="Issue not found"), 404
        
        current_issue = items[0]
        # Optional: Add ownership check
        # if current_issue.get('owner_sub') != current_user_sub:
        #     return jsonify(error="Not authorized to update this issue"), 403

        update_expression_parts = ["updatedAt = :updated_at"]
        expression_attribute_values = {':updated_at': datetime.utcnow().isoformat() + 'Z'}
        expression_attribute_names = {}

        allowed_fields = ['title', 'description', 'status', 'priority']
        for field in allowed_fields:
            if field in data:
                if field in ['title', 'description'] and not data[field].strip():
                    return jsonify(error=f"{field} cannot be empty"), 400
                if field == 'status' and data[field] not in ['open', 'in-progress', 'resolved']:
                    return jsonify(error="Invalid status"), 400
                if field == 'priority' and data[field] not in ['low', 'medium', 'high']:
                    return jsonify(error="Invalid priority"), 400
                
                update_expression_parts.append(f"#{field} = :{field}")
                expression_attribute_names[f"#{field}"] = field
                expression_attribute_values[f":{field}"] = data[field].strip() if isinstance(data[field], str) else data[field]

        update_expression = "SET " + ", ".join(update_expression_parts)
        
        update_args = {
            'Key': {'objectId': current_issue['objectId'], 'sortKey': current_issue['sortKey']},
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_attribute_values,
            'ReturnValues': 'ALL_NEW'
        }
        if expression_attribute_names:
            update_args['ExpressionAttributeNames'] = expression_attribute_names

        updated_response = table.update_item(**update_args)
        updated_issue = updated_response.get('Attributes')
        return jsonify(serialize_issue(updated_issue))
        
    except ClientError as e:
        print(f"DynamoDB error updating issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error updating issue: {e}")
        return jsonify(error="Failed to update issue"), 500

@app.route('/api/issues/<issue_id>', methods=['DELETE'])
@token_required
def delete_issue(current_user_sub, issue_id):
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        response = table.scan(FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id))
        items = response.get('Items', [])
        if not items:
            return jsonify(error="Issue not found"), 404
        
        current_issue = items[0]
        # Optional: Add ownership check
        # if current_issue.get('owner_sub') != current_user_sub:
        #     return jsonify(error="Not authorized to delete this issue"), 403

        table.delete_item(Key={'objectId': current_issue['objectId'], 'sortKey': current_issue['sortKey']})
        return jsonify(message="Issue deleted successfully")
        
    except ClientError as e:
        print(f"DynamoDB error deleting issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error deleting issue: {e}")
        return jsonify(error="Failed to delete issue"), 500

@app.route('/api/issues', methods=['GET'])
@token_required
def get_all_issues(current_user_sub):
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        status_filter = request.args.get('status')
        priority_filter = request.args.get('priority')
        object_id_filter = request.args.get('objectId')
        
        if object_id_filter:
            response = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('objectId').eq(object_id_filter),
                ScanIndexForward=False
            )
        else:
            response = table.scan()
        
        issues = response.get('Items', [])
        
        if status_filter:
            issues = [issue for issue in issues if issue.get('status') == status_filter]
        if priority_filter:
            issues = [issue for issue in issues if issue.get('priority') == priority_filter]
        
        issues.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        serialized_issues = [serialize_issue(issue) for issue in issues]
        return jsonify(serialized_issues)
        
    except ClientError as e:
        print(f"DynamoDB error fetching all issues: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching all issues: {e}")
        return jsonify(error="Failed to fetch issues"), 500

@app.route('/api/issues/stats', methods=['GET'])
@token_required
def get_issue_stats(current_user_sub):
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        response = table.scan()
        issues = response.get('Items', [])
        
        total_count = len(issues)
        status_counts = {'open': 0, 'in-progress': 0, 'resolved': 0}
        for issue in issues:
            status = issue.get('status', 'open')
            if status in status_counts:
                status_counts[status] += 1
        
        priority_counts = {'low': 0, 'medium': 0, 'high': 0}
        for issue in issues:
            priority = issue.get('priority', 'medium')
            if priority in priority_counts:
                priority_counts[priority] += 1
        
        return jsonify({
            'total': total_count,
            'by_status': status_counts,
            'by_priority': priority_counts
        })
        
    except ClientError as e:
        print(f"DynamoDB error fetching issue stats: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching issue stats: {e}")
        return jsonify(error="Failed to fetch issue statistics"), 500

# --- Error Handlers ---
@app.errorhandler(404)
def not_found(error):
    return jsonify(error="Endpoint not found"), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify(error="Internal server error"), 500

# --- Run the App ---
if __name__ == "__main__":
    print("Starting BIM Viewer API Server with DynamoDB and Cognito Auth...")
    print(f"AWS Region: {os.environ.get('AWS_REGION', 'Not Set')}")
    print(f"DynamoDB Table: {os.environ.get('DYNAMODB_TABLE_NAME', 'Not Set')}")
    print(f"S3_BUCKET_NAME: {S3_BUCKET_NAME}") 
    app.run(host="0.0.0.0", port=4000, debug=True)