import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getReleaseGroups } from '../services/api';

export default function ReleasesPage() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReleaseGroups()
      .then(setGroups)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-text/60">{t('common.loading', 'Loading...')}</div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-text mb-1">{t('releases.title')}</h1>
      <p className="text-text/60 text-sm mb-6">{t('releases.subtitle')}</p>

      {groups.length === 0 ? (
        <div className="bg-surface rounded-xl border border-border p-8 text-center text-text/50">
          <p className="mb-3">{t('releases.noGroups')}</p>
          <Link to="/settings" className="text-primary hover:underline text-sm">
            {t('releases.goToSettings')}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(g => (
            <Link
              key={g.id}
              to={`/release-groups/${g.id}`}
              className="block bg-surface rounded-xl border border-border p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-text">{g.name}</span>
                  <span className="ml-2 text-xs text-text/40 font-mono">{g.bundle_package_name}</span>
                </div>
                <span className="text-text/40 text-sm">{g.members.length} {t('releases.components')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
