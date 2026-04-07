import React, { useState } from 'react';
import './App.css';
import ExcelUpload from './components/dataImport/ExcelUpload';
import EditorReportsView from './components/reports/EditorReportsView';
import PlatformReportsView from './components/reports/PlatformReportsView';
import LibraryView from './components/dataImport/LibraryView';
import excelStore from './store/excelStore';

function App() {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'platform-reports' | 'reports' | 'library'
  const excelRows = excelStore((state) => state.excelRows);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-content">
          <h1>📊 TrackingReports</h1>
          <p>Reportes, Librerías y Métricas - Sin Servidor</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        {/* Sidebar Tabs */}
        <nav className="app-sidebar">
          <div className="sidebar-menu">
            <button
              className={`menu-item ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              📥 Cargar Excel
            </button>
            <button
              className={`menu-item ${activeTab === 'platform-reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('platform-reports')}
              disabled={excelRows.length === 0}
            >
              🌐 Reporte Plataformas
            </button>
            <button
              className={`menu-item ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
              disabled={excelRows.length === 0}
            >
              📈 Reporte Editores
            </button>
            <button
              className={`menu-item ${activeTab === 'library' ? 'active' : ''}`}
              onClick={() => setActiveTab('library')}
            >
              📚 Librerías
            </button>
          </div>
        </nav>

        {/* Content Area */}
        <div className="app-content">
          {activeTab === 'upload' && <ExcelUpload onSuccess={() => setActiveTab('platform-reports')} />}
          {activeTab === 'platform-reports' && excelRows.length > 0 && <PlatformReportsView />}
          {activeTab === 'platform-reports' && excelRows.length === 0 && (
            <div className="empty-state">
              <p>⬆️ Carga un archivo Excel primero</p>
            </div>
          )}
          {activeTab === 'reports' && excelRows.length > 0 && <EditorReportsView />}
          {activeTab === 'reports' && excelRows.length === 0 && (
            <div className="empty-state">
              <p>⬆️ Carga un archivo Excel primero</p>
            </div>
          )}
          {activeTab === 'library' && <LibraryView />}
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>TrackingReports v1.0 | Aplicación Standalone | © 2026</p>
      </footer>
    </div>
  );
}

export default App;
