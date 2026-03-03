import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Download, Search, FileText, Clock, Box } from 'lucide-react';
import { fetchWithAuth } from '../services/api';

const ArtifactsPage = () => {
  const { t } = useTranslation();
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadArtifacts();
  }, []);

  const loadArtifacts = async () => {
    try {
      const res = await fetchWithAuth('/api/artifacts');
      if (!res.ok) throw new Error('Failed to load artifacts');
      const data = await res.json();
      setArtifacts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredArtifacts = artifacts.filter(a => 
    a.project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.rpm_files.some(f => f.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Group by project
  const groupedArtifacts = filteredArtifacts.reduce((acc, artifact) => {
    if (!acc[artifact.project_name]) {
      acc[artifact.project_name] = [];
    }
    acc[artifact.project_name].push(artifact);
    return acc;
  }, {});

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
          <h1 className="text-2xl font-bold text-white tracking-tight">{t('artifacts.title')}</h1>
          <p className="text-text-muted">{t('artifacts.subtitle')}</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-text-muted w-4 h-4" />
          <input 
            type="text" 
            placeholder={t('artifacts.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-4 py-2 bg-surface border border-border rounded-lg text-sm text-text focus:outline-none focus:border-primary w-64"
          />
        </div>
      </div>

      {Object.keys(groupedArtifacts).length === 0 ? (
        <div className="text-center py-12 bg-surface border border-border rounded-xl">
          <Package className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-white">{t('artifacts.noArtifacts')}</h3>
          <p className="text-text-muted max-w-md mx-auto mt-2">
            {t('artifacts.noArtifactsDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedArtifacts).map(([projectName, items]) => (
            <div key={projectName} className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-surface-hover/30 flex items-center gap-3">
                <Box className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-white">{projectName}</h2>
                <span className="text-xs text-text-muted bg-background px-2 py-0.5 rounded-full border border-border">
                  {items.length} builds
                </span>
              </div>
              
              <div className="divide-y divide-border">
                {items.map((artifact) => (
                  <div key={artifact.id} className="p-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">Version {artifact.version}</span>
                          <span className="text-xs text-text-muted">•</span>
                          <span className="text-xs text-text-muted flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {artifact.completed_at}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mt-2">
                          {artifact.rpm_files.map((file, idx) => {
                            const filename = file.split('/').pop();
                            const downloadUrl = `${import.meta.env.VITE_API_URL || ''}/api/builds/${artifact.id}/download/${filename}`;
                            
                            return (
                              <a 
                                key={idx}
                                href={downloadUrl}
                                download
                                className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border rounded-md text-sm text-primary hover:border-primary transition-colors group"
                              >
                                <FileText className="w-4 h-4 text-text-muted group-hover:text-primary" />
                                <span className="font-mono">{filename}</span>
                                <Download className="w-3 h-3 ml-1 opacity-50 group-hover:opacity-100" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ArtifactsPage;
