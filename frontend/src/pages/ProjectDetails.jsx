import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Server, Box, Activity, Settings, Terminal, Play, Save, Download, ChevronDown, ChevronUp, Edit2, X, Check, Trash2, Copy, AlertTriangle, Key, FileText, Loader2 } from 'lucide-react';
import { fetchWithAuth, startBuild, updateProjectDetails, deleteBuild, updateSourceConfig, cloneProject, runPrefetchScript } from '../services/api';
import SourceBrowserModal from '../components/SourceManager/SourceBrowserModal';
import SpecEditor from '../components/BuildManager/SpecEditor';
import FileMapper from '../components/BuildManager/FileMapper';
import DeploymentManager from '../components/DeploymentManager/DeploymentManager';

// Auto-scrolling Log Component
const AutoScrollLog = ({ log }) => {
  const logRef = useRef(null);
  const { t } = useTranslation();

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  return (
    <div
        ref={logRef}
        className="p-4 bg-black/30 border-t border-border font-mono text-[10px] text-text-muted whitespace-pre-wrap overflow-x-auto overflow-y-auto max-h-96"
    >
        {log || t('project.builds.waitingForLog')}
    </div>
  );
};

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isSourceModalOpen, setIsSourceModalOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [expandedBuildId, setExpandedBuildId] = useState(null);
  
  // Edit state for overview
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', max_builds: 10 });

  // Edit state for Source tab
  const [sourceEditMode, setSourceEditMode] = useState(false);
  const [sourceForm, setSourceForm] = useState({ pre_fetch_script: '', remote_command: '' });

  // Pre-fetch script run state
  const [prefetchRunning, setPrefetchRunning] = useState(false);
  const [prefetchResult, setPrefetchResult] = useState(null);

  // Clone modal state
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloning, setCloning] = useState(false);

  // Notes state
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);

  // Connection edit modal state
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    host: '',
    username: '',
    password: '',
    ssh_key_path: '',
    path: ''
  });
  const [savingConnection, setSavingConnection] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  // Polling for running builds
  useEffect(() => {
    let interval;
    const hasRunningBuild = project?.builds?.some(b => b.status === 'running' || b.status === 'pending');
    
    if (hasRunningBuild) {
        interval = setInterval(() => {
            fetchWithAuth(`/api/projects/${id}`)
                .then(res => res.json())
                .then(data => setProject(data))
                .catch(console.error);
                
        }, 3000);
    }
    
    return () => {
        if (interval) clearInterval(interval);
    };
  }, [project, id]);

  useEffect(() => {
    if (project) {
        setEditForm({ 
            name: project.name, 
            description: project.description || '',
            max_builds: project.max_builds || 10
        });
        setNotesText(project.notes || '');
        setSourceForm({
            pre_fetch_script: project.source_config?.pre_fetch_script || '',
            remote_command: project.source_config?.remote_command || ''
        });
        setConnectionForm({
            host: project.source_config?.host || '',
            username: project.source_config?.username || '',
            password: '',
            ssh_key_path: project.source_config?.ssh_key_path || '',
            path: project.source_config?.path || ''
        });
    }
  }, [project]);

  const loadProject = async () => {
    try {
      const data = await fetchWithAuth(`/api/projects/${id}`);
      if (!data.ok) throw new Error('Failed to fetch project');
      const json = await data.json();
      setProject(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartBuild = async () => {
    setBuilding(true);
    try {
      const response = await startBuild(project.id);
      setActiveTab('builds');
      // Handle both old (build_id) and new (build_ids) response formats
      if (response.build_ids && response.build_ids.length > 0) {
          setExpandedBuildId(response.build_ids[0]);
      } else if (response.build_id) {
          setExpandedBuildId(response.build_id);
      }
      loadProject();
    } catch (err) {
      console.error("Build failed to start:", err);
      alert(t('project.builds.startFailed'));
    } finally {
      setBuilding(false);
    }
  };

  const handleSaveDetails = async () => {
      try {
          const updated = await updateProjectDetails(project.id, editForm);
          setProject(prev => ({ 
              ...prev, 
              name: updated.name, 
              description: updated.description,
              max_builds: updated.max_builds
          }));
          setIsEditing(false);
      } catch (err) {
          alert(t('project.builds.updateFailed') + err.message);
      }
  };

  const handleSaveNotes = async () => {
      setSavingNotes(true);
      setNotesSaved(false);
      try {
          await updateProjectDetails(project.id, { notes: notesText });
          setProject(prev => ({ ...prev, notes: notesText }));
          setNotesSaved(true);
          setTimeout(() => setNotesSaved(false), 3000);
      } catch (err) {
          alert(t('project.notes.saveFailed') + err.message);
      } finally {
          setSavingNotes(false);
      }
  };

  const handleDeleteBuild = async (e, buildId) => {
      e.stopPropagation();
      if (!window.confirm(t('project.builds.confirmDelete'))) return;

      try {
          await deleteBuild(buildId);
          setProject(prev => ({
              ...prev,
              builds: prev.builds.filter(b => b.id !== buildId)
          }));
      } catch (err) {
          alert(t('project.builds.deleteFailed') + err.message);
      }
  };

  const toggleBuildLog = (buildId) => {
      setExpandedBuildId(expandedBuildId === buildId ? null : buildId);
  };

  const handleSaveSourceConfig = async () => {
      try {
          await updateSourceConfig(project.id, sourceForm);
          setProject(prev => ({
              ...prev,
              source_config: {
                  ...prev.source_config,
                  pre_fetch_script: sourceForm.pre_fetch_script,
                  remote_command: sourceForm.remote_command
              }
          }));
          setSourceEditMode(false);
      } catch (err) {
          alert("Failed to update source config: " + err.message);
      }
  };

  const handleRunPrefetch = async () => {
      setPrefetchRunning(true);
      setPrefetchResult(null);
      try {
          const result = await runPrefetchScript(project.id);
          setPrefetchResult(result);
      } catch (err) {
          setPrefetchResult({ success: false, exit_code: -1, stdout: '', stderr: err.message });
      } finally {
          setPrefetchRunning(false);
      }
  };

  const handleSaveConnection = async () => {
      setSavingConnection(true);
      try {
          // Only send fields that have values (don't send empty password)
          const updateData = {
              host: connectionForm.host.trim(),
              username: connectionForm.username.trim(),
              path: connectionForm.path.trim(),
              ssh_key_path: connectionForm.ssh_key_path?.trim() || null
          };
          if (connectionForm.password) {
              updateData.password = connectionForm.password;
          }

          await updateSourceConfig(project.id, updateData);

          // Reload project to get updated data
          const res = await fetchWithAuth(`/api/projects/${id}`);
          if (res.ok) {
              const data = await res.json();
              setProject(data);
          }

          setIsConnectionModalOpen(false);
      } catch (err) {
          alert(t('project.connectionSaveFailed') + ': ' + err.message);
      } finally {
          setSavingConnection(false);
      }
  };

  const handleSourceUpdate = (updatedSourceConfig) => {
    setProject(prev => ({
      ...prev,
      source_config: {
        ...prev.source_config,
        ...updatedSourceConfig
      }
    }));
  };

  const handleConfigUpdate = (updatedBuildConfig) => {
    setProject(prev => ({
        ...prev,
        build_config: updatedBuildConfig
    }));
  };

  const handleCloneProject = async () => {
    if (!cloneName.trim()) return;
    setCloning(true);
    try {
      const newProject = await cloneProject(project.id, cloneName.trim());
      setIsCloneModalOpen(false);
      setCloneName('');
      navigate(`/projects/${newProject.id}`);
    } catch (err) {
      alert(err.message);
    } finally {
      setCloning(false);
    }
  };

  const openCloneModal = () => {
    setCloneName(project.name + '-copy');
    setIsCloneModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-text-muted">
        <p className="mb-4">Failed to load project details</p>
        <Link to="/" className="text-primary hover:underline">Return to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link to="/" className="inline-flex items-center text-text-muted hover:text-text transition-colors w-fit">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t('project.backToDashboard')}
        </Link>
        
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{project.name}</h1>
            <p className="text-text-muted mt-1">{project.description || t('project.noDescriptionProvided')}</p>
          </div>
          <div className="flex gap-3">
             <button
                onClick={() => setActiveTab('configuration')}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-text hover:bg-surface-hover transition-colors"
             >
              <Settings className="w-4 h-4" />
              {t('project.settings')}
            </button>
            <button
                onClick={openCloneModal}
                className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg text-text hover:bg-surface-hover transition-colors"
             >
              <Copy className="w-4 h-4" />
              {t('project.copyProject')}
            </button>
            <button
              onClick={handleStartBuild}
              disabled={building}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Play className="w-4 h-4" />
              {building ? t('project.building') : t('project.buildNow')}
            </button>
          </div>
        </div>

        {/* Status Bar */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Box className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium uppercase">{t('project.status')}</p>
                <p className="text-white font-medium capitalize">{project.status}</p>
              </div>
           </div>
           
           <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <Activity className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium uppercase">{t('project.lastBuild')}</p>
                <p className="text-white font-medium">{project.last_build || t('project.never')}</p>
              </div>
           </div>

           <div className="bg-surface border border-border p-4 rounded-xl flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Server className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-text-muted font-medium uppercase">{t('project.sourceHost')}</p>
                <p className="text-white font-medium truncate max-w-[150px]">{project.source_config?.host}</p>
              </div>
           </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <div className="flex gap-6">
          {['overview', 'source', 'mapping', 'configuration', 'builds', 'deployment', 'notes'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium capitalize transition-all relative ${
                activeTab === tab 
                  ? 'text-primary' 
                  : 'text-text-muted hover:text-text'
              }`}
            >
              {t(`project.tabs.${tab}`)}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-surface border border-border rounded-xl p-6 relative">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-white">{t('project.details')}</h3>
                {!isEditing ? (
                    <button 
                        onClick={() => setIsEditing(true)}
                        className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsEditing(false)}
                            className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={handleSaveDetails}
                            className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                        >
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                )}
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-text-muted">Project ID</label>
                  <p className="text-text font-mono">{project.id}</p>
                </div>
                <div>
                  <label className="text-sm text-text-muted">{t('project.name')}</label>
                  {isEditing ? (
                      <input 
                        type="text" 
                        value={editForm.name}
                        onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                        className="w-full mt-1 bg-background border border-border rounded px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                      />
                  ) : (
                    <p className="text-text">{project.name}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-text-muted">{t('project.description')}</label>
                  {isEditing ? (
                      <textarea 
                        value={editForm.description}
                        onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full mt-1 bg-background border border-border rounded px-3 py-1.5 text-text focus:outline-none focus:border-primary min-h-[80px]"
                      />
                  ) : (
                    <p className="text-text">{project.description || '-'}</p>
                  )}
                </div>
                <div>
                    <label className="text-sm text-text-muted">{t('project.createdAt')}</label>
                    <p className="text-text">
                        {project.created_at ? new Date(project.created_at).toLocaleString() : 'Unknown'}
                    </p>
                </div>
                <div>
                    <label className="text-sm text-text-muted">{t('project.retentionPolicy')}</label>
                    {isEditing ? (
                      <input 
                        type="number" 
                        min="1"
                        max="100"
                        value={editForm.max_builds}
                        onChange={(e) => setEditForm(prev => ({ ...prev, max_builds: parseInt(e.target.value) || 10 }))}
                        className="w-full mt-1 bg-background border border-border rounded px-3 py-1.5 text-text focus:outline-none focus:border-primary"
                      />
                    ) : (
                        <p className="text-text">{project.max_builds || 10} builds</p>
                    )}
                </div>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-xl p-6">
              <h3 className="text-lg font-semibold text-white mb-4">{t('project.sourceConfig')}</h3>
               <div className="space-y-4">
                <div>
                  <label className="text-sm text-text-muted">{t('project.sourceHost')}</label>
                  <p className="text-text font-mono text-sm">{project.source_config?.host}</p>
                </div>
                <div>
                  <label className="text-sm text-text-muted">{t('project.sourceUser')}</label>
                  <p className="text-text font-mono text-sm">{project.source_config?.username}</p>
                </div>
                 <div>
                  <label className="text-sm text-text-muted">{t('project.sourcePath')}</label>
                  <p className="text-text font-mono text-sm break-all">{project.source_config?.path}</p>
                </div>
                <div>
                  <label className="text-sm text-text-muted">{t('project.includedFiles')}</label>
                  <p className="text-text font-mono text-sm">
                    {project.source_config?.include_patterns?.length || 0} files selected
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'source' && (
          <div className="bg-surface border border-border rounded-xl p-8">
            {/* Connection Settings Section */}
            <div className="max-w-2xl mx-auto mb-8 pb-8 border-b border-border">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-white">{t('project.connectionSettings')}</h4>
                    <button
                        onClick={() => setIsConnectionModalOpen(true)}
                        className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-text-muted">{t('project.sourceHost')}</label>
                        <p className="text-text font-mono text-sm">{project.source_config?.host}</p>
                    </div>
                    <div>
                        <label className="text-xs text-text-muted">{t('project.sourceUser')}</label>
                        <p className="text-text font-mono text-sm">{project.source_config?.username}</p>
                    </div>
                    <div className="md:col-span-2">
                        <label className="text-xs text-text-muted">{t('project.sourcePath')}</label>
                        <p className="text-text font-mono text-sm break-all">{project.source_config?.path}</p>
                    </div>
                    {project.source_config?.ssh_key_path && (
                        <div className="md:col-span-2">
                            <label className="text-xs text-text-muted">{t('project.sshKeyPath')}</label>
                            <p className="text-text font-mono text-sm break-all">{project.source_config?.ssh_key_path}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Pre-Fetch Script Section */}
            <div className="max-w-2xl mx-auto mb-8 pb-8 border-b border-border">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-white">{t('project.preFetchScript')}</h4>
                    {!sourceEditMode ? (
                        <button
                            onClick={() => setSourceEditMode(true)}
                            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSourceEditMode(false)}
                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleSaveSourceConfig}
                                className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                 </div>

                 <div className="space-y-4">
                    <div>
                        <p className="text-xs text-text-muted mb-2">
                            {t('project.preFetchScriptHint')}
                        </p>
                        {sourceEditMode ? (
                            <textarea
                                value={sourceForm.pre_fetch_script}
                                onChange={(e) => setSourceForm(prev => ({ ...prev, pre_fetch_script: e.target.value }))}
                                className="w-full bg-background border border-border rounded px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary min-h-[80px]"
                                placeholder="tar -czf archive.tar.gz mydir/"
                            />
                        ) : (
                             <div className="bg-background border border-border rounded px-3 py-2 text-text font-mono text-sm min-h-[38px] whitespace-pre-wrap">
                                {project.source_config?.pre_fetch_script || <span className="text-text-muted italic">{t('project.notConfigured')}</span>}
                             </div>
                        )}
                        {project.source_config?.pre_fetch_script && !sourceEditMode && (
                            <div className="mt-2">
                                <button
                                    onClick={handleRunPrefetch}
                                    disabled={prefetchRunning}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {prefetchRunning ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Play className="w-3.5 h-3.5" />
                                    )}
                                    {prefetchRunning ? t('project.runPrefetchRunning') : t('project.runPrefetch')}
                                </button>
                            </div>
                        )}
                        {prefetchResult && (
                            <div className={`mt-3 rounded-lg border p-3 ${prefetchResult.success ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
                                <p className={`text-xs font-semibold mb-2 ${prefetchResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                    {prefetchResult.success
                                        ? t('project.runPrefetchSuccess')
                                        : t('project.runPrefetchFailed', { code: prefetchResult.exit_code })}
                                </p>
                                {prefetchResult.stdout && (
                                    <pre className="text-xs text-text font-mono whitespace-pre-wrap break-all bg-background rounded px-2 py-1 mb-1">{prefetchResult.stdout}</pre>
                                )}
                                {prefetchResult.stderr && (
                                    <pre className="text-xs text-red-300 font-mono whitespace-pre-wrap break-all bg-background rounded px-2 py-1">{prefetchResult.stderr}</pre>
                                )}
                            </div>
                        )}
                    </div>
                 </div>
            </div>

            {/* Source File Browser */}
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mx-auto mb-4">
                    <Terminal className="w-8 h-8 text-text-muted" />
                </div>
                <h3 className="text-lg font-medium text-white">{t('project.sourceBrowser.title')}</h3>
                <p className="text-text-muted mt-2 max-w-md mx-auto">
                {t('project.sourceBrowser.description')}
                </p>
                <div className="mt-6 flex flex-col items-center gap-4">
                    <button
                        onClick={() => setIsSourceModalOpen(true)}
                        className="px-6 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg transition-colors"
                    >
                        {t('project.sourceBrowser.openBrowser')}
                    </button>
                </div>
            </div>

            {/* Advanced Source Options */}
            <div className="max-w-2xl mx-auto pt-6 border-t border-border">
                 <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-semibold text-white">{t('project.advancedSourceSettings')}</h4>
                    {!sourceEditMode ? (
                        <button 
                            onClick={() => setSourceEditMode(true)}
                            className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setSourceEditMode(false)}
                                className="p-1.5 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={handleSaveSourceConfig}
                                className="p-1.5 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                 </div>

                 <div className="space-y-4">
                    <div>
                        <label className="text-sm text-text-muted block mb-1">{t('project.remoteCheckCommand')}</label>
                        <p className="text-xs text-text-muted mb-2">
                            {t('project.remoteCheckCommandHint')}
                        </p>
                        {sourceEditMode ? (
                            <input 
                                type="text" 
                                value={sourceForm.remote_command}
                                onChange={(e) => setSourceForm(prev => ({ ...prev, remote_command: e.target.value }))}
                                className="w-full bg-background border border-border rounded px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                                placeholder="cat version.txt"
                            />
                        ) : (
                             <div className="bg-background border border-border rounded px-3 py-2 text-text font-mono text-sm min-h-[38px]">
                                {project.source_config?.remote_command || <span className="text-text-muted italic">{t('project.notConfigured')}</span>}
                             </div>
                        )}
                    </div>
                 </div>
            </div>

            <div className="mt-8 flex flex-col items-center">
              {/* List selected files here too */}
              {project.source_config?.include_patterns?.length > 0 && (
                <div className="w-full max-w-2xl mt-4 text-left">
                  <h4 className="text-sm font-medium text-text-muted mb-2">{t('project.sourceBrowser.selectedFiles')}</h4>
                  <div className="bg-background border border-border rounded-lg p-4 max-h-60 overflow-y-auto">
                    <ul className="space-y-1">
                      {project.source_config.include_patterns.map(path => (
                        <li key={path} className="text-sm font-mono text-text flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary/50"></span>
                          {path}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'configuration' && (
             <SpecEditor 
                project={project} 
                onUpdate={handleConfigUpdate} 
             />
        )}

        {activeTab === 'mapping' && (
             <FileMapper 
                project={project} 
                onUpdate={() => loadProject()} 
             />
        )}

        {activeTab === 'builds' && (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
             {project.builds && project.builds.length > 0 ? (
               <div className="divide-y divide-border">
                 {/* Deduplicate builds by ID just in case */}
                 {Array.from(new Map(project.builds.map(b => [b.id, b])).values())
                    .sort((a, b) => b.id - a.id) // Sort by ID descending (newest first)
                    .map((build) => (
                   <div key={build.id} className="flex flex-col hover:bg-surface-hover transition-colors">
                     <div 
                        className="p-4 flex items-center justify-between cursor-pointer"
                        onClick={() => toggleBuildLog(build.id)}
                     >
                       <div className="flex items-center gap-4">
                         <div className={`w-2 h-2 rounded-full ${
                           build.status === 'success' ? 'bg-green-500' : 
                           build.status === 'failed' ? 'bg-red-500' : 
                           'bg-blue-500 animate-pulse'
                         }`} />
                         <div>
                           <p className="text-sm font-medium text-white flex items-center gap-2">
                             {t('project.builds.title', { number: build.build_number })}
                             {build.target_distro && (
                               <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                                 {build.target_distro}
                               </span>
                             )}
                           </p>
                           <p className="text-xs text-text-muted">{t('project.builds.version', { version: build.version })}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-4">
                         <span className="text-xs text-text-muted">{build.started_at}</span>
                         <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                           build.status === 'success' ? 'bg-green-500/10 text-green-500' : 
                           build.status === 'failed' ? 'bg-red-500/10 text-red-500' : 
                           'bg-blue-500/10 text-blue-500'
                         }`}>
                           {build.status}
                         </span>
                         
                         {/* Artifacts Download */}
                         {build.status === 'success' && build.rpm_files && (
                             <div className="flex gap-2 mr-2">
                                {build.rpm_files.map(path => {
                                    const filename = path.split('/').pop();
                                    const downloadUrl = `${import.meta.env.VITE_API_URL || ''}/api/builds/${build.id}/download/${filename}`;
                                    return (
                                        <a 
                                            key={filename}
                                            href={downloadUrl}
                                            className="flex items-center gap-1 px-2 py-1 bg-background border border-border rounded text-xs text-text hover:text-primary hover:border-primary transition-colors"
                                            onClick={(e) => e.stopPropagation()}
                                            title={`Download ${filename}`}
                                            download
                                        >
                                            <Download className="w-3 h-3" />
                                            <span className="max-w-[100px] truncate">{filename}</span>
                                        </a>
                                    );
                                })}
                             </div>
                         )}

                         <button 
                            onClick={(e) => handleDeleteBuild(e, build.id)}
                            className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                            title="Delete build"
                         >
                            <Trash2 className="w-4 h-4" />
                         </button>

                         {expandedBuildId === build.id ? <ChevronUp className="w-4 h-4 text-text-muted" /> : <ChevronDown className="w-4 h-4 text-text-muted" />}
                       </div>
                     </div>
                     
                     {/* Build Log */}
                     {expandedBuildId === build.id && (
                        <AutoScrollLog log={build.build_log} />
                     )}
                   </div>
                 ))}
               </div>
             ) : (
               <div className="p-8 text-center text-text-muted">
                  {t('project.builds.noBuilds')}
               </div>
             )}
          </div>
        )}

        {activeTab === 'deployment' && (
             <DeploymentManager
                project={project}
                onUpdate={() => loadProject()}
             />
        )}

        {activeTab === 'notes' && (
          <div className="bg-surface border border-border rounded-xl flex flex-col h-[500px]">
            <div className="flex justify-between items-center p-4 border-b border-border bg-background/50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h3 className="font-semibold text-white">{t('project.notes.title')}</h3>
              </div>
              <div className="flex items-center gap-4">
                {notesSaved && <span className="text-green-400 text-sm">{t('project.notes.saved')}</span>}
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {t('project.notes.save')}
                </button>
              </div>
            </div>
            <textarea
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              className="flex-1 bg-[#1e1e1e] text-gray-300 p-4 resize-none focus:outline-none text-sm leading-relaxed"
              placeholder={t('project.notes.placeholder')}
              spellCheck="false"
            />
          </div>
        )}
      </div>

      <SourceBrowserModal
        isOpen={isSourceModalOpen}
        onClose={() => setIsSourceModalOpen(false)}
        project={project}
        onUpdate={handleSourceUpdate}
      />

      {/* Edit Connection Modal */}
      {isConnectionModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-lg mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">{t('project.editConnection')}</h3>
              <button
                onClick={() => setIsConnectionModalOpen(false)}
                className="p-1 text-text-muted hover:text-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-3 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mb-4">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                {t('project.connectionChangeWarning')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">{t('project.sourceHost')}</label>
                <input
                  type="text"
                  value={connectionForm.host}
                  onChange={(e) => setConnectionForm(prev => ({ ...prev, host: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                  placeholder="example.com"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">{t('project.sourceUser')}</label>
                <input
                  type="text"
                  value={connectionForm.username}
                  onChange={(e) => setConnectionForm(prev => ({ ...prev, username: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                  placeholder="username"
                />
              </div>

              <div>
                <label className="block text-sm text-text-muted mb-1">{t('project.sourcePath')}</label>
                <input
                  type="text"
                  value={connectionForm.path}
                  onChange={(e) => setConnectionForm(prev => ({ ...prev, path: e.target.value }))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                  placeholder="/path/to/source"
                />
              </div>

              <div className="border-t border-border pt-4">
                <p className="text-xs text-text-muted mb-3">{t('project.authMethod')}</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm text-text-muted mb-1 flex items-center gap-2">
                      <Key className="w-4 h-4" />
                      {t('project.sshKeyPath')}
                    </label>
                    <input
                      type="text"
                      value={connectionForm.ssh_key_path}
                      onChange={(e) => setConnectionForm(prev => ({ ...prev, ssh_key_path: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                      placeholder="/opt/rpmworks/.ssh/id_ed25519"
                    />
                  </div>

                  <div className="text-center text-xs text-text-muted">{t('project.or')}</div>

                  <div>
                    <label className="block text-sm text-text-muted mb-1">{t('project.password')}</label>
                    <input
                      type="password"
                      value={connectionForm.password}
                      onChange={(e) => setConnectionForm(prev => ({ ...prev, password: e.target.value }))}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text font-mono text-sm focus:outline-none focus:border-primary"
                      placeholder={t('project.passwordPlaceholder')}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setIsConnectionModalOpen(false)}
                  className="px-4 py-2 text-text-muted hover:text-text transition-colors"
                >
                  {t('project.cancel')}
                </button>
                <button
                  onClick={handleSaveConnection}
                  disabled={savingConnection || !connectionForm.host || !connectionForm.username || !connectionForm.path}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingConnection ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  {t('project.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Clone Project Modal */}
      {isCloneModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">{t('project.cloneProject')}</h3>
              <button
                onClick={() => setIsCloneModalOpen(false)}
                className="p-1 text-text-muted hover:text-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-text-muted mb-1">{t('project.newProjectName')}</label>
                <input
                  type="text"
                  value={cloneName}
                  onChange={(e) => setCloneName(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                  placeholder={t('project.newProjectNamePlaceholder')}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCloneProject()}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsCloneModalOpen(false)}
                  className="px-4 py-2 text-text-muted hover:text-text transition-colors"
                >
                  {t('project.cancel')}
                </button>
                <button
                  onClick={handleCloneProject}
                  disabled={cloning || !cloneName.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cloning ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {t('project.copy')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;
