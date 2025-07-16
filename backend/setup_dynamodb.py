import boto3
import os
from dotenv import load_dotenv

load_dotenv()

# --- Configuration ---
# Ensure AWS credentials and region are set in your environment or .env file
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

# Initialize DynamoDB resource
try:
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
except Exception as e:
    print(f"Error connecting to AWS. Please check your credentials and region setup. Details: {e}")
    exit()

def create_table(table_name, key_schema, attribute_definitions, provisioned_throughput):
    """A generic function to create a DynamoDB table."""
    print(f"Attempting to create table: {table_name}...")
    try:
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=key_schema,
            AttributeDefinitions=attribute_definitions,
            ProvisionedThroughput=provisioned_throughput
        )
        # Wait until the table exists.
        table.wait_until_exists()
        print(f"Table '{table_name}' created successfully.")
    except dynamodb.meta.client.exceptions.ResourceInUseException:
        print(f"Table '{table_name}' already exists. No action taken.")
    except Exception as e:
        print(f"An unexpected error occurred creating table '{table_name}': {e}")

def setup_all_tables():
    """Sets up all the required tables for the BIM Viewer application."""
    print("--- Starting Database Setup ---")

    # 1. Issues Table (from your original file)
    create_table(
        table_name='bim-viewer-issues',
        key_schema=[
            {'AttributeName': 'objectId', 'KeyType': 'HASH'},  # Partition key
            {'AttributeName': 'sortKey', 'KeyType': 'RANGE'}   # Sort key
        ],
        attribute_definitions=[
            {'AttributeName': 'objectId', 'AttributeType': 'S'},
            {'AttributeName': 'sortKey', 'AttributeType': 'S'}
        ],
        provisioned_throughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
    )

    # 2. Projects Table (NEW)
    create_table(
        table_name='bim-viewer-projects',
        key_schema=[
            {'AttributeName': 'projectId', 'KeyType': 'HASH'}  # Partition key
        ],
        attribute_definitions=[
            {'AttributeName': 'projectId', 'AttributeType': 'S'}
        ],
        provisioned_throughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
    )

    # 3. Project Permissions Table (NEW)
    create_table(
        table_name='bim-viewer-project-permissions',
        key_schema=[
            {'AttributeName': 'permissionId', 'KeyType': 'HASH'}  # Partition key
        ],
        attribute_definitions=[
            {'AttributeName': 'permissionId', 'AttributeType': 'S'}
        ],
        provisioned_throughput={'ReadCapacityUnits': 5, 'WriteCapacityUnits': 5}
    )

    print("\n--- Database Setup Complete ---")

if __name__ == '__main__':
    setup_all_tables()