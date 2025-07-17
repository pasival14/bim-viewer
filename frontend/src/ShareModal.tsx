import React, { useState } from 'react';
import { Loader, Send, X } from 'lucide-react';

const API_URL = 'http://localhost:4000';

interface ShareModalProps {
  authToken: string;
  projectId: string;
  projectName: string;
  onClose: () => void;
}

export const ShareModal = ({ authToken, projectId, projectName, onClose }: ShareModalProps) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError('Email address cannot be empty.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`${API_URL}/api/projects/${projectId}/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ email: email.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send invitation.');
      }
      
      setSuccess(result.message || 'Invitation sent successfully!');
      setEmail(''); // Clear input on success
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600">
          <X size={24} />
        </button>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Share Project</h2>
        <p className="text-sm text-slate-600 mb-4">Invite a collaborator to <span className="font-semibold">{projectName}</span>.</p>
        
        <form onSubmit={handleSubmit}>
          {error && <p className="text-red-500 text-sm mb-4 bg-red-50 p-3 rounded">{error}</p>}
          {success && <p className="text-green-600 text-sm mb-4 bg-green-50 p-3 rounded">{success}</p>}

          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">User's Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder="Enter email address"
              required
            />
          </div>

          <div className="flex justify-end">
            <button 
              type="submit" 
              disabled={isLoading} 
              className="px-5 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:bg-sky-300 flex items-center justify-center gap-2 font-semibold"
            >
              {isLoading && <Loader className="animate-spin w-4 h-4" />}
              {isLoading ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};