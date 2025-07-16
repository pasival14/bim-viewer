import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Import the new AuthWrapper instead of App
import AuthWrapper from './AuthWrapper.tsx' 

// The Amplify configuration is now moved to AuthWrapper.tsx
// You can remove it from here to avoid duplication.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Render the AuthWrapper as the root component */}
    <AuthWrapper />
  </StrictMode>,
)
