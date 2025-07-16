import React from 'react';
import { Amplify } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import App from './App'; // Your original App component

// Configure Amplify with your Cognito User Pool details
// IMPORTANT: Replace these placeholder values with your actual Cognito details
const amplifyConfig = {
  Auth: {
    Cognito: {
      region: 'us-east-1',
      userPoolId: 'us-east-1_Qz0XQbRYF',
      userPoolClientId: '6trsdho1dueumlof1pqb8hqe67',
    }
  }
};

Amplify.configure(amplifyConfig);

/**
 * This component acts as a gatekeeper. It uses the Amplify Authenticator component.
 * 1. If the user is not logged in, it displays a full sign-in/sign-up UI.
 * 2. If the user is logged in, it renders the main App component, passing down
 * the `user` object and the `signOut` function as props.
 */
const AuthWrapper: React.FC = () => {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        // Once authenticated, render the original App component with auth props
        <App signOut={signOut} user={user} />
      )}
    </Authenticator>
  );
};

export default AuthWrapper;