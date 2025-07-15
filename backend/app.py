import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import boto3
from botocore.exceptions import ClientError
from datetime import datetime
import json
import uuid
from decimal import Decimal

# --- Configuration ---
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'glb'}

# DynamoDB Configuration
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
DYNAMODB_TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'bim-viewer-issues')

# Initialize the Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Setup CORS
CORS(app)

# Initialize DynamoDB connection
try:
    # Use boto3 session for better credential handling
    session = boto3.Session()
    dynamodb = session.resource('dynamodb', region_name=AWS_REGION)
    table = dynamodb.Table(DYNAMODB_TABLE_NAME)
    
    # Test the connection by describing the table
    table.load()
    print(f"DynamoDB connection successful! Table: {DYNAMODB_TABLE_NAME}")
except Exception as e:
    print(f"DynamoDB connection failed: {e}")
    table = None

# --- Helper Functions ---
def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def decimal_to_float(obj):
    """Convert DynamoDB Decimal types to float for JSON serialization"""
    if isinstance(obj, list):
        return [decimal_to_float(item) for item in obj]
    elif isinstance(obj, dict):
        return {key: decimal_to_float(value) for key, value in obj.items()}
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

def serialize_issue(issue):
    """Convert DynamoDB item to JSON-serializable format"""
    if issue is None:
        return None
    
    # Convert all Decimal types to float
    serialized = decimal_to_float(issue)
    
    # Ensure dates are properly formatted
    if 'createdAt' in serialized:
        serialized['createdAt'] = serialized['createdAt']
    if 'updatedAt' in serialized:
        serialized['updatedAt'] = serialized['updatedAt']
    
    return serialized

def validate_issue_data(data):
    """Validate issue data structure"""
    required_fields = ['title', 'description', 'objectId', 'author']
    
    for field in required_fields:
        if field not in data or not data[field].strip():
            return False, f"Missing or empty field: {field}"
    
    # Validate priority
    if 'priority' in data and data['priority'] not in ['low', 'medium', 'high']:
        return False, "Priority must be 'low', 'medium', or 'high'"
    
    # Validate status
    if 'status' in data and data['status'] not in ['open', 'in-progress', 'resolved']:
        return False, "Status must be 'open', 'in-progress', or 'resolved'"
    
    return True, ""

def generate_sort_key():
    """Generate a sort key for DynamoDB based on timestamp"""
    return datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S.%fZ')

# --- API Endpoints ---

@app.route("/api/health", methods=["GET"])
def health_check():
    dynamodb_status = "connected" if table is not None else "disconnected"
    return jsonify(
        status="ok", 
        message="Server is healthy",
        dynamodb_status=dynamodb_status
    )

@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'model' not in request.files:
        return jsonify(error="No file part in the request"), 400
    
    file = request.files['model']
    
    if file.filename == '':
        return jsonify(error="No file selected"), 400
    
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

# --- Issue Management Endpoints ---

@app.route('/api/issues', methods=['POST'])
def create_issue():
    """Create a new issue"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No data provided"), 400
        
        # Validate the data
        is_valid, error_message = validate_issue_data(data)
        if not is_valid:
            return jsonify(error=error_message), 400
        
        # Generate unique ID and timestamp
        issue_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat() + 'Z'
        
        # Create the issue document
        issue = {
            'id': issue_id,
            'objectId': data['objectId'].strip(),
            'sortKey': generate_sort_key(),
            'title': data['title'].strip(),
            'description': data['description'].strip(),
            'author': data['author'].strip(),
            'priority': data.get('priority', 'medium'),
            'status': data.get('status', 'open'),
            'createdAt': created_at,
            'updatedAt': created_at
        }
        
        # Insert into DynamoDB
        table.put_item(Item=issue)
        
        # Return the created issue
        return jsonify(serialize_issue(issue)), 201
        
    except ClientError as e:
        print(f"DynamoDB error creating issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error creating issue: {e}")
        return jsonify(error="Failed to create issue"), 500

@app.route('/api/issues/<object_id>', methods=['GET'])
def get_issues_for_object(object_id):
    """Get all issues for a specific object"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        # Query all issues for the given object ID
        response = table.query(
            KeyConditionExpression=boto3.dynamodb.conditions.Key('objectId').eq(object_id),
            ScanIndexForward=False  # Sort by sortKey in descending order (newest first)
        )
        
        issues = response.get('Items', [])
        
        # Serialize the issues
        serialized_issues = [serialize_issue(issue) for issue in issues]
        
        return jsonify(serialized_issues)
        
    except ClientError as e:
        print(f"DynamoDB error fetching issues: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching issues: {e}")
        return jsonify(error="Failed to fetch issues"), 500

