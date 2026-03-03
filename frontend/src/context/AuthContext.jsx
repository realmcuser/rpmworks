import React, { createContext, useState, useContext, useEffect } from 'react';
import { login as apiLogin, register as apiRegister, fetchCurrentUser } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists on mount and fetch user profile
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
      fetchCurrentUser()
        .then(setUser)
        .catch(() => {
          // Token invalid, clear it
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    try {
      const data = await apiLogin(username, password);
      localStorage.setItem('token', data.access_token);
      setToken(data.access_token);
      setUser({ username });
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const register = async (username, password) => {
    try {
      await apiRegister(username, password);
      // Automatically login after register
      return login(username, password);
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
