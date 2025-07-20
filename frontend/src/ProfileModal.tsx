import React, { useState } from 'react';
import { Loader, X } from 'lucide-react';

const API_URL = 'http://localhost:4000';

interface ProfileModalProps {
  authToken: string;
  currentName: string;
  onClose: () => void;
}

export const ProfileModal = ({ authToken, currentName, onClose }: ProfileModalProps) => {
  const [name, setName] = useState(currentName);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ name: name.trim() }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      
      setMessage({ text: 'Name updated successfully! Page will refresh.', type: 'success' });
      
      // The simplest way to ensure the user object is refreshed everywhere
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Update failed.', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X /></button>
        <h2 className="text-xl font-bold text-slate-800 mb-4">Edit Profile</h2>
        <form onSubmit={handleSubmit}>
          {message && (
            <p className={`text-sm mb-4 p-3 rounded ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.text}
            </p>
          )}
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-1">Display Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={isLoading} className="px-5 py-2 bg-sky-600 text-white rounded-lg flex items-center gap-2">
              {isLoading && <Loader className="animate-spin w-4 h-4" />}
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};