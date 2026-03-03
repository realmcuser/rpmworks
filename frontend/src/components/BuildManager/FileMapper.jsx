import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Save, CheckSquare, Square, ArrowRight, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { updateBuildConfig } from '../../services/api';

const FileMapper = ({ project, onUpdate }) => {
  const { t } = useTranslation();
  const [mappings, setMappings] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // State for Multi-select & Staging
  const [selectedSources, setSelectedSources] = useState([]);
  const [stagingTargets, setStagingTargets] = useState({}); // { "src/path": "target/path" }
  const [customSourceInput, setCustomSourceInput] = useState('');

  // Base path settings for target generation
  const [basePath, setBasePath] = useState('/opt/');
  const [keepStructure, setKeepStructure] = useState(true);

  // Default attributes for the current batch
  const [attributes, setAttributes] = useState({
    mode: '0644',
    user: 'root',
    group: 'root',
    type: 'regular'
  });

  // Bulk edit state for current mappings
  const [selectedMappings, setSelectedMappings] = useState([]);
  const [bulkEditValues, setBulkEditValues] = useState({
    user: '',
    group: '',
    mode: '',
    type: '',
    targetPrefix: ''
  });

  useEffect(() => {
    if (project?.build_config?.file_mappings) {
      setMappings(project.build_config.file_mappings);
    }
  }, [project]);

  // Update all staging targets when base path or keepStructure changes
  const applyBasePathToStaging = () => {
    if (selectedSources.length === 0) return;
    const newStaging = {};
    selectedSources.forEach(path => {
      newStaging[path] = generateTargetPath(path);
    });
    setStagingTargets(newStaging);
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const updatedConfig = {
        ...project.build_config,
        file_mappings: mappings
      };
      
      await updateBuildConfig(project.id, updatedConfig);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error("Failed to save mappings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Helper to generate target path based on source and base path settings
  const generateTargetPath = (sourcePath, basePathOverride = null, keepStructureOverride = null) => {
    // Absolute source paths already describe where the file lives in the system,
    // so use the source path directly as the target (user can override afterwards).
    if (sourcePath.startsWith('/')) {
      return sourcePath;
    }

    const effectiveBasePath = basePathOverride ?? basePath;
    const effectiveKeepStructure = keepStructureOverride ?? keepStructure;

    // Ensure base path ends with /
    const normalizedBase = effectiveBasePath.endsWith('/') ? effectiveBasePath : effectiveBasePath + '/';

    if (effectiveKeepStructure) {
      // Keep relative directory structure, but strip leading path components if they look like source dirs
      const parts = sourcePath.split('/');
      // Remove common source prefixes like 'src/', 'source/', 'files/' etc.
      const skipPrefixes = ['src', 'source', 'files', 'assets', 'resources'];
      let startIndex = 0;
      if (parts.length > 1 && skipPrefixes.includes(parts[0].toLowerCase())) {
        startIndex = 1;
      }
      const relativePath = parts.slice(startIndex).join('/');
      return normalizedBase + relativePath;
    } else {
      // Just use filename
      const filename = sourcePath.split('/').pop();
      return normalizedBase + filename;
    }
  };

  // Legacy function for backwards compatibility
  const guessTarget = (sourcePath) => {
    return generateTargetPath(sourcePath);
  };

  const toggleSource = (path) => {
    if (selectedSources.includes(path)) {
      // Remove
      setSelectedSources(selectedSources.filter(s => s !== path));
      const newStaging = { ...stagingTargets };
      delete newStaging[path];
      setStagingTargets(newStaging);
    } else {
      // Add
      setSelectedSources([...selectedSources, path]);
      setStagingTargets({
          ...stagingTargets,
          [path]: guessTarget(path)
      });
    }
  };

  const toggleAll = () => {
    const allSources = project?.source_config?.include_patterns || [];
    if (selectedSources.length === allSources.length) {
      setSelectedSources([]);
      setStagingTargets({});
    } else {
      setSelectedSources([...allSources]);
      const newStaging = {};
      allSources.forEach(path => {
          newStaging[path] = guessTarget(path);
      });
      setStagingTargets(newStaging);
    }
  };

  const updateStagingTarget = (source, value) => {
      setStagingTargets({
          ...stagingTargets,
          [source]: value
      });
  };

  const addMappings = () => {
    if (selectedSources.length === 0) return;
    
    const newItems = selectedSources.map(src => {
        return {
            id: Date.now() + Math.random(),
            source: src,
            target: stagingTargets[src] || '',
            ...attributes
        };
    });
    
    setMappings([...mappings, ...newItems]);
    setSelectedSources([]);
    setStagingTargets({});
  };

  const updateMapping = (index, field, value) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], [field]: value };
    setMappings(newMappings);
  };

  const removeMapping = (index) => {
    const newMappings = [...mappings];
    newMappings.splice(index, 1);
    setMappings(newMappings);
    // Also remove from selection if selected
    setSelectedMappings(selectedMappings.filter(i => i !== index).map(i => i > index ? i - 1 : i));
  };

  // Bulk edit functions for current mappings
  const toggleMappingSelection = (index) => {
    if (selectedMappings.includes(index)) {
      setSelectedMappings(selectedMappings.filter(i => i !== index));
    } else {
      setSelectedMappings([...selectedMappings, index]);
    }
  };

  const toggleAllMappings = () => {
    if (selectedMappings.length === mappings.length) {
      setSelectedMappings([]);
    } else {
      setSelectedMappings(mappings.map((_, i) => i));
    }
  };

  const applyBulkEdit = () => {
    const newMappings = [...mappings];
    selectedMappings.forEach(index => {
      if (bulkEditValues.user) newMappings[index] = { ...newMappings[index], user: bulkEditValues.user };
      if (bulkEditValues.group) newMappings[index] = { ...newMappings[index], group: bulkEditValues.group };
      if (bulkEditValues.mode) newMappings[index] = { ...newMappings[index], mode: bulkEditValues.mode };
      if (bulkEditValues.type) newMappings[index] = { ...newMappings[index], type: bulkEditValues.type };
      if (bulkEditValues.targetPrefix) {
        // Replace target path with new prefix + filename
        const filename = newMappings[index].target.split('/').pop();
        const normalizedPrefix = bulkEditValues.targetPrefix.endsWith('/')
          ? bulkEditValues.targetPrefix
          : bulkEditValues.targetPrefix + '/';
        newMappings[index] = { ...newMappings[index], target: normalizedPrefix + filename };
      }
    });
    setMappings(newMappings);
    // Clear bulk edit values after applying
    setBulkEditValues({ user: '', group: '', mode: '', type: '', targetPrefix: '' });
  };

  const clearBulkSelection = () => {
    setSelectedMappings([]);
    setBulkEditValues({ user: '', group: '', mode: '', type: '', targetPrefix: '' });
  };
  
  const handleAddCustomSource = (e) => {
      e.preventDefault();
      if(!customSourceInput) return;
      toggleSource(customSourceInput);
      setCustomSourceInput('');
  };

  const sourceOptions = project?.source_config?.include_patterns || [];
  // Filter out sources that are already in mappings
  const mappedSources = mappings.map(m => m.source);
  const availableSources = sourceOptions.filter(s => !mappedSources.includes(s));
  
  // Combine available sources with any currently selected ones (in case logic changes) 
  // but mostly we just want to show available ones.
  const allDisplaySources = [...new Set([...availableSources, ...selectedSources])].sort();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium text-text">{t('fileMapper.title')}</h3>
          <p className="text-sm text-text-muted">{t('fileMapper.description')}</p>
        </div>
        <button 
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{t('specEditor.saveConfig')}</span>
        </button>
      </div>

      {/* Two Column Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[500px]">
          
          {/* Left: Source Selector */}
          <div className="lg:col-span-4 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
              <div className="p-3 border-b border-border bg-surface-hover/50 flex justify-between items-center">
                  <span className="font-medium text-sm">{t('fileMapper.selectSources')}</span>
                  <button onClick={toggleAll} className="text-xs text-primary hover:underline">
                    {selectedSources.length > 0 && selectedSources.length === allDisplaySources.length ? t('fileMapper.deselectAll') : t('fileMapper.selectAll')}
                  </button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {allDisplaySources.length === 0 ? (
                      <div className="text-text-muted text-xs text-center pt-8">{t('fileMapper.noMappings')}</div>
                  ) : (
                      allDisplaySources.map((path, i) => (
                          <div 
                            key={i} 
                            onClick={() => toggleSource(path)}
                            className={clsx(
                                "flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-sm select-none transition-colors",
                                selectedSources.includes(path) ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-surface-hover text-text border border-transparent"
                            )}
                          >
                              {selectedSources.includes(path) ? <CheckSquare className="w-4 h-4 shrink-0" /> : <Square className="w-4 h-4 shrink-0" />}
                              <span className="truncate" title={path}>{path}</span>
                          </div>
                      ))
                  )}
              </div>
              
              <div className="p-3 border-t border-border bg-surface-hover/30">
                  <form onSubmit={handleAddCustomSource} className="flex gap-2">
                      <input 
                        type="text" 
                        value={customSourceInput}
                        onChange={(e) => setCustomSourceInput(e.target.value)}
                        placeholder={t('fileMapper.addCustomSource')}
                        className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-xs focus:outline-none focus:border-primary"
                      />
                      <button type="submit" disabled={!customSourceInput} className="px-3 py-1 bg-secondary/20 text-secondary hover:bg-secondary/30 rounded text-xs">
                          {t('fileMapper.add')}
                      </button>
                  </form>
              </div>
          </div>

          {/* Right: Staging Area */}
          <div className="lg:col-span-8 bg-surface border border-border rounded-lg flex flex-col overflow-hidden">
              <div className="p-3 border-b border-border bg-surface-hover/50">
                  <span className="font-medium text-sm">{t('fileMapper.configureBatch')}</span>
              </div>
              
              <div className="flex-1 flex flex-col overflow-hidden">
                  {selectedSources.length === 0 ? (
                      <div className="flex-1 flex flex-col items-center justify-center text-text-muted opacity-50 p-8">
                          <ArrowRight className="w-8 h-8 mb-2" />
                          <p className="text-sm">{t('fileMapper.noMappings')}</p>
                      </div>
                  ) : (
                      <>
                        {/* Configuration Panel - MOVED TO TOP */}
                        <div className="p-4 bg-surface-hover/30 border-b border-border">
                            <div className="flex items-center gap-2 mb-3">
                                <Settings className="w-4 h-4 text-primary" />
                                <span className="text-xs font-bold uppercase tracking-wide text-text">{t('fileMapper.applyToSelected', { count: selectedSources.length })}</span>
                            </div>

                            {/* Base Path Configuration */}
                            <div className="mb-4 p-3 bg-background rounded-lg border border-border">
                                <label className="text-[10px] text-text-muted block mb-2 font-medium uppercase tracking-wide">{t('fileMapper.basePath')}</label>
                                <div className="flex gap-2 items-center">
                                    <input
                                        type="text"
                                        value={basePath}
                                        onChange={(e) => setBasePath(e.target.value)}
                                        placeholder="/opt/myapp/"
                                        className="flex-1 bg-surface border border-border rounded px-3 py-2 text-sm font-mono focus:border-primary focus:outline-none"
                                    />
                                    <button
                                        onClick={applyBasePathToStaging}
                                        className="px-3 py-2 bg-primary/20 text-primary hover:bg-primary/30 rounded text-xs font-medium transition-colors"
                                    >
                                        {t('fileMapper.applyBasePath')}
                                    </button>
                                </div>
                                <div className="mt-2 flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="keepStructure"
                                        checked={keepStructure}
                                        onChange={(e) => setKeepStructure(e.target.checked)}
                                        className="rounded border-border"
                                    />
                                    <label htmlFor="keepStructure" className="text-xs text-text-muted cursor-pointer">
                                        {t('fileMapper.keepStructure')}
                                    </label>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.fileType')}</label>
                                    <select 
                                      value={attributes.type} 
                                      onChange={(e) => setAttributes({...attributes, type: e.target.value})}
                                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                                    >
                                        <option value="regular">{t('fileMapper.typeRegular')}</option>
                                        <option value="dir">{t('fileMapper.typeDir')}</option>
                                        <option value="doc">{t('fileMapper.typeDoc')}</option>
                                        <option value="license">{t('fileMapper.typeLicense')}</option>
                                        <option value="config">{t('fileMapper.typeConfig')}</option>
                                        <option value="config_noreplace">{t('fileMapper.typeConfigNoRep')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.mode')}</label>
                                    <input 
                                      type="text" 
                                      value={attributes.mode} 
                                      onChange={(e) => setAttributes({...attributes, mode: e.target.value})}
                                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.user')}</label>
                                    <input 
                                      type="text" 
                                      value={attributes.user} 
                                      onChange={(e) => setAttributes({...attributes, user: e.target.value})}
                                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.group')}</label>
                                    <input 
                                      type="text" 
                                      value={attributes.group} 
                                      onChange={(e) => setAttributes({...attributes, group: e.target.value})}
                                      className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Target Paths List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            <p className="text-xs text-text-muted mb-2">{t('fileMapper.description')}</p>
                            {selectedSources.map((source, i) => (
                                <div key={i} className="grid grid-cols-12 gap-4 items-center bg-background p-2 rounded border border-border">
                                    <div className="col-span-5 text-xs font-mono truncate text-text-muted" title={source}>
                                        {source}
                                    </div>
                                    <div className="col-span-1 flex justify-center text-text-muted">
                                        <ArrowRight className="w-3 h-3" />
                                    </div>
                                    <div className="col-span-6">
                                        <input 
                                            type="text" 
                                            value={stagingTargets[source] || ''}
                                            onChange={(e) => updateStagingTarget(source, e.target.value)}
                                            className="w-full bg-surface border border-border rounded px-2 py-1 text-xs font-mono text-primary focus:outline-none focus:border-primary"
                                            placeholder={t('fileMapper.targetPlaceholder')}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add Button */}
                        <div className="p-4 border-t border-border bg-surface-hover/50 flex justify-end">
                            <button 
                                onClick={addMappings}
                                className="flex items-center gap-2 px-6 py-2 bg-secondary text-white hover:bg-secondary/90 rounded-md transition-colors shadow-lg shadow-secondary/20 font-medium text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                <span>{t('fileMapper.addSourcesButton', { count: selectedSources.length })}</span>
                            </button>
                        </div>
                      </>
                  )}
              </div>
          </div>
      </div>

      {/* Saved Mappings List (Editable) */}
      <div className="space-y-2 pt-4 border-t border-border">
          <div className="flex justify-between items-center">
            <h4 className="text-sm font-medium text-text">{t('fileMapper.currentMappings')} ({mappings.length})</h4>
            {mappings.length > 0 && (
              <button
                onClick={toggleAllMappings}
                className="text-xs text-primary hover:underline"
              >
                {selectedMappings.length === mappings.length ? t('fileMapper.deselectAll') : t('fileMapper.selectAll')}
              </button>
            )}
          </div>

          {/* Bulk Edit Panel - shown when mappings are selected */}
          {selectedMappings.length > 0 && (
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wide text-primary">
                  {t('fileMapper.bulkEdit', { count: selectedMappings.length })}
                </span>
                <button
                  onClick={clearBulkSelection}
                  className="text-xs text-text-muted hover:text-text"
                >
                  {t('fileMapper.clearSelection')}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.user')}</label>
                  <input
                    type="text"
                    value={bulkEditValues.user}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, user: e.target.value })}
                    placeholder="root"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.group')}</label>
                  <input
                    type="text"
                    value={bulkEditValues.group}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, group: e.target.value })}
                    placeholder="root"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.mode')}</label>
                  <input
                    type="text"
                    value={bulkEditValues.mode}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, mode: e.target.value })}
                    placeholder="0644"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.fileType')}</label>
                  <select
                    value={bulkEditValues.type}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, type: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
                  >
                    <option value="">--</option>
                    <option value="regular">{t('fileMapper.typeRegular')}</option>
                    <option value="dir">{t('fileMapper.typeDir')}</option>
                    <option value="doc">{t('fileMapper.typeDoc')}</option>
                    <option value="license">{t('fileMapper.typeLicense')}</option>
                    <option value="config">{t('fileMapper.typeConfig')}</option>
                    <option value="config_noreplace">{t('fileMapper.typeConfigNoRep')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-text-muted block mb-1">{t('fileMapper.newTargetPrefix')}</label>
                  <input
                    type="text"
                    value={bulkEditValues.targetPrefix}
                    onChange={(e) => setBulkEditValues({ ...bulkEditValues, targetPrefix: e.target.value })}
                    placeholder="/opt/newpath/"
                    className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={applyBulkEdit}
                    disabled={!bulkEditValues.user && !bulkEditValues.group && !bulkEditValues.mode && !bulkEditValues.type && !bulkEditValues.targetPrefix}
                    className="w-full px-3 py-1.5 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-medium transition-colors"
                  >
                    {t('fileMapper.applyBulk')}
                  </button>
                </div>
              </div>
            </div>
          )}

        {mappings.length === 0 ? (
          <div className="text-center py-6 text-text-muted bg-surface/30 rounded-lg border border-border border-dashed text-sm">
            {t('fileMapper.noMappings')}
          </div>
        ) : (
            <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-surface-hover/50 text-text-muted border-b border-border">
                        <tr>
                            <th className="px-2 py-2 w-8">
                              <input
                                type="checkbox"
                                checked={selectedMappings.length === mappings.length && mappings.length > 0}
                                onChange={toggleAllMappings}
                                className="rounded border-border"
                              />
                            </th>
                            <th className="px-4 py-2 font-medium w-1/4">{t('fileMapper.sourcePath')}</th>
                            <th className="px-4 py-2 font-medium w-1/4">{t('fileMapper.targetPath')}</th>
                            <th className="px-4 py-2 font-medium w-1/6">{t('fileMapper.fileType')}</th>
                            <th className="px-4 py-2 font-medium w-16">{t('fileMapper.mode')}</th>
                            <th className="px-4 py-2 font-medium w-16">{t('fileMapper.user')}</th>
                            <th className="px-4 py-2 font-medium w-16">{t('fileMapper.group')}</th>
                            <th className="px-4 py-2 font-medium w-10"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-surface">
                        {mappings.map((map, index) => (
                            <tr
                              key={index}
                              className={clsx(
                                "hover:bg-surface-hover/30 transition-colors",
                                selectedMappings.includes(index) && "bg-primary/5"
                              )}
                            >
                                <td className="px-2 py-2">
                                  <input
                                    type="checkbox"
                                    checked={selectedMappings.includes(index)}
                                    onChange={() => toggleMappingSelection(index)}
                                    className="rounded border-border"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                    <div className="truncate font-mono text-xs text-text-muted max-w-[200px]" title={map.source}>
                                        {map.source}
                                    </div>
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="text"
                                        value={map.target}
                                        onChange={(e) => updateMapping(index, 'target', e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-primary focus:outline-none focus:border-primary"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <select
                                        value={map.type}
                                        onChange={(e) => updateMapping(index, 'type', e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:border-primary focus:outline-none"
                                    >
                                        <option value="regular">{t('fileMapper.typeRegular')}</option>
                                        <option value="dir">{t('fileMapper.typeDir')}</option>
                                        <option value="doc">{t('fileMapper.typeDoc')}</option>
                                        <option value="license">{t('fileMapper.typeLicense')}</option>
                                        <option value="config">{t('fileMapper.typeConfig')}</option>
                                        <option value="config_noreplace">{t('fileMapper.typeConfigNoRep')}</option>
                                    </select>
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="text"
                                        value={map.mode}
                                        onChange={(e) => updateMapping(index, 'mode', e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-primary"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="text"
                                        value={map.user}
                                        onChange={(e) => updateMapping(index, 'user', e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-primary"
                                    />
                                </td>
                                <td className="px-4 py-2">
                                    <input
                                        type="text"
                                        value={map.group}
                                        onChange={(e) => updateMapping(index, 'group', e.target.value)}
                                        className="w-full bg-background border border-border rounded px-2 py-1 text-xs font-mono text-center focus:outline-none focus:border-primary"
                                    />
                                </td>
                                <td className="px-4 py-2 text-right">
                                    <button
                                        onClick={() => removeMapping(index)}
                                        className="p-1.5 text-text-muted hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                                        title="Remove mapping"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};

export default FileMapper;
