import os
import re
import paramiko
from datetime import datetime
from models import Repository, Build, Project
from services.ssh_service import SSHService
from services.github_service import GitHubReleaseService

class DeploymentService:
    def __init__(self, db_session):
        self.db = db_session

    def deploy_build(self, build_id: int, repository_id: int, run_createrepo: bool = False, custom_path: str = None, override_base_path: str = None):
        """
        Deploys a build's artifacts to a repository.
        """
        build = self.db.query(Build).filter(Build.id == build_id).first()
        repo = self.db.query(Repository).filter(Repository.id == repository_id).first()
        
        if not build or not repo:
            return False, "Build or Repository not found"

        if not build.rpm_files:
            return False, "No artifacts to deploy"

        if getattr(repo, 'repo_type', 'ssh') == "github_releases":
            return self._deploy_to_github(build, repo)

        ssh = SSHService()
        try:
            # Connect
            connected, msg = ssh.connect(repo.host, repo.username, repo.password, repo.ssh_key_path)
            if not connected:
                return False, f"Connection failed: {msg}"
            
            logs = []
            logs.append(f"Connected to {repo.host}")
            
            # Determine target path
            # Use override_base_path (from per-distro repository_paths) if provided,
            # otherwise fall back to first configured path or /tmp/rpmworks-deploy
            if override_base_path:
                remote_path = override_base_path
            else:
                # Fallback: use first path from repo.paths if available
                from models import RepositoryPath
                first_path = self.db.query(RepositoryPath).filter(
                    RepositoryPath.repository_id == repo.id
                ).first()
                remote_path = first_path.base_path if first_path else "/tmp/rpmworks-deploy"

            if custom_path:
                # If custom path is relative, join with base. If absolute, use it.
                if custom_path.startswith('/'):
                    remote_path = custom_path
                else:
                    remote_path = os.path.join(remote_path, custom_path)
            
            logs.append(f"Target directory: {remote_path}")
            
            # Ensure directory exists
            # Helper to create dir via SSH
            mkdir_cmd = f"mkdir -p {remote_path}"
            stdin, stdout, stderr = ssh.client.exec_command(mkdir_cmd)
            err = stderr.read().decode().strip()
            if err:
                # Sometimes mkdir -p warns but succeeds? 
                # Let's assume critical failure if exit code != 0
                if stdout.channel.recv_exit_status() != 0:
                    raise Exception(f"Failed to create directory: {err}")
            
            # Upload files
            sftp = ssh.client.open_sftp()
            try:
                for local_file_path in build.rpm_files:
                    if not os.path.exists(local_file_path):
                        logs.append(f"Warning: Local file not found: {local_file_path}")
                        continue
                        
                    filename = os.path.basename(local_file_path)
                    remote_file_path = os.path.join(remote_path, filename) # posix path join
                    
                    logs.append(f"Uploading {filename}...")
                    sftp.put(local_file_path, remote_file_path)
                    logs.append(f"Uploaded {filename}")
            finally:
                sftp.close()
                
            # Run createrepo if requested
            if run_createrepo:
                logs.append("Running createrepo --update...")
                cmd = f"createrepo --update {remote_path}"
                stdin, stdout, stderr = ssh.client.exec_command(cmd)
                
                out_str = stdout.read().decode().strip()
                err_str = stderr.read().decode().strip()
                
                if out_str: logs.append(out_str)
                if err_str: logs.append(f"STDERR: {err_str}")
                
                if stdout.channel.recv_exit_status() != 0:
                    raise Exception("createrepo failed")
                else:
                    logs.append("createrepo finished successfully")
            
            return True, "\n".join(logs)
            
        except Exception as e:
            return False, f"Deployment Error: {str(e)}"
        finally:
            ssh.close()

    def _extract_github_tag(self, build: Build) -> str:
        """Derive a GitHub release tag from the RPM filename.
        e.g. rpmworks-1.0.0-15.el9.x86_64.rpm → v1.0.0-15
        Falls back to v{version} if the pattern doesn't match.
        """
        if build.rpm_files:
            fname = os.path.basename(build.rpm_files[0])
            m = re.search(r'-(\d[\d.]*)-(\d+)\.', fname)
            if m:
                return f"v{m.group(1)}-{m.group(2)}"
        return f"v{build.version or '0.0.0'}"

    def _deploy_to_github(self, build: Build, repo: Repository):
        """Upload build artifacts to a GitHub Release.

        Each build gets its own release tagged v{version}-{release_number}.
        Old releases beyond the project's max_builds limit are deleted
        automatically, with their download counts accumulated first.
        """
        logs = []

        if not repo.github_repo:
            return False, "GitHub repository not configured (missing github_repo)"
        if not repo.password:
            return False, "GitHub token not configured (missing token)"

        tag = self._extract_github_tag(build)
        logs.append(f"GitHub Releases: {repo.github_repo} — {tag}")

        try:
            svc = GitHubReleaseService(repo.github_repo, repo.password)

            # Check if this release already exists (multi-distro: second distro
            # uploads to the same release that the first distro already created)
            existing_releases = svc.list_releases()
            existing_tags = {r["tag_name"]: r for r in existing_releases}

            if tag not in existing_tags:
                # Snapshot total downloads across all existing releases.
                # Using max() ensures the counter never goes backward even when
                # old releases are deleted by the retention policy below.
                live_downloads = sum(
                    svc.get_release_downloads(r["id"]) for r in existing_releases
                )
                new_total = max(repo.github_downloads or 0, live_downloads)
                if new_total != (repo.github_downloads or 0):
                    logs.append(f"Download snapshot: {new_total} total")
                    repo.github_downloads = new_total
                    self.db.commit()

                # Apply retention: delete oldest releases beyond max_builds
                project = self.db.query(Project).filter(Project.id == build.project_id).first()
                max_releases = (project.max_builds if project else 10)

                if len(existing_releases) >= max_releases:
                    # GitHub returns releases newest-first; oldest are at the end
                    to_delete = existing_releases[max_releases - 1:]
                    for old_release in to_delete:
                        svc.delete_release(old_release["id"])
                        logs.append(f"Deleted old release {old_release['tag_name']} (retention policy)")
                    self.db.commit()

            release = svc.create_or_get_release(tag)
            release_id = release["id"]
            logs.append(f"Release {tag} ready (id={release_id})")

            for local_path in build.rpm_files:
                if not os.path.exists(local_path):
                    logs.append(f"Warning: file not found: {local_path}")
                    continue
                filename = os.path.basename(local_path)
                logs.append(f"Uploading {filename}...")
                svc.upload_asset(release_id, local_path)
                logs.append(f"Uploaded {filename}")

            logs.append("GitHub release upload complete.")
            return True, "\n".join(logs)

        except Exception as e:
            logs.append(f"Error: {e}")
            return False, "\n".join(logs)
