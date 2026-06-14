import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus, GitBranch, Clock, ArrowRight, Loader2, LayoutGrid, List, Play } from 'lucide-react';
import { fetchProjects, fetchProjectGroups, startBuild, startGroupBuild } from '../services/api';

const ProjectCard = ({ name, description, lastBuild, status, onClick, onBuildNow, isBuilding, t }) => {
  const buildDisabled = isBuilding || status === 'running' || status === 'pending';
  return (
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
      </div>
    </div>

    <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{name}</h3>
    <p className="text-text-muted text-sm mb-4 line-clamp-2">{description || t('dashboard.noDescription')}</p>

    <button
      onClick={onBuildNow}
      disabled={buildDisabled}
      className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-4 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
    >
      {isBuilding || status === 'running' || status === 'pending'
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Play className="w-4 h-4" />}
      {t('project.buildNow')}
    </button>

    <div className="flex items-center justify-between text-xs text-text-muted border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4" />
        <span>{lastBuild || t('dashboard.neverBuilt')}</span>
      </div>
      <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
    </div>
  </div>
  );
};

const ProjectListItem = ({ name, description, lastBuild, status, onClick, onBuildNow, isBuilding, t }) => {
  const buildDisabled = isBuilding || status === 'running' || status === 'pending';
  return (
  <div onClick={onClick} className="bg-surface border border-border rounded-xl px-5 py-3 hover:border-primary/50 transition-colors group cursor-pointer shadow-lg shadow-black/20 relative">
    <div className="flex items-center gap-4">
      <div className="p-2 bg-background rounded-lg border border-border group-hover:border-primary/30 transition-colors shrink-0">
        <GitBranch className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-4">
          <h3 className="text-base font-semibold group-hover:text-primary transition-colors truncate">{name}</h3>
          <div className="flex items-center gap-2 shrink-0">
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
            <button
              onClick={onBuildNow}
              disabled={buildDisabled}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-md text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-10"
            >
              {isBuilding || status === 'running' || status === 'pending'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Play className="w-3.5 h-3.5" />}
              {t('project.buildNow')}
            </button>
            <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 mt-1">
          <p className="text-text-muted text-sm truncate">{description || t('dashboard.noDescription')}</p>
          <div className="flex items-center gap-2 text-xs text-text-muted shrink-0">
            <Clock className="w-4 h-4" />
            <span>{lastBuild || t('dashboard.neverBuilt')}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('dashboard-view-mode') || 'grid');
  const [buildingIds, setBuildingIds] = useState(new Set());
  const [buildingGroupIds, setBuildingGroupIds] = useState(new Set());
  const [buildError, setBuildError] = useState(null);

  const handleSetViewMode = (mode) => {
    setViewMode(mode);
    localStorage.setItem('dashboard-view-mode', mode);
  };

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const [projectsData, groupsData] = await Promise.all([
          fetchProjects(),
          fetchProjectGroups()
        ]);
        setProjects(projectsData);
        setGroups(groupsData);
      } catch (err) {
        setError(t('dashboard.loadError'));
      } finally {
        setIsLoading(false);
      }
    };

    loadProjects();
  }, [t]);

  const handleBuildNow = async (e, projectId) => {
    e.stopPropagation();
    setBuildError(null);
    setBuildingIds(prev => new Set(prev).add(projectId));
    try {
      await startBuild(projectId);
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'running' } : p));
    } catch (err) {
      console.error("Failed to start build:", err);
      setBuildError(t('project.builds.startFailed'));
    } finally {
      setBuildingIds(prev => {
        const next = new Set(prev);
        next.delete(projectId);
        return next;
      });
    }
  };

  const handleBuildGroup = async (e, groupId, projectIds) => {
    e.stopPropagation();
    setBuildError(null);
    setBuildingGroupIds(prev => new Set(prev).add(groupId));
    try {
      await startGroupBuild(groupId);
      const idSet = new Set(projectIds);
      setProjects(prev => prev.map(p => idSet.has(p.id) ? { ...p, status: 'running' } : p));
    } catch (err) {
      console.error("Failed to start group build:", err);
      setBuildError(t('project.builds.startFailed'));
    } finally {
      setBuildingGroupIds(prev => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
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
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface border border-border rounded-lg p-1">
            <button
              onClick={() => handleSetViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
              title={t('dashboard.gridView')}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleSetViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-primary text-white' : 'text-text-muted hover:text-text'}`}
              title={t('dashboard.listView')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-5 h-5" />
            <span>{t('dashboard.newProject')}</span>
          </button>
        </div>
      </div>

      {buildError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {buildError}
        </div>
      )}

      {(() => {
        const ItemComponent = viewMode === 'list' ? ProjectListItem : ProjectCard;

        const renderCard = (project) => (
          <ItemComponent
            key={project.id}
            name={project.name}
            description={project.description}
            status={project.status}
            lastBuild={project.last_build}
            onClick={() => navigate(`/projects/${project.id}`)}
            onBuildNow={(e) => handleBuildNow(e, project.id)}
            isBuilding={buildingIds.has(project.id)}
            t={t}
          />
        );

        const addPlaceholder = viewMode === 'list' ? (
          <div
            key="add-placeholder"
            onClick={() => navigate('/projects/new')}
            className="border-2 border-dashed border-border rounded-xl px-5 py-3 flex items-center gap-3 text-text-muted hover:text-primary hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <Plus className="w-4 h-4" />
            </div>
            <p className="font-medium">{t('dashboard.createNewProject')}</p>
          </div>
        ) : (
          <div
            key="add-placeholder"
            onClick={() => navigate('/projects/new')}
            className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center justify-center text-text-muted hover:text-primary hover:border-primary/50 hover:bg-surface/50 transition-all cursor-pointer group min-h-[240px]"
          >
            <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <p className="font-medium">{t('dashboard.createNewProject')}</p>
          </div>
        );

        const containerClass = viewMode === 'list'
          ? 'flex flex-col gap-3'
          : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

        if (groups.length === 0) {
          return (
            <div className={containerClass}>
              {projects.map(renderCard)}
              {addPlaceholder}
            </div>
          );
        }

        const ungrouped = projects.filter(p => !p.project_group_id);
        const sections = [
          ...groups.map(group => ({
            key: `group-${group.id}`,
            title: group.name,
            groupId: group.id,
            items: projects.filter(p => p.project_group_id === group.id)
          })),
          { key: 'ungrouped', title: t('dashboard.ungrouped'), items: ungrouped }
        ].filter(section => section.items.length > 0 || section.key === 'ungrouped');

        return (
          <div className="space-y-10">
            {sections.map((section, idx) => (
              <div key={section.key}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-text-muted">{section.title}</h3>
                  {section.groupId && section.items.length > 0 && (
                    <button
                      onClick={(e) => handleBuildGroup(e, section.groupId, section.items.map(p => p.id))}
                      disabled={buildingGroupIds.has(section.groupId)}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-primary hover:bg-primary-hover text-white shadow-lg shadow-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title={t('dashboard.buildGroupTitle')}
                    >
                      {buildingGroupIds.has(section.groupId) ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      <span>{t('dashboard.buildGroup')}</span>
                    </button>
                  )}
                </div>
                <div className={containerClass}>
                  {section.items.map(renderCard)}
                  {idx === sections.length - 1 && addPlaceholder}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
    </div>
  );
};

export default Dashboard;
