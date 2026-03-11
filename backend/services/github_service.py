import urllib.request
import urllib.error
import urllib.parse
import json
import os
import re


class GitHubReleaseService:
    API_BASE = "https://api.github.com"
    UPLOAD_BASE = "https://uploads.github.com"

    def __init__(self, github_repo: str, token: str):
        self.github_repo = github_repo  # e.g. "realmcuser/cockpit-nspawn"
        self.token = token

    def _api_request(self, method: str, url: str, data: dict = None) -> dict:
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(
            url,
            data=body,
            headers={
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json",
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            raise Exception(f"GitHub API {method} {url} → {e.code}: {body}")

    def create_or_get_release(self, version: str) -> dict:
        """Return existing release for v{version}, or create it."""
        tag = f"v{version}"
        url = f"{self.API_BASE}/repos/{self.github_repo}/releases/tags/{tag}"
        try:
            return self._api_request("GET", url)
        except Exception:
            pass
        return self._api_request(
            "POST",
            f"{self.API_BASE}/repos/{self.github_repo}/releases",
            {
                "tag_name": tag,
                "name": f"Release {tag}",
                "body": f"Release {tag}",
                "draft": False,
                "prerelease": False,
            },
        )

    def get_release_downloads(self, release_id: int) -> int:
        """Return the total download count for all assets in a release."""
        url = f"{self.API_BASE}/repos/{self.github_repo}/releases/{release_id}/assets"
        try:
            assets = self._api_request("GET", url)
            return sum(a.get("download_count", 0) for a in assets)
        except Exception:
            return 0

    def delete_asset(self, asset_id: int) -> None:
        """Delete a release asset by ID."""
        url = f"{self.API_BASE}/repos/{self.github_repo}/releases/assets/{asset_id}"
        req = urllib.request.Request(
            url,
            headers={
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            method="DELETE",
        )
        try:
            urllib.request.urlopen(req)
        except urllib.error.HTTPError as e:
            if e.code != 204:  # 204 No Content is success for DELETE
                raise Exception(f"GitHub DELETE asset {asset_id} → {e.code}")

    def upload_asset(self, release_id: int, file_path: str) -> dict:
        """Upload a file as a release asset.

        Before uploading, removes any existing assets with the same distro
        suffix (e.g. .el9.noarch.rpm) so the release only keeps the latest
        build per distribution.
        """
        filename = os.path.basename(file_path)

        # Extract distro suffix: e.g. ".el9.noarch.rpm" or ".fc43.noarch.rpm"
        dist_match = re.search(r'\.\w+\.noarch\.rpm$', filename)
        dist_suffix = dist_match.group(0) if dist_match else None

        assets_url = f"{self.API_BASE}/repos/{self.github_repo}/releases/{release_id}/assets"
        try:
            existing = self._api_request("GET", assets_url)
        except Exception:
            existing = []

        for asset in existing:
            name = asset.get("name", "")
            if name == filename:
                # Exact match — already uploaded (e.g. same build re-deployed)
                return asset
            if dist_suffix and name.endswith(dist_suffix):
                # Old build for same distro — delete it
                try:
                    self.delete_asset(asset["id"])
                except Exception:
                    pass  # Best-effort cleanup

        with open(file_path, "rb") as f:
            file_data = f.read()

        upload_url = (
            f"{self.UPLOAD_BASE}/repos/{self.github_repo}"
            f"/releases/{release_id}/assets?name={urllib.parse.quote(filename)}"
        )
        req = urllib.request.Request(
            upload_url,
            data=file_data,
            headers={
                "Authorization": f"token {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/octet-stream",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            raise Exception(f"GitHub upload {filename} → {e.code}: {body}")
