# BIM Viewer - 3D Model Collaboration Platform

A modern web-based BIM (Building Information Modeling) viewer built with React, Three.js, and AWS services. This platform enables users to upload, view, and collaborate on 3D models with integrated issue tracking and project management capabilities.

## 🚀 Features

### Core Functionality
- **3D Model Viewer**: Interactive 3D model visualization using React Three Fiber
- **Object Inspection**: Click on model objects to view detailed properties and metadata
- **Issue Tracking**: Create, manage, and track issues directly on 3D model objects
- **Project Management**: Organize and manage multiple BIM projects
- **Real-time Collaboration**: Share projects with team members

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
- **File Compression**: Automatic model optimization

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
- **Boto3** for AWS SDK

### Infrastructure
- **Render** for deployment
- **AWS Services** for cloud infrastructure

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
- Update bucket policy for public r
