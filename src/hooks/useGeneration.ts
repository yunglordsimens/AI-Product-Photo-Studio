/* eslint-disable react-hooks/exhaustive-deps */
// Gemini: one shot per selected product (references by «берём:» roles), «править», «Стиль».
// Split out of App.tsx; App passes in what it needs and spreads back what it returns.
import React, { useEffect, useCallback, useRef, useMemo } from 'react';
import { Card, Connection, MasterPrompt, Note, ProductItem, Project } from '../types';
import { compressDataUrl } from '../utils/imageUtils';
import { getStoredApiKey, hasGenerationAccess, generateImageWithGemini, analyzeStyleWithGemini, getImageModel } from '../utils/gemini';
import { splitSelection } from '../utils/referenceRoles';
import { SOURCE_FIX_MARKER } from '../utils/storage';
import { makeExample, promptByName, withExample } from '../utils/promptExamples';
import { ConsideredNoteInfo } from '../components/GenerationPanel';

export interface GenerationDeps {
  activeProject: Project;
  activeProjectId: string;
  consideredNotes: ConsideredNoteInfo[];
  handleSaveMasterPrompts: (prompts: MasterPrompt[]) => void;
  handleUpdateCards: (cards: Card[]) => void;
  latestProjectsRef: React.RefObject<Project[]>;
  masterPrompts: MasterPrompt[];
  masterPromptsRef: React.RefObject<MasterPrompt[]>;
  projects: Project[];
  saveProjectsToStorage: (updatedProjects: Project[]) => void;
  selectedCardIds: Set<string>;
  setActiveGenerations: React.Dispatch<React.SetStateAction<number>>;
  setCurrentPromptPreset: React.Dispatch<React.SetStateAction<string>>;
  setFolderImportStatus: React.Dispatch<React.SetStateAction<string>>;
  setGeneratingCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setGenerationError: React.Dispatch<React.SetStateAction<string>>;
  setIsAnalyzingStyle: React.Dispatch<React.SetStateAction<boolean>>;
  setIsGenerationOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsSettingsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setIsStyleAnalysisOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedCardIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setSelectedNoteIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setStyleAnalysisTags: React.Dispatch<React.SetStateAction<string>>;
}

