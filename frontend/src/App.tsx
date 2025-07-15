import React, { Suspense, useState, useRef } from 'react';
import { Canvas, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment, Html } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Building, UploadCloud, Box, X } from 'lucide-react';

const API_URL = 'http://localhost:4000';

// A simple spinner to show while the 3D model is loading
const Loader = () => (
  <Html center>
    <div className="flex items-center justify-center text-slate-500">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500"></div>
      <span className="ml-2">Loading...</span>
    </div>
  </Html>
);

// This component now handles click events and passes the clicked object's data up
const Model = ({ url, onObjectClick }: { url: string; onObjectClick: (data: any) => void }) => {
  const gltf = useLoader(GLTFLoader, url);
  return (
    <primitive 
      object={gltf.scene} 
      scale={2} 
      onClick={(event) => {
        event.stopPropagation(); 
        onObjectClick(event.object.userData);
      }}
    />
  );
};

// A new component to display the properties of the selected object
const PropertiesPanel = ({ data, onClear }: { data: any | null; onClear: () => void }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="p-4 text-center text-slate-500">
        {/* FIX: Changed 'Cube' to 'Box' */}
        <Box className="mx-auto w-12 h-12 mb-2" />
        <p>Click on an object in the model to view its properties.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-bold text-slate-800">Properties</h3>
        <button onClick={onClear} className="p-1 text-slate-500 hover:text-slate-800">
            <X size={20} />
        </button>
      </div>
      <div className="bg-slate-50 p-2 rounded-md max-h-96 overflow-y-auto">
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(data).map(([key, value]) => (
              <tr key={key} className="border-b border-slate-200">
                <td className="font-semibold p-2">{key}</td>
                <td className="p-2 break-all">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// The main application component
const App = () => {
  const [modelUrl, setModelUrl] = useState('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/DamagedHelmet/glTF-Binary/DamagedHelmet.glb');
  const [selectedObjectData, setSelectedObjectData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSelectedObjectData(null);

    const formData = new FormData();
    formData.append('model', file);

    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'File upload failed.');
      setModelUrl(`${API_URL}${data.url}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    }
  };
  
  const handleUploadClick = () => fileInputRef.current?.click();

  return (
    <div className="w-screen h-screen bg-slate-100 flex flex-col">
      <header className="bg-white shadow-md z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Building className="w-8 h-8 text-sky-600" />
            <h1 className="text-xl font-bold text-slate-800">BIM Model Viewer</h1>
          </div>
          <button onClick={handleUploadClick} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition font-semibold">
            <UploadCloud className="w-5 h-5" />
            <span>Upload .glb Model</span>
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".glb" className="hidden" />
        </div>
      </header>
      
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-1 h-full w-full" onClick={() => setSelectedObjectData(null)}>
          <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
            <Suspense fallback={<Loader />}>
              <ambientLight intensity={1.5} />
              <Environment preset="city" />
              <Model url={modelUrl} onObjectClick={setSelectedObjectData} />
              <OrbitControls />
            </Suspense>
          </Canvas>
        </div>
        
        <aside className="w-full lg:w-96 bg-white p-4 overflow-y-auto shadow-lg">
          <PropertiesPanel data={selectedObjectData} onClear={() => setSelectedObjectData(null)} />
        </aside>
      </main>
    </div>
  );
};

export default App;
