# BIM Viewer

**Live App:** [https://bim-viewer-wewb.onrender.com/](https://bim-viewer-wewb.onrender.com/)
**Smaple .glb file:** https://drive.google.com/file/d/19NEHF_fXGILrrmABC7FJpE4dTNIAWgTO/view?usp=sharing

## Overview

BIM Viewer is a cloud-based platform for collaborative viewing, management, and issue tracking of 3D BIM models. It enables users to upload, share, and annotate 3D models, facilitating streamlined communication and project management for AEC (Architecture, Engineering, Construction) teams.

---

## Features

- **Secure Authentication:**  
  User authentication is managed via AWS Cognito, ensuring secure access and user management.

- **3D Model Upload & Viewing:**  
  Upload `.glb` BIM models and view them interactively in the browser with advanced controls (orbit, zoom, wireframe, lighting, etc.).

- **Automatic Model Compression:**  
  Uploaded 3D models are automatically compressed using the Draco 3D compression library via an AWS Lambda function, reducing file size and improving load times.

- **Project Dashboard:**  
  Manage multiple projects, each with its own 3D model and issue tracking.

- **Issue Tracking:**  
  Create, assign, and track issues directly on model objects. Issues support priorities, statuses, and rich metadata.

- **Collaboration & Sharing:**  
  Invite collaborators to projects by email. Permissions are managed to ensure only authorized users can access or modify projects.

- **Profile Management:**  
  Users can update their display name and view their profile information.

- **Cloud Storage & Scalability:**  
  Models and data are stored in AWS S3 and DynamoDB, ensuring reliability and scalability.

---

## User Guide

### 1. Accessing the App

Visit: [https://bim-viewer-wewb.onrender.com/](https://bim-viewer-wewb.onrender.com/)

### 2. Authentication

- Sign up with your email and full name.
- Log in with your registered email and password.
- All user sessions are securely managed via AWS Cognito.

### 3. Project Management

- **Create Project:**  
  Click "New Project" to upload a `.glb` model and name your project.
- **View Projects:**  
  All your projects are listed on the dashboard. Click a project to open the 3D viewer.
- **Edit/Rename/Delete:**  
  Use the project menu to rename or delete projects you own.

### 4. 3D Model Viewer

- **Navigation:**  
  Use mouse/touch to orbit, pan, and zoom.
- **Object Selection:**  
  Click on objects in the model to view properties and related issues.
- **Viewer Settings:**  
  Adjust background color, lighting, exposure, and wireframe mode from the settings panel.

### 5. Issue Tracking

- **Create Issue:**  
  Select an object and click "Add Issue" to annotate it with a title, description, priority, and status.
- **Manage Issues:**  
  Update issue status (open, in-progress, resolved) and view all issues for a project or object.

### 6. Collaboration

- **Invite Collaborators:**  
  Use the "Share" option in the project menu to invite users by email. Invited users will have access to the project upon registration.
- **Permissions:**  
  Only project owners can invite or remove collaborators.

### 7. Profile Management

- **Edit Profile:**  
  Update your display name from the user menu.

---

## Technical Architecture

- **Frontend:**  
  - React + Vite
  - Three.js (via @react-three/fiber and drei) for 3D rendering
  - AWS Amplify for authentication integration

- **Backend:**  
  - Python Flask API
  - AWS Cognito for authentication
  - AWS DynamoDB for projects, issues, and permissions
  - AWS S3 for model storage
  - CORS configured for secure cross-origin requests

- **Automatic File Compression:**  
  - When a `.glb` model is uploaded, an AWS Lambda function is triggered.
  - The Lambda function uses the Draco 3D compression library to compress the model.
  - The compressed file is stored in a separate S3 folder (`compressed/`), and the application serves the compressed version when available, improving performance and reducing bandwidth.

- **Deployment:**  
  - Frontend and backend are deployed on [Render.com](https://render.com/)
  - Environment variables are used for all sensitive configuration

---

## Security

- All API endpoints require authentication via JWT tokens issued by AWS Cognito.
- CORS is restricted to the deployed frontend URL.
- User permissions are enforced at the API level for all project and issue actions.

---

## Support

For questions, feature requests, or bug reports, please contact the project maintainer or open an issue in your project management system.

---

**Enjoy collaborating on your BIM projects!**  
[https://bim-viewer-wewb.onrender.com/](https://bim-viewer-wewb.onrender.com/)