export function useGeneration(deps: GenerationDeps) {
  const {
    activeProject,
    activeProjectId,
    consideredNotes,
    handleSaveMasterPrompts,
    handleUpdateCards,
    latestProjectsRef,
    masterPrompts,
    masterPromptsRef,
    projects,
    saveProjectsToStorage,
    selectedCardIds,
    setActiveGenerations,
    setCurrentPromptPreset,
    setFolderImportStatus,
    setGeneratingCardIds,
    setGenerationError,
    setIsAnalyzingStyle,
    setIsGenerationOpen,
    setIsSettingsOpen,
    setIsStyleAnalysisOpen,
    setSelectedCardIds,
    setSelectedNoteIds,
    setStyleAnalysisTags,
  } = deps;

  // ---- Gemini generation ----
  // Every selected product gets its own shot; photos with a «берём:» role are references for all of them.
  // Runs go side by side (3 at a time, the rest wait in line); the button never locks.
  const genSlots = useRef<{ running: number; queue: (() => void)[] }>({ running: 0, queue: [] });
  const acquireGenSlot = () =>
    new Promise<void>((resolve) => {
      const s = genSlots.current;
      if (s.running < 3) {
        s.running++;
        resolve();
      } else s.queue.push(() => {
        s.running++;
        resolve();
      });
    });
  const releaseGenSlot = () => {
    const s = genSlots.current;
    s.running--;
    s.queue.shift()?.();
  };
  const selectedCardIdsRef = useRef(selectedCardIds);
  selectedCardIdsRef.current = selectedCardIds;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;
  const handleTriggerGeminiGeneration = async (
    prompt: string,
    options?: {
      isProductReplacement?: boolean;
      selectedProduct?: ProductItem;
      masterPromptName?: string;
      /** Generate from these photos instead of the board selection (e.g. «править» on one photo) */
      sourceCards?: Card[];
      /** «попробовать на выделенном»: the result becomes this prompt's example */
      exampleForPromptId?: string;
    }
  ) => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setGenerationError('Укажите пароль студии или API-ключ в настройках');
      setIsSettingsOpen(true);
      return;
    }

    const projectId = activeProjectId;
    const selectedCards = options?.sourceCards || (activeProject.cards || []).filter((c) => selectedCardIds.has(c.id));
    const noteTexts = options?.sourceCards ? [] : consideredNotes.map((n) => n.text);

    type Job = { sources: Card[]; anchor: Card[]; label?: string; photoRole?: 'product' | 'style' };
    let jobs: Job[];
    const single = options?.sourceCards || options?.isProductReplacement || options?.exampleForPromptId || prompt.includes(SOURCE_FIX_MARKER);
    if (single) {
      jobs = [{ sources: selectedCards, anchor: selectedCards, photoRole: options?.sourceCards ? 'product' : undefined }];
    } else {
      const { products, refs } = splitSelection(selectedCards);
      if (products.length === 0) {
        jobs = [{ sources: refs.slice(0, 5), anchor: refs, photoRole: refs.length ? 'style' : undefined }];
      } else {
        if (products.length > 10 && !window.confirm(`Сгенерировать ${products.length} кадров? Это ${products.length} запросов к Gemini.`)) return;
        jobs = products.map((p) => ({
          sources: [{ ...p, takes: Array.from(new Set(['product', ...(p.takes || [])])) }, ...refs.slice(0, 4)],
          anchor: [p],
          label: p.name,
          photoRole: 'product',
        }));
      }
    }
    setGenerationError(null);
    const selectionAtStart = selectedCardIdsRef.current;

    const runJob = async (job: Job) => {
      const ids = job.anchor.map((c) => c.id);
      setActiveGenerations((n) => n + 1);
      setGeneratingCardIds((prev) => new Set([...prev, ...ids]));
      try {
        await acquireGenSlot();
        let result;
        try {
          result = await generateImageWithGemini(apiKey, prompt, job.sources, noteTexts, {
            isProductReplacement: options?.isProductReplacement,
            productImageDataUrl: options?.selectedProduct?.photoDataUrl,
            photoRole: job.photoRole,
          });
        } finally {
          releaseGenSlot();
        }
        const compressedDataUrl = await compressDataUrl(result.imageUrl, 1600, 1600, 0.9);

        // Insert into the newest state of the project it was started in (other runs may have finished meanwhile)
        const latest = latestProjectsRef.current;
        const proj = latest.find((p) => p.id === projectId);
        if (!proj) return;
        const cards = proj.cards || [];
        let newX: number;
        let newY: number;
        if (job.anchor.length > 0) {
          const first = job.anchor[0];
          const siblings = cards.filter((c) => c.meta?.sourceIds?.[0] === first.id).length;
          newX = Math.max(...job.anchor.map((c) => c.x + c.width)) + 50 + siblings * 30;
          newY = Math.min(...job.anchor.map((c) => c.y)) + 50 + siblings * 30;
        } else {
          const pan = proj.pan || { x: 80, y: 80 };
          const zoom = proj.zoom || 1;
          newX = (-pan.x + window.innerWidth / 2 - 120) / zoom;
          newY = (-pan.y + window.innerHeight / 2 - 150) / zoom;
        }
        const maxZ = cards.reduce((max, c) => Math.max(max, c.zIndex || 1), 1);
        const cardWidth = 240;
        const cardHeight = Math.round(cardWidth * (result.height / result.width)) || 300;
        const generatedCard: Card = {
          id: `card_gen_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
          x: Math.round(newX),
          y: Math.round(newY),
          width: cardWidth,
          height: cardHeight,
          src: compressedDataUrl,
          name: job.label ? `${job.label} · AI` : `Gemini_${new Date().toLocaleTimeString().replace(/:/g, '-')}.png`,
          aspectRatio: cardWidth / cardHeight,
          zIndex: maxZ + 1,
          meta: {
            kind: prompt.includes(SOURCE_FIX_MARKER) ? 'fix' : options?.isProductReplacement ? 'product' : 'generate',
            prompt,
            masterPromptName: options?.masterPromptName,
            productName: options?.isProductReplacement ? options?.selectedProduct?.name : undefined,
            model: getImageModel(),
            sourceIds: job.sources.map((c) => c.id),
            createdAt: Date.now(),
          },
        };
        // "Made from" links: every source → the new card
        const autoConnections: Connection[] = job.sources.slice(0, 5).map((c, i) => ({
          id: `conn_auto_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
          from: c.id,
          to: generatedCard.id,
          auto: true,
        }));
        saveProjectsToStorage(
          latest.map((p) =>
            p.id === projectId
              ? { ...p, cards: [...(p.cards || []), generatedCard], connections: [...(p.connections || []), ...autoConnections], updatedAt: Date.now() }
              : p
          )
        );
        // One result and nothing else selected meanwhile: select it, so the next edit can follow
        if (jobs.length === 1 && selectedCardIdsRef.current === selectionAtStart && projectId === activeProjectIdRef.current) {
          setSelectedCardIds(new Set([generatedCard.id]));
          setSelectedNoteIds(new Set());
        }
        // The first result of a master prompt becomes its example (or this one, when asked for)
        const target = options?.exampleForPromptId
          ? masterPromptsRef.current.find((mp) => mp.id === options.exampleForPromptId)
          : promptByName(masterPromptsRef.current, options?.masterPromptName);
        if (target && (options?.exampleForPromptId || !target.example)) {
          makeExample(job.sources[0]?.src, compressedDataUrl, options?.exampleForPromptId ? 'manual' : 'auto').then((ex) =>
            handleSaveMasterPrompts(withExample(masterPromptsRef.current, target.id, ex))
          );
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setGenerationError(job.label && jobs.length > 1 ? `«${job.label}»: ${errorMsg}` : errorMsg);
      } finally {
        setActiveGenerations((n) => n - 1);
        setGeneratingCardIds((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    };
    jobs.forEach((job) => void runJob(job));
  };
  /** A generated photo on the board → the example of the master prompt it was made with */
  const handleMakeExampleFromCard = useCallback(
    async (card: Card) => {
      const mp = promptByName(masterPromptsRef.current, card.meta?.masterPromptName);
      if (!mp) return;
      const source = (activeProject.cards || []).find((c) => c.id === card.meta?.sourceIds?.[0]);
      const ex = await makeExample(source?.src, card.src, 'manual');
      handleSaveMasterPrompts(withExample(masterPromptsRef.current, mp.id, ex));
      setFolderImportStatus(`Пример для «${mp.name}» обновлён.`);
      setTimeout(() => setFolderImportStatus(null), 4000);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject.cards]
  );
  // Keyboard shortcut listener ('G' / 'g' / 'п' / 'П' for generation panel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'g' || e.key === 'G' || e.key === 'п' || e.key === 'П')) {
        e.preventDefault();
        setIsGenerationOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  // Style Analysis Handlers (gemini-2.5-flash)
  const handleAnalyzeStyle = useCallback(async () => {
    const apiKey = getStoredApiKey();
    if (!hasGenerationAccess()) {
      setIsSettingsOpen(true);
      return;
    }

    const selectedCards = (activeProject.cards || []).filter((c) => selectedCardIds.has(c.id));
    if (selectedCards.length === 0) {
      window.alert('Пожалуйста, выделите от 1 до 5 карточек-изображений на канвасе для анализа стиля.');
      return;
    }
    const n = Math.min(5, selectedCards.length);
    if (
      !window.confirm(
        `Описать стиль ${n} фото${selectedCards.length > 5 ? ' (первых пяти)' : ''}?\n\nМодель посмотрит на них и положит описание заметкой рядом. Это один запрос к Gemini.`
      )
    )
      return;
    const projectId = activeProject.id;

    const cardsToAnalyze = selectedCards.slice(0, 5);
    setIsStyleAnalysisOpen(true);
    setIsAnalyzingStyle(true);
    setStyleAnalysisTags('');

    try {
      const tags = await analyzeStyleWithGemini(apiKey, cardsToAnalyze);
      setStyleAnalysisTags(tags);

      // Keep the result on the board as a note next to the analysed photos, so it doesn't vanish with the window
      const maxRight = Math.max(...cardsToAnalyze.map((c) => c.x + c.width));
      const minTop = Math.min(...cardsToAnalyze.map((c) => c.y));
      const styleNote: Note = {
        id: `note_style_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        x: Math.round(maxRight + 24),
        y: Math.round(minTop),
        width: 220,
        height: 160,
        text: `Стиль (${cardsToAnalyze.length} фото): ${tags}`,
        color: 'blue',
        attachedTo: null,
        projectId: activeProject.id,
        zIndex: 20,
      };
      // Into the newest state: generations may have finished while the model was looking
      saveProjectsToStorage(
        latestProjectsRef.current.map((p) =>
          p.id === projectId ? { ...p, notes: [...(p.notes || []), styleNote], updatedAt: Date.now() } : p
        )
      );
    } catch (err: any) {
      console.error('Style analysis error:', err);
      setStyleAnalysisTags(`Ошибка: ${err?.message || 'Не удалось проанализировать стиль'}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [activeProject, selectedCardIds, saveProjectsToStorage]);
  const handleSaveStyleAsMasterPrompt = useCallback(
    (tagsText: string) => {
      const newPrompt: MasterPrompt = {
        id: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `Стиль из ${selectedCardIds.size || 1} референсов`,
        prompt: tagsText,
        tags: ['Стиль', 'Анализ'],
        category: 'Мои',
        projectId: activeProject.id,
        createdAt: Date.now(),
      };
      const updated = [newPrompt, ...masterPrompts];
      handleSaveMasterPrompts(updated);
    },
    [selectedCardIds, masterPrompts, handleSaveMasterPrompts, activeProject.id]
  );
  const handleUseStyleInGeneration = useCallback((tagsText: string) => {
    setCurrentPromptPreset(tagsText);
    setIsGenerationOpen(true);
    setIsStyleAnalysisOpen(false);
  }, []);
  // What to take from a reference photo (фон, свет, ракурс…)
  const handleChangeCardTakes = useCallback(
    (cardId: string, takes: string[]) => {
      handleUpdateCards((activeProject.cards || []).map((c) => (c.id === cardId ? { ...c, takes } : c)));
    },
    [activeProject.cards, handleUpdateCards]
  );
  // «править» on one photo: edit it by words (or by a «Исходник» prompt); the result appears next to it
  const handleEditCard = useCallback(
    (cardId: string, instruction: string, promptName?: string) => {
      const card = (activeProject.cards || []).find((c) => c.id === cardId);
      const text = instruction.trim();
      if (!card || !text) return;
      const prompt = text.includes(SOURCE_FIX_MARKER) ? text : `${SOURCE_FIX_MARKER} ${text}`;
      handleTriggerGeminiGeneration(prompt, { sourceCards: [card], masterPromptName: promptName });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeProject.cards, projects, activeProjectId]
  );
  /** Names of master prompts: a photo made with one of them can become its example */
  const examplePromptNames = useMemo(() => new Set(masterPrompts.map((mp) => mp.name)), [masterPrompts]);
  const quickEditPrompts = useMemo(() => masterPrompts.filter((mp) => mp.prompt.includes(SOURCE_FIX_MARKER)), [masterPrompts]);

  return {
    examplePromptNames,
    handleAnalyzeStyle,
    handleChangeCardTakes,
    handleEditCard,
    handleMakeExampleFromCard,
    handleSaveStyleAsMasterPrompt,
    handleTriggerGeminiGeneration,
    handleUseStyleInGeneration,
    quickEditPrompts,
  };
}
