import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Shield, Loader2, AlertCircle, Check, X } from 'lucide-react';
import { fetchUsers, updateUser, fetchAdminSettings, updateAdminSettings, fetchCurrentUser } from '../services/api';

const Settings = () => {
  const { t } = useTranslation();
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState({ allow_registration: true });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

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
        const [usersData, settingsData] = await Promise.all([
          fetchUsers(),
          fetchAdminSettings()
        ]);
        setUsers(usersData);
        setSettings(settingsData);
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
    </div>
  );
};

export default Settings;
