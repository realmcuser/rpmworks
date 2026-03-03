import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Terminal,
  Server,
  FolderGit2,
  Save,
  Loader2
} from 'lucide-react';
import FileSelector from '../components/SourceManager/FileSelector';
import { clsx } from 'clsx';
import { testConnection as apiTestConnection, createProject as apiCreateProject } from '../services/api';

const CreateProject = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false); // Add loading state for saving
  const [connectionLog, setConnectionLog] = useState([]);
  const [fileTree, setFileTree] = useState(null);
  const [error, setError] = useState(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    host: '',
    username: '',
    password: '',
    path: '/var/www/html',
    sshKey: ''
  });

  // Real connection test
  const testConnection = async () => {
    setIsConnecting(true);
    setConnectionLog([]);
    setFileTree(null);
    setError(null);

    const addLog = (msg) => setConnectionLog(prev => [...prev, msg]);

    addLog(t('createProject.log.resolving', { host: formData.host }));
    addLog(t('createProject.log.connecting', { username: formData.username }));

    try {
      const response = await apiTestConnection(
        formData.host,
        formData.username,
        formData.password,
        formData.path,
        formData.sshKey
      );

      addLog(t('createProject.log.sshSuccess'));
      addLog(t('createProject.log.authSuccess'));
      addLog(t('createProject.log.listing'));
      addLog(t('createProject.log.success'));

      setFileTree(response.files);

      setTimeout(() => {
        setIsConnecting(false);
        setStep(3);
      }, 500);

    } catch (error) {
      addLog(`${t('createProject.log.error')}: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleCreateProject = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        ...formData,
        host: formData.host.trim(),
        username: formData.username.trim(),
        path: formData.path.trim(),
        sshKey: formData.sshKey.trim(),
        ssh_key: formData.sshKey.trim()
      };
      delete payload.sshKey;
      await apiCreateProject(payload);
      navigate('/');
    } catch (err) {
      setError(t('createProject.error.createFailed') + ": " + err.message);
      setIsSaving(false);
    }
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div className={clsx(
            "w-10 h-10 rounded-full flex items-center justify-center border-2 font-bold transition-all",
            step === s ? "border-primary bg-primary text-white" : 
            step > s ? "border-primary bg-primary text-white" : 
            "border-border bg-surface text-text-muted"
          )}>
            {step > s ? <Check className="w-5 h-5" /> : s}
          </div>
          {s < 3 && (
            <div className={clsx(
              "w-20 h-0.5 mx-2 transition-colors",
              step > s ? "bg-primary" : "bg-border"
            )} />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">{t('createProject.title')}</h1>
        <p className="text-text-muted">{t('createProject.subtitle')}</p>
      </div>

      {renderStepIndicator()}

      <div className="bg-surface border border-border rounded-xl shadow-xl overflow-hidden">
        {/* STEP 1: Basic Info */}
        {step === 1 && (
          <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <FolderGit2 className="text-primary" /> {t('createProject.projectDetails')}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('createProject.projectName')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                  placeholder={t('createProject.projectNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('createProject.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary focus:ring-1 focus:ring-primary outline-none h-32"
                  placeholder={t('createProject.descriptionPlaceholder')}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Connection */}
        {step === 2 && (
          <div className="p-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Server className="text-primary" /> {t('createProject.sourceConnection')}
            </h2>
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">{t('createProject.sshHost')}</label>
                  <input
                    type="text"
                    value={formData.host}
                    onChange={(e) => setFormData({...formData, host: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary outline-none"
                    placeholder="192.168.1.50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">{t('createProject.username')}</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({...formData, username: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary outline-none"
                    placeholder="root"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    {t('createProject.password')} <span className="text-xs text-text-muted/50">({t('createProject.optionalIfSshKey')})</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary outline-none"
                    placeholder="••••••••"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">
                    {t('createProject.sshKeyPath')} <span className="text-xs text-text-muted/50">({t('createProject.optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={formData.sshKey}
                    onChange={(e) => setFormData({...formData, sshKey: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary outline-none font-mono text-sm"
                    placeholder="/root/.ssh/id_rsa"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted mb-1">{t('createProject.sourcePath')}</label>
                  <input
                    type="text"
                    value={formData.path}
                    onChange={(e) => setFormData({...formData, path: e.target.value})}
                    className="w-full bg-background border border-border rounded-lg p-3 focus:border-primary outline-none"
                    placeholder="/opt/my-app"
                  />
                </div>
              </div>

              {/* Connection Log Terminal */}
              <div className="bg-background rounded-lg border border-border p-4 font-mono text-xs flex flex-col h-full">
                <div className="flex items-center gap-2 text-text-muted border-b border-border pb-2 mb-2">
                  <Terminal className="w-4 h-4" /> {t('createProject.connectionLog')}
                </div>
                <div className="flex-1 overflow-auto space-y-1">
                  {connectionLog.length === 0 && !isConnecting && (
                    <span className="text-text-muted/50 italic">{t('createProject.readyToConnect')}</span>
                  )}
                  {connectionLog.map((log, i) => (
                    <div key={i} className={clsx(
                      log.includes(t('createProject.log.error')) ? "text-red-400" : "text-green-400"
                    )}>
                      <span className="opacity-50 mr-2">{new Date().toLocaleTimeString()}</span>
                      {'>'} {log}
                    </div>
                  ))}
                  {isConnecting && (
                    <div className="animate-pulse text-primary">_</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: File Selection */}
        {step === 3 && (
          <div className="flex flex-col h-[500px] animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="p-6 border-b border-border">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Check className="text-green-400" /> {t('createProject.confirmSourceFiles')}
              </h2>
              <p className="text-text-muted text-sm mt-1">
                {t('createProject.connectedTo', { host: formData.host })}
              </p>
            </div>
            <div className="flex-1 p-4 bg-background/30 overflow-hidden">
               <FileSelector
                  initialData={fileTree}
                  credentials={{
                    host: formData.host,
                    username: formData.username,
                    password: formData.password
                  }}
               />
            </div>
            {error && (
              <div className="px-6 py-2 text-red-400 text-sm bg-red-500/10 border-t border-red-500/20">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="p-6 border-t border-border bg-background/50 flex justify-between items-center">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1 || isConnecting || isSaving}
            className="px-4 py-2 text-text-muted hover:text-white disabled:opacity-50 flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" /> {t('createProject.back')}
          </button>

          {step === 2 ? (
            <button
              onClick={testConnection}
              disabled={isConnecting}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {isConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
              {isConnecting ? t('createProject.connecting') : t('createProject.testConnection')}
            </button>
          ) : step === 3 ? (
            <button
              onClick={handleCreateProject}
              disabled={isSaving}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-green-900/20 disabled:opacity-70"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? t('createProject.saving') : t('createProject.createProject')}
            </button>
          ) : (
            <button
              onClick={() => setStep(s => Math.min(3, s + 1))}
              className="bg-primary hover:bg-primary-hover text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              {t('createProject.next')} <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
