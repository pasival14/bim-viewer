# BIM Viewer - 3D Model Collaboration Platform ( https://bim-viewer-wewb.onrender.com )

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
