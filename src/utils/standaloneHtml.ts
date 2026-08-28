/**
 * Generates a completely standalone single-file index.html with pure Vanilla JS and embedded CSS
 * so the user can open it anywhere locally in any browser with zero server setup.
 */

export function generateStandaloneHtml(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>AI Product Photo Studio</title>
  <style>
    :root {
      --bg-dark: #f9fafb;
      --panel-bg: #ffffff;
      --panel-border: #e5e7eb;
      --card-bg: #ffffff;
      --text-main: #1f2937;
      --text-muted: #6b7280;
      --accent: #2563eb;
      --accent-hover: #1d4ed8;
      --purple: #7c3aed;
      --purple-hover: #6d28d9;
      --danger: #ef4444;
      --danger-hover: #dc2626;
      --selection-border: #3b82f6;
      --selection-fill: rgba(59, 130, 246, 0.1);
      --grid-dot: #e5e7eb;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }

    body, html {
      width: 100%;
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-dark);
      color: var(--text-main);
    }

    #app {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
      position: relative;
    }

    /* Top Bar */
    header {
      height: 56px;
      background: var(--panel-bg);
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      z-index: 100;
      flex-shrink: 0;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
      gap: 6px;
    }

    @media (min-width: 640px) {
      header {
        padding: 0 16px;
        gap: 12px;
      }
    }

    .brand-section {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .brand-icon {
      width: 28px;
      height: 28px;
      background: #2563eb;
      color: #ffffff;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      flex-shrink: 0;
    }

    .brand-title {
      font-weight: 700;
      font-size: 15px;
      letter-spacing: -0.3px;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .brand-full { display: inline; }
    .brand-short { display: none; }

    @media (max-width: 600px) {
      .brand-full { display: none; }
      .brand-short { display: inline; }
      .brand-title { font-size: 14px; }
    }

    .btn-hamburger {
      display: none;
      background: transparent;
      border: 1px solid #e5e7eb;
      padding: 5px 7px;
      font-size: 14px;
      border-radius: 6px;
      cursor: pointer;
    }

    @media (max-width: 768px) {
      .btn-hamburger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
    }

    .top-actions {
      display: flex;
      align-items: center;
      gap: 5px;
      flex-shrink: 0;
    }

    button {
      background: #ffffff;
      border: 1px solid #d1d5db;
      color: var(--text-main);
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: all 0.15s ease;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
      white-space: nowrap;
    }

    button:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }

    button.primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    button.purple {
      background: var(--purple);
      border-color: var(--purple);
      color: #ffffff;
    }

    button.purple:hover {
      background: var(--purple-hover);
      border-color: var(--purple-hover);
    }

    button.danger {
      color: var(--danger);
      border-color: #fecaca;
      background: #ffffff;
    }

    button.danger:hover {
      background: #fee2e2;
      border-color: #fca5a5;
    }

    button.amber {
      background: #fffbeb;
      border-color: #fcd34d;
      color: #b45309;
    }

    button.amber:hover {
      background: #fef3c7;
      border-color: #f59e0b;
    }

    .storage-warning-banner {
      display: none;
      background: #f59e0b;
      color: #ffffff;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 500;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      z-index: 100;
    }

    .storage-warning-banner.active {
      display: flex;
    }

    /* Responsive buttons on mobile (<600px): hide text labels */
    @media (max-width: 600px) {
      .btn-text {
        display: none;
      }
      button {
        padding: 6px 8px;
      }
    }

    /* Workspace */
    .workspace {
      display: flex;
      flex: 1;
      height: calc(100vh - 56px);
      position: relative;
      overflow: hidden;
    }

    /* Sidebar Drawer */
    .sidebar-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(2px);
      z-index: 150;
    }

    aside {
      width: 240px;
      background: var(--panel-bg);
      border-right: 1px solid var(--panel-border);
      display: flex;
      flex-direction: column;
      z-index: 20;
      flex-shrink: 0;
      transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    @media (max-width: 768px) {
      aside {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 270px;
        z-index: 200;
        transform: translateX(-100%);
        box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
      }
      aside.open {
        transform: translateX(0);
      }
      .sidebar-backdrop.open {
        display: block;
      }
    }

    .sidebar-header {
      padding: 12px 14px;
      border-bottom: 1px solid var(--panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .sidebar-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }

    .btn-new-project {
      padding: 4px 8px;
      font-size: 11px;
      background: #eff6ff;
      color: var(--accent);
      border: 1px solid #bfdbfe;
      border-radius: 4px;
    }

    .btn-new-project:hover {
      background: #dbeafe;
    }

    .btn-close-sidebar {
      display: none;
      background: transparent;
      border: none;
      box-shadow: none;
      padding: 4px;
      font-size: 14px;
      color: var(--text-muted);
    }

    @media (max-width: 768px) {
      .btn-close-sidebar {
        display: inline-flex;
      }
    }

    .projects-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .project-item {
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 13px;
      color: var(--text-main);
      border: 1px solid transparent;
      transition: background 0.1s ease;
    }

    .project-item:hover {
      background: #f3f4f6;
    }

    .project-item.active {
      background: #eff6ff;
      border-color: #bfdbfe;
      color: var(--accent);
      font-weight: 600;
    }

    .project-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
    }

    .btn-del-project {
      opacity: 0;
      background: transparent;
      border: none;
      box-shadow: none;
      color: var(--text-muted);
      padding: 2px 4px;
      font-size: 11px;
    }

    .project-item:hover .btn-del-project {
      opacity: 1;
    }

    @media (max-width: 768px) {
      .btn-del-project {
        opacity: 1;
      }
    }

    .btn-del-project:hover {
      color: var(--danger);
      background: transparent;
    }

    .sidebar-footer {
      padding: 10px 14px;
      border-top: 1px solid var(--panel-border);
      font-size: 11px;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    /* Infinite Canvas */
    #canvas-container {
      flex: 1;
      height: 100%;
      background-color: var(--bg-dark);
      background-image: radial-gradient(var(--grid-dot) 1.5px, transparent 1.5px);
      background-size: 24px 24px;
      position: relative;
      overflow: hidden;
      cursor: default;
      touch-action: none;
    }

    #canvas-container.panning {
      cursor: grab !important;
    }

    #canvas-world {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      transform-origin: 0 0;
      will-change: transform;
    }

    /* Cards */
    .canvas-card {
      position: absolute;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -1px rgba(0, 0, 0, 0.04);
      cursor: move;
      transition: box-shadow 0.15s ease, border-color 0.15s ease;
      padding: 6px;
      touch-action: none;
      max-width: 350px;
    }

    @media (max-width: 640px) {
      .canvas-card {
        max-width: 250px;
      }
    }

    .canvas-card:hover {
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.12);
      border-color: #cbd5e1;
    }

    .canvas-card.selected {
      border-color: var(--selection-border) !important;
      box-shadow: 0 0 0 3px var(--selection-fill), 0 10px 15px -3px rgba(0, 0, 0, 0.12) !important;
    }

    .canvas-card img {
      display: block;
      width: 100%;
      height: auto;
      max-width: 350px;
      pointer-events: none;
      background: #f3f4f6;
      border-radius: 4px;
    }

    @media (max-width: 640px) {
      .canvas-card img {
        max-width: 250px;
      }
    }

    .card-header-overlay {
      position: absolute;
      top: -10px;
      right: -10px;
      display: flex;
      gap: 4px;
      opacity: 0;
      transition: opacity 0.15s ease;
      z-index: 10;
    }

    .canvas-card:hover .card-header-overlay {
      opacity: 1;
    }

    @media (max-width: 768px) {
      .card-header-overlay {
        opacity: 1;
      }
    }

    .btn-card-del {
      width: 22px;
      height: 22px;
      background: var(--danger);
      border: none;
      border-radius: 50%;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 11px;
      line-height: 1;
      padding: 0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .btn-card-del:hover {
      background: var(--danger-hover);
    }

    /* Selection Rectangle */
    #selection-box {
      position: absolute;
      border: 2px solid rgba(37, 99, 235, 0.4);
      background-color: rgba(37, 99, 235, 0.08);
      pointer-events: none;
      display: none;
      z-index: 1000;
      border-radius: 4px;
    }

    /* Drop Overlay Hint */
    #drop-hint {
      position: absolute;
      inset: 16px;
      border: 2px dashed rgba(37, 99, 235, 0.5);
      background: rgba(37, 99, 235, 0.05);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s ease;
      z-index: 500;
    }

    #drop-hint.active {
      opacity: 1;
    }

    /* Floating Zoom Controls */
    .zoom-toolbar {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      display: flex;
      align-items: center;
      padding: 3px;
      gap: 2px;
      box-shadow: 0 8px 15px -3px rgba(0, 0, 0, 0.1);
      z-index: 80;
    }

    .zoom-toolbar button {
      padding: 5px 8px;
      font-size: 12px;
      background: transparent;
      border: none;
      box-shadow: none;
      color: #4b5563;
      border-radius: 4px;
    }

    .zoom-toolbar button:hover {
      background: #f3f4f6;
      color: #111827;
    }

    .zoom-level {
      font-size: 11px;
      font-weight: 600;
      min-width: 44px;
      text-align: center;
      color: #374151;
      font-family: monospace;
    }

    /* Status Bar / Hints */
    .canvas-hint {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(255, 255, 255, 0.92);
      backdrop-filter: blur(8px);
      border: 1px solid #e5e7eb;
      border-radius: 9999px;
      padding: 5px 14px;
      font-size: 11px;
      color: #6b7280;
      pointer-events: none;
      z-index: 80;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    @media (max-width: 768px) {
      .canvas-hint {
        display: none;
      }
    }

    /* Generation Panel */
    #generation-panel {
      position: fixed;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
      z-index: 400;
      display: none;
      flex-direction: column;
      overflow: hidden;
      /* Desktop defaults */
      width: 400px;
      max-width: 95vw;
      bottom: 24px;
      left: calc(50% - 200px);
    }

    #generation-panel.active {
      display: flex;
    }

    /* Mobile bottom sheet style (<640px) */
    @media (max-width: 640px) {
      #generation-panel {
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        top: auto !important;
        width: 100vw !important;
        max-width: 100vw !important;
        max-height: 58vh;
        border-radius: 16px 16px 0 0;
        border-bottom: none;
      }
    }

    .gen-panel-header {
      padding: 10px 14px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
      cursor: move;
      flex-shrink: 0;
    }

    @media (max-width: 640px) {
      .gen-panel-header {
        cursor: default;
      }
    }

    .gen-panel-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: #111827;
    }

    .gen-panel-body {
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      user-select: auto;
      -webkit-user-select: auto;
    }

    .gen-thumbs-row {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      padding: 6px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      min-height: 48px;
    }

    .gen-thumb {
      width: 40px;
      height: 40px;
      border-radius: 6px;
      border: 1px solid #d1d5db;
      overflow: hidden;
      flex-shrink: 0;
      background: #fff;
    }

    .gen-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .gen-thumbs-empty {
      font-size: 11px;
      color: #9ca3af;
      padding: 4px;
    }

    .gen-textarea {
      width: 100%;
      min-height: 56px;
      max-height: 120px;
      padding: 8px 10px;
      font-size: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      outline: none;
      font-family: inherit;
      resize: none;
      color: #111827;
      background: #f9fafb;
      line-height: 1.4;
      user-select: text;
      -webkit-user-select: text;
      overflow-y: auto;
    }

    .gen-textarea:focus {
      background: #ffffff;
      border-color: var(--purple);
    }

    .gen-panel-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 2px;
      gap: 8px;
    }

    .gen-error-banner {
      padding: 8px 10px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 6px;
      color: #b91c1c;
      font-size: 11px;
      display: none;
      line-height: 1.3;
    }

    .gen-error-banner.active {
      display: block;
    }

    /* Modal dialog */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(2px);
      z-index: 1000;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 16px;
    }

    .modal-backdrop.active {
      display: flex;
    }

    .modal-dialog {
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
      padding: 18px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .modal-title {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 600;
      color: #374151;
    }

    .form-group input {
      padding: 8px 10px;
      font-size: 12px;
      font-family: monospace;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      outline: none;
      background: #f9fafb;
      color: #111827;
      user-select: text;
      -webkit-user-select: text;
    }

    .form-group input:focus {
      border-color: var(--accent);
      background: #ffffff;
    }

    .form-group p {
      font-size: 11px;
      color: #6b7280;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div id="app">
    <!-- Storage Warning Banner -->
    <div id="storage-warning-banner" class="storage-warning-banner">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>⚠️ Память почти заполнена (>80%). Нажмите «Оптимизировать память»</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button id="btn-banner-optimize" style="background:#fff; color:#b45309; border:none; padding:3px 8px; font-weight:600; font-size:11px; border-radius:4px; cursor:pointer;">Оптимизировать память</button>
        <button id="btn-banner-close" style="background:transparent; color:#fff; border:none; box-shadow:none; cursor:pointer; font-size:12px;">✕</button>
      </div>
    </div>

    <!-- Top Bar -->
    <header>
      <div class="brand-section">
        <button id="btn-toggle-menu" class="btn-hamburger" title="Открыть список проектов">
          ☰
        </button>
        <div class="brand-icon">📸</div>
        <span class="brand-title">
          <span class="brand-full">AI Product Photo Studio</span>
          <span class="brand-short">Photo Studio</span>
        </span>
      </div>

      <div class="top-actions">
        <button id="btn-upload-file" title="Загрузить фото с устройства">
          <span>➕</span>
          <span class="btn-text">Фото</span>
        </button>
        <button id="btn-toggle-gen" class="purple" title="Открыть панель AI генерации (G)">
          <span>✨</span>
          <span class="btn-text">AI (G)</span>
        </button>
        <button id="btn-optimize-memory" class="amber" title="Сжать все фото до 500px">
          <span>⚡</span>
          <span class="btn-text">Оптимизировать</span>
        </button>
        <button id="btn-clear-memory" class="danger" title="Очистить память (сохраняя API-ключ)">
          <span>🧹</span>
          <span class="btn-text">Очистить память</span>
        </button>
        <button id="btn-open-settings" title="Настройки API Gemini">
          <span>⚙️</span>
          <span class="btn-text">Настройки</span>
        </button>
        <button id="btn-export" title="Скачать проект в JSON">
          <span>💾</span>
          <span class="btn-text">JSON</span>
        </button>
        <button id="btn-import" class="primary" title="Загрузить проект из JSON">
          <span>📂</span>
          <span class="btn-text">Импорт</span>
        </button>
        <button id="btn-clear" class="danger" title="Очистить все карточки на холсте">
          <span>🗑️</span>
        </button>
      </div>
    </header>

    <!-- Main Workspace -->
    <div class="workspace">
      <!-- Mobile Drawer Backdrop -->
      <div id="sidebar-backdrop" class="sidebar-backdrop"></div>

      <!-- Left Sidebar -->
      <aside id="sidebar-panel">
        <div class="sidebar-header">
          <span class="sidebar-title">Проекты</span>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button id="btn-new-proj" class="btn-new-project">+ Проект</button>
            <button id="btn-close-sidebar" class="btn-close-sidebar">✕</button>
          </div>
        </div>
        <div id="projects-list" class="projects-list"></div>
        <div class="sidebar-footer">
          <div id="storage-status">Хранилище: 0%</div>
          <div>Перетащите фото на канвас</div>
        </div>
      </aside>

      <!-- Infinite Canvas -->
      <div id="canvas-container">
        <div id="canvas-world"></div>
        <div id="selection-box"></div>
        
        <div id="drop-hint">
          <div style="font-size: 32px;">📥</div>
          <div style="font-size: 15px; font-weight: 600; color: #2563eb;">Отпустите фото здесь</div>
        </div>

        <div class="canvas-hint">
          Пробел + ЛКМ / СКМ: Панорамирование • Ctrl + Колесо: Зум • Shift + Клик / Рамка: Выделение • G: AI • Del: Удалить
        </div>

        <!-- Floating Zoom Controls -->
        <div class="zoom-toolbar">
          <button id="btn-zoom-out" title="Уменьшить">−</button>
          <span id="zoom-level-text" class="zoom-level">100%</span>
          <button id="btn-zoom-in" title="Увеличить">+</button>
          <button id="btn-zoom-reset" title="Сбросить масштаб" style="font-size: 11px;">1:1</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Floating Draggable / Mobile Bottom Sheet Generation Panel -->
  <div id="generation-panel">
    <div class="gen-panel-header" id="gen-panel-header">
      <div class="gen-panel-title">
        <span>✨</span>
        <span>AI Генерация фото</span>
      </div>
      <button id="btn-close-gen" style="padding: 2px 6px; font-size: 12px;">✕</button>
    </div>
    <div class="gen-panel-body">
      <div id="gen-error-banner" class="gen-error-banner"></div>
      
      <div>
        <div style="font-size: 11px; font-weight: 600; color: #4b5563; margin-bottom: 3px;">
          Выбранные референсы (до 5):
        </div>
        <div class="gen-thumbs-row" id="gen-thumbs-container">
          <span class="gen-thumbs-empty">Кликните по карточкам на канвасе</span>
        </div>
      </div>

      <div class="form-group">
        <label for="gen-prompt-input">Описание сцены (промпт):</label>
        <textarea
          id="gen-prompt-input"
          class="gen-textarea"
          placeholder="Опишите желаемую сцену, фон, композицию или свет..."
        ></textarea>
      </div>

      <div class="gen-panel-footer">
        <span style="font-size: 10px; color: #6b7280;">Клавиша: <b>G</b></span>
        <button id="btn-do-generate" class="purple" style="font-weight: 600; padding: 6px 14px;">
          <span id="btn-do-generate-text">Сгенерировать</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Settings Modal -->
  <div id="modal-settings" class="modal-backdrop">
    <div class="modal-dialog">
      <div class="modal-title">
        <span>⚙️ Настройки Google Gemini API</span>
        <button id="btn-close-settings" style="padding: 2px 6px; font-size: 12px;">✕</button>
      </div>
      <div class="form-group">
        <label for="input-api-key">API Key (Gemini / Imagen)</label>
        <input type="password" id="input-api-key" placeholder="AIzaSy...">
        <p>
          Ключ сохраняется локально в вашем браузере (localStorage: <code>aips_api_key</code>).
          Генератор в приоритете использует <b>gemini-2.0-flash-exp</b>, с автоматическим fallback на <b>imagen-3.0-generate-002</b>.
        </p>
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button id="btn-cancel-settings">Отмена</button>
        <button id="btn-save-settings" class="primary">Сохранить</button>
      </div>
    </div>
  </div>

  <input type="file" id="hidden-file-input" accept="image/*" multiple style="display: none;">
  <input type="file" id="hidden-json-input" accept=".json" style="display: none;">

  <script>
    (function () {
      const STORAGE_KEY = 'aips_projects';
      const ACTIVE_KEY = 'aips_active_project_id';
      const API_KEY_KEY = 'aips_api_key';

      let state = {
        projects: [],
        currentProjectId: null,
        pan: { x: 60, y: 60 },
        zoom: 1,
        selectedCardIds: new Set(),
        isPanning: false,
        isSelecting: false,
        isDraggingCards: false,
        isSpaceDown: false,
        isGenerating: false,
        lastMouse: { x: 0, y: 0 },
        selectionStart: { x: 0, y: 0 },
        dragCardStartPositions: new Map(),
      };

      const container = document.getElementById('canvas-container');
      const world = document.getElementById('canvas-world');
      const selectionBox = document.getElementById('selection-box');
      const dropHint = document.getElementById('drop-hint');
      const projectsListEl = document.getElementById('projects-list');
      const zoomText = document.getElementById('zoom-level-text');
      const storageStatusEl = document.getElementById('storage-status');
      const sidebarPanel = document.getElementById('sidebar-panel');
      const sidebarBackdrop = document.getElementById('sidebar-backdrop');

      // Modals and Generation Panel elements
      const genPanel = document.getElementById('generation-panel');
      const genPanelHeader = document.getElementById('gen-panel-header');
      const genThumbsContainer = document.getElementById('gen-thumbs-container');
      const genPromptInput = document.getElementById('gen-prompt-input');
      const btnDoGenerate = document.getElementById('btn-do-generate');
      const btnDoGenerateText = document.getElementById('btn-do-generate-text');
      const genErrorBanner = document.getElementById('gen-error-banner');
      const settingsModal = document.getElementById('modal-settings');
      const inputApiKey = document.getElementById('input-api-key');

      // Auto-growing textarea
      genPromptInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(120, Math.max(56, this.scrollHeight)) + 'px';
      });

      // Mobile Sidebar toggle
      function openSidebar() {
        sidebarPanel.classList.add('open');
        sidebarBackdrop.classList.add('open');
      }

      function closeSidebar() {
        sidebarPanel.classList.remove('open');
        sidebarBackdrop.classList.remove('open');
      }

      document.getElementById('btn-toggle-menu').onclick = openSidebar;
      document.getElementById('btn-close-sidebar').onclick = closeSidebar;
      sidebarBackdrop.onclick = closeSidebar;

      // Helper: get current project
      function getCurrentProject() {
        return state.projects.find(p => p.id === state.currentProjectId) || null;
      }

      function createDefaultProjects() {
        return [{
          id: 'proj_' + Date.now(),
          name: 'Проект 1 — Студия',
          cards: [],
          pan: { x: 60, y: 60 },
          zoom: 1
        }];
      }

      // Load & Save
      function loadData() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            state.projects = JSON.parse(raw);
          }
        } catch (e) {
          console.error(e);
        }
        if (!state.projects || state.projects.length === 0) {
          state.projects = createDefaultProjects();
        }
        const activeId = localStorage.getItem(ACTIVE_KEY);
        if (activeId && state.projects.some(p => p.id === activeId)) {
          state.currentProjectId = activeId;
        } else {
          state.currentProjectId = state.projects[0].id;
        }
        const curr = getCurrentProject();
        if (curr) {
          state.pan = curr.pan || { x: 60, y: 60 };
          state.zoom = curr.zoom || 1;
        }
      }

      function saveData() {
        const curr = getCurrentProject();
        if (curr) {
          curr.pan = { ...state.pan };
          curr.zoom = state.zoom;
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state.projects));
          localStorage.setItem(ACTIVE_KEY, state.currentProjectId);
          updateStorageStatus();
        } catch (e) {
          alert('Внимание: превышен лимит localStorage! Рекомендуется скачать проект и удалить старые изображения.');
        }
      }

      function updateStorageStatus() {
        try {
          let total = 0;
          for (let k in localStorage) {
            if (localStorage.hasOwnProperty(k)) total += (localStorage[k].length * 2);
          }
          const pct = Math.min(100, Math.round((total / (5 * 1024 * 1024)) * 100));
          storageStatusEl.textContent = 'Хранилище: ' + pct + '% (' + (total / (1024 * 1024)).toFixed(1) + ' МБ)';
          
          const banner = document.getElementById('storage-warning-banner');
          if (banner) {
            if (pct >= 80) {
              banner.classList.add('active');
            } else {
              banner.classList.remove('active');
            }
          }
        } catch(e){}
      }

      // Render Projects Sidebar
      function renderProjects() {
        projectsListEl.innerHTML = '';
        state.projects.forEach(p => {
          const item = document.createElement('div');
          item.className = 'project-item' + (p.id === state.currentProjectId ? ' active' : '');
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'project-name';
          nameSpan.textContent = p.name + ' (' + (p.cards ? p.cards.length : 0) + ')';
          
          const delBtn = document.createElement('button');
          delBtn.className = 'btn-del-project';
          delBtn.innerHTML = '✕';
          delBtn.title = 'Удалить проект';
          delBtn.onclick = (e) => {
            e.stopPropagation();
            if (state.projects.length <= 1) {
              alert('Нельзя удалить единственный проект');
              return;
            }
            if (confirm('Удалить проект "' + p.name + '"?')) {
              state.projects = state.projects.filter(proj => proj.id !== p.id);
              if (state.currentProjectId === p.id) {
                state.currentProjectId = state.projects[0].id;
                const newCurr = getCurrentProject();
                state.pan = newCurr.pan || { x: 60, y: 60 };
                state.zoom = newCurr.zoom || 1;
              }
              state.selectedCardIds.clear();
              saveData();
              renderProjects();
              renderCanvas();
              updateGenerationThumbs();
            }
          };

          item.onclick = () => {
            if (state.currentProjectId !== p.id) {
              state.currentProjectId = p.id;
              state.selectedCardIds.clear();
              state.pan = p.pan || { x: 60, y: 60 };
              state.zoom = p.zoom || 1;
              saveData();
              renderProjects();
              renderCanvas();
              updateGenerationThumbs();
              if (window.innerWidth <= 768) closeSidebar();
            }
          };

          item.appendChild(nameSpan);
          item.appendChild(delBtn);
          projectsListEl.appendChild(item);
        });
        updateStorageStatus();
      }

      // Transform update
      function updateWorldTransform() {
        world.style.transform = 'translate(' + state.pan.x + 'px, ' + state.pan.y + 'px) scale(' + state.zoom + ')';
        container.style.backgroundPosition = state.pan.x + 'px ' + state.pan.y + 'px';
        container.style.backgroundSize = (24 * state.zoom) + 'px ' + (24 * state.zoom) + 'px';
        zoomText.textContent = Math.round(state.zoom * 100) + '%';
      }

      // Screen to Canvas coordinate conversion
      function screenToCanvas(screenX, screenY) {
        const rect = container.getBoundingClientRect();
        return {
          x: (screenX - rect.left - state.pan.x) / state.zoom,
          y: (screenY - rect.top - state.pan.y) / state.zoom
        };
      }

      // Render Cards
      function renderCanvas() {
        const curr = getCurrentProject();
        world.innerHTML = '';
        if (!curr || !curr.cards) return;

        const isMobile = window.innerWidth <= 640;
        const maxCardWidth = isMobile ? 250 : 350;

        curr.cards.forEach(card => {
          const cardEl = document.createElement('div');
          cardEl.className = 'canvas-card' + (state.selectedCardIds.has(card.id) ? ' selected' : '');
          cardEl.id = 'card-' + card.id;
          cardEl.style.left = card.x + 'px';
          cardEl.style.top = card.y + 'px';
          
          const effectiveWidth = Math.min(maxCardWidth, card.width || 260);
          cardEl.style.width = effectiveWidth + 'px';

          const img = document.createElement('img');
          img.src = card.src;
          img.alt = 'Product reference';
          img.loading = 'lazy';

          const overlay = document.createElement('div');
          overlay.className = 'card-header-overlay';

          const delBtn = document.createElement('button');
          delBtn.className = 'btn-card-del';
          delBtn.innerHTML = '✕';
          delBtn.title = 'Удалить';
          delBtn.onclick = (e) => {
            e.stopPropagation();
            curr.cards = curr.cards.filter(c => c.id !== card.id);
            state.selectedCardIds.delete(card.id);
            saveData();
            renderProjects();
            renderCanvas();
            updateGenerationThumbs();
          };

          overlay.appendChild(delBtn);
          cardEl.appendChild(overlay);
          cardEl.appendChild(img);

          // Card Drag & Select Events
          cardEl.addEventListener('pointerdown', (e) => {
            if (e.button !== 0 && e.pointerType === 'mouse' && state.isSpaceDown) return;
            e.stopPropagation();

            if (e.shiftKey) {
              if (state.selectedCardIds.has(card.id)) {
                state.selectedCardIds.delete(card.id);
              } else {
                state.selectedCardIds.add(card.id);
              }
            } else {
              if (!state.selectedCardIds.has(card.id)) {
                state.selectedCardIds.clear();
                state.selectedCardIds.add(card.id);
              }
            }

            renderCardSelectionClasses();
            updateGenerationThumbs();

            state.isDraggingCards = true;
            state.lastMouse = { x: e.clientX, y: e.clientY };
            state.dragCardStartPositions.clear();

            curr.cards.forEach(c => {
              if (state.selectedCardIds.has(c.id)) {
                state.dragCardStartPositions.set(c.id, { x: c.x, y: c.y });
              }
            });
          });

          world.appendChild(cardEl);
        });

        updateWorldTransform();
      }

      function renderCardSelectionClasses() {
        const curr = getCurrentProject();
        if (!curr || !curr.cards) return;
        curr.cards.forEach(card => {
          const el = document.getElementById('card-' + card.id);
          if (el) {
            if (state.selectedCardIds.has(card.id)) {
              el.classList.add('selected');
            } else {
              el.classList.remove('selected');
            }
          }
        });
      }

      function updateGenerationThumbs() {
        const curr = getCurrentProject();
        if (!curr || !curr.cards) return;
        const selected = curr.cards.filter(c => state.selectedCardIds.has(c.id));
        genThumbsContainer.innerHTML = '';
        if (selected.length === 0) {
          genThumbsContainer.innerHTML = '<span class="gen-thumbs-empty">Кликните по карточкам на канвасе</span>';
          return;
        }
        selected.slice(0, 5).forEach(card => {
          const div = document.createElement('div');
          div.className = 'gen-thumb';
          const img = document.createElement('img');
          img.src = card.src;
          div.appendChild(img);
          genThumbsContainer.appendChild(div);
        });
        if (selected.length > 5) {
          const more = document.createElement('div');
          more.style.fontSize = '11px';
          more.style.color = '#6b7280';
          more.textContent = '+' + (selected.length - 5);
          genThumbsContainer.appendChild(more);
        }
      }

      // Image Compression & Loading
      function processAndAddImage(file, worldX, worldY) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              let w = img.naturalWidth || img.width;
              let h = img.naturalHeight || img.height;
              const maxDim = 800;
              if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
              }

              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, w, h);
              const compressedSrc = canvas.toDataURL('image/jpeg', 0.85);

              const isMobile = window.innerWidth <= 640;
              const maxDisplay = isMobile ? 240 : 300;
              const displayWidth = Math.min(maxDisplay, w);
              const displayHeight = Math.round(displayWidth * (h / w));

              const curr = getCurrentProject();
              if (curr) {
                const newCard = {
                  id: 'c_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                  x: worldX,
                  y: worldY,
                  width: displayWidth,
                  height: displayHeight,
                  src: compressedSrc
                };
                if (!curr.cards) curr.cards = [];
                curr.cards.push(newCard);
                state.selectedCardIds.clear();
                state.selectedCardIds.add(newCard.id);
                saveData();
                renderProjects();
                renderCanvas();
                updateGenerationThumbs();
              }
              resolve();
            };
            img.src = e.target.result;
          };
          reader.readAsDataURL(file);
        });
      }

      // Drag and drop onto Canvas
      container.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropHint.classList.add('active');
      });

      container.addEventListener('dragleave', (e) => {
        if (!container.contains(e.relatedTarget)) {
          dropHint.classList.remove('active');
        }
      });

      container.addEventListener('drop', async (e) => {
        e.preventDefault();
        dropHint.classList.remove('active');

        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;

        const basePos = screenToCanvas(e.clientX, e.clientY);
        let offset = 0;

        for (const file of files) {
          await processAndAddImage(file, basePos.x + offset, basePos.y + offset);
          offset += 35;
        }
      });

      // Canvas Mouse & Interaction Events
      window.addEventListener('keydown', (e) => {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') {
          return;
        }

        if (e.code === 'Space' && !state.isSpaceDown) {
          state.isSpaceDown = true;
          container.style.cursor = 'grab';
        }

        if (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П') {
          e.preventDefault();
          toggleGenerationPanel();
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (state.selectedCardIds.size > 0) {
            const curr = getCurrentProject();
            if (curr && curr.cards) {
              curr.cards = curr.cards.filter(c => !state.selectedCardIds.has(c.id));
              state.selectedCardIds.clear();
              saveData();
              renderProjects();
              renderCanvas();
              updateGenerationThumbs();
            }
          }
        }
      });

      window.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          state.isSpaceDown = false;
          container.style.cursor = 'default';
        }
      });

      container.addEventListener('pointerdown', (e) => {
        // Middle mouse or Space + Left click or Touch dragging empty canvas = Pan
        if (e.button === 1 || (e.button === 0 && state.isSpaceDown) || e.pointerType === 'touch') {
          state.isPanning = true;
          state.lastMouse = { x: e.clientX, y: e.clientY };
          container.classList.add('panning');
          return;
        }

        // Left click on empty canvas = Marquee selection
        if (e.button === 0) {
          state.isSelecting = true;
          state.selectionStart = { x: e.clientX, y: e.clientY };
          state.lastMouse = { x: e.clientX, y: e.clientY };

          if (!e.shiftKey) {
            state.selectedCardIds.clear();
            renderCardSelectionClasses();
            updateGenerationThumbs();
          }

          selectionBox.style.display = 'block';
          selectionBox.style.left = e.clientX + 'px';
          selectionBox.style.top = e.clientY + 'px';
          selectionBox.style.width = '0px';
          selectionBox.style.height = '0px';
        }
      });

      window.addEventListener('pointermove', (e) => {
        const dx = e.clientX - state.lastMouse.x;
        const dy = e.clientY - state.lastMouse.y;

        // Panning
        if (state.isPanning) {
          state.pan.x += dx;
          state.pan.y += dy;
          updateWorldTransform();
          state.lastMouse = { x: e.clientX, y: e.clientY };
          return;
        }

        // Dragging selected cards
        if (state.isDraggingCards) {
          const worldDx = dx / state.zoom;
          const worldDy = dy / state.zoom;
          const curr = getCurrentProject();
          if (curr && curr.cards) {
            curr.cards.forEach(c => {
              if (state.selectedCardIds.has(c.id)) {
                c.x += worldDx;
                c.y += worldDy;
                const el = document.getElementById('card-' + c.id);
                if (el) {
                  el.style.left = c.x + 'px';
                  el.style.top = c.y + 'px';
                }
              }
            });
          }
          state.lastMouse = { x: e.clientX, y: e.clientY };
          return;
        }

        // Marquee Selection Box
        if (state.isSelecting) {
          const rect = container.getBoundingClientRect();
          const curX = Math.max(rect.left, Math.min(e.clientX, rect.right));
          const curY = Math.max(rect.top, Math.min(e.clientY, rect.bottom));

          const x = Math.min(state.selectionStart.x, curX);
          const y = Math.min(state.selectionStart.y, curY);
          const w = Math.abs(curX - state.selectionStart.x);
          const h = Math.abs(curY - state.selectionStart.y);

          selectionBox.style.left = (x - rect.left) + 'px';
          selectionBox.style.top = (y - rect.top) + 'px';
          selectionBox.style.width = w + 'px';
          selectionBox.style.height = h + 'px';

          const startCanvas = screenToCanvas(x, y);
          const endCanvas = screenToCanvas(x + w, y + h);

          const boxMinX = Math.min(startCanvas.x, endCanvas.x);
          const boxMaxX = Math.max(startCanvas.x, endCanvas.x);
          const boxMinY = Math.min(startCanvas.y, endCanvas.y);
          const boxMaxY = Math.max(startCanvas.y, endCanvas.y);

          const curr = getCurrentProject();
          if (curr && curr.cards) {
            curr.cards.forEach(c => {
              const cardRight = c.x + c.width;
              const cardBottom = c.y + (c.height || 300);
              const intersects = !(c.x > boxMaxX || cardRight < boxMinX || c.y > boxMaxY || cardBottom < boxMinY);

              if (intersects) {
                state.selectedCardIds.add(c.id);
              } else if (!e.shiftKey) {
                state.selectedCardIds.delete(c.id);
              }
            });
            renderCardSelectionClasses();
            updateGenerationThumbs();
          }
        }
      });

      window.addEventListener('pointerup', () => {
        if (state.isPanning) {
          state.isPanning = false;
          container.classList.remove('panning');
          saveData();
        }
        if (state.isDraggingCards) {
          state.isDraggingCards = false;
          saveData();
        }
        if (state.isSelecting) {
          state.isSelecting = false;
          selectionBox.style.display = 'none';
        }
      });

      // Window Resize Listener to adapt smoothly
      window.addEventListener('resize', () => {
        updateWorldTransform();
      });

      // Zoom (Wheel)
      container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
        const newZoom = Math.min(4, Math.max(0.15, state.zoom * zoomFactor));

        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        state.pan.x = mouseX - (mouseX - state.pan.x) * (newZoom / state.zoom);
        state.pan.y = mouseY - (mouseY - state.pan.y) * (newZoom / state.zoom);
        state.zoom = newZoom;

        updateWorldTransform();
        saveData();
      }, { passive: false });

      // Buttons wiring
      document.getElementById('btn-zoom-in').onclick = () => {
        state.zoom = Math.min(4, state.zoom * 1.25);
        updateWorldTransform();
        saveData();
      };

      document.getElementById('btn-zoom-out').onclick = () => {
        state.zoom = Math.max(0.15, state.zoom / 1.25);
        updateWorldTransform();
        saveData();
      };

      document.getElementById('btn-zoom-reset').onclick = () => {
        state.zoom = 1;
        state.pan = { x: 60, y: 60 };
        updateWorldTransform();
        saveData();
      };

      document.getElementById('btn-new-proj').onclick = () => {
        const name = prompt('Введите название нового проекта:', 'Проект ' + (state.projects.length + 1));
        if (name && name.trim()) {
          const newProj = {
            id: 'proj_' + Date.now(),
            name: name.trim(),
            cards: [],
            pan: { x: 60, y: 60 },
            zoom: 1
          };
          state.projects.push(newProj);
          state.currentProjectId = newProj.id;
          state.selectedCardIds.clear();
          state.pan = { x: 60, y: 60 };
          state.zoom = 1;
          saveData();
          renderProjects();
          renderCanvas();
          updateGenerationThumbs();
        }
      };

      // Memory Management: Clear & Optimize
      function compressImageBase64(dataUrl, maxDim = 500, quality = 0.7) {
        return new Promise((resolve) => {
          if (!dataUrl || !dataUrl.startsWith('data:image/')) return resolve(dataUrl);
          if (dataUrl.startsWith('data:image/svg+xml')) return resolve(dataUrl);
          const img = new Image();
          img.onload = () => {
            let w = img.naturalWidth || img.width;
            let h = img.naturalHeight || img.height;
            if (!w || !h) return resolve(dataUrl);
            if (w > maxDim || h > maxDim) {
              const ratio = Math.min(maxDim / w, maxDim / h);
              w = Math.round(w * ratio);
              h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(dataUrl);
            ctx.drawImage(img, 0, 0, w, h);
            const optimized = canvas.toDataURL('image/jpeg', quality);
            resolve(optimized.length < dataUrl.length ? optimized : dataUrl);
          };
          img.onerror = () => resolve(dataUrl);
          img.src = dataUrl;
        });
      }

      async function runOptimizeMemory() {
        const btn = document.getElementById('btn-optimize-memory');
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = '<span>⏳</span><span class="btn-text">Сжатие...</span>';
        }

        let totalBefore = 0;
        for (let k in localStorage) {
          if (localStorage.hasOwnProperty(k)) totalBefore += (localStorage[k].length || 0) * 2;
        }

        let optimizedCards = 0;
        for (const proj of state.projects) {
          if (Array.isArray(proj.cards)) {
            for (const card of proj.cards) {
              if (card.src && card.src.startsWith('data:image/')) {
                const prev = card.src;
                const opt = await compressImageBase64(prev, 500, 0.7);
                if (opt !== prev && opt.length < prev.length) {
                  card.src = opt;
                  optimizedCards++;
                }
              }
            }
          }
        }

        saveData();
        renderCanvas();
        updateStorageStatus();

        let totalAfter = 0;
        for (let k in localStorage) {
          if (localStorage.hasOwnProperty(k)) totalAfter += (localStorage[k].length || 0) * 2;
        }

        const freedBytes = Math.max(0, totalBefore - totalAfter);
        const freedMb = (freedBytes / (1024 * 1024)).toFixed(2);

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<span>⚡</span><span class="btn-text">Оптимизировать</span>';
        }

        if (parseFloat(freedMb) > 0 || freedBytes > 0) {
          alert('Освобождено ' + freedMb + ' MB (' + optimizedCards + ' фото сжато до 500px)');
        } else {
          alert('Все изображения уже оптимизированы (до 500px, quality 0.7). Освобождено 0.00 MB');
        }
      }

      document.getElementById('btn-optimize-memory').onclick = runOptimizeMemory;
      document.getElementById('btn-banner-optimize').onclick = runOptimizeMemory;
      document.getElementById('btn-banner-close').onclick = () => {
        document.getElementById('storage-warning-banner').classList.remove('active');
      };

      document.getElementById('btn-clear-memory').onclick = () => {
        if (confirm('Точно очистить все проекты и карточки?')) {
          const apiKey = localStorage.getItem(API_KEY_KEY);
          localStorage.clear();
          if (apiKey) {
            localStorage.setItem(API_KEY_KEY, apiKey);
          }
          window.location.reload();
        }
      };

      document.getElementById('btn-clear').onclick = () => {
        const curr = getCurrentProject();
        if (!curr) return;
        if (confirm('Очистить все карточки в текущем проекте?')) {
          curr.cards = [];
          state.selectedCardIds.clear();
          saveData();
          renderProjects();
          renderCanvas();
          updateGenerationThumbs();
        }
      };

      // Export Project JSON
      document.getElementById('btn-export').onclick = () => {
        const curr = getCurrentProject();
        if (!curr) return;
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(curr, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', (curr.name.replace(/[^a-z0-9а-яё]/gi, '_') || 'project') + '.json');
        document.body.appendChild(a);
        a.click();
        a.remove();
      };

      // Import Project JSON
      const jsonInput = document.getElementById('hidden-json-input');
      document.getElementById('btn-import').onclick = () => jsonInput.click();
      jsonInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const project = JSON.parse(event.target.result);
            if (!project.id) project.id = 'proj_' + Date.now();
            if (!project.name) project.name = file.name.replace(/\\.json$/, '');
            if (!Array.isArray(project.cards)) project.cards = [];
            state.projects.push(project);
            state.currentProjectId = project.id;
            state.selectedCardIds.clear();
            state.pan = project.pan || { x: 60, y: 60 };
            state.zoom = project.zoom || 1;
            saveData();
            renderProjects();
            renderCanvas();
            updateGenerationThumbs();
            alert('Проект успешно загружен!');
          } catch(err) {
            alert('Ошибка при чтении файла проекта');
          }
        };
        reader.readAsText(file);
        jsonInput.value = '';
      };

      // File upload button
      const fileInput = document.getElementById('hidden-file-input');
      document.getElementById('btn-upload-file').onclick = () => fileInput.click();
      fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
        if (files.length === 0) return;
        const center = screenToCanvas(container.clientWidth / 2, container.clientHeight / 2);
        let offset = 0;
        for (const file of files) {
          await processAndAddImage(file, center.x + offset, center.y + offset);
          offset += 30;
        }
        fileInput.value = '';
      };

      // Settings Modal
      function openSettings() {
        inputApiKey.value = localStorage.getItem(API_KEY_KEY) || '';
        settingsModal.classList.add('active');
        inputApiKey.focus();
      }

      function closeSettings() {
        settingsModal.classList.remove('active');
      }

      document.getElementById('btn-open-settings').onclick = openSettings;
      document.getElementById('btn-close-settings').onclick = closeSettings;
      document.getElementById('btn-cancel-settings').onclick = closeSettings;
      document.getElementById('btn-save-settings').onclick = () => {
        const key = inputApiKey.value.trim();
        localStorage.setItem(API_KEY_KEY, key);
        closeSettings();
        genErrorBanner.classList.remove('active');
      };

      // Generation Panel Toggle
      function toggleGenerationPanel() {
        if (genPanel.classList.contains('active')) {
          genPanel.classList.remove('active');
        } else {
          genPanel.classList.add('active');
          updateGenerationThumbs();
        }
      }

      document.getElementById('btn-toggle-gen').onclick = toggleGenerationPanel;
      document.getElementById('btn-close-gen').onclick = () => genPanel.classList.remove('active');

      // Draggable generation panel header on desktop
      let isDraggingPanel = false;
      let panelDragOffset = { x: 0, y: 0 };

           // AI Image Generation via gemini-2.5-flash-image
      btnDoGenerate.onclick = async () => {
        if (state.isGenerating) return;

        const apiKey = (localStorage.getItem(API_KEY_KEY) || '').trim();
        if (!apiKey) {
          genErrorBanner.textContent = 'Введите API-ключ в настройках';
          genErrorBanner.classList.add('active');
          openSettings();
          return;
        }

        const curr = getCurrentProject();
        if (!curr) return;

        const selectedCards = (curr.cards || []).filter(c => state.selectedCardIds.has(c.id));
        const userPrompt = (genPromptInput.value || '').trim();
        let promptText = 'Сгенерируй изображение в стиле приложенных референсов. ' + userPrompt;

        // Collect attached/nearby notes if any
        if (Array.isArray(curr.notes) && curr.notes.length > 0) {
          const validNoteTexts = [];
          // Attached to selected cards
          curr.notes.forEach(n => {
            if (n.attachedTo && state.selectedCardIds.has(n.attachedTo) && n.text && n.text.trim()) {
              validNoteTexts.push(n.text.trim());
            }
          });
          // Unattached nearby notes
          curr.notes.forEach(n => {
            if (!n.attachedTo && n.text && n.text.trim()) {
              validNoteTexts.push(n.text.trim());
            }
          });
          if (validNoteTexts.length > 0) {
            promptText += ' Дополнительные требования из заметок: ' + validNoteTexts.join(', ');
          }
        }

        // Build base64 parts (up to 5 reference cards)
        const imageParts = [];

        for (const card of selectedCards.slice(0, 5)) {
          const match = card.src.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
          if (match) {
            imageParts.push({
              inline_data: {
                mime_type: match[1],
                data: match[2]
              }
            });
          }
        }

        state.isGenerating = true;
        btnDoGenerate.disabled = true;
        btnDoGenerateText.textContent = 'Генерация...';
        genErrorBanner.classList.remove('active');

        let generatedImageSrc = '';

        try {
          const geminiParts = [{ text: promptText.trim() }, ...imageParts];
          const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=' + apiKey;

          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: geminiParts }],
              generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192,
                responseModalities: ['image', 'text']
              }
            })
          });

          const resJson = await response.json();

          if (!response.ok) {
            const errMsg = resJson?.error?.message || ('HTTP ' + response.status);
            throw new Error(errMsg);
          }

          const candidate = resJson?.candidates?.[0];
          const responseParts = candidate?.content?.parts || [];

          for (const part of responseParts) {
            if (part.inlineData?.data) {
              const mime = part.inlineData.mimeType || 'image/png';
              generatedImageSrc = 'data:' + mime + ';base64,' + part.inlineData.data;
              break;
            }
            if (part.inline_data?.data) {
              const mime = part.inline_data.mime_type || 'image/png';
              generatedImageSrc = 'data:' + mime + ';base64,' + part.inline_data.data;
              break;
            }
          }

          if (!generatedImageSrc) {
            const textPart = responseParts.find(p => p.text);
            if (textPart && textPart.text) {
              throw new Error('Модель вернула текст: ' + textPart.text.slice(0, 150));
            }
            throw new Error('Модель gemini-2.5-flash-image не вернула изображение в ответе.');
          }
        } catch (err) {
          genErrorBanner.textContent = 'Ошибка генерации: ' + (err.message || err);
          genErrorBanner.classList.add('active');
          state.isGenerating = false;
          btnDoGenerate.disabled = false;
          btnDoGenerateText.textContent = 'Сгенерировать';
          return;
        }

        if (generatedImageSrc) {
          // Calculate spawn position (+50px to the right and down relative to selected cards)
          let spawnX = 150;
          let spawnY = 150;

          if (selectedCards.length > 0) {
            const maxRight = Math.max(...selectedCards.map(c => c.x + c.width));
            const minTop = Math.min(...selectedCards.map(c => c.y));
            spawnX = maxRight + 50;
            spawnY = minTop + 50;
          } else {
            const center = screenToCanvas(container.clientWidth / 2, container.clientHeight / 2);
            spawnX = center.x - 120;
            spawnY = center.y - 120;
          }

          const isMobile = window.innerWidth <= 640;
          const displayWidth = isMobile ? 240 : 280;

          const newCard = {
            id: 'c_gen_' + Date.now(),
            x: Math.round(spawnX),
            y: Math.round(spawnY),
            width: displayWidth,
            height: displayWidth,
            src: generatedImageSrc
          };

          if (!curr.cards) curr.cards = [];
          curr.cards.push(newCard);

          state.selectedCardIds.clear();
          state.selectedCardIds.add(newCard.id);

          saveData();
          renderProjects();
          renderCanvas();
          updateGenerationThumbs();

          // On mobile, close panel after successful generation to show the canvas
          if (window.innerWidth <= 640) {
            genPanel.classList.remove('active');
          }
        }

        state.isGenerating = false;
        btnDoGenerate.disabled = false;
        btnDoGenerateText.textContent = 'Сгенерировать';
      };

      // Initialization
      loadData();
      renderProjects();
      renderCanvas();
      updateGenerationThumbs();
    })();
  </script>
</body>
</html>`;
}
