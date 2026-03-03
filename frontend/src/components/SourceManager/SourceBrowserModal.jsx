import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Save, Loader2 } from 'lucide-react';
import FileSelector from './FileSelector';
import { fetchProjectFiles, browseProjectFiles, updateSourceConfig } from '../../services/api';

const SourceBrowserModal = ({ isOpen, onClose, project, onUpdate }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fileData, setFileData] = useState(null);
  const [selectedPaths, setSelectedPaths] = useState(project?.source_config?.include_patterns || []);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && project?.source_config) {
      loadFileTree();
      setSelectedPaths(project.source_config.include_patterns || []);
    }
  }, [isOpen, project]);

  const loadFileTree = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use the project-based file fetching (doesn't require sending password from frontend)
      const files = await fetchProjectFiles(project.id);
      setFileData(files);
    } catch (err) {
      setError("Failed to load file tree: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowse = async (path) => {
    // This function is passed to FileSelector -> FileTreeItem to load subdirectories
    return await browseProjectFiles(project.id, path);
  };

  const handleTogglePath = (path) => {
    setSelectedPaths(prev => {
      if (prev.includes(path)) {
        return prev.filter(p => p !== path);
      } else {
        return [...prev, path];
      }
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedConfig = await updateSourceConfig(project.id, {
        include_patterns: selectedPaths
      });
      if (onUpdate) onUpdate(updatedConfig);
      onClose();
    } catch (err) {
      setError("Failed to save changes: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border">
          <h2 className="text-xl font-semibold text-white">{t('project.sourceBrowser.title')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
            <X className="w-6 h-6 text-text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden p-4 flex flex-col">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex-1 overflow-hidden flex gap-4">
              <div className="flex-1 h-full overflow-hidden">
                <FileSelector 
                   initialData={fileData}
                   credentials={project?.source_config}
                   mode="multi"
                   selectedPaths={selectedPaths}
                   onTogglePath={handleTogglePath}
                   onBrowse={handleBrowse}
                />
              </div>
              
              {/* Sidebar with selected files summary */}
              <div className="w-64 bg-background border border-border rounded-xl p-4 overflow-y-auto">
                <h3 className="font-medium text-text mb-2">{t('project.sourceBrowser.selectedFiles')} ({selectedPaths.length})</h3>
                {selectedPaths.length === 0 ? (
                  <p className="text-sm text-text-muted italic">No files selected.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedPaths.map(path => (
                      <li key={path} className="text-xs text-text-muted break-all bg-surface p-1 rounded border border-border/50">
                        {path.split('/').pop()}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-text hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving || loading}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default SourceBrowserModal;
