import boto3
from botocore.exceptions import ClientError
import os

# Configuration
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')
TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'bim-viewer-issues')

def create_dynamodb_table():
    """Create the DynamoDB table for BIM viewer issues"""
    
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    
    try:
        # Check if table already exists
        table = dynamodb.Table(TABLE_NAME)
        table.load()
        print(f"Table {TABLE_NAME} already exists!")
        return table
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print(f"Table {TABLE_NAME} does not exist. Creating...")
        else:
            print(f"Error checking table: {e}")
            return None
    
    try:
        # Create table
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {
                    'AttributeName': 'objectId',
                    'KeyType': 'HASH'  # Partition key
                },
                {
                    'AttributeName': 'sortKey',
                    'KeyType': 'RANGE'  # Sort key
                }
            ],
            AttributeDefinitions=[
                {
                    'AttributeName': 'objectId',
                    'AttributeType': 'S'
                },
                {
                    'AttributeName': 'sortKey',
                    'AttributeType': 'S'
                }
            ],
            BillingMode='PAY_PER_REQUEST'  # On-demand pricing
        )
        
        # Wait for table to be created
        print("Creating table... This may take a few minutes.")
        table.wait_until_exists()
        
        print(f"Table {TABLE_NAME} created successfully!")
        print(f"Table ARN: {table.table_arn}")
        
        return table
        
    except ClientError as e:
        print(f"Error creating table: {e}")
        return None

def add_sample_data(table):
    """Add sample data to the table for testing"""
    from datetime import datetime
    import uuid
    
    sample_issues = [
        {
            'id': str(uuid.uuid4()),
            'objectId': 'wall-001',
            'sortKey': '2024-01-01T10:00:00.000000Z',
            'title': 'Wall alignment issue',
            'description': 'The wall is not properly aligned with the grid',
            'author': 'John Doe',
            'priority': 'high',
            'status': 'open',
            'createdAt': '2024-01-01T10:00:00.000000Z',
            'updatedAt': '2024-01-01T10:00:00.000000Z'
        },
        {
            'id': str(uuid.uuid4()),
            'objectId': 'wall-001',
            'sortKey': '2024-01-01T11:00:00.000000Z',
            'title': 'Material specification',
            'description': 'Need to verify the material specification for this wall',
            'author': 'Jane Smith',
            'priority': 'medium',
            'status': 'in-progress',
            'createdAt': '2024-01-01T11:00:00.000000Z',
            'updatedAt': '2024-01-01T11:00:00.000000Z'
        },
        {
            'id': str(uuid.uuid4()),
            'objectId': 'door-001',
            'sortKey': '2024-01-01T12:00:00.000000Z',
            'title': 'Door swing direction',
            'description': 'Door should swing outward for fire safety compliance',
            'author': 'Bob Johnson',
            'priority': 'high',
            'status': 'resolved',
            'createdAt': '2024-01-01T12:00:00.000000Z',
            'updatedAt': '2024-01-01T12:00:00.000000Z'
        }
    ]
    
    print("Adding sample data...")
    
    for issue in sample_issues:
        try:
            table.put_item(Item=issue)
            print(f"Added issue: {issue['title']}")
        except ClientError as e:
            print(f"Error adding issue {issue['title']}: {e}")
    
    print("Sample data added successfully!")

def main():
    print("Setting up DynamoDB table for BIM Viewer...")
    print(f"Region: {AWS_REGION}")
    print(f"Table Name: {TABLE_NAME}")
    
    # Create table
    table = create_dynamodb_table()
    
    if table:
        # Ask if user wants to add sample data
        add_sample = input("\nWould you like to add sample data? (y/n): ").lower().strip()
        if add_sample in ['y', 'yes']:
            add_sample_data(table)
        
        print("\nSetup complete!")
        print(f"Your DynamoDB table '{TABLE_NAME}' is ready to use.")
        print("\nMake sure to set the following environment variables:")
        print(f"  AWS_REGION={AWS_REGION}")
        print(f"  DYNAMODB_TABLE_NAME={TABLE_NAME}")
        print("\nAlso ensure your AWS credentials are configured (AWS CLI, IAM role, or environment variables).")
    else:
        print("Setup failed!")

if __name__ == "__main__":
    main()