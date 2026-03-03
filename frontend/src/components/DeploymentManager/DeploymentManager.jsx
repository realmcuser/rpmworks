import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Plus, Trash2, Rocket, Settings, Check, X, Clock, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Github } from 'lucide-react';
import { 
    fetchRepositories, 
    fetchProjectTargets, 
    createProjectTarget, 
    deleteProjectTarget,
    deployBuild,
    fetchProjectDeployments
} from '../../services/api';

const DeploymentManager = ({ project, onUpdate }) => {
  const { t } = useTranslation();
  const [repositories, setRepositories] = useState([]);
  const [targets, setTargets] = useState([]);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [selectedBuildId, setSelectedBuildId] = useState('');
  const [expandedDeploymentId, setExpandedDeploymentId] = useState(null);
  
  // New Target Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTarget, setNewTarget] = useState({
      repository_id: '',
      auto_publish: false,
      run_createrepo: false,
      custom_path: ''
  });

  useEffect(() => {
    loadData();
  }, [project.id]);

  // Poll for deployment updates if any are running
  useEffect(() => {
      let interval;
      const hasRunning = deployments.some(d => d.status === 'running' || d.status === 'pending');
      
      if (hasRunning) {
          interval = setInterval(() => {
              fetchProjectDeployments(project.id)
                  .then(data => setDeployments(data))
                  .catch(console.error);
          }, 3000);
      }
      return () => {
          if (interval) clearInterval(interval);
      };
  }, [deployments, project.id]);

  // Pre-select latest successful build
  useEffect(() => {
      if (project.builds) {
          const successBuilds = project.builds.filter(b => b.status === 'success');
          if (successBuilds.length > 0) {
              // Sort by ID desc (newest first)
              const latest = successBuilds.sort((a, b) => b.id - a.id)[0];
              setSelectedBuildId(latest.id);
          }
      }
  }, [project.builds]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [repos, projectTargets, projectDeployments] = await Promise.all([
          fetchRepositories(),
          fetchProjectTargets(project.id),
          fetchProjectDeployments(project.id)
      ]);
      setRepositories(repos);
      setTargets(projectTargets);
      setDeployments(projectDeployments);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTarget = async (e) => {
      e.preventDefault();
      if (!newTarget.repository_id) return;
      
      try {
          await createProjectTarget(project.id, newTarget);
          setShowAddForm(false);
          setNewTarget({ repository_id: '', auto_publish: false, run_createrepo: false, custom_path: '' });
          loadData();
      } catch (err) {
          alert(err.message);
      }
  };

  const handleDeleteTarget = async (targetId) => {
      if (!confirm(t('deployment.confirmRemoveTarget'))) return;
      try {
          await deleteProjectTarget(project.id, targetId);
          loadData();
      } catch (err) {
          alert(err.message);
      }
  };

  const handleDeploy = async (targetId) => {
      if (!selectedBuildId) {
          alert(t('deployment.selectBuildAlert'));
          return;
      }
      
      setDeploying(true);
      try {
          await deployBuild(project.id, selectedBuildId, targetId);
          loadData(); // Reload to show pending deployment
      } catch (err) {
          alert(err.message);
      } finally {
          setDeploying(false);
      }
  };

  const toggleLog = (id) => {
      setExpandedDeploymentId(expandedDeploymentId === id ? null : id);
  };

  // Filter out repos already added as targets
  const availableRepos = repositories.filter(r => !targets.some(t => t.repository_id === r.id));

  return (
    <div className="space-y-8">
      {/* Configuration Section */}
      <div className="space-y-6">
        <div className="flex justify-between items-center">
            <div>
            <h3 className="text-lg font-medium text-text">{t('deployment.targets')}</h3>
            <p className="text-sm text-text-muted">{t('deployment.targetsDesc')}</p>
            </div>
            <button 
            onClick={() => setShowAddForm(true)}
            disabled={availableRepos.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
            <Plus className="w-4 h-4" />
            <span>{t('deployment.addTarget')}</span>
            </button>
        </div>

        {/* Add Target Form */}
        {showAddForm && (
            <div className="bg-surface border border-border rounded-xl p-4 mb-6 animate-in fade-in slide-in-from-top-4">
                <h4 className="font-semibold text-white mb-4">{t('deployment.addTargetTitle')}</h4>
                <form onSubmit={handleAddTarget} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm text-text-muted block mb-1">{t('deployment.repository')}</label>
                            <select
                                required
                                className="w-full bg-background border border-border rounded px-3 py-2 text-text focus:outline-none focus:border-primary"
                                value={newTarget.repository_id}
                                onChange={e => setNewTarget({...newTarget, repository_id: e.target.value})}
                            >
                                <option value="">{t('deployment.selectRepository')}</option>
                                {availableRepos.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.name} {r.repo_type === 'github_releases' ? `(${r.github_repo})` : `(${r.host})`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm text-text-muted block mb-1">{t('deployment.customSubdir')}</label>
                            <input
                                type="text"
                                placeholder={t('deployment.customSubdirPlaceholder')}
                                className="w-full bg-background border border-border rounded px-3 py-2 text-text focus:outline-none focus:border-primary"
                                value={newTarget.custom_path}
                                onChange={e => setNewTarget({...newTarget, custom_path: e.target.value})}
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={newTarget.run_createrepo}
                                onChange={e => setNewTarget({...newTarget, run_createrepo: e.target.checked})}
                                className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-text">{t('deployment.runCreaterepo')}</span>
                        </label>
                        
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={newTarget.auto_publish}
                                onChange={e => setNewTarget({...newTarget, auto_publish: e.target.checked})}
                                className="rounded border-border text-primary focus:ring-primary"
                            />
                            <span className="text-sm text-text">{t('deployment.autoPublish')}</span>
                        </label>
                    </div>
                    
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 text-text-muted hover:text-text"
                        >
                            {t('deployment.cancel')}
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
                        >
                            {t('deployment.addTarget')}
                        </button>
                    </div>
                </form>
            </div>
        )}

        {/* Target List */}
        <div className="space-y-4">
            {targets.length === 0 ? (
                <div className="text-center py-8 text-text-muted bg-surface/30 rounded-lg border border-border border-dashed">
                    {t('deployment.noTargets')}
                </div>
            ) : (
                targets.map(target => (
                    <div key={target.id} className="bg-surface border border-border rounded-xl p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-lg ${target.repo_type === 'github_releases' ? 'bg-purple-500/10' : 'bg-green-500/10'}`}>
                                {target.repo_type === 'github_releases'
                                    ? <Github className="w-5 h-5 text-purple-400" />
                                    : <Server className="w-5 h-5 text-green-400" />}
                            </div>
                            <div>
                                <h4 className="font-semibold text-white">{target.repository_name}</h4>
                                <div className="flex gap-3 text-xs text-text-muted mt-1">
                                    {target.custom_path && (
                                        <span className="flex items-center gap-1 bg-background px-2 py-0.5 rounded border border-border">
                                            Path: {target.custom_path}
                                        </span>
                                    )}
                                    {target.run_createrepo && (
                                        <span className="flex items-center gap-1 text-green-400">
                                            <Check className="w-3 h-3" /> createrepo
                                        </span>
                                    )}
                                    {target.auto_publish && (
                                        <span className="flex items-center gap-1 text-blue-400">
                                            <Rocket className="w-3 h-3" /> auto-deploy
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            {/* Build Selector for Deployment */}
                            <div className="flex-1 md:w-48">
                                <select 
                                    value={selectedBuildId}
                                    onChange={e => setSelectedBuildId(e.target.value)}
                                    className="w-full bg-background border border-border rounded px-3 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
                                >
                                    <option value="">{t('deployment.selectBuild')}</option>
                                    {project.builds && project.builds
                                        .filter(b => b.status === 'success')
                                        .sort((a, b) => b.id - a.id)
                                        .map(b => (
                                        <option key={b.id} value={b.id}>
                                            Build #{b.build_number} ({b.version}){b.target_distro ? ` [${b.target_distro}]` : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <button 
                                onClick={() => handleDeploy(target.id)}
                                disabled={deploying || !selectedBuildId}
                                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Rocket className="w-3 h-3" />
                                {t('deployment.deploy')}
                            </button>
                            
                            <button 
                                onClick={() => handleDeleteTarget(target.id)}
                                className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* Deployment History */}
      <div className="space-y-4 pt-6 border-t border-border">
          <h3 className="text-lg font-medium text-text">{t('deployment.history')}</h3>

          {deployments.length === 0 ? (
              <div className="text-sm text-text-muted">{t('deployment.noDeployments')}</div>
          ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {deployments.map(dep => (
                      <div key={dep.id} className="flex flex-col">
                          <div 
                            className="p-4 flex justify-between items-center hover:bg-surface-hover cursor-pointer transition-colors"
                            onClick={() => toggleLog(dep.id)}
                          >
                              <div className="flex items-center gap-4">
                                  {dep.status === 'success' ? (
                                      <CheckCircle className="w-5 h-5 text-green-500" />
                                  ) : dep.status === 'failed' ? (
                                      <AlertCircle className="w-5 h-5 text-red-500" />
                                  ) : (
                                      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                                  )}
                                  
                                  <div>
                                      <p className="text-sm text-white font-medium">
                                          {t('deployment.deployedTo', { buildId: dep.build_id })} <span className="text-primary">{dep.repository_name}</span>
                                      </p>
                                      <div className="flex items-center gap-2 text-xs text-text-muted">
                                          <Clock className="w-3 h-3" />
                                          {dep.deployed_at}
                                      </div>
                                  </div>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${
                                      dep.status === 'success' ? 'bg-green-500/10 text-green-500' :
                                      dep.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                                      'bg-blue-500/10 text-blue-500'
                                  }`}>
                                      {dep.status}
                                  </span>
                                  {expandedDeploymentId === dep.id ? (
                                      <ChevronUp className="w-4 h-4 text-text-muted" />
                                  ) : (
                                      <ChevronDown className="w-4 h-4 text-text-muted" />
                                  )}
                              </div>
                          </div>
                          
                          {expandedDeploymentId === dep.id && (
                              <div className="bg-black/30 p-4 border-t border-border font-mono text-xs text-text-muted whitespace-pre-wrap max-h-60 overflow-y-auto">
                                  {dep.log || t('deployment.noLogAvailable')}
                              </div>
                          )}
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );
};

export default DeploymentManager;
