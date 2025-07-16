import React, { Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Building, UploadCloud, Box, X, MessageCircle, Plus, Send, AlertCircle, Clock, User, LogOut } from 'lucide-react';
import type { Object3D } from 'three';
import * as THREE from 'three';
import { fetchAuthSession } from 'aws-amplify/auth';

const API_URL = 'http://localhost:4000';

// Types for our issue system
interface Issue {
  _id: string;
  objectId: string;
  title: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
  author: string;
}

interface NewIssue {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  author: string;
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
  const { scene } = useLoader(GLTFLoader, url);

  const handleMeshClick = (event: any) => {
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
  };

  const clickableScene = useMemo(() => {
    const clonedScene = scene.clone();
    clonedScene.traverse((child) => {
      if ((child as any).isMesh) {
        (child as any).onClick = handleMeshClick;
        (child as any).raycast = child.raycast;
      }
    });
    return clonedScene;
  }, [scene]);

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
          onChange={(e) => onStatusChange(issue._id, e.target.value)}
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

const IssueForm = ({ onSubmit, onCancel, defaultAuthor }: { 
  onSubmit: (issue: NewIssue) => void; 
  onCancel: () => void;
  defaultAuthor: string;
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
      author: author.trim()
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

const IssuesPanel = ({ objectData, authToken }: { objectData: any; authToken: string }) => {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectId = objectData?.objectUUID || objectData?.objectName || 'unknown';

  // Helper function to make authenticated API calls
  const makeAuthenticatedRequest = async (url: string, options: RequestInit = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers,
    };

    return fetch(url, {
      ...options,
      headers,
    });
  };

  useEffect(() => {
    if (objectData && objectId !== 'unknown') {
      fetchIssues();
    }
  }, [objectData, objectId]);

  const fetchIssues = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await makeAuthenticatedRequest(`${API_URL}/api/issues/${encodeURIComponent(objectId)}`);
      if (!response.ok) {
        throw new Error('Failed to fetch issues');
      }
      const data = await response.json();
      setIssues(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error fetching issues:', err);
    } finally {
      setLoading(false);
    }
  };

  const createIssue = async (newIssue: NewIssue) => {
    setLoading(true);
    setError(null);
    try {
      const response = await makeAuthenticatedRequest(`${API_URL}/api/issues`, {
        method: 'POST',
        body: JSON.stringify({
          ...newIssue,
          objectId
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create issue');
      }
      
      const createdIssue = await response.json();
      setIssues(prev => [createdIssue, ...prev]);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Error creating issue:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateIssueStatus = async (issueId: string, status: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await makeAuthenticatedRequest(`${API_URL}/api/issues/${issueId}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update issue');
      }
      
      const updatedIssue = await response.json();
      setIssues(prev => prev.map(issue => 
        issue._id === issueId ? updatedIssue : issue
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
      </div>
    );
  }

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
          defaultAuthor=""
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
            <p className="text-sm">No issues found for this object.</p>
            <p className="text-xs text-slate-400 mt-1">Click "Add Issue" to create the first one.</p>
          </div>
        )}
        
        {!loading && issues.map((issue) => (
          <IssueItem 
            key={issue._id} 
            issue={issue}
            onStatusChange={updateIssueStatus}
          />
        ))}
      </div>
    </div>
  );
};

const PropertiesPanel = ({ data, onClear, authToken }: { 
  data: any | null; 
  onClear: () => void; 
  authToken: string;
}) => {
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
        <IssuesPanel objectData={data} authToken={authToken} />
      )}
    </div>
  );
};

const App: React.FC<AppProps> = ({ signOut, user }) => {
  const [modelUrl, setModelUrl] = useState('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb');
  const [selectedObjectData, setSelectedObjectData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get the current user's token when the component mounts
  useEffect(() => {
    const getAuthToken = async () => {
      try {
        // Use the new fetchAuthSession function from Amplify v6
        const session = await fetchAuthSession();
        const idToken = session.tokens?.idToken?.toString();
        if (idToken) {
          setAuthToken(idToken);
        } else {
          throw new Error('No ID token found');
        }
      } catch (error) {
        console.error('Error getting auth token:', error);
        setError('Authentication error. Please try signing out and back in.');
      }
    };

    if (user) {
      getAuthToken();
    }
  }, [user]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setError(null);
    setSelectedObjectData(null);

    if (!authToken) {
      setError('Authentication token not available. Please refresh the page.');
      return;
    }

    const formData = new FormData();
    formData.append('model', file);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        body: formData,
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'File upload failed.');
      }
      
      setModelUrl(`${API_URL}${data.url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      if (event.target) {
        event.target.value = '';
      }
    }
  };
  
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleSignOut = () => {
    if (signOut) {
      signOut();
    }
  };

  return (
    <div className="w-screen h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow-md z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Building className="w-8 h-8 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-800">BIM Model Viewer</h1>
          </div>
          
          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <User className="w-4 h-4" />
                <span>Welcome, {user.username}</span>
              </div>
            )}
            
            <button 
              onClick={handleUploadClick} 
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition font-semibold"
            >
              <UploadCloud className="w-5 h-5" />
              <span>Upload .glb Model</span>
            </button>
            
            {signOut && (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
          
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".glb" className="hidden" />
        </div>
      </header>
      
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <Canvas 
          camera={{ position: [0.2, 0.2, 0.5], fov: 50 }}
          onPointerDown={(e) => console.log('Canvas pointer down:', e)}
          onPointerUp={(e) => console.log('Canvas pointer up:', e)}
          onClick={(e) => console.log('Canvas click:', e)}
        >
          <Suspense fallback={<Loader />}>
            <ambientLight intensity={1.5} />
            <Environment preset="city" />
            <Model url={modelUrl} onObjectClick={setSelectedObjectData} />
            <OrbitControls />
          </Suspense>
        </Canvas>
        
        <aside className="w-full lg:w-96 bg-white overflow-y-auto shadow-lg">
          <PropertiesPanel 
            data={selectedObjectData} 
            onClear={() => setSelectedObjectData(null)} 
            authToken={authToken}
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
};

export default App;