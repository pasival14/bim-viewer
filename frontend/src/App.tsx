import React, { Suspense, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html, useGLTF } from '@react-three/drei';
import { Building, UploadCloud, Box, X, MessageCircle, Plus, Send, AlertCircle, Clock, User, LogOut, ArrowLeft } from 'lucide-react';
import type { Object3D } from 'three';
import * as THREE from 'three';
import { fetchAuthSession } from 'aws-amplify/auth';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { ProjectDashboard } from './Dashboard';

const API_URL = 'http://localhost:4000';

// Types for our issue system - FIXED to match backend response
interface Issue {
  id: string;  // Changed from _id to id
  objectId: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  author: string;
  projectId: string;  // Added projectId field
  sortKey?: string;   // Added optional sortKey field
}

interface NewIssue {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  author: string;
  projectId: string;  // Added projectId field
}

// Project interface - should match what's returned from your API
interface Project {
  projectId: string;
  projectName: string;
  modelUrl: string;
  ownerId: string;
  createdAt: string;
}

// Authentication-related interfaces
interface AppProps {
  signOut?: () => void;
  user?: {
    username: string;
    attributes: {
      email: string;
      [key: string]: any;
    };
  };
}

const Loader = () => (
  <Html center>
    <div className="flex items-center justify-center text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500"></div>
      <span className="ml-2">Loading...</span>
    </div>
  </Html>
);

