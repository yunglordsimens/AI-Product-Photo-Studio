/* eslint-disable react-hooks/exhaustive-deps */
// Project copy (.json) in and out, image picker button, memory clean-up.
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useCallback } from 'react';
import { MasterPrompt, ProductItem, Project, StorageInfo } from '../types';
import { loadProjects, getStorageUsage, exportProjectToJson, parseProjectJson, mergeMasterPrompts, clearAllMemory, optimizeAllProjectsMemory, saveProjectProducts } from '../utils/storage';

export interface ProjectFilesDeps {
  activeProject: Project;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleSaveMasterPrompts: (prompts: MasterPrompt[]) => void;
  handleSelectProject: (id: string) => void;
  jsonInputRef: React.RefObject<HTMLInputElement>;
  masterPrompts: MasterPrompt[];
  productsList: ProductItem[];
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  setIsOptimizing: React.Dispatch<React.SetStateAction<boolean>>;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setStorageInfo: React.Dispatch<React.SetStateAction<StorageInfo>>;
  setStorageWarning: React.Dispatch<React.SetStateAction<string>>;
}

export function useProjectFiles(deps: ProjectFilesDeps) {
  const {
    activeProject,
    fileInputRef,
    handleSaveMasterPrompts,
    handleSelectProject,
    jsonInputRef,
    masterPrompts,
    productsList,
    projects,
    saveProjectsToStorage,
    setIsOptimizing,
    setProjects,
    setStorageInfo,
    setStorageWarning,
  } = deps;

  // Export JSON
  const handleExportProject = useCallback(() => {
    exportProjectToJson(activeProject, masterPrompts, productsList);
  }, [activeProject, masterPrompts, productsList]);
  // Import JSON
  const handleImportProjectClick = () => {
    jsonInputRef.current?.click();
  };
  const handleJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = (await parseProjectJson(file)) as Project & { masterPrompts?: unknown; positions?: unknown; exportedAt?: number; format?: string };
      const { masterPrompts: importedPrompts, positions: importedPositions, exportedAt: _e, format: _f, ...projectOnly } = parsed;
      const imported: Project = { ...projectOnly };
      // Importing the same file twice must not create two projects with one id
      if (projects.some((p) => p.id === imported.id)) {
        imported.id = `proj_${Date.now()}`;
        imported.name = `${imported.name} (импорт)`;
      }
      const updated = [...projects, imported];
      if (Array.isArray(importedPositions) && importedPositions.length > 0) {
        await saveProjectProducts(imported.id, importedPositions as ProductItem[]);
      }
      saveProjectsToStorage(updated);
      handleSelectProject(imported.id);
      const { merged, added } = mergeMasterPrompts(masterPrompts, importedPrompts);
      if (added > 0) handleSaveMasterPrompts(merged);
      window.alert(
        `Проект "${imported.name}" загружен.` +
          (added > 0 ? ` Добавлено мастер-промптов: ${added}.` : importedPrompts ? '' : ' В этом файле нет мастер-промптов (он сохранён старой версией).')
      );
    } catch (err) {
      window.alert('Ошибка при импорте файла проекта. Проверьте формат JSON.');
    }
    if (jsonInputRef.current) jsonInputRef.current.value = '';
  };
  // Add image button click
  const handleAddImageClick = () => {
    fileInputRef.current?.click();
  };
  // Memory Management Handlers
  const handleClearMemory = useCallback(() => {
    clearAllMemory();
  }, []);
  const handleOptimizeMemory = useCallback(async () => {
    setIsOptimizing(true);
    try {
      const res = await optimizeAllProjectsMemory();
      const loaded = loadProjects();
      setProjects(loaded);
      const usage = getStorageUsage();
      setStorageInfo(usage);
      if (usage.percentage < 80) {
        setStorageWarning(null);
      }
      if (parseFloat(res.freedMb) > 0 || res.freedBytes > 0) {
        window.alert(`Освобождено ${res.freedMb} MB (${res.optimizedCards} фото пересохранено легче)`);
      } else {
        window.alert('Все изображения уже оптимизированы (до 500px, quality 0.7). Освобождено 0.00 MB');
      }
    } catch (err) {
      console.error('Failed to optimize memory:', err);
      window.alert('Ошибка при оптимизации изображений');
    } finally {
      setIsOptimizing(false);
    }
  }, []);

  return {
    handleAddImageClick,
    handleClearMemory,
    handleExportProject,
    handleImportProjectClick,
    handleJsonFileChange,
    handleOptimizeMemory,
  };
}
