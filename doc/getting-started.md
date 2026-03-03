# Getting Started with RPMWorks

RPMWorks is a web-based RPM build management system. This guide covers two things:

1. **Installing RPMWorks** on a fresh server using the pre-built RPM from GitLab
2. **Building a new RPMWorks RPM** using a running RPMWorks instance (dogfooding)

---

## Part 1 — Installing RPMWorks from the GitLab RPM

### Prerequisites

- AlmaLinux 9/10, Fedora, or compatible RHEL-based system
- Root access
- `podman` installed (used by the build engine)
- `postgresql-server` installed

### Step 1 — Download the RPM

Download the latest `rpmworks-*.rpm` from the GitLab releases page and transfer it to your server, or download it directly:

```bash
curl -L -o rpmworks.rpm <gitlab-release-url>
```

### Step 2 — Install the RPM

```bash
dnf install ./rpmworks.rpm
```

The installer will:
- Create a `rpmworks` system user and group
- Install the application to `/opt/rpmworks/`
- Install the systemd service file
- Create a Python virtual environment and install dependencies
- Create a default config at `/etc/rpmworks/rpmworks.conf`

At the end of installation, instructions are printed to the terminal. Follow them:

### Step 3 — Set up PostgreSQL

```bash
# Initialize PostgreSQL if not already done
postgresql-setup --initdb

# Start and enable PostgreSQL
systemctl enable --now postgresql

# Create user and database
sudo -u postgres createuser rpmworks
sudo -u postgres createdb -O rpmworks rpmworks
sudo -u postgres psql -c "ALTER USER rpmworks WITH PASSWORD 'rpmworks';"
```

### Step 4 — Configure PostgreSQL authentication

Edit `/var/lib/pgsql/data/pg_hba.conf` and make sure local TCP connections use `md5`:

```
host  all  all  127.0.0.1/32  md5
host  all  all  ::1/128       md5
```

Then restart PostgreSQL:

```bash
systemctl restart postgresql
```

### Step 5 — Edit the RPMWorks configuration

The default config is at `/etc/rpmworks/rpmworks.conf`:

```ini
WORKSPACE_DIR=/var/lib/rpmworks/workspace
DATABASE_URL=postgresql+psycopg://rpmworks:rpmworks@localhost:5432/rpmworks
HOST=0.0.0.0
PORT=8005
```

Change `PORT` if needed. If you changed the PostgreSQL password, update `DATABASE_URL` accordingly.

### Step 6 — Set up SSH keys (optional but recommended)

If your build projects fetch files from remote servers using SSH keys, copy the relevant key into the RPMWorks SSH directory:

```bash
cp ~/.ssh/id_ed25519 /opt/rpmworks/.ssh/
cp ~/.ssh/known_hosts /opt/rpmworks/.ssh/
chown rpmworks:rpmworks /opt/rpmworks/.ssh/*
chmod 600 /opt/rpmworks/.ssh/id_ed25519
```

In the RPMWorks UI, refer to the key as `/opt/rpmworks/.ssh/id_ed25519`.

### Step 7 — Start RPMWorks

```bash
systemctl enable --now rpmworks
```

Open your browser and go to:

```
http://<your-server>:8005
```

The first user to register becomes the administrator.

---

## Part 2 — Building a new RPMWorks RPM using RPMWorks

Once you have a running RPMWorks instance, you can use it to build new versions of RPMWorks itself. The RPMWorks source repository on GitLab is itself an RPMWorks project.

### How it works

The RPMWorks build uses **Raw Spec Mode** with a pre-fetch script:

1. The pre-fetch script runs on the source server and:
   - Builds the frontend (`npm run build`)
   - Creates a `rpmworks.tar.gz` archive containing the backend, built frontend, and migrations
2. RPMWorks fetches the archive via SFTP
3. The spec file (`rpmworks.spec`) builds and packages everything into an RPM

### Setting up the RPMWorks build project

#### Source configuration

| Field | Value |
|-------|-------|
| Host | The server where the RPMWorks source code lives |
| User | `root` (or whichever user has access) |
| Path | `/root/rpmworks` (or wherever the repo is checked out) |
| SSH Key | `/opt/rpmworks/.ssh/id_ed25519` |

**Pre-fetch script** — runs `npm run build` and creates the archive:

```bash
cd /root/rpmworks/frontend && npm run build
cd /root/rpmworks
tar --exclude='.git' \
    --exclude='frontend/node_modules' \
    --exclude='backend/venv' \
    --exclude='backend/__pycache__' \
    --exclude='dokumentation' \
    --exclude='backups' \
    -czf rpmworks.tar.gz \
    --transform 's,^,rpmworks/,' \
    backend frontend/dist migrations
```

After writing the pre-fetch script, click **"Run now"** to verify it completes successfully before opening the file browser.

#### File selection

In the source file browser, select:

- `rpmworks.tar.gz` — the archive created by the pre-fetch script
- `rpmworks.spec` — the RPM spec file

#### Mapping

| Source | Target | Type |
|--------|--------|------|
| `rpmworks.tar.gz` | `/root/rpmworks/rpmworks.tar.gz` | File |
| `rpmworks.spec` | `/root/rpmworks/rpmworks.spec` | File |

#### Configuration

| Setting | Value |
|---------|-------|
| Version | e.g. `1.0.0` |
| Release | e.g. `1%{?dist}` with auto-increment enabled |
| Target distribution | AlmaLinux 9 (or your target) |
| **Raw Spec Mode** | **Enabled** ✓ |

> **Important:** Enable **"Use Spec File Without Modification (Raw Mode)"** — RPMWorks will use `rpmworks.spec` as-is without injecting any automatic install commands.

### Running the build

Go to the **Build** tab and click **Start Build**. The log will show:

1. Pre-fetch script execution (frontend build + tar.gz creation)
2. File transfer via SFTP
3. RPM build inside a Podman container
4. The finished `.rpm` artifact

### Installing the new RPM on the production server

After a successful build, download the RPM from the **Artifacts** page, or deploy it automatically via the **Distribution** tab to your RPM repository.

To install on the production server:

```bash
systemctl stop rpmworks
dnf install ./rpmworks-1.0.0-<release>.el9.x86_64.rpm
systemctl start rpmworks
```

> The RPM preserves `/etc/rpmworks/rpmworks.conf` on upgrade (marked `%config(noreplace)`), so your configuration is not overwritten.

---

## API — Automating builds

RPMWorks provides a REST API, documented interactively at `http://<server>:8005/docs`.

To trigger a build remotely (useful in CI/CD pipelines):

```bash
# Get access token
TOKEN=$(curl -s -X POST "http://<server>:8005/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=<password>" | jq -r '.access_token')

# Start build
curl -X POST "http://<server>:8005/api/build/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": <id>}'
```

See `rpmbuild-curl.bash` in the repository for a complete example script that starts a build, polls for completion, and downloads the resulting RPM.
