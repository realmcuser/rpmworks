// src/services/api.js

const API_URL = import.meta.env.VITE_API_URL || '';

// Helper to get token
const getToken = () => localStorage.getItem('token');

// Helper for authenticated requests
export async function fetchWithAuth(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Handle unauthorized (e.g., token expired)
    localStorage.removeItem('token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
}

export async function login(username, password) {
  const formData = new URLSearchParams();
  formData.append('username', username);
  formData.append('password', password);

  const response = await fetch(`${API_URL}/api/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Login failed');
  }
  return response.json();
}

export async function register(username, password) {
  const response = await fetch(`${API_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Registration failed');
  }
  return response.json();
}

export async function fetchProjects() {
  const response = await fetchWithAuth('/api/projects');
  if (!response.ok) {
    throw new Error('Failed to fetch projects');
  }
  return response.json();
}

export async function createProject(projectData) {
  const response = await fetchWithAuth('/api/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
  if (!response.ok) {
    throw new Error('Failed to create project');
  }
  return response.json();
}

export async function deleteProject(projectId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete project');
  }
  return true; // No content returned usually
}

export async function updateSourceConfig(projectId, config) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/source`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update source config');
  }
  return response.json();
}

export async function updateBuildConfig(projectId, config) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/build-config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
  
  if (!response.ok) {
    throw new Error('Failed to update build config');
  }
  return response.json();
}

export async function fetchProjectFiles(projectId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/files`);
  if (!response.ok) {
    throw new Error('Failed to fetch project files');
  }
  return response.json();
}

export async function browseProjectFiles(projectId, path) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/files/browse`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
  if (!response.ok) {
    throw new Error('Failed to browse project files');
  }
  return response.json();
}

export async function testConnection(host, username, password, path, sshKey) {
  const response = await fetchWithAuth('/api/source/connect', {
    method: 'POST',
    body: JSON.stringify({ host, username, password, path, ssh_key: sshKey }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Connection failed');
  }
  return response.json();
}

export async function browsePath(host, username, password, path, sshKey) {
  const response = await fetchWithAuth('/api/source/browse', {
    method: 'POST',
    body: JSON.stringify({ host, username, password, path, ssh_key: sshKey }),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to browse path');
  }
  return response.json();
}



export async function startBuild(projectId) {
  const response = await fetchWithAuth('/api/build/start', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId }),
  });
  
  if (!response.ok) {
    throw new Error('Failed to start build');
  }
  return response.json();
}

export async function deleteBuild(buildId) {
  const response = await fetchWithAuth(`/api/builds/${buildId}`, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    throw new Error('Failed to delete build');
  }
  return true; 
}

export async function fetchDistributions() {
  const response = await fetchWithAuth('/api/info/distributions');
  if (!response.ok) {
    throw new Error('Failed to fetch distributions');
  }
  return response.json();
}

export async function validateSpec(specContent) {
  const res = await fetchWithAuth('/api/build/validate', {
      method: 'POST',
      body: JSON.stringify({ content: specContent })
  });
  
  if (!res.ok) throw new Error('Validation failed');
  return res.json();
}

export async function addDistribution(id, name, dist_suffix) {
  const response = await fetchWithAuth('/api/info/distributions', {
    method: 'POST',
    body: JSON.stringify({ id, name, dist_suffix }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to add distribution');
  }
  return response.json();
}

export async function deleteDistribution(id) {
  const response = await fetchWithAuth(`/api/info/distributions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error('Failed to delete distribution');
  }
  return true;
}

export async function updateProjectDetails(projectId, details) {
  const response = await fetchWithAuth(`/api/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(details),
  });
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to update project');
  }
  return response.json();
}

// Repositories
export async function fetchRepositories() {
  const response = await fetchWithAuth('/api/repositories');
  if (!response.ok) throw new Error('Failed to fetch repositories');
  return response.json();
}

export async function createRepository(data) {
  const response = await fetchWithAuth('/api/repositories', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to create repository');
  return response.json();
}

export async function updateRepository(id, data) {
  const response = await fetchWithAuth(`/api/repositories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update repository');
  return response.json();
}

export async function deleteRepository(id) {
  const response = await fetchWithAuth(`/api/repositories/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete repository');
  return true;
}

// Project Deployment Targets
export async function fetchProjectTargets(projectId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/targets`);
  if (!response.ok) throw new Error('Failed to fetch targets');
  return response.json();
}

export async function createProjectTarget(projectId, data) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/targets`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to add target');
  return response.json();
}

export async function deleteProjectTarget(projectId, targetId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/targets/${targetId}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete target');
  return true;
}

// Deploy Trigger
export async function deployBuild(projectId, buildId, targetId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/deploy/${buildId}`, {
    method: 'POST',
    body: JSON.stringify({ target_id: targetId }),
  });
  if (!response.ok) throw new Error('Failed to start deployment');
  return response.json();
}

export async function fetchProjectDeployments(projectId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/deployments`);
  if (!response.ok) throw new Error('Failed to fetch deployments');
  return response.json();
}

// Check if registration is allowed (public endpoint)
export async function checkRegistrationAllowed() {
  const response = await fetch(`${API_URL}/api/settings/registration`);
  if (!response.ok) throw new Error('Failed to check registration status');
  return response.json();
}

// Admin: Get all users
export async function fetchUsers() {
  const response = await fetchWithAuth('/api/admin/users');
  if (!response.ok) throw new Error('Failed to fetch users');
  return response.json();
}

// Admin: Update user
export async function updateUser(userId, data) {
  const response = await fetchWithAuth(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to update user');
  }
  return response.json();
}

// Admin: Get settings
export async function fetchAdminSettings() {
  const response = await fetchWithAuth('/api/admin/settings');
  if (!response.ok) throw new Error('Failed to fetch settings');
  return response.json();
}

// Admin: Update settings
export async function updateAdminSettings(settings) {
  const response = await fetchWithAuth('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
  if (!response.ok) throw new Error('Failed to update settings');
  return response.json();
}

// Get current user info
export async function fetchCurrentUser() {
  const response = await fetchWithAuth('/api/users/me');
  if (!response.ok) throw new Error('Failed to fetch user info');
  return response.json();
}

// Clone a project
export async function cloneProject(projectId, newName) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/clone`, {
    method: 'POST',
    body: JSON.stringify({ name: newName }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to clone project');
  }
  return response.json();
}

export async function runPrefetchScript(projectId) {
  const response = await fetchWithAuth(`/api/projects/${projectId}/run-prefetch`, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || 'Failed to run script');
  }
  return response.json();
}
