import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Loader2, FileCode, Info, CheckCircle } from 'lucide-react';
import { updateBuildConfig, fetchDistributions, validateSpec } from '../../services/api';

const SpecEditor = ({ project, onUpdate }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [distros, setDistros] = useState([]);
  const [config, setConfig] = useState({
    version: '1.0.0',
    release: '1',
    auto_increment_release: false,
    spec_template: '',
    build_arch: 'x86_64',
    target_distros: [],
    build_requires: []
  });
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    // Load available distributions
    const loadDistros = async () => {
        try {
            const data = await fetchDistributions();
            setDistros(data);
        } catch (err) {
            console.error("Failed to load distributions", err);
            // Fallback
            setDistros([
                {id: "almalinux:9", name: "AlmaLinux 9 (Fallback)"}
            ]);
        }
    };
    loadDistros();
  }, []);

  useEffect(() => {
    if (project?.build_config) {
      // Generate default spec if empty
      const defaultSpec = project.build_config.spec_template || `Name:           ${project.name}
Version:        ${project.build_config.version || '1.0.0'}
Release:        ${project.build_config.release || '1'}
Summary:        ${project.description || 'Auto-generated RPM package'}
License:        Proprietary
BuildArch:      ${project.build_config.build_arch || 'x86_64'}

%description
${project.description || 'No description provided.'}

%prep
# No prep needed as we put sources directly in SOURCES

%build
# Nothing to build, just copying files

%install
rm -rf %{buildroot}
# --- AUTOMATIC INSTALL START ---
# System will inject mkdir and cp commands here
# --- AUTOMATIC INSTALL END ---

%files
# --- AUTOMATIC FILES START ---
# System will inject file list here
# --- AUTOMATIC FILES END ---

# Scripts
%pre
# echo "Pre-install script"

%post
# echo "Post-install script"

%changelog
* ${new Date().toDateString()} Builder <builder@example.com> - ${project.build_config.version || '1.0.0'}-${project.build_config.release || '1'}
- Auto-generated build
`;

      setConfig({
        version: project.build_config.version || '1.0.0',
        release: project.build_config.release || '1',
        auto_increment_release: project.build_config.auto_increment_release || false,
        spec_template: defaultSpec,
        build_arch: project.build_config.build_arch || 'x86_64',
        target_distros: project.build_config.target_distros || [],
        build_requires: project.build_config.build_requires || [],
        // Preserve file mappings to avoid overwriting them
        file_mappings: project.build_config.file_mappings || [],

        rpm_name: project.build_config.rpm_name || '',

        use_extra_name_vars: project.build_config.use_extra_name_vars || false,
        timestamp_format: project.build_config.timestamp_format || '%y%m%d%H%M',
        extra_vars_target: project.build_config.extra_vars_target || 'name',

        // Raw spec mode - use spec as-is
        use_raw_spec: project.build_config.use_raw_spec || false
      });
    }
  }, [project]);

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleValidate = async () => {
      setValidating(true);
      setValidationResult(null);
      try {
          const res = await validateSpec(config.spec_template);
          setValidationResult(res);
      } catch (err) {
          setValidationResult({ valid: false, errors: [err.message] });
      } finally {
          setValidating(false);
      }
  };

  const handleSave = async () => {
    setLoading(true);
    setSuccessMsg('');
    try {
      const updated = await updateBuildConfig(project.id, config);
      if (onUpdate) onUpdate(updated);
      setSuccessMsg(t('specEditor.success'));
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (error) {
      console.error(error);
      alert(t('specEditor.failed') + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center gap-4">
        {successMsg && <span className="text-green-400 text-sm">{successMsg}</span>}
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('specEditor.saveConfig')}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Versioning */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-primary" />
            {t('specEditor.versioning')}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-muted mb-1">{t('specEditor.rpmName')}</label>
              {(() => {
                const RPM_NAME_RE = /^[a-zA-Z0-9._-]+$/;
                const effectiveName = config.rpm_name || project.name || '';
                const isInvalid = effectiveName && !RPM_NAME_RE.test(effectiveName);
                const isProjectNameInvalid = !config.rpm_name && project.name && !RPM_NAME_RE.test(project.name);
                return (
                  <>
                    <input
                      type="text"
                      value={config.rpm_name}
                      onChange={(e) => handleChange('rpm_name', e.target.value)}
                      className={`w-full bg-background border rounded-lg px-3 py-2 text-text focus:outline-none transition-colors ${
                        isInvalid ? 'border-red-500 focus:border-red-400' : 'border-border focus:border-primary'
                      }`}
                      placeholder={project.name}
                    />
                    {isInvalid ? (
                      <p className="text-[10px] text-red-400 mt-1">
                        {isProjectNameInvalid
                          ? t('specEditor.rpmNameProjectInvalid')
                          : t('specEditor.rpmNameValueInvalid')}
                      </p>
                    ) : (
                      <p className="text-[10px] text-text-muted mt-1">{t('specEditor.rpmNameHint')}</p>
                    )}
                  </>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('specEditor.version')}</label>
                <input
                  type="text"
                  value={config.version}
                  onChange={(e) => handleChange('version', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                  placeholder="1.0.0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('specEditor.release')}</label>
                <input
                  type="text"
                  value={config.release}
                  onChange={(e) => handleChange('release', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                  placeholder="1"
                />
                 <p className="text-[10px] text-text-muted mt-1">Tip: Use <code>%{'('}?dist{')'}</code> to insert dist suffix (e.g. .el9)</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="auto-inc"
                checked={config.auto_increment_release}
                onChange={(e) => handleChange('auto_increment_release', e.target.checked)}
                className="w-4 h-4 rounded border-border bg-background checked:bg-primary"
              />
              <label htmlFor="auto-inc" className="text-sm text-text">{t('specEditor.autoIncrement')}</label>
            </div>

            <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('specEditor.architecture')}</label>
                <select
                  value={config.build_arch}
                  onChange={(e) => handleChange('build_arch', e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
                >
                    <option value="x86_64">x86_64</option>
                    <option value="noarch">noarch</option>
                    <option value="aarch64">aarch64</option>
                </select>
            </div>

            <div>
                <label className="block text-sm font-medium text-text-muted mb-1">{t('specEditor.targetDistros')}</label>
                {distros.length === 0 ? (
                    <p className="text-xs text-text-muted">{t('specEditor.noDistrosAvailable', 'No distributions available')}</p>
                ) : (
                    <div className="space-y-2 bg-background border border-border rounded-lg p-3 max-h-40 overflow-y-auto">
                        {distros.map(d => (
                            <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={(config.target_distros || []).includes(d.id)}
                                    onChange={(e) => {
                                        const current = config.target_distros || [];
                                        if (e.target.checked) {
                                            handleChange('target_distros', [...current, d.id]);
                                        } else {
                                            handleChange('target_distros', current.filter(id => id !== d.id));
                                        }
                                    }}
                                    className="w-4 h-4 rounded border-border bg-background checked:bg-primary"
                                />
                                <span className="text-sm text-text">{d.name}</span>
                            </label>
                        ))}
                    </div>
                )}
                {(config.target_distros || []).length === 0 && (
                    <p className="text-xs text-yellow-400 mt-1">{t('specEditor.noDistrosSelected')}</p>
                )}
            </div>
            
            <div className="pt-4 border-t border-border mt-4">
                 <h4 className="text-sm font-semibold text-white mb-2">Advanced Naming</h4>
                 <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="use-extra-vars"
                        checked={config.use_extra_name_vars}
                        onChange={(e) => handleChange('use_extra_name_vars', e.target.checked)}
                        className="w-4 h-4 rounded border-border bg-background checked:bg-primary"
                      />
                      <label htmlFor="use-extra-vars" className="text-sm text-text">Enable Dynamic Variables (Script + Timestamp)</label>
                    </div>
                    
                    {config.use_extra_name_vars && (
                        <>
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">{t('specEditor.extraVarsTarget')}</label>
                            <select
                              value={config.extra_vars_target}
                              onChange={(e) => handleChange('extra_vars_target', e.target.value)}
                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary"
                            >
                                <option value="name">{t('specEditor.extraVarsTargetName')}</option>
                                <option value="version">{t('specEditor.extraVarsTargetVersion')}</option>
                            </select>
                        </div>
                        {config.extra_vars_target === 'version' && (
                            <div className="bg-background/50 border border-border/50 rounded p-2.5 text-xs text-text-muted space-y-1">
                                <p className="font-medium text-text">{t('specEditor.extraVarsVersionHint')}</p>
                                <p>{t('specEditor.extraVarsVersionExample')}</p>
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-text-muted mb-1">{t('specEditor.timestampFormat')}</label>
                            <input
                              type="text"
                              value={config.timestamp_format}
                              onChange={(e) => handleChange('timestamp_format', e.target.value)}
                              className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm text-text focus:outline-none focus:border-primary"
                              placeholder="%y%m%d%H%M"
                            />
                            <p className="text-[10px] text-text-muted mt-1">Example: %y%m%d%H%M → {new Date().toISOString().slice(2,4)}12191700</p>
                        </div>
                        </>
                    )}
                 </div>
            </div>
          </div>
        </div>

        {/* Info / Help */}
        <div className="bg-surface border border-border rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-4">{t('specEditor.buildInfo')}</h3>
            <p className="text-sm text-text-muted mb-4">
                {t('specEditor.buildInfoDesc')}
            </p>
            <div className="text-xs font-mono bg-background p-3 rounded border border-border/50 text-text-muted">
                %define name {project.name}<br/>
                %define version {config.version}<br/>
                %define release {config.release}
            </div>
        </div>
      </div>

      {/* Raw Spec Mode Toggle */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="use-raw-spec"
            checked={config.use_raw_spec}
            onChange={(e) => handleChange('use_raw_spec', e.target.checked)}
            className="w-4 h-4 mt-1 rounded border-border bg-background checked:bg-primary"
          />
          <div>
            <label htmlFor="use-raw-spec" className="text-sm font-medium text-white cursor-pointer">
              {t('specEditor.useRawSpec')}
            </label>
            <p className="text-xs text-text-muted mt-1">
              {t('specEditor.useRawSpecHint')}
            </p>
          </div>
        </div>
      </div>

      {/* Spec File Editor */}
      <div className="bg-surface border border-border rounded-xl flex flex-col h-[500px]">
        <div className="flex justify-between items-center p-4 border-b border-border bg-background/50">
          <div className="flex items-center gap-2">
            <FileCode className="w-5 h-5 text-orange-400" />
            <h3 className="font-semibold text-white">{t('specEditor.specFile')}</h3>
            {config.use_raw_spec && (
              <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded">RAW</span>
            )}
          </div>
          <div className="flex items-center gap-4">
             {successMsg && <span className="text-green-400 text-sm animate-fade-in">{successMsg}</span>}
             
             <button
                onClick={handleValidate}
                disabled={validating || !config.spec_template}
                className="flex items-center gap-2 px-4 py-2 bg-surface-hover hover:bg-surface border border-border text-text rounded-lg transition-colors disabled:opacity-50"
             >
                {validating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                {t('specEditor.validate')}
             </button>

             <button
                onClick={handleSave}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
             >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t('specEditor.saveConfig')}
             </button>
          </div>
        </div>
        
        {validationResult && (
            <div className={`p-2 border-b border-border text-xs font-mono ${validationResult.valid ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {validationResult.valid ? (
                    <div className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3" /> {t('specEditor.syntaxOk')}
                    </div>
                ) : (
                    <ul className="list-disc list-inside">
                        {validationResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                )}
            </div>
        )}

        <textarea
          value={config.spec_template}
          onChange={(e) => handleChange('spec_template', e.target.value)}
          className="flex-1 bg-[#1e1e1e] text-gray-300 font-mono p-4 resize-none focus:outline-none text-sm leading-relaxed"
          spellCheck="false"
        />
      </div>
    </div>
  );
};

export default SpecEditor;
