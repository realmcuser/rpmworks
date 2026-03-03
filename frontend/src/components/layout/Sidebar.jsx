import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  FolderGit2,
  Box,
  Server,
  Settings,
  Target,
  Package,
  LogOut
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from 'react-i18next';

const Sidebar = () => {
  const { logout, user } = useAuth();
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng) => {
    i18n.changeLanguage(lng);
  };

  const navItems = [
    { icon: FolderGit2, label: t('sidebar.projects'), path: '/' },
    { icon: Box, label: "Artifacts", path: '/artifacts' },
    { icon: Server, label: t('sidebar.repositories'), path: '/repos' },
    { icon: Target, label: t('sidebar.distributions'), path: '/distributions' },
  ];

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col h-full text-text">
      <div className="p-6 flex items-center gap-3 border-b border-border">
        <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
          <Package className="w-5 h-5 text-white" />
        </div>
        <h1 className="font-bold text-lg tracking-tight">RPM Works</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => clsx(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200",
              "hover:bg-background/50 hover:text-white group",
              isActive 
                ? "bg-primary/10 text-primary font-medium" 
                : "text-text-muted"
            )}
          >
            <item.icon className={clsx("w-5 h-5", "group-hover:scale-110 transition-transform")} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-border space-y-1">
        <div className="flex gap-2 mb-4 px-3">
          <button 
            onClick={() => changeLanguage('en')}
            className={clsx(
              "px-2 py-1 text-xs rounded border transition-colors",
              i18n.language.startsWith('en') 
                ? "bg-primary text-white border-primary" 
                : "text-text-muted border-border hover:border-text-muted"
            )}
          >
            English
          </button>
          <button 
            onClick={() => changeLanguage('sv')}
            className={clsx(
              "px-2 py-1 text-xs rounded border transition-colors",
              i18n.language.startsWith('sv') 
                ? "bg-primary text-white border-primary" 
                : "text-text-muted border-border hover:border-text-muted"
            )}
          >
            Svenska
          </button>
        </div>

        <NavLink 
          to="/settings"
          className={({ isActive }) => clsx(
            "flex items-center gap-3 px-3 py-2.5 w-full rounded-md transition-colors",
            isActive ? "bg-primary/10 text-primary" : "text-text-muted hover:text-white hover:bg-background/50"
          )}
        >
          <Settings className="w-5 h-5" />
          <span>{t('sidebar.settings')}</span>
        </NavLink>
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2.5 w-full text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>{t('sidebar.logout')}{user?.username ? ` (${user.username})` : ''}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
