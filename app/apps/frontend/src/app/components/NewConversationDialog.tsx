import React, { useState, useEffect, useMemo } from 'react';

interface Props {
  chapters: { file: string }[];
  skills: { name: string; display_name: string }[];
  projectFiles?: { path: string; type: 'file' | 'dir' }[];
  onSubmit: (data: { name: string; context_scope: any; active_skills: string[]; mode: string; model?: string }) => void;
  onCancel: () => void;
}

export function NewConversationDialog({ chapters, skills, projectFiles, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [scopeType, setScopeType] = useState('free');
  const [scopeFile, setScopeFile] = useState('');
  const [mode, setMode] = useState('chat');
  const [model, setModel] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [configModel, setConfigModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [fileFilter, setFileFilter] = useState('');

  // Build list of selectable text files from project files
  const selectableFiles = useMemo(() => {
    if (!projectFiles || projectFiles.length === 0) return [];
    const textExtensions = ['.tex', '.md', '.txt', '.bib', '.sty', '.cls', '.json', '.yml', '.yaml', '.csv', '.py', '.js', '.ts', '.sh', '.cfg', '.toml'];
    return projectFiles
      .filter(f => f.type === 'file')
      .filter(f => textExtensions.some(ext => f.path.toLowerCase().endsWith(ext)))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [projectFiles]);

  const filteredFiles = useMemo(() => {
    if (!fileFilter.trim()) return selectableFiles;
    const q = fileFilter.toLowerCase();
    return selectableFiles.filter(f => f.path.toLowerCase().includes(q));
  }, [selectableFiles, fileFilter]);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(cfg => {
      if (cfg.claude_model || cfg.llm_model) setConfigModel(cfg.llm_model || cfg.claude_model);
    }).catch((err) => { console.error('Failed to load config:', err); });

    fetch('/api/models').then(r => r.json()).then(data => {
      if (data.error) {
        setModelsError(data.error);
      } else if (data.models && data.models.length > 0) {
        setAvailableModels(data.models);
      }
    }).catch((err) => { setModelsError(`Failed to fetch models: ${err.message}`); });
  }, []);

  const handleSubmit = () => {
    let context_scope: any = { type: scopeType };
    if (scopeType === 'chapter') context_scope.file = scopeFile;
    onSubmit({ name: name || `New ${scopeType}`, context_scope, active_skills: selectedSkills, mode, model: model || undefined });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--paper)', borderRadius: '8px', padding: '24px', width: '400px', color: 'var(--text)' }}>
        <h3 style={{ margin: '0 0 16px' }}>New Conversation</h3>

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Write Introduction"
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', background: 'var(--panel)', color: 'var(--text)' }} />
        </label>

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Model</span>
          {modelsError && <span style={{ fontSize: '11px', color: 'var(--danger)', marginLeft: '8px' }}>{modelsError}</span>}
          <select value={model} onChange={e => setModel(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--panel)', color: 'var(--text)' }}>
            <option value="">{`Default (${configModel || 'from settings'})`}</option>
            {availableModels.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Context Scope</span>
          <select value={scopeType} onChange={e => setScopeType(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--panel)', color: 'var(--text)' }}>
            <option value="free">Free (no file binding)</option>
            <option value="global">Global (all chapters)</option>
            <option value="chapter">Chapter (specific)</option>
          </select>
        </label>

        {scopeType === 'chapter' && (
          <label style={{ display: 'block', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500 }}>File</span>
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
              <input
                value={scopeFile}
                onChange={e => setScopeFile(e.target.value)}
                placeholder="sec/intro.tex or any project file path"
                style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--panel)', color: 'var(--text)', fontSize: '12px' }}
              />
              {selectableFiles.length > 0 && (
                <button
                  onClick={() => setShowFilePicker(!showFilePicker)}
                  title="Browse project files"
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    background: showFilePicker ? 'var(--accent-soft)' : 'var(--panel)',
                    color: 'var(--text)',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📂 Browse
                </button>
              )}
            </div>
            {showFilePicker && (
              <div style={{
                marginTop: '6px',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                background: 'var(--panel)',
                maxHeight: '200px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}>
                <input
                  value={fileFilter}
                  onChange={e => setFileFilter(e.target.value)}
                  placeholder="Filter files..."
                  style={{ border: 'none', borderBottom: '1px solid var(--border)', padding: '6px 10px', background: 'var(--panel)', color: 'var(--text)', fontSize: '12px', outline: 'none' }}
                />
                <div style={{ overflow: 'auto', flex: 1 }}>
                  {/* Predefined chapters for backward compat */}
                  {fileFilter.trim() === '' && chapters.length > 0 && (
                    <div style={{ padding: '4px 10px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Chapters
                    </div>
                  )}
                  {fileFilter.trim() === '' && chapters.map(ch => (
                    <div
                      key={ch.file}
                      onClick={() => { setScopeFile(ch.file); setShowFilePicker(false); setFileFilter(''); }}
                      style={{
                        padding: '5px 14px', cursor: 'pointer', fontSize: '12px',
                        color: scopeFile === ch.file ? 'var(--accent-strong)' : 'var(--text)',
                        background: scopeFile === ch.file ? 'var(--accent-soft)' : 'transparent',
                      }}
                      onMouseEnter={e => { if (scopeFile !== ch.file) e.currentTarget.style.background = 'var(--hover)'; }}
                      onMouseLeave={e => { if (scopeFile !== ch.file) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {ch.file}
                    </div>
                  ))}
                  {/* All project files */}
                  {filteredFiles.length > 0 && (
                    <div style={{
                      padding: '4px 10px', fontSize: '10px', fontWeight: 600, color: 'var(--muted)',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                      borderTop: chapters.length > 0 && fileFilter.trim() === '' ? '1px solid var(--border)' : 'none',
                    }}>
                      Project Files
                    </div>
                  )}
                  {filteredFiles.map(f => (
                    <div
                      key={f.path}
                      onClick={() => { setScopeFile(f.path); setShowFilePicker(false); setFileFilter(''); }}
                      style={{
                        padding: '5px 14px', cursor: 'pointer', fontSize: '12px',
                        color: scopeFile === f.path ? 'var(--accent-strong)' : 'var(--text)',
                        background: scopeFile === f.path ? 'var(--accent-soft)' : 'transparent',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { if (scopeFile !== f.path) e.currentTarget.style.background = 'var(--hover)'; }}
                      onMouseLeave={e => { if (scopeFile !== f.path) e.currentTarget.style.background = 'transparent'; }}
                    >
                      {f.path}
                    </div>
                  ))}
                  {filteredFiles.length === 0 && chapters.length === 0 && (
                    <div style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--muted)' }}>No files available</div>
                  )}
                </div>
              </div>
            )}
          </label>
        )}

        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>Mode</span>
          <select value={mode} onChange={e => setMode(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '4px', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--panel)', color: 'var(--text)' }}>
            <option value="chat">Chat (read-only discussion)</option>
            <option value="agent">Agent (propose edits)</option>
            <option value="tools">Tools (multi-step tasks)</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onCancel} style={{ padding: '6px 16px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--panel)', color: 'var(--text)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSubmit} style={{ padding: '6px 16px', border: 'none', borderRadius: '4px', background: 'var(--accent)', color: '#fff', cursor: 'pointer' }}>Create</button>
        </div>
      </div>
    </div>
  );
}
