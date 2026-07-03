import React, { useState, useEffect } from 'react';
import {
  listSkills, getSkill, createSkill, deleteSkill, reloadSkills,
  importSkillFromGitHub, updateImportedSkill, removeImportedSkill,
  getSkillPackageTree, runSkillTests, SkillInfo, SkillPackageTreeItem
} from '../api/skillApi';
import { SKILL_CATEGORIES, t, generateSkillDescription, getLocalizedDisplayName, useGlobalLanguage, Language } from './SkillsSelector';

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
    name: '', display_name: '', description: '', type: 'writing', 
    categories: [] as string[], url: '', trigger: 'manual', prompt: '' 
  });
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
    setNewSkill({ name: '', display_name: '', description: '', type: 'writing', categories: [], url: '', trigger: 'manual', prompt: '' });
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
            <input placeholder={t({ zh: '简短描述', en: 'Short description' }, lang)} value={newSkill.description} onChange={e => setNewSkill(p => ({ ...p, description: e.target.value }))}
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
                if (expandedCategories.size === SKILL_CATEGORIES.length) {
                  setExpandedCategories(new Set());
                } else {
                  setExpandedCategories(new Set(SKILL_CATEGORIES.map(c => c.id)));
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
                {expandedCategories.size === SKILL_CATEGORIES.length ? '▼' : '▶'}
              </span>
            </div>

            {/* Collapsible category sections */}
            {SKILL_CATEGORIES.map(cat => {
              const catSkills = filteredSkills.filter(s => {
                const categories = s.categories?.length ? s.categories : [s.type];
                return categories.includes(cat.id);
              }).sort((a, b) => String(a.subcategory_zh || '').localeCompare(String(b.subcategory_zh || ''), 'zh-Hans-CN'));
              const isExpanded = expandedCategories.has(cat.id);

              if (catSkills.length === 0 && search) return null;

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
                    return (
                    <div key={skill.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <div
                        style={{
                          padding: '12px',
                          cursor: 'pointer',
                          background: isActive(skill.name) ? 'var(--accent-soft)' : 'transparent',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                        }}
                      >
                        {/* Toggle button */}
                        <div
                          onClick={() => onActivateSkill(skill.name)}
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
                            cursor: 'pointer',
                          }}
                        >
                          {isActive(skill.name) ? '✓' : ''}
                        </div>

                        {/* Skill info */}
                        <div style={{ flex: 1, minWidth: 0 }} onClick={() => onActivateSkill(skill.name)}>
                          <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{localizedName}</span>
                            {skill.source === 'imported' && (
                              <span style={{ fontSize: '9px', color: '#7b1fa2', background: 'rgba(123,31,162,0.1)', padding: '2px 6px', borderRadius: '3px' }}>
                                ⬇ GitHub
                              </span>
                            )}
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
                            onClick={(e) => { e.stopPropagation(); handleDelete(skill.name); }}
                            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '14px', padding: '4px', color: '#d32f2f' }}
                            title={t({ zh: '删除', en: 'Delete' }, lang)}
                          >
                            ×
                          </button>
                        </div>
                      </div>

                      {/* Expanded details */}
                      {expandedSkill === skill.name && (
                        <div style={{ padding: '12px', background: 'var(--bg-secondary)', fontSize: '11px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)' }}>
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
