import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, UploadCloud, Loader, AlertCircle, Share2, LogOut } from 'lucide-react';

// NEW: Import the ShareModal. Make sure you have created the 'ShareModal.tsx' file.
import { ShareModal } from './ShareModal';

const API_URL = 'http://localhost:4000';

// --- TYPE DEFINITIONS (Your existing types) ---
interface Project {
  projectId: string;
  projectName: string;
  modelUrl: string;
  ownerId: string;
  createdAt: string;
}

interface DashboardProps {
  authToken: string;
  onSelectProject: (project: Project) => void;
  user: {
    username: string;
    attributes: {
      email: string;
      [key: string]: any;
    };
  };
  signOut?: () => void;
}

// --- CreateProjectModal Component (Your existing component) ---
const CreateProjectModal = ({ authToken, onClose, onProjectCreated }: {
  authToken: string;
  onClose: () => void;
  onProjectCreated: (newProject: Project) => void;
}) => {
  const [projectName, setProjectName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !projectName.trim()) {
      setError('Project name and a .glb file are required.');
      return;
    }
    
    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('projectName', projectName.trim());
    formData.append('model', file);

    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
        body: formData,
      });
      const newProject = await response.json();
      if (!response.ok) {
        throw new Error(newProject.error || 'Failed to create project.');
      }
      onProjectCreated(newProject);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Create New Project</h2>
        <form onSubmit={handleSubmit}>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <div className="mb-4">
            <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 mb-1">Project Name</label>
            <input
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">3D Model File (.glb)</label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:bg-slate-50"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-12 w-12 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">
                {file ? `Selected: ${file.name}` : 'Click to select a file'}
              </p>
              <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept=".glb" className="hidden" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-200 rounded text-slate-800 hover:bg-slate-300">Cancel</button>
            <button type="submit" disabled={isUploading} className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:bg-sky-300 flex items-center gap-2">
              {isUploading && <Loader className="animate-spin w-4 h-4" />}
              {isUploading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


// --- MODIFIED Main Dashboard Component ---
export const ProjectDashboard = ({ authToken, onSelectProject, user, signOut }: DashboardProps) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // --- NEW: State for managing the share modal ---
  const [sharingProject, setSharingProject] = useState<Project | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      if (!authToken) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_URL}/api/projects`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch projects');
        setProjects(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [authToken]);
  
  const handleProjectCreated = (newProject: Project) => {
    setProjects(prev => [newProject, ...prev]);
  };

  const handleSignOut = () => {
    if (signOut) signOut();
  };

  return (
    <div className="w-screen min-h-screen bg-slate-50 p-4 sm:p-8">
      {isCreateModalOpen && (
        <CreateProjectModal
          authToken={authToken}
          onClose={() => setIsCreateModalOpen(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}
      
      {/* NEW: Render the ShareModal when a project is selected for sharing */}
      {sharingProject && (
        <ShareModal
          authToken={authToken}
          projectId={sharingProject.projectId}
          projectName={sharingProject.projectName}
          onClose={() => setSharingProject(null)}
        />
      )}

      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
          <div className="flex items-center gap-3">
            <Building className="w-8 h-8 text-sky-600" />
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Projects Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
              <span className="text-sm text-slate-600 hidden md:block">
                Welcome, {user?.attributes?.email || user?.username}
              </span>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold text-sm"
              >
                <Plus size={18} /> New Project
              </button>
              {signOut && (
                 <button onClick={handleSignOut} title="Sign Out" className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full">
                    <LogOut size={20} />
                </button>
              )}
          </div>
        </header>
        
        <main>
          {isLoading && (
            <div className="text-center py-10">
              <Loader className="animate-spin w-8 h-8 mx-auto text-slate-500" />
              <p className="mt-2 text-slate-600">Loading projects...</p>
            </div>
          )}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded text-center">
              <p><strong>Error:</strong> {error}</p>
            </div>

          )}
          {!isLoading && !error && projects.length === 0 && (
             <div className="text-center py-16 px-6 border-2 border-dashed border-slate-300 rounded-lg">
                <Building className="mx-auto h-16 w-16 text-slate-400" />
                <h3 className="text-xl font-semibold text-slate-700 mt-4">No projects yet!</h3>
                <p className="text-slate-500 mt-2">Click "New Project" to upload your first model.</p>
            </div>
          )}
          {!isLoading && !error && projects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map(project => (
                <div key={project.projectId} className="bg-white p-5 rounded-lg shadow-md border border-transparent hover:border-sky-500 hover:shadow-lg transition-all group">
                  <div 
                    className="flex-grow cursor-pointer" 
                    onClick={() => onSelectProject(project)}
                  >
                    <h3 className="font-bold text-lg text-slate-800 group-hover:text-sky-600 truncate">
                      {project.projectName}
                    </h3>
                  </div>
                  <div className="flex justify-between items-end mt-4 pt-4 border-t border-slate-100">
                    <p className="text-xs text-slate-500">
                      Created: {new Date(project.createdAt).toLocaleDateString()}
                    </p>
                    {/* NEW: Share Button Logic */}
                    {user?.username === project.ownerId && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent card click event
                          setSharingProject(project);
                        }}
                        className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-full"
                        title="Share Project"
                      >
                        <Share2 size={18} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};