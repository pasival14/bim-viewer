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

# --- Helper Functions ---
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

# --- NEW: Helper function to check if user has project access ---
def user_has_project_access(user_sub, project_id):
    """Check if user has access to a project"""
    try:
        permissions_response = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('projectId').eq(project_id) & 
                           boto3.dynamodb.conditions.Attr('userId').eq(user_sub)
        )
        return len(permissions_response.get('Items', [])) > 0
    except Exception as e:
        print(f"Error checking project access: {e}")
        return False

# --- NEW: Helper function to check if user exists ---
def check_user_exists(email):
    """
    Check if a user exists in Cognito User Pool by email.
    Returns (exists: bool, user_sub: str|None, error: str|None)
    """
    try:
        # Use AdminGetUser with email as username
        response = cognito_client.admin_get_user(
            UserPoolId=COGNITO_USER_POOL_ID,
            Username=email
        )
        
        # Extract the user's 'sub' from attributes
        user_sub = None
        for attr in response.get('UserAttributes', []):
            if attr['Name'] == 'sub':
                user_sub = attr['Value']
                break
        
        return True, user_sub, None
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'UserNotFoundException':
            return False, None, "User has not created an account"
        else:
            return False, None, f"Error checking user: {e}"
    except Exception as e:
        return False, None, f"Unexpected error: {e}"

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
        if not user_has_project_access(current_user_sub, project_id):
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

# --- FIXED: Check User Endpoint ---
@app.route('/check-user', methods=['POST'])
def check_user():
    """
    Checks if a user exists in the Cognito User Pool.
    Expects a JSON payload with an "email" key.
    """
    data = request.get_json()
    if not data or 'email' not in data:
        return jsonify({'error': 'Email is required'}), 400

    email = data['email']
    
    # Validate email format (basic check)
    if '@' not in email or '.' not in email:
        return jsonify({'error': 'Invalid email format'}), 400

    exists, user_sub, error = check_user_exists(email)
    
    if error:
        if "User has not created an account" in error:
            return jsonify({'error': error}), 404
        else:
            return jsonify({'error': error}), 500
    
    if exists:
        return jsonify({'message': f'User {email} exists.', 'userSub': user_sub}), 200
    else:
        return jsonify({'error': 'User has not created an account'}), 404

# --- UPDATED: Invite User Endpoint ---
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

    # 3. Check if the user exists using our helper function
    exists, invitee_sub, error = check_user_exists(invitee_email)
    
    if error:
        if "User has not created an account" in error:
            return jsonify(error=f"User with email '{invitee_email}' has not created an account yet"), 404
        else:
            return jsonify(error=f"Error checking user: {error}"), 500
    
    if not exists or not invitee_sub:
        return jsonify(error=f"User with email '{invitee_email}' not found"), 404

    # 4. Check if user is already invited to this project
    try:
        existing_permission = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('projectId').eq(project_id) & 
                           boto3.dynamodb.conditions.Attr('userId').eq(invitee_sub)
        )
        
        if existing_permission.get('Items', []):
            return jsonify(error=f"User {invitee_email} is already invited to this project"), 400
            
    except ClientError as e:
        return jsonify(error=f"Database error: {e}"), 500

    # 5. Create the new permission in DynamoDB
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


