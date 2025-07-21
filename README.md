# BIM Viewer - 3D Model Collaboration Platform

A modern web-based BIM (Building Information Modeling) viewer built with React, Three.js, and AWS services. This platform enables users to upload, view, and collaborate on 3D models with integrated issue tracking, project management, and automatic Draco compression.

## 🚀 Features

### Core Functionality

- **3D Model Viewer**: Interactive 3D model visualization using React Three Fiber
- **Object Inspection**: Click on model objects to view detailed properties and metadata
- **Issue Tracking**: Create, manage, and track issues directly on 3D model objects
- **Project Management**: Organize and manage multiple BIM projects
- **Real-time Collaboration**: Share projects with team members
- **Automatic Compression**: Draco compression via AWS Lambda for optimized model loading

### Viewer Controls

- **Camera Controls**: Orbit, pan, and zoom functionality
- **Visual Settings**:
  - Background color customization
  - Wireframe mode toggle
  - Punctual lighting controls
  - Exposure and ambient intensity adjustment
  - Auto-rotate functionality
- **Object Properties Panel**: Floating panel with minimize/maximize functionality

### Authentication & Security

- **AWS Cognito Integration**: Secure user authentication
- **JWT Token Management**: Protected API endpoints
- **User Profile Management**: Custom attributes support

### File Management

- **GLB File Support**: Upload and view 3D models in GLB format
- **S3 Storage**: Secure cloud storage with presigned URLs
- **Draco Compression**: Automatic model optimization via AWS Lambda
- **File Size Optimization**: Compressed models for faster loading

## 🛠️ Tech Stack

### Frontend

- **React 18** with TypeScript
- **React Three Fiber** for 3D rendering
- **Drei** for Three.js utilities
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **AWS Amplify** for authentication
- **Vite** for build tooling

### Backend

- **Flask** (Python) REST API
- **AWS DynamoDB** for data storage
- **AWS S3** for file storage
- **AWS Cognito** for authentication
- **AWS Lambda** for Draco compression
- **Boto3** for AWS SDK

### Infrastructure

- **Render** for deployment
- **AWS Services** for cloud infrastructure
- **CloudFormation** for infrastructure as code

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **AWS CLI** configured with appropriate permissions
- **Git**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone <your-repository-url>
cd bim-viewer
```

### 2. Backend Setup

#### Install Python Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

#### Environment Configuration

Create a `.env` file in the `backend` directory:

```env
AWS_REGION=us-east-1
AWS_DEFAULT_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name
COGNITO_USER_POOL_ID=your-cognito-user-pool-id
DYNAMODB_TABLE_NAME=bim-viewer-issues
```

#### Database Setup

```bash
python setup_dynamodb.py
```

#### Deploy Lambda Compression Function

```bash
# Set your S3 bucket name
export S3_BUCKET_NAME=your-s3-bucket-name

# Make deployment script executable
chmod +x deploy-lambda.sh

# Deploy Lambda function
./deploy-lambda.sh
```

#### Start Backend Server

```bash
python app.py
```

The backend will run on `http://localhost:4000`

### 3. Frontend Setup

#### Install Dependencies

```bash
cd frontend
npm install
```

#### Environment Configuration

Create a `.env` file in the `frontend` directory:

```env
VITE_API_URL=http://localhost:4000
```

#### Start Development Server

```bash
npm run dev
```

The frontend will run on `http://localhost:5173`

## 🏗️ AWS Setup

### 1. S3 Bucket Configuration

- Create an S3 bucket for model storage
- Configure CORS policy:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

- Disable "Block Public Access" settings
- Update bucket policy for public read access

### 2. Cognito User Pool

- Create a Cognito User Pool
- Configure authentication flow
- Add custom attributes (e.g., `custom:Name`)
- Set up app client

### 3. DynamoDB Tables

The setup script creates three tables:

- `bim-viewer-issues`: Issue tracking data
- `bim-viewer-projects`: Project metadata
- `bim-viewer-project-permissions`: User access control

### 4. Lambda Function Setup

The Lambda function automatically compresses GLB files using Draco compression:

#### Features:

- **Automatic Trigger**: Triggers when GLB files are uploaded to S3
- **Draco Compression**: Uses gltf-transform for optimal compression
- **Async Processing**: Non-blocking compression for better user experience
- **Error Handling**: Comprehensive error logging and recovery

#### Compression Settings:

- **Method**: Edgebreaker (optimal for most models)
- **Encode Speed**: 5 (balanced between speed and compression)
- **Decode Speed**: 5 (fast decompression)

## 📦 Deployment

### Render Deployment

#### Backend Service

1. Connect your GitHub repository to Render
2. Create a new Web Service
3. Configure build settings:
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `python app.py`
   - **Environment**: Python 3

#### Frontend Service

1. Create a new Static Site
2. Configure build settings:
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
   - **Environment**: Node

#### Environment Variables

Set the following environment variables in Render:

