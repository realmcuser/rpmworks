import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Plus, Trash2, Pencil, Key, Github, Download } from 'lucide-react';
import { fetchRepositories, createRepository, updateRepository, deleteRepository, fetchDistributions } from '../services/api';

const RepositoriesPage = () => {
  const { t } = useTranslation();
  const [repositories, setRepositories] = useState([]);
  const [distros, setDistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRepo, setEditingRepo] = useState(null); // null = create mode, object = edit mode

  const defaultFormData = {
    name: '',
    description: '',
    repo_type: 'ssh',
    // SSH fields
    host: '',
    username: 'root',
    auth_method: 'key', // key or password
    password: '',
    ssh_key_path: '/root/.ssh/id_rsa',
    paths: [],
    // GitHub fields
    github_repo: '',
    github_token: '',
  };

  const [formData, setFormData] = useState(defaultFormData);

  useEffect(() => {
    loadRepositories();
    loadDistros();
  }, []);

  const loadDistros = async () => {
    try {
      const data = await fetchDistributions();
      setDistros(data);
    } catch (err) {
      console.error("Failed to load distributions", err);
    }
  };

  const loadRepositories = async () => {
    try {
      const data = await fetchRepositories();
      setRepositories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      if (formData.repo_type === 'github_releases') {
          // For GitHub repos, store token in password field, clear SSH fields
          payload.password = formData.github_token || null;
          payload.host = null;
          payload.username = null;
          payload.ssh_key_path = null;
          payload.paths = [];
      } else {
          if (formData.auth_method === 'key') {
              payload.password = null;
          } else {
              payload.ssh_key_path = null;
          }
          payload.github_repo = null;
      }
      // Remove ui-only fields
      delete payload.auth_method;
      delete payload.github_token;
      // Filter out empty paths
      payload.paths = (payload.paths || []).filter(p => p.base_path && p.base_path.trim());

      if (editingRepo) {
        await updateRepository(editingRepo.id, payload);
      } else {
        await createRepository(payload);
      }
      closeModal();
      loadRepositories();
    } catch (err) {
      alert(err.message);
    }
  };

  const openCreateModal = () => {
    setEditingRepo(null);
    setFormData(defaultFormData);
    setIsModalOpen(true);
  };

  const openEditModal = (repo) => {
    setEditingRepo(repo);
    setFormData({
      name: repo.name,
      description: repo.description || '',
      repo_type: repo.repo_type || 'ssh',
      host: repo.host || '',
      username: repo.username || '',
      auth_method: repo.ssh_key_path ? 'key' : 'password',
      password: repo.repo_type === 'github_releases' ? '' : (repo.password || ''),
      ssh_key_path: repo.ssh_key_path || '/root/.ssh/id_rsa',
      paths: repo.paths || [],
      github_repo: repo.github_repo || '',
      github_token: repo.repo_type === 'github_releases' ? (repo.password || '') : '',
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRepo(null);
    setFormData(defaultFormData);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('repositories.confirmDelete'))) return;
    try {
      await deleteRepository(id);
      loadRepositories();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('repositories.title')}</h1>
          <p className="text-text-muted">{t('repositories.subtitle')}</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          {t('repositories.addRepo')}
        </button>
      </div>

      {repositories.length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-xl">
          <Server className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-white">{t('repositories.noRepos')}</h3>
          <p className="text-text-muted max-w-md mx-auto mt-2">
            {t('repositories.noReposDesc')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {repositories.map((repo) => (
            <div key={repo.id} className="bg-surface border border-border rounded-xl p-6 hover:border-primary/50 transition-colors group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${repo.repo_type === 'github_releases' ? 'bg-purple-500/10' : 'bg-blue-500/10'}`}>
                    {repo.repo_type === 'github_releases'
                      ? <Github className="w-5 h-5 text-purple-400" />
                      : <Server className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{repo.name}</h3>
                    {repo.repo_type === 'github_releases'
                      ? <p className="text-xs text-text-muted font-mono">{repo.github_repo}</p>
                      : <p className="text-xs text-text-muted font-mono">{repo.username}@{repo.host}</p>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEditModal(repo)}
                    className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title={t('repositories.editRepo')}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(repo.id)}
                    className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title={t('repositories.deleteRepo')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {repo.description && (
                <p className="text-sm text-text-muted mb-4">{repo.description}</p>
              )}

              {repo.repo_type === 'github_releases' && (
                <div className="flex items-center gap-2 mb-4 text-sm">
                  <Download className="w-4 h-4 text-purple-400" />
                  <span className="text-text-muted">Total downloads:</span>
                  <span className="text-white font-semibold">{(repo.github_downloads || 0).toLocaleString()}</span>
                </div>
              )}

              <div className="space-y-2 text-sm">
                {repo.paths && repo.paths.length > 0 ? (
                  repo.paths.map((p, idx) => (
                    <div key={idx} className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-text-muted text-xs">{p.distribution_id}</span>
                      <span className="text-text font-mono truncate max-w-[150px] text-xs" title={p.base_path}>{p.base_path}</span>
                    </div>
                  ))
                ) : (
                  <div className="py-1 text-text-muted text-xs italic">{t('repositories.noPathsConfigured')}</div>
                )}
                <div className="flex justify-between py-1 border-b border-border/50">
                  <span className="text-text-muted">{t('repositories.authMethod')}</span>
                  <span className="text-text flex items-center gap-1">
                    {repo.ssh_key_path ? <Key className="w-3 h-3" /> : null}
                    {repo.ssh_key_path ? t('repositories.sshKey') : t('repositories.password')}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-bold text-white">
                {editingRepo ? t('repositories.editRepo') : t('repositories.addRepo')}
              </h2>
              <p className="text-sm text-text-muted">{t('repositories.subtitle')}</p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('repositories.name')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('repositories.namePlaceholder')}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('repositories.description')}</label>
                <textarea
                  placeholder={t('repositories.descriptionPlaceholder')}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none text-sm"
                  rows={2}
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-sm font-medium text-text-muted mb-2">Type</label>
                <div className="flex gap-3">
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${formData.repo_type === 'ssh' ? 'border-primary bg-primary/10 text-white' : 'border-border text-text-muted hover:border-border/80'}`}>
                    <input type="radio" name="repo_type" value="ssh" checked={formData.repo_type === 'ssh'} onChange={() => setFormData({...formData, repo_type: 'ssh'})} className="sr-only" />
                    <Server className="w-4 h-4" />
                    <span className="text-sm">SSH / SFTP</span>
                  </label>
                  <label className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors ${formData.repo_type === 'github_releases' ? 'border-purple-500 bg-purple-500/10 text-white' : 'border-border text-text-muted hover:border-border/80'}`}>
                    <input type="radio" name="repo_type" value="github_releases" checked={formData.repo_type === 'github_releases'} onChange={() => setFormData({...formData, repo_type: 'github_releases'})} className="sr-only" />
                    <Github className="w-4 h-4" />
                    <span className="text-sm">GitHub Releases</span>
                  </label>
                </div>
              </div>

              {formData.repo_type === 'github_releases' ? (
                /* GitHub fields */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">GitHub repository</label>
                    <input
                      type="text"
                      required
                      placeholder="owner/repo-name"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none font-mono"
                      value={formData.github_repo}
                      onChange={e => setFormData({...formData, github_repo: e.target.value})}
                    />
                    <p className="text-xs text-text-muted mt-1">e.g. realmcuser/cockpit-nspawn</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Personal Access Token</label>
                    <input
                      type="password"
                      required={!editingRepo}
                      placeholder={editingRepo ? '(unchanged)' : 'ghp_xxxxxxxxxxxx'}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none font-mono"
                      value={formData.github_token}
                      onChange={e => setFormData({...formData, github_token: e.target.value})}
                    />
                    <p className="text-xs text-text-muted mt-1">Needs <code>repo</code> scope to create releases and upload assets.</p>
                  </div>
                </div>
              ) : (
                /* SSH fields */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-muted mb-1">{t('repositories.host')}</label>
                      <input
                        type="text"
                        required
                        placeholder="192.168.1.10"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none font-mono"
                        value={formData.host}
                        onChange={e => setFormData({...formData, host: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-muted mb-1">{t('repositories.username')}</label>
                      <input
                        type="text"
                        required
                        placeholder="root"
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none font-mono"
                        value={formData.username}
                        onChange={e => setFormData({...formData, username: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">{t('repositories.distributionPaths')}</label>
                    <p className="text-xs text-text-muted mb-2">{t('repositories.distributionPathsHint')}</p>
                    <div className="space-y-2 bg-background border border-border rounded-lg p-3 max-h-48 overflow-y-auto">
                      {distros.length === 0 ? (
                        <p className="text-xs text-text-muted italic">No distributions available. Add distributions first.</p>
                      ) : (
                        distros.map(d => {
                          const existing = (formData.paths || []).find(p => p.distribution_id === d.id);
                          return (
                            <div key={d.id} className="flex items-center gap-2">
                              <span className="text-xs text-text-muted w-28 truncate flex-shrink-0" title={d.name}>{d.name}</span>
                              <input
                                type="text"
                                placeholder="/var/www/html/repo"
                                className="flex-1 bg-surface border border-border rounded px-2 py-1.5 text-text focus:border-primary focus:outline-none font-mono text-sm"
                                value={existing?.base_path || ''}
                                onChange={e => {
                                  const newPaths = (formData.paths || []).filter(p => p.distribution_id !== d.id);
                                  if (e.target.value) {
                                    newPaths.push({ distribution_id: d.id, base_path: e.target.value });
                                  }
                                  setFormData({...formData, paths: newPaths});
                                }}
                              />
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <label className="block text-sm font-medium text-text-muted">{t('repositories.authMethod')}</label>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="auth_method"
                          value="key"
                          checked={formData.auth_method === 'key'}
                          onChange={() => setFormData({...formData, auth_method: 'key'})}
                          className="text-primary"
                        />
                        <span className="text-sm">{t('repositories.sshKey')}</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="auth_method"
                          value="password"
                          checked={formData.auth_method === 'password'}
                          onChange={() => setFormData({...formData, auth_method: 'password'})}
                          className="text-primary"
                        />
                        <span className="text-sm">{t('repositories.password')}</span>
                      </label>
                    </div>

                    {formData.auth_method === 'key' ? (
                      <div>
                        <input
                          type="text"
                          placeholder={t('repositories.sshKeyPlaceholder')}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none font-mono text-sm"
                          value={formData.ssh_key_path}
                          onChange={e => setFormData({...formData, ssh_key_path: e.target.value})}
                        />
                      </div>
                    ) : (
                      <div>
                        <input
                          type="password"
                          placeholder={t('repositories.password')}
                          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:border-primary focus:outline-none"
                          value={formData.password}
                          onChange={e => setFormData({...formData, password: e.target.value})}
                        />
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-text-muted hover:text-text transition-colors"
                >
                  {t('repositories.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shadow-lg shadow-primary/20"
                >
                  {editingRepo ? t('repositories.saveChanges') : t('repositories.saveRepo')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepositoriesPage;
