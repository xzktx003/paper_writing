import React, { useState, useEffect } from 'react';
import {
  listSkills, getSkill, createSkill, deleteSkill, reloadSkills,
  importSkillFromGitHub, updateImportedSkill, removeImportedSkill,
  getSkillPackageTree, runSkillTests, SkillInfo, SkillPackageTreeItem
} from '../api/skillApi';

interface Props {
  globalSkills: string[];
  chapterSkills: string[];
  onActivateSkill: (skillName: string) => void;
}

const typeColors: Record<string, string> = {
  writing: '#1976d2',
  research: '#7b1fa2',
  review: '#e65100',
  analysis: '#2e7d32',
  utility: '#6a1b9a',
  experiment: '#455a64',
  methodology: '#00695c',
  argumentation: '#bf360c',
};

const typeOrder = ['all', 'writing', 'research', 'experiment', 'review', 'analysis', 'methodology', 'argumentation', 'utility'];

export function SkillPanel({ globalSkills, chapterSkills, onActivateSkill }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillPrompts, setSkillPrompts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', display_name: '', description: '', type: 'writing', trigger: 'manual', prompt: '' });
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);
  const [packageTree, setPackageTree] = useState<SkillPackageTreeItem[]>([]);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testingSkill, setTestingSkill] = useState<string | null>(null);

  const refreshSkills = () => listSkills().then(setSkills).catch((err) => { console.error('Failed to load skills:', err); });

  useEffect(() => { refreshSkills(); }, []);

  const handleExpand = async (name: string) => {
    if (expandedSkill === name) {
      setExpandedSkill(null);
      return;
    }
    setExpandedSkill(name);
    if (!skillPrompts[name]) {
      const detail = await getSkill(name);
      setSkillPrompts(prev => ({ ...prev, [name]: detail.prompt || 'No prompt content' }));
    }
  };

  const handleCreate = async () => {
    if (!newSkill.name || !newSkill.prompt) return;
    await createSkill(newSkill);
    setNewSkill({ name: '', display_name: '', description: '', type: 'writing', trigger: 'manual', prompt: '' });
    setShowCreate(false);
    refreshSkills();
  };

  const handleDelete = async (name: string) => {
    await deleteSkill(name);
    refreshSkills();
  };

  const handleReload = async () => {
    await reloadSkills();
    refreshSkills();
  };

  /* ── GitHub Import ──────────────────────────────────────────── */

  const handleImportSkill = async () => {
    if (!importUrl.trim()) return;
    setImportStatus('Importing...');
    try {
      const result = await importSkillFromGitHub(importUrl.trim(), importName.trim() || undefined);
      if (result.skill) {
        setImportStatus(`Imported: ${result.skill.display_name || result.skill.name}`);
      } else {
        setImportStatus(`Import completed`);
      }
      setImportUrl('');
      setImportName('');
      setShowImport(false);
      refreshSkills();
    } catch (err: any) {
      setImportStatus(`Failed: ${err.message}`);
    }
  };

  const handleUpdateImported = async (name: string) => {
    setUpdatingSkill(name);
    try {
      await updateImportedSkill(name);
      refreshSkills();
    } catch (err: any) {
      console.error('Update failed:', err);
    } finally {
      setUpdatingSkill(null);
    }
  };

  const handleRemoveImported = async (name: string) => {
    await removeImportedSkill(name);
    refreshSkills();
  };

  const handleViewPackageTree = async (name: string) => {
    if (expandedPackage === name) {
      setExpandedPackage(null);
      setPackageTree([]);
      return;
    }
    setExpandedPackage(name);
    setExpandedSkill(name); // Also expand the detail
    try {
      const data = await getSkillPackageTree(name);
      setPackageTree(data.tree || []);
    } catch (err) {
      setPackageTree([]);
    }
  };

  const handleRunTests = async (name: string) => {
    setTestingSkill(name);
    try {
      const result = await runSkillTests(name);
      setTestResults(prev => ({ ...prev, [name]: result }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [name]: { error: err.message } }));
    } finally {
      setTestingSkill(null);
    }
  };

  const filtered = skills.filter(s => {
    if (filter !== 'all' && s.type !== filter) return false;
    if (search && !s.display_name?.toLowerCase().includes(search.toLowerCase()) && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isActive = (name: string) => globalSkills.includes(name) || chapterSkills.includes(name);

  const typeCounts: Record<string, number> = {};
  for (const s of skills) {
    const t = s.type || 'utility';
    typeCounts[t] = (typeCounts[t] || 0) + 1;
  }

  return (
    <div style={{ fontSize: '12px' }}>
      <div style={{ padding: '4px 8px', display: 'flex', gap: '4px' }}>
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, padding: '3px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box' }}
        />
        <button
          onClick={handleReload}
          title="Reload skills"
          style={{ padding: '3px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}
        >
          ↻
        </button>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #1976d2', borderRadius: '3px', background: showCreate ? '#1976d2' : '#fff', color: showCreate ? '#fff' : '#1976d2', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + Add
        </button>
        <button
          onClick={() => setShowImport(!showImport)}
          title="Import from GitHub"
          style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #7b1fa2', borderRadius: '3px', background: showImport ? '#7b1fa2' : '#fff', color: showImport ? '#fff' : '#7b1fa2', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          📦 Git
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: '8px', margin: '4px 8px', border: '1px solid #ddd', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ marginBottom: '6px' }}>
            <input placeholder="Skill name (slug)" value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))}
              style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', marginBottom: '4px' }} />
            <input placeholder="Display name" value={newSkill.display_name} onChange={e => setNewSkill(p => ({ ...p, display_name: e.target.value }))}
              style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', marginBottom: '4px' }} />
            <input placeholder="Description" value={newSkill.description} onChange={e => setNewSkill(p => ({ ...p, description: e.target.value }))}
              style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', marginBottom: '4px' }} />
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            <select value={newSkill.type} onChange={e => setNewSkill(p => ({ ...p, type: e.target.value }))}
              style={{ flex: 1, padding: '3px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px' }}>
              {typeOrder.filter(t => t !== 'all').map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={newSkill.trigger} onChange={e => setNewSkill(p => ({ ...p, trigger: e.target.value }))}
              style={{ flex: 1, padding: '3px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px' }}>
              <option value="manual">manual</option>
              <option value="auto">auto</option>
            </select>
          </div>
          <textarea placeholder="Prompt content..." value={newSkill.prompt} onChange={e => setNewSkill(p => ({ ...p, prompt: e.target.value }))}
            style={{ width: '100%', height: '80px', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: '4px', marginTop: '6px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleCreate} style={{ padding: '3px 8px', fontSize: '11px', border: 'none', borderRadius: '3px', background: '#1976d2', color: '#fff', cursor: 'pointer' }}>Save</button>
          </div>
        </div>
      )}

      {showImport && (
        <div style={{ padding: '8px', margin: '4px 8px', border: '1px solid #7b1fa2', borderRadius: '4px', background: '#fafafa' }}>
          <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '12px', color: '#7b1fa2' }}>
            📦 Import Skill from GitHub
          </div>
          <input
            placeholder="GitHub URL (e.g. https://github.com/owner/repo)"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', marginBottom: '4px' }}
          />
          <input
            placeholder="Optional: custom skill name (default: repo name)"
            value={importName}
            onChange={e => setImportName(e.target.value)}
            style={{ width: '100%', padding: '4px 6px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', boxSizing: 'border-box', marginBottom: '4px' }}
          />
          <div style={{ fontSize: '10px', color: '#888', marginBottom: '6px' }}>
            Supports: github.com/owner/repo, or owner/repo. Downloads SKILL.md + manifest.yaml + references/ + scripts/ + assets/ + tests/
          </div>
          {importStatus && (
            <div style={{ fontSize: '10px', color: importStatus.startsWith('Failed') ? '#d32f2f' : '#2e7d32', marginBottom: '4px' }}>
              {importStatus}
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowImport(false); setImportStatus(''); }} style={{ padding: '3px 8px', fontSize: '11px', border: '1px solid #ddd', borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleImportSkill} disabled={!importUrl.trim()} style={{ padding: '3px 8px', fontSize: '11px', border: 'none', borderRadius: '3px', background: '#7b1fa2', color: '#fff', cursor: importUrl.trim() ? 'pointer' : 'not-allowed', opacity: importUrl.trim() ? 1 : 0.6 }}>Import</button>
          </div>
        </div>
      )}

      {/* Tags toggle */}
      <div
        onClick={() => setTagsExpanded(!tagsExpanded)}
        style={{ padding: '3px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', userSelect: 'none', color: '#666', fontSize: '11px' }}
      >
        <span style={{ fontSize: '9px', transition: 'transform 0.15s', transform: tagsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', display: 'inline-block' }}>▶</span>
        <span>Tags</span>
        {filter !== 'all' && (
          <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: typeColors[filter] || '#999', color: '#fff', marginLeft: '4px' }}>
            {filter}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#aaa' }}>{filtered.length} skills</span>
      </div>

      {tagsExpanded && (
        <div style={{ padding: '4px 8px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
          {typeOrder.map(t => {
            const count = t === 'all' ? skills.length : (typeCounts[t] || 0);
            if (t !== 'all' && count === 0) return null;
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  padding: '2px 6px', fontSize: '10px', border: '1px solid #ddd',
                  borderRadius: '3px', cursor: 'pointer',
                  background: filter === t ? (typeColors[t] || '#1976d2') : '#fff',
                  color: filter === t ? '#fff' : '#333',
                  transition: 'all 0.15s',
                }}
              >
                {t}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ padding: '2px 8px', fontSize: '10px', color: '#888' }}>
        {globalSkills.length} active
      </div>

      <div style={{ maxHeight: '350px', overflow: 'auto' }}>
        {filtered.map(skill => (
          <div key={skill.name} style={{ borderBottom: '1px solid #f0f0f0' }}>
            <div
              style={{
                padding: '6px 8px', cursor: 'pointer',
                background: isActive(skill.name) ? '#e8f5e9' : 'transparent',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <div
                onClick={() => onActivateSkill(skill.name)}
                style={{
                  width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
                  border: isActive(skill.name) ? '2px solid #4caf50' : '2px solid #ccc',
                  background: isActive(skill.name) ? '#4caf50' : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: '10px', fontWeight: 'bold',
                }}
              >
                {isActive(skill.name) ? '✓' : ''}
              </div>
              <div style={{ flex: 1, minWidth: 0 }} onClick={() => onActivateSkill(skill.name)}>
                <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {skill.display_name || skill.name}
                  {skill.source === 'imported' && <span style={{ marginLeft: 4, fontSize: '9px', color: '#7b1fa2' }}>⬇</span>}
                </div>
                <div style={{ color: '#888', fontSize: '10px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {skill.description}
                </div>
                {skill.kind === 'package' && (
                  <div style={{ color: '#7b1fa2', fontSize: '9px', marginTop: '2px' }}>
                    package · {(skill.package?.fileCount?.references || skill.package?.references?.length || 0)} refs · {(skill.package?.fileCount?.scripts || skill.package?.scripts?.length || 0)} scripts · {(skill.package?.fileCount?.tests || skill.package?.tests?.length || 0)} tests
                  </div>
                )}
                {skill.importInfo && (
                  <div style={{ color: '#5c6bc0', fontSize: '9px', marginTop: '1px' }}>
                    {skill.importInfo.owner}/{skill.importInfo.repo}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '2px', background: typeColors[skill.type] || '#999', color: '#fff' }}>
                  {skill.type}
                </span>
                {skill.kind === 'package' && skill.source === 'imported' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleUpdateImported(skill.name); }}
                    disabled={updatingSkill === skill.name}
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '10px', padding: '0 2px', color: '#5c6bc0' }}
                    title="Update imported skill"
                  >
                    {updatingSkill === skill.name ? '…' : '↻'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleExpand(skill.name); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', padding: '0 2px', color: '#666' }}
                  title="View skill details"
                >
                  {expandedSkill === skill.name ? '▲' : '▼'}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(skill.name); }}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '11px', padding: '0 2px', color: '#d32f2f' }}
                  title="Delete skill"
                >
                  ×
                </button>
              </div>
            </div>
            {expandedSkill === skill.name && (
              <div style={{ padding: '6px 12px', background: '#f9f9f9', fontSize: '11px', color: '#444', borderTop: '1px solid #eee', maxHeight: '300px', overflow: 'auto' }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Prompt:</div>
                <div style={{ whiteSpace: 'pre-wrap', marginBottom: '8px' }}>{skillPrompts[skill.name] || 'Loading...'}</div>

                {/* Package details */}
                {skill.kind === 'package' && skill.package && (
                  <>
                    <div style={{ borderTop: '1px solid #ddd', margin: '6px 0' }} />
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleViewPackageTree(skill.name); }}
                        style={{ padding: '2px 6px', fontSize: '10px', border: '1px solid #7b1fa2', borderRadius: '3px', background: '#fff', color: '#7b1fa2', cursor: 'pointer' }}
                      >
                        {expandedPackage === skill.name ? 'Hide tree' : '📂 Package tree'}
                      </button>
                      {(skill.package.tests?.length || 0) > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRunTests(skill.name); }}
                          disabled={testingSkill === skill.name}
                          style={{ padding: '2px 6px', fontSize: '10px', border: '1px solid #2e7d32', borderRadius: '3px', background: '#fff', color: '#2e7d32', cursor: 'pointer' }}
                        >
                          {testingSkill === skill.name ? 'Running…' : '🧪 Run tests'}
                        </button>
                      )}
                      {skill.source === 'imported' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveImported(skill.name); }}
                          style={{ padding: '2px 6px', fontSize: '10px', border: '1px solid #d32f2f', borderRadius: '3px', background: '#fff', color: '#d32f2f', cursor: 'pointer' }}
                        >
                          Remove import
                        </button>
                      )}
                    </div>

                    {/* Package tree */}
                    {expandedPackage === skill.name && packageTree.length > 0 && (
                      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '3px', padding: '4px 8px', marginBottom: '6px', maxHeight: '150px', overflow: 'auto', fontSize: '10px', fontFamily: 'monospace' }}>
                        {packageTree.map((item, i) => (
                          <div key={i} style={{ color: item.type === 'dir' ? '#7b1fa2' : '#555' }}>
                            {item.type === 'dir' ? '📁' : '📄'} {item.path}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Test results */}
                    {testResults[skill.name] && (
                      <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '3px', padding: '4px 8px', fontSize: '10px' }}>
                        <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                          Test: {testResults[skill.name].message || testResults[skill.name].error}
                        </div>
                        {(testResults[skill.name].results || []).map((r: any, i: number) => (
                          <div key={i} style={{ color: r.status === 'passed' ? '#2e7d32' : r.status === 'failed' ? '#d32f2f' : '#888' }}>
                            {r.status === 'passed' ? '✓' : r.status === 'failed' ? '✗' : '–'} {r.file}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
