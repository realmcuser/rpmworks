import os
import shutil
import subprocess
import time
import hashlib
import fcntl

BUILD_ROOT = os.getenv("WORKSPACE_DIR", os.path.abspath("build-workspace"))
RELEASES_ROOT = os.path.join(os.path.dirname(BUILD_ROOT), "releases-workspace")


class BundleService:
    """Builds a noarch meta/bundle RPM with exact Requires= locks for each component."""

    def build_bundle(
        self,
        release_id: int,
        bundle_name: str,
        version: str,
        release_str: str,
        requires: list,        # [{"name": "pkg", "evr": "1.0.0-83.el9"}, ...]
        container_image: str,  # e.g. "almalinux:9"
        log_fn=None,
    ) -> tuple:
        """
        Build the bundle RPM in a Podman container.
        Returns (success: bool, log: str, rpm_filename: str | None).
        """
        log = []

        def log_msg(msg):
            ts = time.strftime("%H:%M:%S")
            line = f"[{ts}] {msg}"
            log.append(line)
            if log_fn:
                log_fn(line)
            print(line)

        build_dir = os.path.join(RELEASES_ROOT, str(release_id))
        if os.path.exists(build_dir):
            shutil.rmtree(build_dir)

        for d in ["SPECS", "RPMS", "BUILD", "SOURCES", "SRPMS"]:
            os.makedirs(os.path.join(build_dir, d), exist_ok=True)

        spec_path = self._write_spec(build_dir, bundle_name, version, release_str, requires)
        log_msg(f"Bundle spec written: {spec_path}")

        storage_root = os.path.join(os.path.dirname(BUILD_ROOT), "podman-storage")
        os.makedirs(storage_root, exist_ok=True)
        run_root = "/tmp/podman-run-rpmworks"
        os.makedirs(run_root, exist_ok=True)

        # Auto-recover stale boot-ID (same pattern as rpm_works.py)
        _probe = subprocess.run(
            ["podman", "--root", storage_root, "--runroot", run_root, "info"],
            capture_output=True, text=True
        )
        if "boot ID" in _probe.stderr:
            log_msg("Podman: stale boot-ID — clearing state")
            for _p in [run_root, "/run/libpod"]:
                shutil.rmtree(_p, ignore_errors=True)
            os.makedirs(run_root, exist_ok=True)

        deps = ["rpm-build"]
        deps_hash = hashlib.md5(" ".join(sorted(deps)).encode()).hexdigest()[:8]
        safe_image = container_image.replace(":", "-").replace("/", "-")
        cache_image = f"rpmworks-builder-{safe_image}-{deps_hash}"

        lock_path = os.path.join(run_root, f"cache-{deps_hash}.lock")
        lock_fd = open(lock_path, "w")
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX)
            check = subprocess.run(
                ["podman", "--root", storage_root, "--runroot", run_root,
                 "image", "exists", cache_image],
                capture_output=True
            )
            if check.returncode != 0:
                log_msg(f"Creating builder cache image: {cache_image}")
                install_cmd = f"dnf install -y {' '.join(deps)} && dnf clean all"
                tmp_name = f"rpmworks-bundle-tmp-{int(time.time())}"
                proc = subprocess.run(
                    ["podman", "--root", storage_root, "--runroot", run_root,
                     "run", "--name", tmp_name, "--network=host",
                     container_image, "/bin/bash", "-c", install_cmd],
                    capture_output=True, text=True
                )
                if proc.returncode != 0:
                    log_msg(f"Cache image creation failed:\n{proc.stdout}\n{proc.stderr}")
                    return False, "\n".join(log), None
                subprocess.run(
                    ["podman", "--root", storage_root, "--runroot", run_root,
                     "commit", tmp_name, cache_image],
                    check=True, capture_output=True
                )
                subprocess.run(
                    ["podman", "--root", storage_root, "--runroot", run_root,
                     "rm", tmp_name],
                    capture_output=True
                )
                log_msg(f"Cache image created: {cache_image}")
            else:
                log_msg(f"Using cached builder image: {cache_image}")
        finally:
            fcntl.flock(lock_fd, fcntl.LOCK_UN)
            lock_fd.close()

        container_build_dir = "/root/rpmbuild"
        spec_filename = os.path.basename(spec_path)
        build_cmd = f"rpmbuild -bb {container_build_dir}/SPECS/{spec_filename}"

        log_msg(f"Running rpmbuild in container: {cache_image}")
        proc = subprocess.run(
            [
                "podman", "--root", storage_root, "--runroot", run_root,
                "run", "--rm", "--network=host",
                "-v", f"{build_dir}:{container_build_dir}:Z",
                cache_image,
                "/bin/bash", "-c", build_cmd,
            ],
            capture_output=True, text=True
        )
        if proc.stdout:
            log_msg(proc.stdout)
        if proc.stderr:
            log_msg(proc.stderr)

        if proc.returncode != 0:
            log_msg("Bundle build FAILED")
            return False, "\n".join(log), None

        rpm_files = []
        for root, _dirs, files in os.walk(os.path.join(build_dir, "RPMS")):
            for f in files:
                if f.endswith(".rpm"):
                    rpm_files.append(os.path.join(root, f))

        if not rpm_files:
            log_msg("Bundle build succeeded but no RPM found in RPMS/")
            return False, "\n".join(log), None

        rpm_path = rpm_files[0]
        rpm_filename = os.path.basename(rpm_path)
        log_msg(f"Bundle RPM built: {rpm_filename}")
        return True, "\n".join(log), rpm_filename

    def get_bundle_local_path(self, release_id: int, rpm_filename: str) -> str:
        """Return the absolute local path for a bundle RPM."""
        return os.path.join(RELEASES_ROOT, str(release_id), "RPMS", "noarch", rpm_filename)

    def cleanup(self, release_id: int):
        """Remove bundle workspace for a release."""
        path = os.path.join(RELEASES_ROOT, str(release_id))
        if os.path.exists(path):
            shutil.rmtree(path)

    def _write_spec(self, build_dir, bundle_name, version, release_str, requires):
        spec_lines = [
            f"Name:           {bundle_name}",
            f"Version:        {version}",
            f"Release:        {release_str}",
            f"Summary:        {bundle_name} release bundle",
            "License:        Proprietary",
            "BuildArch:      noarch",
        ]
        for req in requires:
            spec_lines.append(f"Requires:       {req['name']} = {req['evr']}")

        spec_lines += [
            "",
            "%description",
            f"{bundle_name} release bundle. Locks exact component versions for coordinated deployment.",
            "",
            "%install",
            "# No files",
            "",
            "%files",
            "",
            "%changelog",
            f"* {time.strftime('%a %b %d %Y')} RPMWorks <builder@example.com> - {version}-{release_str}",
            f"- Release bundle {version}-{release_str}",
        ]

        spec_path = os.path.join(build_dir, "SPECS", f"{bundle_name}.spec")
        with open(spec_path, "w") as f:
            f.write("\n".join(spec_lines) + "\n")
        return spec_path