const Model = ({ url, onObjectClick }: { url: string; onObjectClick: (data: any) => void }) => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  console.log('Model component render:', { url, isLoading, loadingProgress, loadError });

  // Add timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (isLoading) {
        console.log('Loading timeout reached, setting error');
        setLoadError('Loading timeout - please try refreshing the page');
        setIsLoading(false);
      }
    }, 30000); // 30 second timeout

    return () => clearTimeout(timeout);
  }, [isLoading]);

  // Add validation for URL
  if (!url || url === 'undefined' || url === 'null') {
    console.log('Invalid URL detected:', url);
    return (
      <Html center>
        <div className="flex flex-col items-center justify-center text-red-500 p-4">
          <AlertCircle className="w-12 h-12 mb-2" />
          <p className="text-center">Model URL is not available</p>
          <p className="text-sm text-gray-500 text-center">Please check your project configuration</p>
          <p className="text-xs text-gray-400 mt-2">URL: {url}</p>
        </div>
      </Html>
    );
  }

  console.log('Starting to load model with URL:', url);

  // Use useGLTF instead of useLoader for GLB files
  const { scene } = useGLTF(url);
  
  console.log('useGLTF result:', { scene });

  // Hide loading when model is loaded
  useEffect(() => {
    console.log('useEffect triggered, scene:', scene);
    if (scene) {
      console.log('Model loaded successfully');
      setLoadingProgress(100);
      setTimeout(() => {
        console.log('Setting isLoading to false');
        setIsLoading(false);
      }, 500); // Small delay to show 100%
    }
  }, [scene]);

  // Define handleMeshClick function with useCallback to prevent recreation
  const handleMeshClick = useCallback((event: any) => {
    console.log('Click detected!', event);
    event.stopPropagation();
    
    let clickedObject: Object3D | null = event.object;
    let objectData: any = {};
    let foundMeaningfulData = false;
    
    if (clickedObject) {
      const userData = clickedObject.userData;
      console.log('Clicked object userData:', userData);
      
      if (userData?.name) {
        objectData.revitName = userData.name;
        foundMeaningfulData = true;
      }
      
      if (clickedObject.name && clickedObject.name !== 'Scene') {
        objectData.objectName = clickedObject.name;
      }
      objectData.type = clickedObject.type;
      
      if (clickedObject.position) {
        objectData.position = `${clickedObject.position.x.toFixed(2)}, ${clickedObject.position.y.toFixed(2)}, ${clickedObject.position.z.toFixed(2)}`;
      }
      
      if (clickedObject.rotation) {
        objectData.rotation = `${clickedObject.rotation.x.toFixed(2)}, ${clickedObject.rotation.y.toFixed(2)}, ${clickedObject.rotation.z.toFixed(2)}`;
      }
      
      if (clickedObject.scale) {
        objectData.scale = `${clickedObject.scale.x.toFixed(2)}, ${clickedObject.scale.y.toFixed(2)}, ${clickedObject.scale.z.toFixed(2)}`;
      }
      
      if ((clickedObject as any).material) {
        const material = (clickedObject as any).material;
        if (material.name) {
          objectData.material = material.name;
        }
        if (material.color) {
          objectData.materialColor = `rgb(${Math.round(material.color.r * 255)}, ${Math.round(material.color.g * 255)}, ${Math.round(material.color.b * 255)})`;
        }
      }
      
      if ((clickedObject as any).geometry) {
        const geometry = (clickedObject as any).geometry;
        if (geometry.attributes?.position) {
          objectData.vertices = geometry.attributes.position.count;
        }
        if (geometry.index) {
          objectData.faces = geometry.index.count / 3;
        }
      }
      
      if (userData) {
        console.log('Found userData:', userData);
        
        if (userData.extras && Object.keys(userData.extras).length > 0) {
          objectData = { ...objectData, ...userData.extras };
          foundMeaningfulData = true;
        }
        
        Object.keys(userData).forEach(key => {
          if (key !== 'extras' && userData[key] !== undefined) {
            objectData[key] = userData[key];
            if (key !== 'name') foundMeaningfulData = true;
          }
        });
      }
    }
    
    if (!foundMeaningfulData) {
      let parent = clickedObject?.parent;
      while (parent && parent.type !== 'Scene') {
        const parentUserData = parent.userData;
        if (parentUserData?.name) {
          objectData.parentRevitName = parentUserData.name;
          foundMeaningfulData = true;
          break;
        }
        if (parentUserData && Object.keys(parentUserData).length > 0) {
          Object.keys(parentUserData).forEach(key => {
            if (key !== 'extras' && parentUserData[key] !== undefined) {
              objectData[`parent_${key}`] = parentUserData[key];
              foundMeaningfulData = true;
            }
          });
        }
        parent = parent.parent;
      }
    }
    
    objectData.clickedAt = new Date().toLocaleTimeString();
    objectData.objectUUID = event.object.uuid;
    
    console.log('Final object data:', objectData);
    onObjectClick(objectData);
  }, [onObjectClick]);

  // Move useMemo to the top level, before any conditional returns
  const clickableScene = useMemo(() => {
    if (!scene) return null;
    const clonedScene = scene.clone();
    clonedScene.traverse((child) => {
      if ((child as any).isMesh) {
        (child as any).onClick = handleMeshClick;
        (child as any).raycast = child.raycast;
      }
    });
    return clonedScene;
  }, [scene, handleMeshClick]);

  // Show loading progress
  if (isLoading) {
    return (
      <Html center>
        <div className="flex flex-col items-center justify-center text-slate-600 p-8">
          <div className="w-64 bg-slate-200 rounded-full h-3 mb-4">
            <div
              className="bg-sky-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <p className="text-sm font-medium">Loading 3D Model...</p>
          <p className="text-xs text-slate-500 mt-1">{loadingProgress}%</p>
          <p className="text-xs text-slate-400 mt-2">URL: {url.substring(0, 50)}...</p>
        </div>
      </Html>
    );
  }

  // Show error if loading failed
  if (loadError) {
    return (
      <Html center>
        <div className="flex flex-col items-center justify-center text-red-500 p-4">
          <AlertCircle className="w-12 h-12 mb-2" />
          <p className="text-center">Failed to load model</p>
          <p className="text-sm text-gray-500 text-center">{loadError}</p>
          <p className="text-xs text-gray-400 mt-2">URL: {url.substring(0, 50)}...</p>
        </div>
      </Html>
    );
  }

  // If no scene is available, show loading
  if (!scene || !clickableScene) {
    return (
      <Html center>
        <div className="flex flex-col items-center justify-center text-slate-600 p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500"></div>
          <span className="ml-2">Loading...</span>
        </div>
      </Html>
    );
  }

  return (
    <group onClick={handleMeshClick}>
      <primitive object={clickableScene} />
    </group>
  );
};