@app.route('/api/issues/<issue_id>', methods=['PUT'])
def update_issue(issue_id):
    """Update an existing issue"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify(error="No data provided"), 400
        
        # First, we need to get the current issue to get its objectId (partition key)
        # We'll scan for the issue with the given ID
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id)
        )
        
        items = response.get('Items', [])
        if not items:
            return jsonify(error="Issue not found"), 404
        
        current_issue = items[0]
        
        # Prepare update expression
        update_expression = "SET updatedAt = :updated_at"
        expression_attribute_values = {
            ':updated_at': datetime.utcnow().isoformat() + 'Z'
        }
        
        # Add allowed fields to update
        allowed_fields = ['title', 'description', 'status', 'priority']
        for field in allowed_fields:
            if field in data:
                if field in ['title', 'description'] and not data[field].strip():
                    return jsonify(error=f"{field} cannot be empty"), 400
                if field == 'status' and data[field] not in ['open', 'in-progress', 'resolved']:
                    return jsonify(error="Invalid status"), 400
                if field == 'priority' and data[field] not in ['low', 'medium', 'high']:
                    return jsonify(error="Invalid priority"), 400
                
                update_expression += f", {field} = :{field}"
                expression_attribute_values[f':{field}'] = data[field].strip() if isinstance(data[field], str) else data[field]
        
        # Update the issue
        table.update_item(
            Key={
                'objectId': current_issue['objectId'],
                'sortKey': current_issue['sortKey']
            },
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues='ALL_NEW'
        )
        
        # Get the updated issue
        updated_response = table.get_item(
            Key={
                'objectId': current_issue['objectId'],
                'sortKey': current_issue['sortKey']
            }
        )
        
        updated_issue = updated_response.get('Item')
        return jsonify(serialize_issue(updated_issue))
        
    except ClientError as e:
        print(f"DynamoDB error updating issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error updating issue: {e}")
        return jsonify(error="Failed to update issue"), 500

@app.route('/api/issues/<issue_id>', methods=['DELETE'])
def delete_issue(issue_id):
    """Delete an issue"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        # First, we need to get the current issue to get its keys
        response = table.scan(
            FilterExpression=boto3.dynamodb.conditions.Attr('id').eq(issue_id)
        )
        
        items = response.get('Items', [])
        if not items:
            return jsonify(error="Issue not found"), 404
        
        current_issue = items[0]
        
        # Delete the issue
        table.delete_item(
            Key={
                'objectId': current_issue['objectId'],
                'sortKey': current_issue['sortKey']
            }
        )
        
        return jsonify(message="Issue deleted successfully")
        
    except ClientError as e:
        print(f"DynamoDB error deleting issue: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error deleting issue: {e}")
        return jsonify(error="Failed to delete issue"), 500

@app.route('/api/issues', methods=['GET'])
def get_all_issues():
    """Get all issues with optional filtering"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        # Get query parameters for filtering
        status_filter = request.args.get('status')
        priority_filter = request.args.get('priority')
        object_id_filter = request.args.get('objectId')
        
        if object_id_filter:
            # If filtering by objectId, use query for better performance
            response = table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('objectId').eq(object_id_filter),
                ScanIndexForward=False
            )
        else:
            # Otherwise, scan the entire table
            response = table.scan()
        
        issues = response.get('Items', [])
        
        # Apply additional filters if specified
        if status_filter:
            issues = [issue for issue in issues if issue.get('status') == status_filter]
        if priority_filter:
            issues = [issue for issue in issues if issue.get('priority') == priority_filter]
        
        # Sort by creation date (newest first)
        issues.sort(key=lambda x: x.get('createdAt', ''), reverse=True)
        
        # Serialize the issues
        serialized_issues = [serialize_issue(issue) for issue in issues]
        
        return jsonify(serialized_issues)
        
    except ClientError as e:
        print(f"DynamoDB error fetching all issues: {e}")
        return jsonify(error="Database error occurred"), 500
    except Exception as e:
        print(f"Error fetching all issues: {e}")
        return jsonify(error="Failed to fetch issues"), 500

@app.route('/api/issues/stats', methods=['GET'])
def get_issue_stats():
    """Get statistics about issues"""
    if table is None:
        return jsonify(error="Database connection not available"), 500
    
    try:
        # Scan all issues to calculate statistics
        response = table.scan()
        issues = response.get('Items', [])
        
        # Calculate statistics
        total_count = len(issues)
        
        # Count by status
        status_counts = {'open': 0, 'in-progress': 0, 'resolved': 0}
        for issue in issues:
            status = issue.get('status', 'open')
            if status in status_counts:
                status_counts[status] += 1
        
        # Count by priority
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
    print("Starting BIM Viewer API Server with DynamoDB...")
    print(f"Upload folder: {UPLOAD_FOLDER}")
    print(f"AWS Region: {AWS_REGION}")
    print(f"DynamoDB Table: {DYNAMODB_TABLE_NAME}")
    
    app.run(port=4000, debug=True)