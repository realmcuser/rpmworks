import paramiko
import stat
from typing import List, Dict, Optional
import os

class SSHService:
    def __init__(self):
        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    def connect(self, host: str, username: str, password: Optional[str] = None, key_path: Optional[str] = None):
        """
        Connect to a remote server via SSH.
        Supports password auth, key file auth, or default system keys.
        """
        try:
            connect_args = {
                'hostname': host,
                'username': username,
                'timeout': 10
            }

            if password:
                connect_args['password'] = password
            elif key_path and os.path.exists(key_path):
                connect_args['key_filename'] = key_path
            # If neither password nor key_path is provided, paramiko looks for system keys (~/.ssh/id_rsa)
            
            self.client.connect(**connect_args)
            return True, "Connected successfully"
        except paramiko.AuthenticationException:
            return False, "Authentication failed. Check credentials."
        except paramiko.SSHException as e:
            return False, f"SSH error: {str(e)}"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    def list_files(self, path: str) -> List[Dict]:
        """
        List files in a remote directory.
        Returns a simplified structure compatible with the frontend FileSelector.
        """
        if not self.client.get_transport() or not self.client.get_transport().is_active():
            raise Exception("Not connected")

        sftp = self.client.open_sftp()
        try:
            file_list = []
            try:
                # Iterate over entries in the directory
                for entry in sftp.listdir_attr(path):
                    is_dir = stat.S_ISDIR(entry.st_mode)
                    file_list.append({
                        "name": entry.filename,
                        "type": "directory" if is_dir else "file",
                        "size": entry.st_size,
                        # Recursion or fetching children would happen on demand in a real app
                        # For now we just return the flat list of this directory
                        "children": [] if is_dir else None 
                    })
            except FileNotFoundError:
                return [] # Directory doesn't exist or permission denied
            
            return file_list
        finally:
            sftp.close()

    def download_recursive(self, sftp, remote_path, local_path):
        """
        Recursively download files from remote_path to local_path.
        """
        # Ensure local directory exists
        os.makedirs(local_path, exist_ok=True)

        try:
            # Check if remote_path is a file
            remote_stat = sftp.stat(remote_path)
            if not stat.S_ISDIR(remote_stat.st_mode):
                # It's a file, download it directly (adjusting local_path to include filename)
                # This case might happen if the initial call points to a file
                local_file = os.path.join(local_path, os.path.basename(remote_path))
                sftp.get(remote_path, local_file)
                return

            # It's a directory, iterate
            for item in sftp.listdir_attr(remote_path):
                remote_item_path = remote_path + "/" + item.filename
                local_item_path = os.path.join(local_path, item.filename)
                
                if stat.S_ISDIR(item.st_mode):
                    self.download_recursive(sftp, remote_item_path, local_item_path)
                else:
                    sftp.get(remote_item_path, local_item_path)
        except Exception as e:
            print(f"Error downloading {remote_path}: {e}")
            # Raise or log? For now log and continue best effort
            pass

    def fetch_paths(self, remote_paths: List[str], local_base_dir: str, remote_base_path: str):
        """
        Download a list of remote paths (relative to remote_base_path) to local_base_dir.
        """
        if not self.client.get_transport() or not self.client.get_transport().is_active():
            raise Exception("Not connected")

        sftp = self.client.open_sftp()
        try:
            for path in remote_paths:
                # Construct full remote path
                # remote_base_path might be "/home/user/project"
                # path might be "src/" or "config.json"
                # If remote_base_path is absolute and path is relative, join works.
                # If path is absolute (which it seems to be from the error), we need to handle it.
                
                # Assume path is relative to remote_base_path usually, but if user browsed absolute, it might be absolute.
                # Let's try to handle both.
                
                if os.path.isabs(path):
                    full_remote_path = path
                else:
                    full_remote_path = os.path.join(remote_base_path, path).replace("\\", "/")
                
                # Construct local destination
                # For absolute paths (from file browser), just use the filename
                # For relative paths, preserve structure (e.g., "src/main.c" -> "local_base_dir/src/main.c")
                if os.path.isabs(path):
                    # Absolute path: use just the filename in SOURCES.
                    # Raw spec files reference sources by basename (e.g. Source0: foo.tar.gz).
                    # File mapper specs also use basename (generated install commands use os.path.basename).
                    clean_path = os.path.basename(path)
                else:
                    clean_path = path
                full_local_path = os.path.join(local_base_dir, clean_path)
                
                # If it's a file, we need the parent dir for local
                # If it's a dir, we need the dir itself
                
                try:
                    r_stat = sftp.stat(full_remote_path)
                    if stat.S_ISDIR(r_stat.st_mode):
                        # Directory
                        self.download_recursive(sftp, full_remote_path, full_local_path)
                    else:
                        # File
                        os.makedirs(os.path.dirname(full_local_path), exist_ok=True)
                        sftp.get(full_remote_path, full_local_path)
                except FileNotFoundError:
                    print(f"Warning: Remote path not found: {full_remote_path}")
                    continue
                    
        finally:
            sftp.close()

    def execute_command(self, command: str, cwd: Optional[str] = None) -> tuple[int, str, str]:
        """
        Execute a command on the remote server.
        Returns (exit_code, stdout, stderr)
        """
        if not self.client.get_transport() or not self.client.get_transport().is_active():
            raise Exception("Not connected")

        cmd_to_run = command
        if cwd:
            cmd_to_run = f"cd {cwd} && {command}"

        stdin, stdout, stderr = self.client.exec_command(cmd_to_run)
        
        # Read output
        out_str = stdout.read().decode('utf-8').strip()
        err_str = stderr.read().decode('utf-8').strip()
        exit_code = stdout.channel.recv_exit_status()
        
        return exit_code, out_str, err_str

    def close(self):
        self.client.close()

# Singleton instance for simple reuse in this prototype
# In a real app, connection pooling or per-request instantiation would be better
ssh_service = SSHService()
