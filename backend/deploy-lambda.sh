#!/bin/bash

# BIM Viewer Lambda Deployment Script
# This script packages and deploys the Draco compression Lambda function

set -e

# Configuration
FUNCTION_NAME="bim-viewer-compression"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-your-bim-viewer-bucket}"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="bim-viewer-compression-stack"

echo "🚀 Starting Lambda deployment..."

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS credentials verified"

# Create deployment directory
DEPLOY_DIR="lambda-deployment"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

echo "📦 Creating deployment package..."

# Copy Lambda function
cp compress-glb.js $DEPLOY_DIR/

# Copy package.json
cp lambda-package.json $DEPLOY_DIR/package.json

# Install dependencies
cd $DEPLOY_DIR
npm install --production
cd ..

# Create ZIP file
echo "🗜️  Creating ZIP package..."
cd $DEPLOY_DIR
zip -r ../lambda-package.zip .
cd ..

# Deploy using CloudFormation
echo "☁️  Deploying to AWS CloudFormation..."

# Check if stack exists
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION &> /dev/null; then
    echo "📝 Updating existing CloudFormation stack..."
    aws cloudformation update-stack \
        --stack-name $STACK_NAME \
        --template-body file://lambda-template.yaml \
        --parameters ParameterKey=S3BucketName,ParameterValue=$S3_BUCKET_NAME \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
    
    echo "⏳ Waiting for stack update to complete..."
    aws cloudformation wait stack-update-complete \
        --stack-name $STACK_NAME \
        --region $REGION
else
    echo "🆕 Creating new CloudFormation stack..."
    aws cloudformation create-stack \
        --stack-name $STACK_NAME \
        --template-body file://lambda-template.yaml \
        --parameters ParameterKey=S3BucketName,ParameterValue=$S3_BUCKET_NAME \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION
    
    echo "⏳ Waiting for stack creation to complete..."
    aws cloudformation wait stack-create-complete \
        --stack-name $STACK_NAME \
        --region $REGION
fi

# Update Lambda function code
echo "🔄 Updating Lambda function code..."
aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://lambda-package.zip \
    --region $REGION

# Wait for function update
echo "⏳ Waiting for function update to complete..."
aws lambda wait function-updated \
    --function-name $FUNCTION_NAME \
    --region $REGION

# Clean up
echo "🧹 Cleaning up deployment files..."
rm -rf $DEPLOY_DIR
rm lambda-package.zip

echo "✅ Deployment completed successfully!"
echo ""
echo "📋 Deployment Summary:"
echo "   Function Name: $FUNCTION_NAME"
echo "   S3 Bucket: $S3_BUCKET_NAME"
echo "   Region: $REGION"
echo "   Stack Name: $STACK_NAME"
echo ""
echo "🔗 View your Lambda function in the AWS Console:"
echo "   https://console.aws.amazon.com/lambda/home?region=$REGION#/functions/$FUNCTION_NAME"
echo ""
echo "📝 To test the function, upload a GLB file to s3://$S3_BUCKET_NAME/uploads/" 