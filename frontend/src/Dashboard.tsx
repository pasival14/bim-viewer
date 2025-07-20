import React, { useState, useEffect, useRef } from 'react';
import { Building, Plus, UploadCloud, Loader, AlertCircle, Search, Calendar, Trash2, Edit3, Eye, MoreVertical, Share2 } from 'lucide-react';
import { ShareModal } from './ShareModal';
import { ProfileModal } from './ProfileModal';
import { Menu, Transition } from '@headlessui/react';
import axios from 'axios';

// --- Type Definitions ---
interface Project {
  projectId: string;
  projectName: string;
  modelUrl: string;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
}

interface DashboardProps {
  authToken: string;
  onSelectProject: (project: Project) => void;
  user: { username: string; attributes: { email: string; name?: string } };
  signOut: () => void;
  userAttrsLoading?: boolean;
}

const API_URL = 'http://localhost:4000';

// --- Create Project Modal Component ---
const CreateProjectModal = ({ authToken, onClose, onProjectCreated }: {
  authToken: string;
  onClose: () => void;
  onProjectCreated: (newProject: Project) => void;
}) => {
  const [projectName, setProjectName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const selectedFile = event.target.files[0];
      if (selectedFile.size > 50 * 1024 * 1024) { // 50MB limit
        setError('File size must be less than 50MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
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
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('projectName', projectName.trim());
    formData.append('model', file);

    try {
      const response = await axios.post(
        `${API_URL}/api/projects`,
        formData,
        {
          headers: { 'Authorization': `Bearer ${authToken}` },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(percent);
            }
          }
        }
      );
      const result = response.data;
      onProjectCreated(result);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'An unknown error occurred.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Create New Project</h2>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4 text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            </div>
          )}
          
          <div className="mb-4">
            <label htmlFor="projectName" className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Enter project name"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              3D Model File (.glb)
            </label>
            <div
              className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadCloud className="mx-auto h-12 w-12 text-slate-400 mb-2" />
              <p className="text-sm text-slate-600">
                {file ? (
                  <span className="text-sky-600 font-medium">Selected: {file.name}</span>
                ) : (
                  'Click to select a .glb file'
                )}
              </p>
              <p className="text-xs text-slate-400 mt-1">Max file size: 50MB</p>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept=".glb" 
                className="hidden" 
              />
            </div>
          </div>
          
          {isUploading && (
            <div className="w-full bg-slate-200 rounded h-3 mb-4">
              <div
                className="bg-sky-600 h-3 rounded transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 rounded text-slate-800 hover:bg-slate-300 transition-colors"
              disabled={isUploading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isUploading || !file || !projectName.trim()} 
              className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isUploading && <Loader className="animate-spin w-4 h-4" />}
              {isUploading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Project Actions Dropdown ---
const ProjectActionsDropdown = ({ 
  project, 
  onView, 
  onEdit, 
  onDelete, 
  onShare,
  currentUserId,
  isOpen, 
  onToggle 
}: {
  project: Project;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onShare: () => void;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  // Debug logging
  console.log('ProjectActionsDropdown Debug:', {
    projectId: project.projectId,
    projectOwnerId: project.ownerId,
    currentUserId: currentUserId,
    isOwner: currentUserId === project.ownerId,
    isOpen: isOpen
  });

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="p-2 hover:bg-slate-100 rounded-full transition-colors"
      >
        <MoreVertical size={16} className="text-slate-500" />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[140px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
              onToggle();
            }}
            className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors rounded-t-lg"
          >
            <Eye size={14} />
            View
          </button>
          
          {/* Only show edit/delete/share options for project owner */}
          {currentUserId === project.ownerId && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                  onToggle();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <Edit3 size={14} />
                Rename
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onShare();
                  onToggle();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 transition-colors"
              >
                <Share2 size={14} />
                Share
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  onToggle();
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors rounded-b-lg"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// --- Project Card Component ---
const ProjectCard = ({ 
  project, 
  onSelect, 
  onEdit, 
  onDelete,
  onShare,
  currentUserId
}: {
  project: Project;
  onSelect: (project: Project) => void;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
  onShare: (project: Project) => void;
  currentUserId: string;
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setDropdownOpen(false);
    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [dropdownOpen]);

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-slate-200 overflow-visible">
      <div 
        className="p-5 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => onSelect(project)}
      >
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-semibold text-slate-800 truncate pr-2 text-lg">
            {project.projectName}
          </h3>
          <div className="flex items-center gap-1">
            {/* Share button - only visible to project owner */}
            {currentUserId === project.ownerId && (
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onShare(project);
                }}
                className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-full transition-colors"
                title="Share Project"
              >
                <Share2 size={16} />
              </button>
            )}
            
            {/* Dropdown menu */}
            <ProjectActionsDropdown
              project={project}
              onView={() => onSelect(project)}
              onEdit={() => onEdit(project)}
              onDelete={() => onDelete(project)}
              onShare={() => onShare(project)}
              currentUserId={currentUserId}
              isOpen={dropdownOpen}
              onToggle={() => setDropdownOpen(!dropdownOpen)}
            />
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-sm text-slate-500">
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>Created {new Date(project.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Edit Project Modal ---
const EditProjectModal = ({ 
  project, 
  authToken, 
  onClose, 
  onProjectUpdated 
}: {
  project: Project;
  authToken: string;
  onClose: () => void;
  onProjectUpdated: (updatedProject: Project) => void;
}) => {
  const [projectName, setProjectName] = useState(project.projectName);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectName.trim()) {
      setError('Project name is required.');
      return;
    }
    
    setIsUpdating(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.projectId}`, {
        method: 'PUT',
        headers: { 
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectName: projectName.trim() }),
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to update project.');
      }
      
      onProjectUpdated(result);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Edit Project</h2>
        <form onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4 text-sm">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                {error}
              </div>
            </div>
          )}
          
          <div className="mb-6">
            <label htmlFor="editProjectName" className="block text-sm font-medium text-slate-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              id="editProjectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Enter project name"
              required
            />
          </div>
          
          <div className="flex justify-end gap-3">
            <button 
              type="button" 
              onClick={onClose} 
              className="px-4 py-2 bg-slate-200 rounded text-slate-800 hover:bg-slate-300 transition-colors"
              disabled={isUpdating}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isUpdating || !projectName.trim()} 
              className="px-4 py-2 bg-sky-600 text-white rounded hover:bg-sky-700 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isUpdating && <Loader className="animate-spin w-4 h-4" />}
              {isUpdating ? 'Updating...' : 'Update Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Delete Confirmation Modal ---
const DeleteConfirmationModal = ({ 
  project, 
  authToken, 
  onClose, 
  onProjectDeleted 
}: {
  project: Project;
  authToken: string;
  onClose: () => void;
  onProjectDeleted: (projectId: string) => void;
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/projects/${project.projectId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to delete project.');
      }
      
      onProjectDeleted(project.projectId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Delete Project</h2>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-4 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} />
              {error}
            </div>
          </div>
        )}
        
        <p className="text-slate-600 mb-6">
          Are you sure you want to delete "<strong>{project.projectName}</strong>"? 
          This action cannot be undone and will also delete all associated issues.
        </p>
        
        <div className="flex justify-end gap-3">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 bg-slate-200 rounded text-slate-800 hover:bg-slate-300 transition-colors"
            disabled={isDeleting}
          >
            Cancel
          </button>
          <button 
            onClick={handleDelete}
            disabled={isDeleting} 
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {isDeleting && <Loader className="animate-spin w-4 h-4" />}
            {isDeleting ? 'Deleting...' : 'Delete Project'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main Dashboard Component ---
export const ProjectDashboard = ({ authToken, onSelectProject, user, signOut, userAttrsLoading = false }: DashboardProps) => {
  console.log('User attributes:', user?.attributes);
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sharingProject, setSharingProject] = useState<Project | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Fetch projects on mount
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
        setFilteredProjects(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, [authToken]);

  // Filter projects based on search term
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredProjects(projects);
    } else {
      const filtered = projects.filter(project =>
        project.projectName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProjects(filtered);
    }
  }, [projects, searchTerm]);

  const handleProjectCreated = (newProject: Project) => {
    setProjects(prev => [newProject, ...prev]);
  };

  const handleProjectUpdated = (updatedProject: Project) => {
    setProjects(prev => prev.map(p => 
      p.projectId === updatedProject.projectId ? updatedProject : p
    ));
  };

  const handleProjectDeleted = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.projectId !== projectId));
  };

  const handleShareProject = (project: Project) => {
    setSharingProject(project);
  };

  const displayName =
    user?.attributes?.name ||
    (user?.attributes && (user.attributes as any)['custom:Name']) ||
    user?.attributes?.email ||
    user?.username ||
    'User';
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0,2);

  return (
    <div className="w-screen h-screen bg-slate-50 flex flex-col">
      {/* Modals */}
      {isCreateModalOpen && (
        <CreateProjectModal
          authToken={authToken}
          onClose={() => setIsCreateModalOpen(false)}
          onProjectCreated={handleProjectCreated}
        />
      )}
      
      {editingProject && (
        <EditProjectModal
          project={editingProject}
          authToken={authToken}
          onClose={() => setEditingProject(null)}
          onProjectUpdated={handleProjectUpdated}
        />
      )}
      
      {deletingProject && (
        <DeleteConfirmationModal
          project={deletingProject}
          authToken={authToken}
          onClose={() => setDeletingProject(null)}
          onProjectDeleted={handleProjectDeleted}
        />
      )}

      {/* Share Modal */}
      {sharingProject && (
        <ShareModal
          authToken={authToken}
          projectId={sharingProject.projectId}
          projectName={sharingProject.projectName}
          onClose={() => setSharingProject(null)}
        />
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 px-8 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Left: Logo and Title */}
          <div className="flex items-center gap-3">
            <Building className="w-8 h-8 text-sky-600" />
            <h1 className="text-2xl font-bold text-slate-800">Projects Dashboard</h1>
          </div>
          {/* Right: Actions and User Menu */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold transition-colors"
            >
              <Plus size={20} />
              New Project
            </button>
            {/* User Dropdown Menu */}
            <Menu as="div" className="relative inline-block text-left">
              <Menu.Button className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg focus:outline-none">
                {/* User Avatar (Initials) */}
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-sky-500 text-white font-bold text-lg">{initials}</span>
                <span className="hidden md:inline text-slate-700 font-medium">
                  {userAttrsLoading
                    ? <span className="inline-block w-24 h-4 bg-slate-200 rounded animate-pulse" />
                    : (user?.attributes?.name || user?.attributes?.email || user?.username)}
                </span>
              </Menu.Button>
              <Transition
                as={React.Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right bg-white border border-slate-200 divide-y divide-slate-100 rounded-lg shadow-lg focus:outline-none z-50">
                  <div className="px-4 py-3">
                    <p className="text-sm font-medium text-slate-800">
                      {userAttrsLoading
                        ? <span className="inline-block w-24 h-4 bg-slate-200 rounded animate-pulse" />
                        : (user?.attributes?.name || user?.attributes?.email || user?.username)}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {userAttrsLoading
                        ? <span className="inline-block w-16 h-3 bg-slate-200 rounded animate-pulse" />
                        : user?.attributes?.email}
                    </p>
                  </div>
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => setIsProfileModalOpen(true)}
                          className={`w-full text-left px-4 py-2 text-sm ${active ? 'bg-sky-50 text-sky-700' : 'text-slate-700'}`}
                        >
                          Edit Profile
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={signOut}
                          className={`w-full text-left px-4 py-2 text-sm ${active ? 'bg-red-50 text-red-700' : 'text-red-600'}`}
                        >
                          Sign Out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </header>
      {/* Profile Modal */}
      {isProfileModalOpen && (
        <ProfileModal
          authToken={authToken}
          currentName={user?.attributes?.name || user?.attributes?.email || user?.username}
          onClose={() => setIsProfileModalOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="max-w-7xl mx-auto px-8 py-6 h-full flex flex-col">
          {/* Search and Filters */}
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-20">
                <Loader className="animate-spin w-8 h-8 text-sky-600" />
                <p className="ml-3 text-slate-600">Loading projects...</p>
              </div>
            )}
            
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} />
                  {error}
                </div>
              </div>
            )}
            
            {!isLoading && !error && filteredProjects.length === 0 && projects.length === 0 && (
              <div className="text-center py-20 border-2 border-dashed border-slate-300 rounded-lg">
                <Building className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">No projects yet!</h3>
                <p className="text-slate-500 mb-4">Create your first project to get started with BIM collaboration.</p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 font-semibold transition-colors"
                >
                  <Plus size={20} />
                  Create Project
                </button>
              </div>
            )}
            
            {!isLoading && !error && filteredProjects.length === 0 && projects.length > 0 && (
              <div className="text-center py-20">
                <Search className="w-16 h-16 text-slate-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-slate-700 mb-2">No projects found</h3>
                <p className="text-slate-500">Try adjusting your search criteria.</p>
              </div>
            )}
            
            {!isLoading && !error && filteredProjects.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {filteredProjects.map(project => (
                  <ProjectCard
                    key={project.projectId}
                    project={project}
                    onSelect={onSelectProject}
                    onEdit={setEditingProject}
                    onDelete={setDeletingProject}
                    onShare={handleShareProject}
                    currentUserId={user?.username}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};