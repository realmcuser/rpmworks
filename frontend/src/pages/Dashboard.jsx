import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, GitBranch, Clock, ArrowRight, Loader2, Trash2, Check } from 'lucide-react';
import { fetchProjects, deleteProject } from '../services/api';

const ProjectCard = ({ name, description, lastBuild, status, onClick, onDelete, onDeleteConfirm, confirmingDelete, t }) => (
  <div onClick={onClick} className="bg-surface border border-border rounded-xl p-5 hover:border-primary/50 transition-colors group cursor-pointer shadow-lg shadow-black/20 relative">
    <div className="flex justify-between items-start mb-4">
      <div className="p-2 bg-background rounded-lg border border-border group-hover:border-primary/30 transition-colors">
        <GitBranch className="w-6 h-6 text-primary" />
      </div>
      <div className="flex items-center gap-2">
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
          status === 'success' ? 'bg-green-500/10 text-green-400' :
          status === 'failed' ? 'bg-red-500/10 text-red-400' :
          status === 'running' ? 'bg-yellow-500/10 text-yellow-400' :
          'bg-slate-500/10 text-slate-400'
        }`}>
          {status === 'success' ? t('dashboard.buildPassing') :
           status === 'failed' ? t('dashboard.buildFailed') :
           status === 'running' ? t('dashboard.building') : t('dashboard.pending')}
        </span>
        {confirmingDelete ? (
          <button
            onClick={onDeleteConfirm}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-md transition-colors z-10"
            title={t('dashboard.confirmDelete')}
          >
            <Check className="w-3 h-3" />
            {t('dashboard.confirmDelete')}
          </button>
        ) : (
          <button
            onClick={onDelete}
            className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors z-10"
            title={t('dashboard.deleteProject')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>

    <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{name}</h3>
    <p className="text-text-muted text-sm mb-6 line-clamp-2">{description || t('dashboard.noDescription')}</p>

    <div className="flex items-center justify-between text-xs text-text-muted border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>{lastBuild || t('dashboard.neverBuilt')}</span>
      </div>
      <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
    </div>
  </div>
);

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await fetchProjects();
        setProjects(data);
      } catch (err) {
        setError(t('dashboard.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [t]);

  // Cancel pending delete if user clicks elsewhere
  useEffect(() => {
    if (!confirmingDeleteId) return;
    const cancel = () => setConfirmingDeleteId(null);
    window.addEventListener('click', cancel);
    return () => window.removeEventListener('click', cancel);
  }, [confirmingDeleteId]);

  const handleDeleteClick = (e, projectId) => {
    e.stopPropagation();
    setDeleteError(null);
    setConfirmingDeleteId(projectId);
  };

  const handleDeleteConfirm = async (e, projectId) => {
    e.stopPropagation();
    setConfirmingDeleteId(null);
    try {
      await deleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
    } catch (err) {
      console.error("Failed to delete project:", err);
      setDeleteError(t('dashboard.deleteError'));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">{t('dashboard.title')}</h2>
          <p className="text-text-muted">{t('dashboard.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" />
          <span>{t('dashboard.newProject')}</span>
        </button>
      </div>

      {deleteError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {deleteError}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <ProjectCard
            key={project.id}
            name={project.name}
            description={project.description}
            status={project.status}
            lastBuild={project.last_build}
            onClick={() => navigate(`/projects/${project.id}`)}
            onDelete={(e) => handleDeleteClick(e, project.id)}
            onDeleteConfirm={(e) => handleDeleteConfirm(e, project.id)}
            confirmingDelete={confirmingDeleteId === project.id}
            t={t}
          />
        ))}

        {/* Empty State / Add New Placeholder */}
        <div
          onClick={() => navigate('/projects/new')}
          className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center text-text-muted hover:text-primary hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer group min-h-[240px]"
        >
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6" />
          </div>
          <p className="font-medium">{t('dashboard.createNewProject')}</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
