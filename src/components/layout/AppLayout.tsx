import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';
import Topbar from './Topbar.tsx';
import { PlanProvider } from '../../contexts/PlanContext';

const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <PlanProvider>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex">
        {/* Sidebar — always dark navy */}
        <aside className="hidden lg:block w-60 shrink-0" />
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Main content */}
        <div className="flex-1 flex flex-col h-screen min-w-0">
          <Topbar onMenuClick={() => setSidebarOpen(true)} />
          <main className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto relative">
              <div className="max-w-screen-xl mx-auto w-full h-full page-content">
                <Outlet />
              </div>
            </div>
          </main>
        </div>
      </div>
    </PlanProvider>
  );
};

export default AppLayout;