```env
AWS_REGION=us-east-1
AWS_DEFAULT_REGION=us-east-1
S3_BUCKET_NAME=your-s3-bucket-name
COGNITO_USER_POOL_ID=your-cognito-user-pool-id
DYNAMODB_TABLE_NAME=bim-viewer-issues
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

### Lambda Deployment

The Lambda function is deployed using CloudFormation:

```bash
# Deploy Lambda function
./deploy-lambda.sh
```

This creates:

- Lambda function with Draco compression
- IAM roles and policies
- S3 bucket notifications
- CloudFormation stack for infrastructure management

## 🎯 Usage Guide

### Creating a Project

1. Sign in to your account
2. Click "New Project" in the dashboard
3. Enter a project name
4. Upload a GLB file (max 50MB)
5. Wait for upload completion
6. The Lambda function will automatically compress the model

### Model Compression

- **Automatic**: Models are compressed automatically when uploaded
- **Manual Trigger**: Use the API to manually trigger compression
- **Status Check**: Check compression status via API
- **Fallback**: Original models are used if compression fails

### Viewing 3D Models

1. Click on a project card to open the viewer
2. Use mouse controls:
   - **Left click + drag**: Rotate camera
   - **Right click + drag**: Pan camera
   - **Scroll**: Zoom in/out
3. Click on model objects to view properties
4. Compressed models load faster for better performance

### Managing Issues

1. Select an object in the 3D viewer
2. Switch to the "Issues" tab in the properties panel
3. Click "Add Issue" to create a new issue
4. Fill in issue details and submit

### Viewer Settings

- Click the settings icon (gear) in the top-right corner
- Adjust background color, lighting, and other visual settings
- Toggle wireframe mode and auto-rotate

### Sharing Projects

1. Click the share icon on a project card
2. Enter the email address of the user to invite
3. The user will receive access to the project

## 🔧 Development

### Project Structure

```
bim-viewer/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── auth.py                # Authentication middleware
│   ├── setup_dynamodb.py      # Database setup script
│   ├── compress-glb.js        # Lambda compression function
│   ├── lambda-package.json    # Lambda dependencies
│   ├── lambda-template.yaml   # CloudFormation template
│   ├── deploy-lambda.sh       # Lambda deployment script
│   ├── requirements.txt       # Python dependencies
│   └── uploads/               # Local file storage
├── frontend/
│   ├── src/
│   │   ├── App.tsx            # Main application component
│   │   ├── Dashboard.tsx      # Project dashboard
│   │   ├── AuthWrapper.tsx    # Authentication wrapper
│   │   └── main.tsx           # Application entry point
│   ├── package.json           # Node.js dependencies
│   └── index.html             # HTML template
└── README.md
```

### Key Components

#### Frontend Components

- **App.tsx**: Main application with 3D viewer and dashboard
- **Dashboard.tsx**: Project management interface
- **AuthWrapper.tsx**: Authentication and routing
- **Model Component**: 3D model rendering and interaction

#### Backend Endpoints

- `/api/projects`: Project CRUD operations
- `/api/issues`: Issue management
- `/api/profile`: User profile updates
- `/api/compress/<project_id>`: Manual compression trigger
- `/api/compress/<project_id>/status`: Compression status check
- `/check-user`: User existence verification

#### Lambda Function

- **compress-glb.js**: Draco compression logic
- **Automatic Trigger**: S3 bucket notifications
- **Error Handling**: Comprehensive logging and recovery
- **Performance**: Optimized for Lambda environment

### Adding New Features

1. **Frontend**: Add components in `src/` directory
2. **Backend**: Add routes in `app.py`
3. **Database**: Update DynamoDB schema if needed
4. **Lambda**: Update compression logic if needed
5. **Testing**: Test locally before deployment

## 🐛 Troubleshooting

### Common Issues

#### Model Loading Issues

- Ensure GLB file is valid and under 50MB
- Check S3 bucket permissions and CORS settings
- Verify presigned URL generation
- Check if compressed version exists

#### Compression Issues

- Verify Lambda function is deployed correctly
- Check CloudWatch logs for compression errors
- Ensure S3 bucket notifications are configured
- Verify IAM permissions for Lambda

#### Authentication Problems

- Confirm Cognito User Pool configuration
- Check JWT token validity
- Verify environment variables

#### Database Errors

- Ensure DynamoDB tables exist
- Check AWS credentials and permissions
- Verify table schema matches code

### Debug Mode

Enable debug logging by setting environment variables:

```env
FLASK_DEBUG=1
```

### Lambda Logs

Check CloudWatch logs for Lambda function:

```bash
aws logs tail /aws/lambda/bim-viewer-compression --follow
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:

- Create an issue in the GitHub repository
- Check the troubleshooting section
- Review AWS service documentation

## 🔮 Roadmap

- [ ] Real-time collaboration features
- [ ] Advanced model analysis tools
- [ ] Mobile application
- [ ] Integration with BIM software
- [ ] Advanced issue tracking workflows
- [ ] Model versioning system
- [ ] Advanced compression options
- [ ] Model optimization recommendations

---

**Built with ❤️ using React, Three.js, AWS Lambda, and Draco compression**
