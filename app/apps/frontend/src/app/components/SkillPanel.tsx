import React, { useState, useEffect } from 'react';
import {
  listSkills, getSkill, createSkill, deleteSkill, reloadSkills,
  importSkillFromGitHub, updateImportedSkill, removeImportedSkill,
  getSkillPackageTree, runSkillTests, dryRunSkill, SkillInfo, SkillPackageTreeItem
} from '../api/skillApi';
import { SKILL_CATEGORIES, getPopulatedSkillCategories, t, generateSkillDescription, getLocalizedDisplayName, useGlobalLanguage, getSkillReadinessPresentation, isSkillSelectable } from './SkillsSelector';

interface Props {
  globalSkills: string[];
  chapterSkills: string[];
  onActivateSkill: (skillName: string) => void;
}

export function SkillPanel({ globalSkills, chapterSkills, onActivateSkill }: Props) {
  const [lang, setLang] = useGlobalLanguage();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['writing']));
  const [expandedSkill, setExpandedSkill] = useState<string | null>(null);
  const [skillPrompts, setSkillPrompts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newSkill, setNewSkill] = useState({ 
    name: '', display_name: '', display_name_zh: '', description: '', description_zh: '', type: 'writing',
    categories: [] as string[], category_zh: '', subcategory: '', subcategory_zh: '',
    tags: [] as string[], url: '', trigger: 'manual', prompt: ''
  });
  const [importUrl, setImportUrl] = useState('');
  const [importName, setImportName] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [updatingSkill, setUpdatingSkill] = useState<string | null>(null);
  const [expandedPackage, setExpandedPackage] = useState<string | null>(null);
  const [packageTree, setPackageTree] = useState<SkillPackageTreeItem[]>([]);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [testingSkill, setTestingSkill] = useState<string | null>(null);
  const [checkingSkill, setCheckingSkill] = useState<string | null>(null);
  const [dryRunResults, setDryRunResults] = useState<Record<string, any>>({});
  const [operationStatus, setOperationStatus] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

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
    if (!newSkill.name || !newSkill.prompt) {
      setOperationStatus({ tone: 'error', text: t({ zh: '名称和 Prompt 不能为空。', en: 'Name and prompt are required.' }, lang) });
      return;
    }
    setOperationStatus(null);
    try {
      await createSkill(newSkill);
      setNewSkill({ name: '', display_name: '', display_name_zh: '', description: '', description_zh: '', type: 'writing', categories: [], category_zh: '', subcategory: '', subcategory_zh: '', tags: [], url: '', trigger: 'manual', prompt: '' });
      setShowCreate(false);
      setOperationStatus({ tone: 'success', text: t({ zh: 'Skill 已创建。', en: 'Skill created.' }, lang) });
      refreshSkills();
    } catch (err: any) {
      setOperationStatus({ tone: 'error', text: err?.message || t({ zh: '创建 Skill 失败。', en: 'Failed to create Skill.' }, lang) });
    }
  };

  const handleDelete = async (skill: SkillInfo) => {
    if (skill.source === 'builtin') {
      setOperationStatus({ tone: 'error', text: t({ zh: '内置 Skill 不能删除。', en: 'Built-in Skills cannot be deleted.' }, lang) });
      return;
    }
    const localizedName = getLocalizedDisplayName(skill, lang);
    if (!window.confirm(t({ zh: `确定删除 Skill“${localizedName}”吗？此操作不可撤销。`, en: `Delete Skill “${localizedName}”? This cannot be undone.` }, lang))) return;
    try {
      await deleteSkill(skill.name);
      setOperationStatus({ tone: 'success', text: t({ zh: 'Skill 已删除。', en: 'Skill deleted.' }, lang) });
      refreshSkills();
    } catch (err: any) {
      setOperationStatus({ tone: 'error', text: err?.message || t({ zh: '删除 Skill 失败。', en: 'Failed to delete Skill.' }, lang) });
    }
  };

  const handleReload = async () => {
    await reloadSkills();
    refreshSkills();
  };

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
    setExpandedSkill(name);
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

  const handleDryRun = async (name: string) => {
    setCheckingSkill(name);
    try {
      const result = await dryRunSkill(name);
      setDryRunResults(prev => ({ ...prev, [name]: result.skill.execution }));
      setSkills(prev => prev.map(skill => skill.name === name ? result.skill : skill));
    } catch (err: any) {
      setDryRunResults(prev => ({ ...prev, [name]: { error: err.message } }));
    } finally {
      setCheckingSkill(null);
    }
  };

  const toggleCategory = (catId: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(catId)) {
      newSet.delete(catId);
    } else {
      newSet.add(catId);
    }
    setExpandedCategories(newSet);
  };

  // Filter skills by search
  const filteredSkills = skills.filter(s => {
    if (!search) return true;
    const sName = `${s.display_name || ''} ${(s as any).display_name_zh || ''} ${s.name}`.toLowerCase();
    const desc = `${s.description || ''} ${s.description_zh || ''}`.toLowerCase();
    const metadata = `${(s.tags || []).join(' ')} ${(s as any).task_intents?.join(' ') || ''}`.toLowerCase();
    return sName.includes(search.toLowerCase()) || desc.includes(search.toLowerCase()) || metadata.includes(search.toLowerCase());
  });
  const visibleCategories = getPopulatedSkillCategories(filteredSkills);
  const allVisibleCategoriesExpanded = visibleCategories.length > 0
    && visibleCategories.every(category => expandedCategories.has(category.id));

  const isActive = (name: string) => globalSkills.includes(name) || chapterSkills.includes(name);

  return (
    <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border)' }}>
        {/* Language toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setLang('zh')}
            style={{
              padding: '4px 8px', fontSize: '10px', borderRadius: '4px', cursor: 'pointer',
              background: lang === 'zh' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: lang === 'zh' ? '#fff' : 'var(--text)',
              border: '1px solid ' + (lang === 'zh' ? 'var(--accent)' : 'var(--border)'),
            }}
          >
            中文
          </button>
          <button
            onClick={() => setLang('en')}
            style={{
              padding: '4px 8px', fontSize: '10px', borderRadius: '4px', cursor: 'pointer',
              background: lang === 'en' ? 'var(--accent)' : 'var(--bg-secondary)',
              color: lang === 'en' ? '#fff' : 'var(--text)',
              border: '1px solid ' + (lang === 'en' ? 'var(--accent)' : 'var(--border)'),
            }}
          >
            English
          </button>
        </div>

        {/* Search */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
          <input
            type="text"
            placeholder={t({ zh: '搜索 Skills...', en: 'Search Skills...' }, lang)}
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '8px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-secondary)', color: 'var(--text)' }}
          />
          <button
            onClick={handleReload}
            title={t({ zh: '重新加载', en: 'Reload' }, lang)}
            style={{ padding: '8px 12px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-secondary)', cursor: 'pointer' }}
          >
            ↻
          </button>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{ flex: 1, padding: '8px', fontSize: '11px', border: '1px solid #1976d2', borderRadius: '6px', background: showCreate ? '#1976d2' : 'transparent', color: showCreate ? '#fff' : '#1976d2', cursor: 'pointer' }}
          >
            + {t({ zh: '新建', en: 'Create' }, lang)}
          </button>
          <button
            onClick={() => setShowImport(!showImport)}
            style={{ flex: 1, padding: '8px', fontSize: '11px', border: '1px solid #7b1fa2', borderRadius: '6px', background: showImport ? '#7b1fa2' : 'transparent', color: showImport ? '#fff' : '#7b1fa2', cursor: 'pointer' }}
          >
            📦 {t({ zh: '导入', en: 'Import' }, lang)}
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px', color: '#1976d2' }}>
            {t({ zh: '创建新 Skill', en: 'Create New Skill' }, lang)}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <input placeholder={t({ zh: 'Skill 名称 (slug)', en: 'Skill name (slug)' }, lang)} value={newSkill.name} onChange={e => setNewSkill(p => ({ ...p, name: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
            <input placeholder={t({ zh: '显示名称', en: 'Display name' }, lang)} value={newSkill.display_name} onChange={e => setNewSkill(p => ({ ...p, display_name: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
            <input placeholder={t({ zh: '中文显示名称', en: 'Chinese display name' }, lang)} value={newSkill.display_name_zh} onChange={e => setNewSkill(p => ({ ...p, display_name_zh: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
            <input placeholder={t({ zh: '简短描述', en: 'Short description' }, lang)} value={newSkill.description} onChange={e => setNewSkill(p => ({ ...p, description: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
            <input placeholder={t({ zh: '中文描述', en: 'Chinese description' }, lang)} value={newSkill.description_zh} onChange={e => setNewSkill(p => ({ ...p, description_zh: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
            <input placeholder={t({ zh: 'URL (可选)', en: 'URL (optional)' }, lang)} value={newSkill.url} onChange={e => setNewSkill(p => ({ ...p, url: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '4px', background: 'var(--paper)' }} />
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '10px', color: 'var(--muted)', display: 'block', marginBottom: '4px' }}>{t({ zh: '分类 (可多选)', en: 'Categories (multi-select)' }, lang)}</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {SKILL_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => {
                    const cats = newSkill.categories.includes(cat.id) 
                      ? newSkill.categories.filter(c => c !== cat.id)
                      : [...newSkill.categories, cat.id];
                    setNewSkill(p => ({ ...p, categories: cats, type: cats[0] || 'utility' }));
                  }}
                  style={{
                    padding: '4px 10px', fontSize: '10px', border: '1px solid var(--border)',
                    borderRadius: '999px', cursor: 'pointer',
                    background: newSkill.categories.includes(cat.id) ? 'var(--accent)' : 'var(--paper)',
                    color: newSkill.categories.includes(cat.id) ? '#fff' : 'var(--text)',
                  }}
                >
                  {cat.icon} {t(cat.name, lang)}
                </button>
              ))}
            </div>
            <input placeholder={t({ zh: '中文分类名称（可选）', en: 'Chinese category label (optional)' }, lang)} value={newSkill.category_zh} onChange={e => setNewSkill(p => ({ ...p, category_zh: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginTop: '6px', background: 'var(--paper)' }} />
          </div>
          <textarea placeholder={t({ zh: 'Prompt 内容...', en: 'Prompt content...' }, lang)} value={newSkill.prompt} onChange={e => setNewSkill(p => ({ ...p, prompt: e.target.value }))}
            style={{ width: '100%', height: '80px', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical', background: 'var(--paper)' }} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 14px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--paper)', cursor: 'pointer' }}>{t({ zh: '取消', en: 'Cancel' }, lang)}</button>
            <button onClick={handleCreate} style={{ padding: '8px 14px', fontSize: '11px', border: 'none', borderRadius: '4px', background: '#1976d2', color: '#fff', cursor: 'pointer' }}>{t({ zh: '保存', en: 'Save' }, lang)}</button>
          </div>
        </div>
      )}

      {/* Import form */}
      {showImport && (
        <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '12px', color: '#7b1fa2' }}>
            📦 {t({ zh: '从 GitHub 导入', en: 'Import from GitHub' }, lang)}
          </div>
          <input
            placeholder={t({ zh: 'GitHub URL', en: 'GitHub URL' }, lang)}
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '6px', background: 'var(--paper)' }}
          />
          <input
            placeholder={t({ zh: '自定义名称 (可选)', en: 'Custom name (optional)' }, lang)}
            value={importName}
            onChange={e => setImportName(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', boxSizing: 'border-box', marginBottom: '6px', background: 'var(--paper)' }}
          />
          {importStatus && (
            <div style={{ fontSize: '10px', color: importStatus.startsWith('Failed') ? '#d32f2f' : '#2e7d32', marginBottom: '6px' }}>
              {importStatus}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowImport(false); setImportStatus(''); }} style={{ padding: '8px 14px', fontSize: '11px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--paper)', cursor: 'pointer' }}>{t({ zh: '取消', en: 'Cancel' }, lang)}</button>
            <button onClick={handleImportSkill} disabled={!importUrl.trim()} style={{ padding: '8px 14px', fontSize: '11px', border: 'none', borderRadius: '4px', background: '#7b1fa2', color: '#fff', cursor: importUrl.trim() ? 'pointer' : 'not-allowed', opacity: importUrl.trim() ? 1 : 0.6 }}>{t({ zh: '导入', en: 'Import' }, lang)}</button>
          </div>
        </div>
      )}

      {/* Skills list with collapsible categories */}
      {operationStatus && (
        <div role="status" style={{ padding: '8px 12px', color: operationStatus.tone === 'error' ? '#d32f2f' : '#2e7d32', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
          {operationStatus.text}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filteredSkills.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--muted)', fontSize: '12px' }}>
            {t({ zh: '暂无 Skills', en: 'No Skills found' }, lang)}
          </div>
        ) : (
          <>
            {/* Category summary - collapsible all */}
            <div 
              onClick={() => {
                if (allVisibleCategoriesExpanded) {
                  setExpandedCategories(current => {
                    const next = new Set(current);
                    visibleCategories.forEach(category => next.delete(category.id));
                    return next;
                  });
                } else {
                  setExpandedCategories(current => new Set([
                    ...current,
                    ...visibleCategories.map(category => category.id),
                  ]));
                }
              }}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>{t({ zh: '全部展开/折叠', en: 'Expand/Collapse All' }, lang)}</span>
              <span style={{ fontSize: '10px', color: 'var(--muted)' }}>
                {allVisibleCategoriesExpanded ? '▼' : '▶'}
              </span>
            </div>

            {/* Collapsible category sections */}
            {visibleCategories.map(cat => {
              const catSkills = filteredSkills.filter(s => {
                const categories = s.categories?.length ? s.categories : [s.type];
                return categories.includes(cat.id);
              }).sort((a, b) => String(a.subcategory_zh || '').localeCompare(String(b.subcategory_zh || ''), 'zh-Hans-CN'));
              const isExpanded = expandedCategories.has(cat.id);

              return (
                <div key={cat.id}>
                  {/* Category header */}
                  <div 
                    onClick={() => toggleCategory(cat.id)}
                    style={{
                      padding: '10px 12px',
                      cursor: 'pointer',
                      background: 'var(--bg-secondary)',
                      borderBottom: '1px solid var(--border)',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>{cat.icon}</span>
                      <span>{t(cat.name, lang)}</span>
                      <span style={{ fontSize: '10px', color: 'var(--muted)', fontWeight: 400 }}>
                        ({catSkills.length})
                      </span>
                    </span>
                    <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{isExpanded ? '▼' : '▶'}</span>
                  </div>

                  {/* Skills in this category */}
                  {isExpanded && catSkills.map(skill => {
                    const localizedName = getLocalizedDisplayName(skill, lang);
                    const readiness = getSkillReadinessPresentation(skill, lang);
                    const selectable = isSkillSelectable(skill);
                    const toggleSkill = () => { if (selectable) onActivateSkill(skill.name); };
                    return (
                    <div key={skill.name} data-testid={`skill-row-${skill.name}`} style={{ borderBottom: '1px solid var(--border)' }}>
                      <div
                        style={{
                          padding: '12px',
                          cursor: selectable ? 'pointer' : 'not-allowed',
                          opacity: selectable ? 1 : 0.66,
                          background: isActive(skill.name) ? 'var(--accent-soft)' : 'transparent',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        {/* Toggle button */}
                        <div
                          data-testid={`skill-toggle-${skill.name}`}
                          aria-disabled={!selectable}
                          onClick={toggleSkill}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '4px',
                            flexShrink: 0,
                            marginTop: '2px',
                            border: isActive(skill.name) ? '2px solid var(--accent)' : '2px solid var(--border)',
                            background: isActive(skill.name) ? 'var(--accent)' : 'var(--paper)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            cursor: selectable ? 'pointer' : 'not-allowed',
                          }}
                        >
                          {isActive(skill.name) ? '✓' : ''}
                        </div>

                        {/* Skill info */}
                        <div style={{ flex: 1, minWidth: 0 }} onClick={toggleSkill}>
                          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{localizedName}</span>
                            {skill.source === 'imported' && (
                              <span style={{ fontSize: '9px', color: '#7b1fa2', background: 'rgba(123,31,162,0.1)', padding: '2px 6px', borderRadius: '3px' }}>
                                ⬇ GitHub
                              </span>
                            )}
                            <span data-testid={`skill-readiness-${skill.name}`} style={{ fontSize: '9px', color: readiness.color, border: `1px solid ${readiness.color}`, padding: '1px 5px', borderRadius: '999px' }}>
                              {readiness.label}
                            </span>
                          </div>
                          <div style={{ fontSize: '9px', color: 'var(--accent)', marginBottom: '4px', fontWeight: 600 }}>
                            {lang === 'zh' ? skill.subcategory_zh : skill.subcategory}
                          </div>
                          
                          {/* Auto-generated or existing description */}
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', lineHeight: 1.4 }}>
                            {generateSkillDescription(skill, lang)}
                          </div>

                          {/* URL link */}
                          {skill.url && (
                            <a 
                              href={skill.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px', marginRight: '10px' }}
                            >
                              🔗 {t({ zh: '链接', en: 'Link' }, lang)}
                            </a>
                          )}
                          {skill.importInfo?.url && !skill.url && (
                            <a 
                              href={skill.importInfo.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                            >
                              🔗 GitHub
                            </a>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {skill.kind === 'package' && skill.source === 'imported' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateImported(skill.name); }}
                              disabled={updatingSkill === skill.name}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', padding: '4px', color: '#7b1fa2' }}
                              title={t({ zh: '更新', en: 'Update' }, lang)}
                            >
                              {updatingSkill === skill.name ? '…' : '↻'}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExpand(skill.name); }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '12px', padding: '4px', color: 'var(--muted)' }}
                            title={t({ zh: '详情', en: 'Details' }, lang)}
                          >
                            {expandedSkill === skill.name ? '▲' : '▼'}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); void handleDelete(skill); }}
                            disabled={skill.source === 'builtin'}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', color: '#d32f2f' }}
                            title={skill.source === 'builtin'
                              ? t({ zh: '内置 Skill 受保护', en: 'Built-in Skill is protected' }, lang)
                              : t({ zh: '删除', en: 'Delete' }, lang)}
                          >
                            {skill.source === 'builtin' ? '🔒' : '×'}
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedSkill === skill.name && (
                        <div style={{ padding: '12px', background: 'var(--bg-secondary)', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
                          <div style={{ marginBottom: '10px', padding: '8px', background: 'var(--paper)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <strong>{t({ zh: '执行就绪度', en: 'Execution readiness' }, lang)}</strong>
                              <span style={{ color: readiness.color }}>● {readiness.label}</span>
                            </div>
                            <div>{t({ zh: '费用级别', en: 'Cost class' }, lang)}: {skill.execution?.costClass || 'medium'}</div>
                            <div>{t({ zh: '副作用', en: 'Side effects' }, lang)}: {skill.execution?.sideEffects?.join(', ') || t({ zh: '未声明', en: 'None declared' }, lang)}</div>
                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border)' }}>
                              <strong>{t({ zh: '最近运行结果', en: 'Latest run' }, lang)}</strong>:{' '}
                              {skill.execution?.lastRun?.outcome === 'provider_completed'
                                ? t({ zh: 'Provider 已完成（目标尚未评估）', en: 'Provider completed (objective not evaluated)' }, lang)
                                : ['tests_passed', 'tests_failed', 'tests_skipped'].includes(skill.execution?.lastRun?.outcome || '')
                                  ? t({ zh: `包测试结果：${skill.execution?.lastRun?.outcome}`, en: `Package test result: ${skill.execution?.lastRun?.outcome}` }, lang)
                                : skill.execution?.lastRun?.outcome === 'provider_failed'
                                  ? t({ zh: 'Provider 执行失败', en: 'Provider failed' }, lang)
                                  : skill.execution?.lastRun?.outcome === 'provider_skipped'
                                    ? t({ zh: 'Provider 执行跳过', en: 'Provider skipped' }, lang)
                                    : t({ zh: '尚未运行', en: 'Not run' }, lang)}
                            </div>
                            {skill.execution?.lastRun?.objectiveStatus && (
                              <div>{t({ zh: '目标验证', en: 'Objective verification' }, lang)}: {skill.execution.lastRun.objectiveStatus}</div>
                            )}
                            {(skill.execution?.checks || []).map((check, index) => (
                              <div key={`${check.kind}-${check.name}-${index}`} style={{ color: check.status === 'missing' ? '#c62828' : ['unverified', 'needs-project'].includes(check.status) ? '#b26a00' : 'var(--muted)' }}>
                                {check.kind}: {check.name} — {check.status}
                              </div>
                            ))}
                            <button
                              onClick={(event) => { event.stopPropagation(); handleDryRun(skill.name); }}
                              disabled={checkingSkill === skill.name}
                              style={{ marginTop: '7px', padding: '5px 10px', fontSize: '10px', border: '1px solid var(--accent)', borderRadius: '4px', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
                            >
                              {checkingSkill === skill.name ? t({ zh: '检查中…', en: 'Checking…' }, lang) : t({ zh: '就绪检查', en: 'Readiness check' }, lang)}
                            </button>
                            {dryRunResults[skill.name] && (
                              <pre style={{ whiteSpace: 'pre-wrap', margin: '7px 0 0', fontSize: '10px' }}>{JSON.stringify(dryRunResults[skill.name], null, 2)}</pre>
                            )}
                          </div>
                          <div style={{ fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>{t({ zh: 'Prompt 内容:', en: 'Prompt Content:' }, lang)}</span>
                          </div>
                          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '12px', lineHeight: 1.6, background: 'var(--paper)', padding: '10px', borderRadius: '6px', maxHeight: '150px', overflow: 'auto' }}>
                            {skillPrompts[skill.name] || t({ zh: '加载中...', en: 'Loading...' }, lang)}
                          </div>

                          {skill.kind === 'package' && skill.package && (
                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleViewPackageTree(skill.name); }}
                                  style={{ padding: '6px 12px', fontSize: '10px', border: '1px solid #7b1fa2', borderRadius: '4px', background: 'transparent', color: '#7b1fa2', cursor: 'pointer' }}
                                >
                                  {expandedPackage === skill.name ? '📂 隐藏结构' : '📂 包结构'}
                                </button>
                                {(skill.package.tests?.length || 0) > 0 && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRunTests(skill.name); }}
                                    disabled={testingSkill === skill.name}
                                    style={{ padding: '6px 12px', fontSize: '10px', border: '1px solid #2e7d32', borderRadius: '4px', background: 'transparent', color: '#2e7d32', cursor: 'pointer' }}
                                  >
                                    {testingSkill === skill.name ? '🧪 运行中…' : '🧪 测试'}
                                  </button>
                                )}
                                {skill.source === 'imported' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleRemoveImported(skill.name); }}
                                    style={{ padding: '6px 12px', fontSize: '10px', border: '1px solid #d32f2f', borderRadius: '4px', background: 'transparent', color: '#d32f2f', cursor: 'pointer' }}
                                  >
                                    {t({ zh: '移除导入', en: 'Remove Import' }, lang)}
                                  </button>
                                )}
                              </div>

                              {expandedPackage === skill.name && packageTree.length > 0 && (
                                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--paper)', borderRadius: '4px', fontFamily: 'monospace', fontSize: '10px' }}>
                                  {packageTree.map((item, i) => (
                                    <div key={i} style={{ padding: '3px 0' }}>
                                      {item.type === 'dir' ? '📁' : '📄'} {item.path}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {testResults[skill.name] && (
                                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--paper)', borderRadius: '4px', fontSize: '10px' }}>
                                  <div style={{ fontWeight: 600, marginBottom: '6px' }}>
                                    {t({ zh: '测试结果:', en: 'Test Results:' }, lang)}
                                  </div>
                                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                                    {JSON.stringify(testResults[skill.name], null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
