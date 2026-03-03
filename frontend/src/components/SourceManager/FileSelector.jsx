import React, { useState } from 'react';
import { Folder, FileCode, ChevronRight, ChevronDown, RefreshCw, HardDrive, Loader2 } from 'lucide-react';
import { browsePath } from '../../services/api';

const FileIcon = ({ name }) => {
  if (name.endsWith('.spec')) return <FileCode className="w-4 h-4 text-orange-400" />;
  if (name.endsWith('.conf') || name.endsWith('.cfg')) return <FileCode className="w-4 h-4 text-yellow-400" />;
  return <FileCode className="w-4 h-4 text-text-muted" />;
};

const FileTreeItem = ({ item, level = 0, onSelect, credentials, parentPath, selectedPaths = [], onTogglePath, mode = 'single', onBrowse, parentIsSelected = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [children, setChildren] = useState(item.children || []);
  const [hasLoaded, setHasLoaded] = useState(children.length > 0);

  const currentPath = parentPath 
    ? `${parentPath}/${item.name}`.replace('//', '/') 
    : item.path || item.name;

  const isDirectlySelected = mode === 'multi' 
    ? selectedPaths.includes(currentPath)
    : false;
    
  const isSelected = isDirectlySelected || parentIsSelected;

  const handleToggle = async (e) => {
    // Prevent toggling when clicking checkbox
    if (e.target.type === 'checkbox') return;
    
    if (item.type !== 'directory') {
      if (mode === 'single') {
        onSelect({ ...item, path: currentPath });
      } else {
        if (!parentIsSelected) {
            onTogglePath(currentPath);
        }
      }
      return;
    }

    if (isOpen) {
      setIsOpen(false);
      return;
    }
    
    setIsOpen(true);

    if (!hasLoaded) {
      setIsLoading(true);
      try {
        let files;
        if (onBrowse) {
            files = await onBrowse(currentPath);
        } else if (credentials) {
            files = await browsePath(
                credentials.host,
                credentials.username,
                credentials.password,
                currentPath
            );
        } else {
            throw new Error("Missing credentials or browse handler");
        }
        
        setChildren(files);
        setHasLoaded(true);
      } catch (error) {
        console.error("Failed to load directory:", error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleCheckboxChange = () => {
    if (!parentIsSelected) {
        onTogglePath(currentPath);
    }
  };

  const paddingLeft = level * 1.5 + 0.5;

  return (
    <div>
      <div 
        className={`flex items-center gap-2 py-1.5 px-2 hover:bg-surface/50 cursor-pointer text-sm select-none group border-b border-transparent hover:border-border/50 transition-colors ${isSelected ? 'bg-primary/10' : ''}`}
        style={{ paddingLeft: `${paddingLeft}rem` }}
        onClick={handleToggle}
      >
        {mode === 'multi' && (
           <input 
             type="checkbox" 
             checked={isSelected} 
             onChange={handleCheckboxChange}
             disabled={parentIsSelected}
             className="w-4 h-4 rounded border-border bg-background checked:bg-primary mr-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
             onClick={(e) => e.stopPropagation()}
           />
        )}
        <span className="opacity-50 group-hover:opacity-100 transition-opacity min-w-[16px]">
          {item.type === 'directory' ? (
            isLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isOpen ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <div className="w-4" />
          )}
        </span>
        
        {item.type === 'directory' ? (
          <Folder className={`w-4 h-4 ${isOpen ? 'text-primary' : 'text-primary/70'}`} />
        ) : (
          <FileIcon name={item.name} />
        )}
        
        <span className={`${item.type === 'directory' ? 'font-medium' : 'text-text-muted group-hover:text-text'}`}>
          {item.name}
        </span>
      </div>
      
      {isOpen && (
        <div className="border-l border-border/50 ml-6">
          {children.map((child, i) => (
            <FileTreeItem 
              key={i} 
              item={child} 
              level={level + 1} 
              onSelect={onSelect}
              credentials={credentials}
              parentPath={currentPath}
              selectedPaths={selectedPaths}
              onTogglePath={onTogglePath}
              mode={mode}
              onBrowse={onBrowse}
              parentIsSelected={isSelected}
            />
          ))}
          {children.length === 0 && hasLoaded && (
            <div className="py-1 px-2 text-xs text-text-muted italic ml-4">
              (Empty directory)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const FileSelector = ({ initialData, credentials, mode = 'single', selectedPaths = [], onTogglePath, onSelect, onBrowse }) => {
  const [selectedFile, setSelectedFile] = useState(null);

  // Use internal selectedFile state for single mode fallback if onSelect not provided fully
  const handleSelect = (file) => {
      setSelectedFile(file);
      if (onSelect) onSelect(file);
  };

  const treeData = initialData || {
    name: "Not connected",
    type: "directory",
    children: []
  };

  return (
    <div className="h-full flex flex-col bg-surface border border-border rounded-xl overflow-hidden shadow-lg">
      <div className="p-4 border-b border-border bg-background/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-primary" />
          <h3 className="font-semibold">Source Browser</h3>
        </div>
        <button className="p-1.5 hover:bg-background rounded-lg transition-colors text-text-muted hover:text-text">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-auto p-2">
        <div className="text-xs font-mono text-text-muted mb-4 px-2 py-1 bg-background rounded border border-border/50 truncate">
           {credentials ? `${credentials.username}@${credentials.host}:${initialData?.path || ''}` : 'No connection'}
        </div>
        
        {initialData ? (
          <FileTreeItem 
            item={treeData} 
            onSelect={handleSelect} 
            credentials={credentials}
            // initialData.path is the root path (e.g. /home/user)
            // The item name is "user" or similar. 
            // We pass parentPath as undefined for root so it uses item.path
            selectedPaths={selectedPaths}
            onTogglePath={onTogglePath}
            mode={mode}
            onBrowse={onBrowse}
          />
        ) : (
          <div className="text-center text-text-muted mt-10">
            No files loaded. Connect to a host first.
          </div>
        )}
      </div>
      
      <div className="p-4 border-t border-border bg-background/50">
        <div className="text-xs text-text-muted flex justify-between items-center">
          <span className="truncate max-w-[200px]">
            Selected: <span className="text-primary font-medium">{selectedFile ? selectedFile.name : 'None'}</span>
          </span>
          <span className="text-text-muted/50">
            {selectedFile && selectedFile.type === 'file' ? (selectedFile.size / 1024).toFixed(1) + ' KB' : ''}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FileSelector;
