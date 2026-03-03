import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const Layout = () => {
  return (
    <div className="flex h-screen bg-background text-text overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-8 max-w-7xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
