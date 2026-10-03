import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getReleaseGroups,
  getReleases,
  createRelease,
  promoteRelease,
  revertRelease,
  deleteRelease,
} from '../services/api';

function ReleaseCard({ release, onPromote, onRevert, onDelete, isAdmin }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const fmt = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  };

  const handlePromote = async () => {
    if (!window.confirm(t('releases.confirmPromote', { version: `${release.version}-${release.release_str}` }))) return;
    setBusy(true);
    try { await onPromote(release.id); } finally { setBusy(false); }
  };

  const handleRevert = async () => {
    if (!window.confirm(t('releases.confirmRevert', { version: `${release.version}-${release.release_str}` }))) return;
    setBusy(true);
    try { await onRevert(release.id); } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('releases.confirmDelete'))) return;
    setBusy(true);
    try { await onDelete(release.id); } finally { setBusy(false); }
  };

  const evr = `${release.version}-${release.release_str}`;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-text">{evr}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              release.channel === 'stable'
                ? 'bg-green-500/15 text-green-400'
                : 'bg-blue-500/15 text-blue-400'
            }`}>
              {release.channel}
            </span>
          </div>

          <div className="text-xs text-text/50 mt-1">
            {t('releases.created')}: {fmt(release.created_at)}
            {release.created_by_username && <> {t('releases.by')} <span className="text-text/70">{release.created_by_username}</span></>}
            {release.promoted_at && (
              <span className="ml-3">
                {t('releases.promotedAt')}: {fmt(release.promoted_at)}
                {release.promoted_by_username && <> {t('releases.by')} <span className="text-text/70">{release.promoted_by_username}</span></>}
              </span>
            )}
          </div>

          {release.bundle_rpm_filename && (
            <div className="text-xs text-text/40 mt-1 font-mono">
              {t('releases.bundlePackage')}: {release.bundle_rpm_filename}
            </div>
          )}

          <div className="mt-2 space-y-0.5">
            {release.locked_builds.map(rb => (
              <div key={rb.id} className="text-xs text-text/60 font-mono">
                {rb.project_name} <span className="text-text/40">= {rb.rpm_evr}</span>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <div className="flex flex-col gap-1.5 shrink-0">
            {release.channel === 'devel' && (
              <button
                onClick={handlePromote}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-lg border border-green-500/20 transition-colors disabled:opacity-50"
              >
                {busy ? t('releases.promoting') : t('releases.promote')}
              </button>
            )}
            {release.channel === 'stable' && (
              <button
                onClick={handleRevert}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-lg border border-yellow-500/20 transition-colors disabled:opacity-50"
              >
                {busy ? t('releases.reverting') : t('releases.revert')}
              </button>
            )}
            {release.channel === 'devel' && (
              <button
                onClick={handleDelete}
                disabled={busy}
                className="text-xs px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg border border-red-500/20 transition-colors disabled:opacity-50"
              >
                {t('releases.delete')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReleaseGroupPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const [group, setGroup] = useState(null);
  const [releases, setReleases] = useState([]);
  const [channel, setChannel] = useState('devel');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const user = (() => { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } })();
  const isAdmin = user.role === 'admin';

  const loadReleases = useCallback(async () => {
    const data = await getReleases(id, channel);
    setReleases(data);
  }, [id, channel]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getReleaseGroups().then(gs => setGroup(gs.find(g => String(g.id) === String(id)) || null)),
      loadReleases(),
    ]).catch(console.error).finally(() => setLoading(false));
  }, [id, loadReleases]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      await createRelease(id);
      await loadReleases();
      if (channel !== 'devel') setChannel('devel');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handlePromote = async (releaseId) => {
    setError('');
    try {
      await promoteRelease(releaseId);
      await loadReleases();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleRevert = async (releaseId) => {
    setError('');
    try {
      await revertRelease(releaseId);
      await loadReleases();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (releaseId) => {
    setError('');
    try {
      await deleteRelease(releaseId);
      await loadReleases();
    } catch (e) {
      setError(e.message);
    }
  };

  if (loading) return <div className="p-8 text-text/60">Loading...</div>;
  if (!group) return <div className="p-8 text-red-400">Release group not found.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/release-groups" className="text-text/40 hover:text-text text-sm">← {t('releases.title')}</Link>
      </div>
      <h1 className="text-2xl font-bold text-text mb-1">{group.name}</h1>
      <p className="text-text/50 text-sm font-mono mb-6">{group.bundle_package_name}</p>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {['devel', 'stable'].map(ch => (
            <button
              key={ch}
              onClick={() => setChannel(ch)}
              className={`px-4 py-1.5 transition-colors font-mono ${
                channel === ch
                  ? 'bg-primary text-white'
                  : 'bg-surface text-text/60 hover:text-text'
              }`}
            >
              {ch}
            </button>
          ))}
        </div>

        {isAdmin && channel === 'devel' && (
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {creating ? t('releases.creating') : t('releases.createRelease')}
          </button>
        )}
      </div>

      {releases.length === 0 ? (
        <div className="text-center text-text/40 py-12">{t('releases.noReleases')}</div>
      ) : (
        <div className="space-y-3">
          {releases.map(r => (
            <ReleaseCard
              key={r.id}
              release={r}
              onPromote={handlePromote}
              onRevert={handleRevert}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}