@app.route('/api/issues', methods=['POST'])
@token_required
def create_issue(current_user_sub):
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['title', 'description', 'objectId', 'author', 'projectId']
    if not data or not all(field in data for field in required_fields):
        return jsonify(error="Missing required fields: title, description, objectId, author, projectId"), 400

    # Check if user has access to the project
    if not user_has_project_access(current_user_sub, data['projectId']):
        return jsonify(error="Access denied to this project"), 403

    # Validate data
    is_valid, error_msg = validate_issue_data(data)
    if not is_valid:
        return jsonify(error=error_msg), 400

    issue_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc).isoformat()
    
    # FIXED: Create issue with projectId as partition key
    issue = {
        'projectId': data['projectId'],  # Partition key
        'sortKey': f"ISSUE#{issue_id}#{created_at}",  # Sort key
        'id': issue_id,  # Unique identifier for the issue
        'objectId': data['objectId'],  # Store as regular attribute
        'title': data['title'].strip(),
        'description': data['description'].strip(),
        'author': data['author'].strip(),
        'priority': data.get('priority', 'medium'),
        'status': data.get('status', 'open'),
        'createdAt': created_at,
        'updatedAt': created_at,
        'owner_sub': current_user_sub
    }
    
    try:
        issues_table.put_item(Item=issue)
        print(f"Created issue: {issue}")
        return jsonify(json.loads(json.dumps(serialize_issue(issue), default=json_serial))), 201
    except ClientError as e:
        print(f"DynamoDB error creating issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error creating issue: {e}")
        return jsonify(error="Failed to create issue"), 500


@app.route('/api/issues/<issue_id>', methods=['PUT'])
@token_required
def update_issue(current_user_sub, issue_id):
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No data provided"), 400
        
        print(f"Updating issue: {issue_id}")
        
        # FIXED: Find the issue by scanning for the issue ID
        response = issues_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id)
        )
        items = response.get('Items', [])

        if not items:
            print(f"Issue not found: {issue_id}")
            return jsonify(error="Issue not found"), 404

        current_issue = items[0]
        print(f"Found issue: {current_issue}")
        
        # Check if user has access to the project
        if not user_has_project_access(current_user_sub, current_issue['projectId']):
            return jsonify(error="Access denied to this issue"), 403

        # Prepare update expression
        update_expression_parts = ["updatedAt = :updated_at"]
        expression_attribute_values = {':updated_at': datetime.now(timezone.utc).isoformat()}
        expression_attribute_names = {}

        # Handle allowed fields
        allowed_fields = ['title', 'description', 'status', 'priority']
        for field in allowed_fields:
            if field in data:
                # Validate field values
                if field in ['title', 'description'] and not data[field].strip():
                    return jsonify(error=f"{field} cannot be empty"), 400
                if field == 'status' and data[field] not in ['open', 'in-progress', 'resolved']:
                    return jsonify(error="Status must be 'open', 'in-progress', or 'resolved'"), 400
                if field == 'priority' and data[field] not in ['low', 'medium', 'high']:
                    return jsonify(error="Priority must be 'low', 'medium', or 'high'"), 400
                
                update_expression_parts.append(f"#{field} = :{field}")
                expression_attribute_names[f"#{field}"] = field
                expression_attribute_values[f":{field}"] = data[field].strip() if isinstance(data[field], str) else data[field]

        update_expression = "SET " + ", ".join(update_expression_parts)
        
        # FIXED: Update using projectId and sortKey as composite key
        update_args = {
            'Key': {'projectId': current_issue['projectId'], 'sortKey': current_issue['sortKey']},
            'UpdateExpression': update_expression,
            'ExpressionAttributeValues': expression_attribute_values,
            'ReturnValues': 'ALL_NEW'
        }
        if expression_attribute_names:
            update_args['ExpressionAttributeNames'] = expression_attribute_names

        # Update the issue
        updated_response = issues_table.update_item(**update_args)
        updated_issue = updated_response.get('Attributes')
        
        print(f"Updated issue: {updated_issue}")
        return jsonify(serialize_issue(updated_issue)), 200
        
    except ClientError as e:
        print(f"DynamoDB error updating issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error updating issue: {e}")
        return jsonify(error="Failed to update issue"), 500

