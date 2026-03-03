import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import CreateProject from './pages/CreateProject';
import ProjectDetails from './pages/ProjectDetails';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ArtifactsPage from './pages/ArtifactsPage';
import RepositoriesPage from './pages/RepositoriesPage';
import DistributionsPage from './pages/DistributionsPage';
import { AuthProvider, useAuth } from './context/AuthContext';

// Auth guard
const RequireAuth = ({ children }) => {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background text-text">Loading...</div>;
  }

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      
      <Route path="/" element={
        <RequireAuth>
          <Layout />
        </RequireAuth>
      }>
        <Route index element={<Dashboard />} />
        <Route path="projects/new" element={<CreateProject />} />
        <Route path="projects/:id" element={<ProjectDetails />} />
        <Route path="settings" element={<Settings />} />
        <Route path="artifacts" element={<ArtifactsPage />} />
        <Route path="repos" element={<RepositoriesPage />} />
        <Route path="distributions" element={<DistributionsPage />} />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
