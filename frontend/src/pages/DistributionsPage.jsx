import React, { useState, useEffect } from 'react';
import { Trash2, Plus, AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { fetchDistributions, addDistribution, deleteDistribution } from '../services/api';

const DistributionsPage = () => {
  const { t } = useTranslation();
  const [distros, setDistros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form state
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newSuffix, setNewSuffix] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadDistros();
  }, []);

  const loadDistros = async () => {
    setLoading(true);
    try {
      const data = await fetchDistributions();
      setDistros(data);
      setError(null);
    } catch (err) {
      setError("Failed to load distributions");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newId || !newName) return;

    setAdding(true);
    try {
      await addDistribution(newId, newName, newSuffix);
      setNewId('');
      setNewName('');
      setNewSuffix('');
      loadDistros();
    } catch (err) {
      setError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(`Are you sure you want to delete ${id}? Projects using this distro may fail.`)) return;

    try {
      await deleteDistribution(id);
      setDistros(distros.filter(d => d.id !== id));
    } catch (err) {
      setError("Failed to delete distribution");
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight mb-2">{t('distributions.title')}</h2>
        <p className="text-text-muted">{t('distributions.description')}</p>
      </div>

      <div className="bg-surface border border-border rounded-xl p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-red-400">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Add New Form */}
          <form onSubmit={handleAdd} className="flex gap-4 items-end bg-background/50 p-4 rounded-lg border border-border">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-muted mb-1">ID (e.g., fedora:44)</label>
              <input
                type="text"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="distro:version"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-muted mb-1">{t('distributions.displayName')}</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Fedora 44"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text focus:border-primary focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-muted mb-1">{t('distributions.suffix')}</label>
              <input
                type="text"
                value={newSuffix}
                onChange={(e) => setNewSuffix(e.target.value)}
                placeholder=".fc44"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-text focus:border-primary focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={adding || !newId || !newName}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {t('distributions.add')}
            </button>
          </form>

          {/* List */}
          {loading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-hover text-text-muted border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-medium">ID</th>
                    <th className="px-4 py-3 font-medium">{t('distributions.name')}</th>
                    <th className="px-4 py-3 font-medium">{t('distributions.suffix')}</th>
                    <th className="px-4 py-3 font-medium text-right">{t('distributions.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {distros.map((distro) => (
                    <tr key={distro.id} className="group hover:bg-surface-hover transition-colors">
                      <td className="px-4 py-3 font-mono">{distro.id}</td>
                      <td className="px-4 py-3">{distro.name}</td>
                      <td className="px-4 py-3 font-mono text-text-muted">{distro.dist_suffix || '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDelete(distro.id)}
                          className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                          title="Remove distribution"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {distros.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-8 text-center text-text-muted">
                        {t('distributions.noDistributions')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DistributionsPage;
