import os
import paramiko
from datetime import datetime
from models import Repository, Build
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

    def _deploy_to_github(self, build: Build, repo: Repository):
        """Upload build artifacts to a GitHub Release."""
        logs = []

        if not repo.github_repo:
            return False, "GitHub repository not configured (missing github_repo)"
        if not repo.password:
            return False, "GitHub token not configured (missing token)"

        version = build.version or "0.0.0"
        logs.append(f"GitHub Releases: {repo.github_repo} — v{version}")

        try:
            svc = GitHubReleaseService(repo.github_repo, repo.password)

            release = svc.create_or_get_release(version)
            release_id = release["id"]
            logs.append(f"Release v{version} ready (id={release_id})")

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
