import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App'; // Assuming App is the main component passed to AuthWrapper
import './index.css';
import { AuthWrapper } from './AuthWrapper';

// --- NEW: Import Amplify and create the configuration ---
import { Amplify } from 'aws-amplify';

// Configure Amplify with your AWS resources
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_AWS_USER_POOLS_ID,
      userPoolClientId: import.meta.env.VITE_AWS_USER_POOLS_WEB_CLIENT_ID,
      region: import.meta.env.VITE_AWS_REGION,
    }
  }
});
// ----------------------------------------------------

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthWrapper>
      <App />
    </AuthWrapper>
  </StrictMode>,
);