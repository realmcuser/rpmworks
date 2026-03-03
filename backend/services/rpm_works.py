import os
import subprocess
import shutil
import time
import re
from typing import List
from models import Project, BuildConfig, Build, Distribution
from services.ssh_service import SSHService

BUILD_ROOT = os.getenv("WORKSPACE_DIR", os.path.abspath("build-workspace"))

class RPMWorks:
    def __init__(self):
        os.makedirs(BUILD_ROOT, exist_ok=True)

    def _prepare_directory(self, build_id):
        path = os.path.join(BUILD_ROOT, str(build_id))
        if os.path.exists(path):
            shutil.rmtree(path)
        
        # Create standard RPM build structure
        for d in ['BUILD', 'RPMS', 'SOURCES', 'SPECS', 'SRPMS', 'src']:
            os.makedirs(os.path.join(path, d), exist_ok=True)
            
        return path

    def _generate_spec_file(self, project: Project, build_config: BuildConfig, build_dir: str, name_suffix: str = "", dist_suffix: str = "", remote_val: str = "", ts_val: str = ""):
        # Use rpm_name if set, otherwise fall back to project.name
        effective_name = build_config.rpm_name or project.name
        spec_path = os.path.join(build_dir, 'SPECS', f"{effective_name}.spec")

        # RAW SPEC MODE: Use spec template as-is without any auto-injection
        # But still apply version/release from UI fields, name_suffix and dist_suffix
        if build_config.use_raw_spec and build_config.spec_template:
            spec_content = build_config.spec_template

            # Apply rpm_name override if set
            if build_config.rpm_name:
                spec_content = re.sub(r"^(Name:\s*).*$", f"Name:           {build_config.rpm_name}", spec_content, flags=re.MULTILINE)

            # Apply version from UI field
            if build_config.version:
                ver_val = build_config.version
                # Replace dynamic placeholders in version
                if remote_val or ts_val:
                    ver_val = ver_val.replace("%(remote)", remote_val).replace("%(timestamp)", ts_val)
                spec_content = re.sub(r"^(Version:\s*).*$", f"Version:        {ver_val}", spec_content, flags=re.MULTILINE)

            # Apply release from UI field (with %(?dist) replacement)
            if build_config.release:
                rel_val = build_config.release
                # Replace dynamic placeholders in release
                if remote_val or ts_val:
                    rel_val = rel_val.replace("%(remote)", remote_val).replace("%(timestamp)", ts_val)
                if "%(?dist)" in rel_val and dist_suffix:
                    rel_val = rel_val.replace("%(?dist)", dist_suffix)
                spec_content = re.sub(r"^(Release:\s*).*$", f"Release:        {rel_val}", spec_content, flags=re.MULTILINE)

            # Apply name suffix (from remote command + timestamp)
            if name_suffix:
                spec_content = re.sub(r"^(Name:\s*)(.*)$", f"\\1\\2{name_suffix}", spec_content, flags=re.MULTILINE)

            with open(spec_path, 'w') as f:
                f.write(spec_content)
            return spec_path

        # Default mappings to file list if empty (fallback)
        mappings = build_config.file_mappings
        install_cmds = []
        files_list = []
        
        if not mappings and project.source_config.include_patterns:
            # Fallback: Just copy everything to /opt/<project_name>
            for pattern in project.source_config.include_patterns:
                # Naive assumption: pattern is a file or dir name
                # FIX: Create parent directory first!
                target_dir = f"/opt/{project.name}"
                pattern_in_sources = pattern.lstrip('/') if os.path.isabs(pattern) else pattern
                install_cmds.append(f"mkdir -p %{{buildroot}}{target_dir} && cp -r %{{_sourcedir}}/{pattern_in_sources} %{{buildroot}}{target_dir}/")
                files_list.append(f"{target_dir}/{os.path.basename(pattern)}")
        
        else:
            # Use mappings
            for m in mappings:
                src = m.get('source')
                tgt = m.get('target')
                mode = m.get('mode', '0644')
                
                # For directory entries: just create the directory, no file to copy.
                # The user may add these to create empty dirs in the installed system.
                if m.get('type') == 'dir':
                    install_cmds.append(f"mkdir -p %{{buildroot}}{tgt}")
                else:
                    # Absolute source paths are stored in SOURCES as basename only
                    # e.g. /etc/cron.d/nordsend -> SOURCES/nordsend
                    src_in_sources = os.path.basename(src) if os.path.isabs(src) else src
                    cmd = f"mkdir -p $(dirname %{{buildroot}}{tgt}) && cp -r %{{_sourcedir}}/{src_in_sources} %{{buildroot}}{tgt}"
                    install_cmds.append(cmd)
                
                # Generate %files entry
                # %attr(mode, user, group) target
                attr = f"%attr({mode}, {m.get('user', 'root')}, {m.get('group', 'root')})"
                
                type_flag = ""
                if m.get('type') == 'config': type_flag = "%config "
                elif m.get('type') == 'config_noreplace': type_flag = "%config(noreplace) "
                elif m.get('type') == 'doc': type_flag = "%doc "
                elif m.get('type') == 'license': type_flag = "%license "
                elif m.get('type') == 'dir': type_flag = "%dir "
                
                files_list.append(f"{attr} {type_flag}{tgt}")

        # Use Template from DB or Fallback
        template = build_config.spec_template

        # Prepare Version and Release values
        ver_val = build_config.version or '1.0.0'
        rel_val = build_config.release or '1'
        # Replace dynamic placeholders in version/release
        if remote_val or ts_val:
            ver_val = ver_val.replace("%(remote)", remote_val).replace("%(timestamp)", ts_val)
            rel_val = rel_val.replace("%(remote)", remote_val).replace("%(timestamp)", ts_val)
        if "%(?dist)" in rel_val:
            rel_val = rel_val.replace("%(?dist)", dist_suffix)
        
        if not template or not template.strip():
            # Basic Spec Template (Fallback)
            template = f"""
Name:           {effective_name}
Version:        {ver_val}
Release:        {rel_val}
Summary:        {project.description or 'Auto-generated RPM package'}
License:        Proprietary
BuildArch:      {build_config.build_arch}

%description
{project.description or 'No description'}

%prep
# No prep needed as we put sources directly in SOURCES

%build
# Nothing to build, just copying files

%install
rm -rf %{{buildroot}}
# --- AUTOMATIC INSTALL START ---
# --- AUTOMATIC INSTALL END ---

%files
# --- AUTOMATIC FILES START ---
# --- AUTOMATIC FILES END ---

%changelog
* {time.strftime("%a %b %d %Y")} RPM Works <builder@example.com> - {ver_val}-{rel_val}
- Auto-generated build
"""
        else:
            # Update Version and Release in existing template
            # Look for "Version: ..." and "Release: ..." lines
            if build_config.rpm_name:
                template = re.sub(r"^(Name:\s*).*$", f"Name:           {build_config.rpm_name}", template, flags=re.MULTILINE)

            if build_config.version:
                template = re.sub(r"^(Version:\s*).*$", f"Version:        {ver_val}", template, flags=re.MULTILINE)

            if build_config.release:
                template = re.sub(r"^(Release:\s*).*$", f"Release:        {rel_val}", template, flags=re.MULTILINE)

            # Add a correct changelog entry at the top of %changelog for raw specs
            if "%changelog" in template:
                changelog_entry = (
                    f"* {time.strftime('%a %b %d %Y')} RPM Works <builder@example.com> - "
                    f"{ver_val}-{rel_val}\n"
                    f"- Build via RPM Works"
                )
                template = re.sub(
                    r"^(%changelog)\s*\n",
                    f"\\1\n{changelog_entry}\n\n",
                    template,
                    flags=re.MULTILINE
                )

        if name_suffix:
            # We need to append the suffix to the Name field in the spec file
            # Look for "Name: ..."
            template = re.sub(r"^(Name:\s*)(.*)$", f"\\1\\2{name_suffix}", template, flags=re.MULTILINE)

        # Helper to ensure placeholders exist in user template
        if "%install" in template and "# --- AUTOMATIC INSTALL START ---" not in template:
             # Heuristic: If rm -rf %{buildroot} exists, inject AFTER it.
             # This prevents us from injecting code that gets immediately deleted.
             if "rm -rf %{buildroot}" in template:
                 # Replace the LAST occurrence to be safe? usually only one in install.
                 # Let's just replace the string.
                 template = template.replace("rm -rf %{buildroot}", "rm -rf %{buildroot}\n# --- AUTOMATIC INSTALL START ---")
             else:
                 # No clean command found, inject at start of section
                 template = template.replace("%install", "%install\n# --- AUTOMATIC INSTALL START ---")

        if "%files" in template and "# --- AUTOMATIC FILES START ---" not in template:
             template = template.replace("%files", "%files\n# --- AUTOMATIC FILES START ---")

        # Inject Install Commands
        install_script = "\n".join([f"{cmd}" for cmd in install_cmds])
        
        if "%install" in template:
            # Append to %install
            if "# --- AUTOMATIC INSTALL START ---" in template:
                 # Ensure we also have the END tag or just insert
                 template = template.replace("# --- AUTOMATIC INSTALL START ---", f"# --- AUTOMATIC INSTALL START ---\nmkdir -p %{{buildroot}}\n{install_script}")
            else:
                 # Should be caught by helper above, but fallback:
                 template = template.replace("%install", f"%install\nrm -rf %{{buildroot}}\nmkdir -p %{{buildroot}}\n{install_script}")
        else:
            # No %install section, append it
            template += f"\n\n%install\nrm -rf %{{buildroot}}\nmkdir -p %{{buildroot}}\n{install_script}"

        # Inject Files List
        files_script = "\n".join([f"{line}" for line in files_list])
        
        if "%files" in template:
             if "# --- AUTOMATIC FILES START ---" in template:
                 template = template.replace("# --- AUTOMATIC FILES START ---", f"# --- AUTOMATIC FILES START ---\n{files_script}")
             else:
                 template = template.replace("%files", f"%files\n{files_script}")
        else:
             template += f"\n\n%files\n{files_script}"

        spec_content = template
        with open(spec_path, 'w') as f:
            f.write(spec_content)
            
        return spec_path

    def start_build(self, build_id: int, project_id: int, SessionLocal):
        db_session = SessionLocal()
        try:
            # Fetch existing build and project
            new_build = db_session.query(Build).filter(Build.id == build_id).first()
            project = db_session.query(Project).filter(Project.id == project_id).first()
            
            if not new_build:
                print(f"Build {build_id} not found.")
                return
            if not project:
                print(f"Project {project_id} not found for build.")
                return

            log = []
            
            def log_msg(msg):
                timestamp = time.strftime("%H:%M:%S")
                line = f"[{timestamp}] {msg}"
                print(line)
                log.append(line)
                # Update DB periodically (in real app streaming is better)
                new_build.build_log = "\n".join(log)
                db_session.commit()

            try:
                log_msg(f"Starting build for {project.name}...")

                
                # 2. Prepare Workspace
                build_dir = self._prepare_directory(new_build.id)
                log_msg(f"Workspace prepared at {build_dir}")
                
                # 3. Fetch Source
                ssh = SSHService()
                connected, msg = ssh.connect(
                    project.source_config.host,
                    project.source_config.username,
                    project.source_config.password,
                    project.source_config.ssh_key_path
                )
                
                if not connected:
                    raise Exception(f"SSH Connection failed: {msg}")

                log_msg(f"Connected to {project.source_config.host}.")

                # 3.1 Run pre-fetch script if configured
                if project.source_config.pre_fetch_script:
                    log_msg(f"Running pre-fetch script...")
                    cwd = project.source_config.path
                    code, out, err = ssh.execute_command(project.source_config.pre_fetch_script, cwd=cwd)

                    if out:
                        log_msg(f"Pre-fetch output:\n{out}")
                    if err:
                        log_msg(f"Pre-fetch stderr:\n{err}")

                    if code != 0:
                        raise Exception(f"Pre-fetch script failed (exit code {code})")

                    log_msg("Pre-fetch script completed successfully.")

                log_msg("Downloading sources...")

                sources_dir = os.path.join(build_dir, 'SOURCES')

                ssh.fetch_paths(
                    project.source_config.include_patterns,
                    sources_dir,
                    project.source_config.path
                )
                ssh.close()
                log_msg("Source download complete.")
                
                # 3.5 Extra Name Variables (Remote Command & Timestamp)
                name_suffix = ""
                remote_val = ""
                ts_val = ""
                if project.build_config.use_extra_name_vars:
                    log_msg("Extra name variables enabled.")
                    extra_target = project.build_config.extra_vars_target or "name"
                    log_msg(f"Dynamic variables target: {extra_target}")

                    # Remote Command
                    if project.source_config.remote_command:
                        log_msg(f"Executing remote command: {project.source_config.remote_command}")
                        # Re-connect since we closed it (optimization: keep open?)
                        ssh = SSHService()
                        connected, msg = ssh.connect(
                            project.source_config.host,
                            project.source_config.username,
                            project.source_config.password,
                            project.source_config.ssh_key_path
                        )
                        if connected:
                            # Run in the source directory if possible, or home
                            cwd = project.source_config.path
                            code, out, err = ssh.execute_command(project.source_config.remote_command, cwd=cwd)
                            ssh.close()

                            if code == 0:
                                remote_val = out.strip()
                                log_msg(f"Remote command output: {remote_val}")
                            else:
                                log_msg(f"Remote command failed (code {code}): {err}")
                                raise Exception(f"Remote command failed: {err}")
                        else:
                             raise Exception(f"Could not connect for remote command: {msg}")

                    # Timestamp
                    fmt = project.build_config.timestamp_format or "%y%m%d%H%M"
                    ts_val = time.strftime(fmt)
                    log_msg(f"Timestamp generated: {ts_val}")

                    if extra_target == "name":
                        # Original behavior: append to package Name
                        parts = []
                        if remote_val: parts.append(remote_val)
                        if ts_val: parts.append(ts_val)

                        if parts:
                            name_suffix = "-" + "-".join(parts)
                            log_msg(f"Generated name suffix: {name_suffix}")
                    else:
                        # "version" mode: pass values for %(remote)/%(timestamp) placeholder replacement
                        log_msg(f"Will replace %(remote) and %(timestamp) placeholders in Version/Release")

                # Fetch dist_suffix from build's target_distro
                dist_suffix = ""
                if new_build.target_distro:
                     dist = db_session.query(Distribution).filter(Distribution.id == new_build.target_distro).first()
                     if dist and dist.dist_suffix:
                         dist_suffix = dist.dist_suffix
                         log_msg(f"Using distribution suffix: {dist_suffix}")

                # 4. Generate Spec
                log_msg("Generating SPEC file...")
                spec_path = self._generate_spec_file(project, project.build_config, build_dir, name_suffix, dist_suffix, remote_val, ts_val)
                log_msg(f"SPEC file created at {spec_path}")
                
                # 5. Run rpmbuild via Podman
                # We mount the build directory to /root/rpmbuild in the container
                # The container needs rpm-build installed.
                
                container_image = new_build.target_distro if new_build.target_distro else "almalinux:9"
                container_build_dir = "/root/rpmbuild"
                
                # Install dependencies script
                # 1. rpm-build
                # 2. user specified build_requires
                deps = ["rpm-build", "systemd-rpm-macros"]
                # epel-release is useful for RHEL-based distros but doesn't exist on Fedora
                if not container_image.startswith("fedora"):
                    deps.append("epel-release")
                if project.build_config.build_requires:
                    deps.extend(project.build_config.build_requires)
                
                install_cmd = f"dnf install -y {' '.join(deps)}"
                
                # RPMBuild command
                # We need to point to the spec file INSIDE the container
                spec_filename = os.path.basename(spec_path)
                container_spec_path = f"{container_build_dir}/SPECS/{spec_filename}"
                
                build_cmd = f"rpmbuild -bb {container_spec_path}"
                
                # Combined command
                full_container_cmd = f"{install_cmd} && {build_cmd}"
                
                # Use persistent storage for podman images so they are cached between restarts
                # usually /data/podman-storage in the container
                storage_root = os.path.join(os.path.dirname(BUILD_ROOT), "podman-storage")
                os.makedirs(storage_root, exist_ok=True)

                # Use a fixed runroot in /tmp to avoid stale boot ID errors after reboots.
                # /tmp is tmpfs and gets cleared on reboot, so no stale boot ID state.
                # Must be fixed (not per-build) to match what the shared --root storage DB expects.
                run_root = "/tmp/podman-run-rpmworks"
                os.makedirs(run_root, exist_ok=True)

                podman_cmd = [
                    "podman",
                    "--root", storage_root,
                    "--runroot", run_root,
                    "run", "--rm",
                    "--storage-driver=vfs",
                    "--network=host",
                    "-v", f"{build_dir}:{container_build_dir}:Z",
                    container_image,
                    "/bin/bash", "-c", full_container_cmd
                ]
                
                log_msg(f"Launching Podman container: {container_image}")
                log_msg(f"Command: {full_container_cmd}")
                
                process = subprocess.Popen(
                    podman_cmd, 
                    stdout=subprocess.PIPE, 
                    stderr=subprocess.PIPE,
                    text=True
                )
                
                stdout, stderr = process.communicate()
                
                if stdout: log_msg(stdout)
                if stderr: log_msg(stderr)
                
                if process.returncode == 0:
                    log_msg("Build SUCCESS!")
                    new_build.status = "success"
                    project.status = "success"
                    
                    rpms_dir = os.path.join(build_dir, 'RPMS')
                    rpm_files = []
                    for root, dirs, files in os.walk(rpms_dir):
                        for file in files:
                            if file.endswith(".rpm"):
                                rpm_files.append(os.path.join(root, file))
                    
                    new_build.rpm_files = rpm_files
                    log_msg(f"Generated packages: {', '.join([os.path.basename(f) for f in rpm_files])}")
                    
                else:
                    log_msg("Build FAILED.")
                    new_build.status = "failed"
                    project.status = "failed"
                    
            except Exception as e:
                log_msg(f"CRITICAL ERROR: {str(e)}")
                new_build.status = "failed"
                project.status = "failed"
            
            finally:
                new_build.completed_at = time.strftime("%Y-%m-%d %H:%M:%S")
                new_build.build_log = "\n".join(log)
                db_session.commit()
                
        except Exception as outer_e:
            print(f"Database error in build task: {outer_e}")
        finally:
            db_session.close()