@app.route('/api/issues/<issue_id>', methods=['DELETE'])
@token_required
def delete_issue(current_user_sub, issue_id):
    try:
        # Find the issue by scanning for the issue ID
        response = issues_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id)
        )
        items = response.get('Items', [])
        
        if not items:
            return jsonify(error="Issue not found"), 404
        
        current_issue = items[0]
        
        # Check if user has access to the project
        if not user_has_project_access(current_user_sub, current_issue['projectId']):
            return jsonify(error="Access denied to this issue"), 403

        # FIXED: Delete using projectId and sortKey as composite key
        issues_table.delete_item(
            Key={'projectId': current_issue['projectId'], 'sortKey': current_issue['sortKey']}
        )
        
        return jsonify(message="Issue deleted successfully"), 200
        
    except ClientError as e:
        print(f"DynamoDB error deleting issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error deleting issue: {e}")
        return jsonify(error="Failed to delete issue"), 500

@app.route('/api/issues', methods=['GET'])
@token_required
def get_all_issues(current_user_sub):
    try:
        # Get query parameters
        status_filter = request.args.get('status')
        priority_filter = request.args.get('priority')
        object_id_filter = request.args.get('objectId')
        project_id_filter = request.args.get('projectId')
        
        accessible_issues = []
        
        # If filtering by specific project, use query (THIS IS NOW CORRECT)
        if project_id_filter:
            if user_has_project_access(current_user_sub, project_id_filter):
                response = issues_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('projectId').eq(project_id_filter),
                    ScanIndexForward=False  # Most recent first
                )
                accessible_issues = response.get('Items', [])
        else:
            # Get all projects the user has access to
            permissions_response = permissions_table.scan(
                FilterExpression=boto3.dynamodb.conditions.Attr('userId').eq(current_user_sub)
            )
            user_project_ids = [perm['projectId'] for perm in permissions_response.get('Items', [])]
            
            # Query issues for each accessible project
            for project_id in user_project_ids:
                response = issues_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('projectId').eq(project_id),
                    ScanIndexForward=False
                )
                accessible_issues.extend(response.get('Items', []))
        
        # Apply additional filters
        if status_filter:
            accessible_issues = [issue for issue in accessible_issues if issue.get('status') == status_filter]
        if priority_filter:
            accessible_issues = [issue for issue in accessible_issues if issue.get('priority') == priority_filter]
        if object_id_filter:
            accessible_issues = [issue for issue in accessible_issues if issue.get('objectId') == object_id_filter]
        
        # Sort by creation date (most recent first)
        accessible_issues.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        serialized_issues = [serialize_issue(issue) for issue in accessible_issues]
        return jsonify(serialized_issues), 200
        
    except ClientError as e:
        print(f"DynamoDB error fetching all issues: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching all issues: {e}")
        return jsonify(error="Failed to fetch issues"), 500

    
@app.route('/api/debug/permissions/<project_id>', methods=['GET'])
@token_required
def debug_permissions(current_user_sub, project_id):
    """Debug endpoint to check project permissions"""
    try:
        # Check permissions for the current user
        permissions_response = permissions_table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('projectId').eq(project_id)
        )
        permissions = permissions_response.get('Items', [])
        
        user_permission = None
        for perm in permissions:
            if perm['userId'] == current_user_sub:
                user_permission = perm
                break
        
        return jsonify({
            'projectId': project_id,
            'currentUserSub': current_user_sub,
            'userHasAccess': user_permission is not None,
            'userPermission': user_permission,
            'allPermissions': permissions
        }), 200
        
    except Exception as e:
        print(f"Error in debug permissions: {e}")
        return jsonify(error=str(e)), 500

# NEW: Debug endpoint to check all issues
@app.route('/api/debug/issues', methods=['GET'])
@token_required
def debug_all_issues(current_user_sub):
    """Debug endpoint to see all issues in the system"""
    try:
        response = issues_table.scan()
        issues = response.get('Items', [])
        
        return jsonify({
            'totalIssues': len(issues),
            'currentUserSub': current_user_sub,
            'issues': [serialize_issue(issue) for issue in issues]
        }), 200
        
    except Exception as e:
        print(f"Error in debug issues: {e}")
        return jsonify(error=str(e)), 500

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