const IssueItem = ({ issue, onStatusChange }: { issue: Issue; onStatusChange: (id: string, status: string) => void }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-red-100 text-red-800';
      case 'in-progress': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3 mb-3 bg-white">
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-semibold text-slate-800 text-sm">{issue.title}</h4>
        <div className="flex gap-2">
          <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(issue.status)}`}>
            {issue.status}
          </span>
          <span className={`text-xs font-medium ${getPriorityColor(issue.priority)}`}>
            {issue.priority}
          </span>
        </div>
      </div>
      
      <p className="text-sm text-slate-600 mb-2">{issue.description}</p>
      
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
        <div className="flex items-center gap-1">
          <User size={12} />
          <span>{issue.author}</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock size={12} />
          <span>{new Date(issue.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      
      <div className="flex gap-2">
        <select 
          value={issue.status} 
          onChange={(e) => onStatusChange(issue.id, e.target.value)}
          className="text-xs border border-slate-300 rounded px-2 py-1"
        >
          <option value="open">Open</option>
          <option value="in-progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>
    </div>
  );
};

const IssueForm = ({ onSubmit, onCancel, defaultAuthor, projectId }: { 
  onSubmit: (issue: NewIssue) => void; 
  onCancel: () => void;
  defaultAuthor: string;
  projectId: string;
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [author, setAuthor] = useState(defaultAuthor);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !author.trim()) return;
    
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      author: author.trim(),
      projectId  // Include projectId in the submission
    });
    
    setTitle('');
    setDescription('');
    setPriority('medium');
    setAuthor(defaultAuthor);
  };

  return (
    <form onSubmit={handleSubmit} className="border border-slate-200 rounded-lg p-4 mb-4 bg-slate-50">
      <h4 className="font-semibold text-slate-800 mb-3">Create New Issue</h4>
      
      <div className="mb-3">
        <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Brief description of the issue"
          required
        />
      </div>
      
      <div className="mb-3">
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          rows={3}
          placeholder="Detailed description of the issue"
          required
        />
      </div>
      
      <div className="mb-3">
        <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      
      <div className="mb-4">
        <label className="block text-sm font-medium text-slate-700 mb-1">Author</label>
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          placeholder="Your name"
          required
        />
      </div>
      
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 text-sm"
        >
          <Send size={16} />
          Create Issue
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-300 text-slate-700 rounded hover:bg-slate-400 text-sm"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};

// Updated IssuesPanel component with better error handling and debugging
// Updated IssuesPanel component with better objectId handling

const IssuesPanel = ({ objectData, authToken, projectId, user }) => {
  const [issues, setIssues] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [debugInfo, setDebugInfo] = useState(null);

  // FIXED: Use a more consistent objectId
  const objectId = objectData?.objectUUID || objectData?.objectName || objectData?.revitName || 'unknown';

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = async (url, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    console.log(`API ${options.method || 'GET'} ${url}:`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    return response;
  };

  // FIXED: Always fetch issues when projectId is available
  useEffect(() => {
    if (projectId) {
      console.log('Fetching issues for project:', projectId);
      fetchIssues();
    }
  }, [projectId]);

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('Fetching issues for project:', projectId);
      const response = await makeAuthenticatedRequest(
        `${API_URL}/api/issues?projectId=${projectId}`
      );
      
      if (!response.ok) {
        if (response.status === 404) {
          console.log('No issues found for project:', projectId);
          setIssues([]);
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to fetch issues: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Fetched issues:', data);
      setIssues(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching issues:', err);
    } finally {
      setLoading(false);
    }
  };

  const createIssue = async (newIssue) => {
    setLoading(true);
    setError(null);
    try {
      const issueData = {
        ...newIssue,
        objectId: objectId, // This will be stored as a regular attribute
        projectId
      };
      
      console.log('Creating issue:', issueData);
      
      const response = await makeAuthenticatedRequest(`${API_URL}/api/issues`, {
        method: 'POST',
        body: JSON.stringify(issueData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Create issue error:', errorData);
        throw new Error(errorData.error || `Failed to create issue: ${response.status}`);
      }
      
      const createdIssue = await response.json();
      console.log('Created issue:', createdIssue);
      
      setIssues(prev => [createdIssue, ...prev]);
      setShowForm(false);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating issue:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateIssueStatus = async (issueId, status) => {
    setLoading(true);
    setError(null);
    try {
      console.log('Updating issue status:', { issueId, status });
      
      const response = await makeAuthenticatedRequest(`${API_URL}/api/issues/${issueId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Update issue error:', errorData);
        throw new Error(errorData.error || `Failed to update issue: ${response.status}`);
      }
      
      const updatedIssue = await response.json();
      console.log('Updated issue:', updatedIssue);
      setIssues(prev => prev.map(issue => 
        issue.id === issueId ? updatedIssue : issue
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error updating issue:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!objectData) {
    return (
      <div className="p-4 text-center text-slate-500">
        <MessageCircle className="mx-auto w-12 h-12 mb-2" />
        <p>Select an object to view and manage issues.</p>
        <p className="text-sm mt-2">Issues for Project: {projectId}</p>
        {issues.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold mb-2">All Project Issues ({issues.length})</h4>
            <div className="space-y-2 text-left">
              {issues.map((issue) => (
                <IssueItem 
                  key={issue.id}
                  issue={issue}
                  onStatusChange={updateIssueStatus}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const defaultAuthor = user?.attributes?.name || user?.attributes?.email || user?.username || '';

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <MessageCircle size={20} />
          Issues ({issues.length})
        </h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-3 py-1 bg-sky-600 text-white rounded hover:bg-sky-700 text-sm"
        >
          <Plus size={16} />
          Add Issue
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
        </div>
      )}

      {showForm && (
        <IssueForm 
          onSubmit={createIssue}
          onCancel={() => setShowForm(false)}
          defaultAuthor={defaultAuthor}
          projectId={projectId}
        />
      )}

      <div className="space-y-2">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
            <span className="ml-2 text-sm text-slate-600">Loading...</span>
          </div>
        )}
        
        {!loading && issues.length === 0 && (
          <div className="text-center py-8 text-slate-500">
            <MessageCircle className="mx-auto w-8 h-8 mb-2" />
            <p className="text-sm">No issues found for this project.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Issue" to create the first one.</p>
          </div>
        )}
        
        {!loading && issues.map((issue) => (
          <IssueItem 
            key={issue.id}
            issue={issue}
            onStatusChange={updateIssueStatus}
          />
        ))}
      </div>
    </div>
  );
};

const PropertiesPanel = ({ data, onClear, authToken, projectId, user }) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'issues'>('properties');

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        <Box className="mx-auto w-12 h-12 mb-2" />
        <p>Click on an object in the model to view its properties and issues.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center p-4 border-b border-slate-200">
        <h3 className="text-lg font-bold text-slate-800">Object Details</h3>
        <button onClick={onClear} className="p-1 text-slate-500 hover:text-slate-800">
          <X size={20} />
        </button>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('properties')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'properties'
              ? 'text-sky-600 border-b-2 border-sky-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Properties
        </button>
        <button
          onClick={() => setActiveTab('issues')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'issues'
              ? 'text-sky-600 border-b-2 border-sky-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Issues
        </button>
      </div>

      {activeTab === 'properties' && (
        <div className="p-4">
          <div className="bg-slate-50 p-3 rounded-md max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {Object.entries(data).map(([key, value]) => (
                  <tr key={key} className="border-b border-slate-200">
                    <td className="font-semibold p-2 text-slate-700">{key}</td>
                    <td className="p-2 break-all text-slate-600">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'issues' && (
        <IssuesPanel 
          objectData={data} 
          authToken={authToken} 
          projectId={projectId}
          user={user}
        />
      )}
    </div>
  );
};

const App: React.FC<AppProps> = ({ signOut, user }) => {
  const [selectedObjectData, setSelectedObjectData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [userAttributes, setUserAttributes] = useState<{ [key: string]: any }>({});
  const [userAttrsLoading, setUserAttrsLoading] = useState(true);

  // Get the current user's token and attributes when the component mounts
  useEffect(() => {
    const getAuthTokenAndAttributes = async () => {
      try {
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        if (idToken) {
          setAuthToken(idToken);
        } else {
          throw new Error('No ID token found');
        }
        // Fetch user attributes (including name)
        const attrs = await fetchUserAttributes();
        setUserAttributes(attrs);
        setUserAttrsLoading(false);
      } catch (error) {
        console.error('Error getting auth token or user attributes:', error);
        setError('Authentication error. Please try signing out and back in.');
        setUserAttrsLoading(false);
      }
    };

    if (user) {
      getAuthTokenAndAttributes();
    }
  }, [user]);

  const handleSignOut = () => {
    if (signOut) {
      signOut();
    }
  };

  // If a project is selected, show the viewer. Otherwise, show the dashboard.
  if (activeProject) {
    return (
      <div className="w-screen h-screen flex flex-col">
        <header className="bg-white shadow-sm p-3 flex justify-between items-center z-10">
          <button 
            onClick={() => setActiveProject(null)}
            className="flex items-center gap-2 px-3 py-1 bg-slate-200 text-slate-800 rounded hover:bg-slate-300"
          >
            <ArrowLeft size={16} />
            Back to Projects
          </button>
          <h1 className="text-lg font-bold text-slate-700 truncate">{activeProject.projectName}</h1>
          <button 
            onClick={handleSignOut} 
            className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </header>
        
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          <div className="flex-1">
            <Canvas camera={{ position: [0, 5, 10], fov: 50 }}>
              <Suspense fallback={<Loader />}>
                <ambientLight intensity={1.5} />
                <Environment preset="city" />
                <Model url={activeProject.modelUrl} onObjectClick={setSelectedObjectData} />
                <OrbitControls />
              </Suspense>
            </Canvas>
          </div>
          
          <aside className="w-full lg:w-96 bg-white overflow-y-auto shadow-lg">
            <PropertiesPanel 
              data={selectedObjectData} 
              onClear={() => setSelectedObjectData(null)} 
              authToken={authToken}
              projectId={activeProject.projectId}
              user={{ ...user, attributes: { ...userAttributes } }}
            />
          </aside>
        </main>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded m-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          </div>
        )}
      </div>
    );
  } else {
    // Dashboard view
    return user && authToken ? (
      <ProjectDashboard
        authToken={authToken}
        user={{ ...user, attributes: { ...userAttributes } }}
        userAttrsLoading={userAttrsLoading}
        onSelectProject={(project) => setActiveProject(project)}
        signOut={handleSignOut}
      />
    ) : (
      <div className="w-screen h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
        <p className="ml-4 text-slate-600">Loading user session...</p>
      </div>
    );
  }
};

export default App;