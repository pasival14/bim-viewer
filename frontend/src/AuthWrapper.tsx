import React from 'react';
import { Authenticator, useTheme, View } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import App from './App';

interface AuthWrapperProps {
  // No children needed if App is imported directly
}

const authComponents = {
  Header() {
    const { tokens } = useTheme();
    return <View textAlign="center" padding={tokens.space.large}></View>;
  },
};

// MODIFIED: Added 'name' to the sign-up form
const formFields = {
  signUp: {
    name: {
      order: 1,
      label: 'Full Name',
      placeholder: 'Enter your full name',
      isRequired: true,
    },
    email: {
      order: 2,
      label: 'Email Address',
      placeholder: 'Enter your email address',
    },
    password: {
      order: 3,
    },
    confirm_password: {
      order: 4,
    },
  },
  signIn: {
    username: {
      label: 'Email Address',
      placeholder: 'Enter your email address',
    },
    password: {
    },
  }
}

export const AuthWrapper: React.FC<AuthWrapperProps> = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100">
      <Authenticator
        loginMechanisms={['email']}
        formFields={formFields}
        components={authComponents}
      >
        {({ signOut, user }) => (
          <App signOut={signOut} user={user} />
        )}
      </Authenticator>
    </div>
  );
};