import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import { auth, testConnection } from '../firebase/config';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isFirebaseConnected: boolean;
  signInWithGoogle: () => Promise<void>;
  signInAsDemoUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState(true);

  useEffect(() => {
    // Test initial connection as required by Firebase skill
    testConnection().then((connected) => {
      setIsFirebaseConnected(connected);
    });

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.warn('Google Sign-In failed or popup blocked, falling back to anonymous session:', err);
      try {
        await signInAnonymously(auth);
      } catch (anonErr) {
        console.error('Anonymous sign in failed:', anonErr);
      }
    }
  };

  const signInAsDemoUser = async () => {
    try {
      await signInAnonymously(auth);
    } catch (err) {
      console.error('Demo sign-in failed:', err);
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isFirebaseConnected,
        signInWithGoogle,
        signInAsDemoUser,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
