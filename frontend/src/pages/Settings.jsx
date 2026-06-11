import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Shield, Loader2, AlertCircle, Check, X, FolderTree, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { fetchUsers, updateUser, fetchAdminSettings, updateAdminSettings, fetchCurrentUser, fetchProjectGroups, createProjectGroup, updateProjectGroup, deleteProjectGroup, fetchProjects, reorderProjects, reorderProjectGroups } from '../services/api';

const buildSections = (groupsList, projectsList) => {
  const sections = {};
  groupsList.forEach(group => {
    sections[`group-${group.id}`] = projectsList.filter(p => p.project_group_id === group.id);
  });
  sections.ungrouped = projectsList.filter(p => !p.project_group_id);
  return sections;
};

const Settings = () => {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({ allow_registration: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [groupError, setGroupError] = useState(null);
  const [sectionProjects, setSectionProjects] = useState({});
  const [dragItem, setDragItem] = useState(null);
  const [groupDragIndex, setGroupDragIndex] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await fetchCurrentUser();
      setCurrentUser(user);

      if (user.role === 'admin') {
        const [usersData, settingsData, groupsData, projectsData] = await Promise.all([
          fetchUsers(),
          fetchAdminSettings(),
          fetchProjectGroups(),
          fetchProjects()
        ]);
        setUsers(usersData);
        setSettings(settingsData);
        setGroups(groupsData);
        setSectionProjects(buildSections(groupsData, projectsData));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRegistration = async () => {
    setSaving(true);
    try {
      const newSettings = { allow_registration: !settings.allow_registration };
      await updateAdminSettings(newSettings);
      setSettings(newSettings);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleUserActive = async (user) => {
    try {
      const updated = await updateUser(user.id, { is_active: !user.is_active });
      setUsers(users.map(u => u.id === user.id ? updated : u));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleChangeRole = async (user, newRole) => {
    try {
      const updated = await updateUser(user.id, { role: newRole });
      setUsers(users.map(u => u.id === user.id ? updated : u));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupError(null);
    try {
      const created = await createProjectGroup(name);
      setGroups([...groups, created]);
      setNewGroupName('');
    } catch (err) {
      setGroupError(err.message);
    }
  };

  const handleStartEditGroup = (group) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
    setGroupError(null);
  };

  const handleSaveGroup = async (group) => {
    const name = editingGroupName.trim();
    if (!name) return;
    setGroupError(null);
    try {
      const updated = await updateProjectGroup(group.id, name);
      setGroups(groups.map(g => g.id === group.id ? updated : g));
      setEditingGroupId(null);
    } catch (err) {
      setGroupError(err.message);
    }
  };

  const handleDeleteGroup = async (group) => {
    setGroupError(null);
    try {
      await deleteProjectGroup(group.id);
      setGroups(groups.filter(g => g.id !== group.id));
      setSectionProjects(prev => {
        const next = { ...prev };
        const orphaned = next[`group-${group.id}`] || [];
        delete next[`group-${group.id}`];
        next.ungrouped = [...(next.ungrouped || []), ...orphaned];
        return next;
      });
    } catch (err) {
      setGroupError(err.message);
    }
  };

  const handleDragStart = (sectionKey, index) => {
    setDragItem({ sectionKey, index });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (sectionKey, index) => {
    if (!dragItem || dragItem.sectionKey !== sectionKey || dragItem.index === index) {
      setDragItem(null);
      return;
    }
    const items = [...sectionProjects[sectionKey]];
    const [moved] = items.splice(dragItem.index, 1);
    items.splice(index, 0, moved);
    setDragItem(null);
    setSectionProjects(prev => ({ ...prev, [sectionKey]: items }));
    try {
      await reorderProjects(items.map(p => p.id));
    } catch (err) {
      setGroupError(err.message);
      setSectionProjects(prev => ({ ...prev, [sectionKey]: sectionProjects[sectionKey] }));
    }
  };

  const handleGroupDragStart = (index) => {
    setGroupDragIndex(index);
  };

  const handleGroupDrop = async (index) => {
    if (groupDragIndex === null || groupDragIndex === index) {
      setGroupDragIndex(null);
      return;
    }
    const previous = groups;
    const items = [...groups];
    const [moved] = items.splice(groupDragIndex, 1);
    items.splice(index, 0, moved);
    setGroupDragIndex(null);
    setGroups(items);
    try {
      await reorderProjectGroups(items.map(g => g.id));
    } catch (err) {
      setGroupError(err.message);
      setGroups(previous);
    }
  };

  const renderProjectList = (sectionKey) => {
    const items = sectionProjects[sectionKey] || [];
    if (items.length === 0) {
      return <p className="text-sm text-text-muted italic">{t('settings.projectGroups.noProjects')}</p>;
    }
    return (
      <ul className="space-y-1">
        {items.map((project, index) => (
          <li
            key={project.id}
            draggable
            onDragStart={() => handleDragStart(sectionKey, index)}
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(sectionKey, index)}
            className="flex items-center gap-2 px-2 py-1.5 bg-background border border-border rounded text-sm text-text cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4 text-text-muted shrink-0" />
            <span className="truncate">{project.name}</span>
          </li>
        ))}
      </ul>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Non-admin user view
  if (currentUser?.role !== 'admin') {
    return (
      <div className="space-y-8 max-w-4xl mx-auto">
        <div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">{t('sidebar.settings')}</h2>
          <p className="text-text-muted">{t('settings.description')}</p>
        </div>

        <div className="bg-surface border border-border rounded-xl p-8">
          <div className="flex flex-col items-center justify-center text-center py-8">
            <div className="w-16 h-16 bg-surface-hover rounded-full flex items-center justify-center mb-4">
              <Shield className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-lg font-medium text-white mb-2">{t('settings.adminOnly')}</h3>
            <p className="text-text-muted max-w-md">
              {t('settings.adminOnlyDescription')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Admin view
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">{t('sidebar.settings')}</h2>
        <p className="text-text-muted">{t('settings.description')}</p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Registration Setting */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          {t('settings.registration')}
        </h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-text">{t('settings.allowRegistration')}</p>
            <p className="text-sm text-text-muted">{t('settings.allowRegistrationHint')}</p>
          </div>
          <button
            onClick={handleToggleRegistration}
            disabled={saving}
            className={`relative w-14 h-7 rounded-full transition-colors ${
              settings.allow_registration ? 'bg-primary' : 'bg-surface-hover'
            }`}
          >
            <span
              className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                settings.allow_registration ? 'left-8' : 'left-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* User Management */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          {t('settings.userManagement')}
        </h3>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-hover text-text-muted border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium">{t('settings.username')}</th>
                <th className="px-4 py-3 font-medium">{t('settings.role')}</th>
                <th className="px-4 py-3 font-medium">{t('settings.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('settings.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-4 py-3 font-mono">
                    {user.username}
                    {user.id === currentUser.id && (
                      <span className="ml-2 text-xs text-primary">({t('settings.you')})</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user, e.target.value)}
                      disabled={user.id === currentUser.id}
                      className="bg-background border border-border rounded px-2 py-1 text-text text-sm focus:outline-none focus:border-primary disabled:opacity-50"
                    >
                      <option value="admin">Admin</option>
                      <option value="user">User</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      user.is_active
                        ? 'bg-green-500/10 text-green-500'
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {user.is_active ? (
                        <><Check className="w-3 h-3" /> {t('settings.active')}</>
                      ) : (
                        <><X className="w-3 h-3" /> {t('settings.inactive')}</>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleToggleUserActive(user)}
                      disabled={user.id === currentUser.id}
                      className={`px-3 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        user.is_active
                          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                          : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                      }`}
                    >
                      {user.is_active ? t('settings.deactivate') : t('settings.activate')}
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-text-muted">
                    {t('settings.noUsers')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Project Groups */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FolderTree className="w-5 h-5" />
          {t('settings.projectGroups.title')}
        </h3>

        {groupError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {groupError}
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden mb-4">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-border">
              {groups.map((group, groupIndex) => (
                <React.Fragment key={group.id}>
                  <tr
                    draggable
                    onDragStart={() => handleGroupDragStart(groupIndex)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleGroupDrop(groupIndex)}
                    className="hover:bg-surface-hover transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-text-muted shrink-0" />
                        {editingGroupId === group.id ? (
                          <input
                            type="text"
                            value={editingGroupName}
                            onChange={(e) => setEditingGroupName(e.target.value)}
                            autoFocus
                            className="bg-background border border-border rounded px-2 py-1 text-text text-sm focus:outline-none focus:border-primary w-full max-w-xs"
                          />
                        ) : (
                          group.name
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editingGroupId === group.id ? (
                        <button
                          onClick={() => handleSaveGroup(group)}
                          className="px-3 py-1 rounded text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5 inline" /> {t('settings.projectGroups.save')}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStartEditGroup(group)}
                          className="p-1.5 text-text-muted hover:text-primary hover:bg-primary/10 rounded-md transition-colors mr-1"
                          title={t('settings.projectGroups.rename')}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteGroup(group)}
                        className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
                        title={t('settings.projectGroups.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="px-4 pb-3 pt-0">
                      {renderProjectList(`group-${group.id}`)}
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              {groups.length === 0 && (
                <tr>
                  <td colSpan="2" className="px-4 py-8 text-center text-text-muted">
                    {t('settings.projectGroups.noGroups')}
                  </td>
                </tr>
              )}
              {(sectionProjects.ungrouped || []).length > 0 && (
                <>
                  <tr className="hover:bg-surface-hover transition-colors">
                    <td colSpan="2" className="px-4 py-3 text-text-muted">
                      {t('dashboard.ungrouped')}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan="2" className="px-4 pb-3 pt-0">
                      {renderProjectList('ungrouped')}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
            placeholder={t('settings.projectGroups.addPlaceholder')}
            className="flex-1 bg-background border border-border rounded px-3 py-1.5 text-text text-sm focus:outline-none focus:border-primary"
          />
          <button
            onClick={handleAddGroup}
            className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('settings.projectGroups.add')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
