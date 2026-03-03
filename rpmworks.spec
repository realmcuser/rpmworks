Name:           rpmworks
Version:        1.0.0
Release:        1%{?dist}
Summary:        RPM Build Management System
License:        Proprietary
BuildArch:      x86_64
Source0:        rpmworks.tar.gz

Requires:       python3 >= 3.9
Requires:       python3-pip
Requires:       podman
Requires:       git
Requires:       postgresql-server

%global __requires_exclude_from ^/opt/rpmworks/backend/venv/.*$
%global __provides_exclude_from ^/opt/rpmworks/backend/venv/.*$
%global debug_package %{nil}

%description
RpmWorks - Web-based RPM build management system.
Requires PostgreSQL database.

%prep
%setup -q -n rpmworks

%build
# Already pre-built in pre-fetch script

%install
rm -rf %{buildroot}

mkdir -p %{buildroot}/opt/rpmworks
mkdir -p %{buildroot}/opt/rpmworks/.ssh
mkdir -p %{buildroot}/var/lib/rpmworks/workspace
mkdir -p %{buildroot}/etc/rpmworks
mkdir -p %{buildroot}%{_unitdir}

# Install backend (without venv), frontend and migrations
cp -r backend %{buildroot}/opt/rpmworks/
cp -r frontend %{buildroot}/opt/rpmworks/frontend
cp -r migrations %{buildroot}/opt/rpmworks/migrations

# Remove venv if it exists (will be created at install time)
rm -rf %{buildroot}/opt/rpmworks/backend/venv

# Config
cat > %{buildroot}/etc/rpmworks/rpmworks.conf << 'EOF'
WORKSPACE_DIR=/var/lib/rpmworks/workspace
DATABASE_URL=postgresql+psycopg://rpmworks:rpmworks@localhost:5432/rpmworks
HOST=0.0.0.0
PORT=8005
EOF

# Systemd service
cat > %{buildroot}%{_unitdir}/rpmworks.service << 'EOF'
[Unit]
Description=RpmWorks
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=rpmworks
Group=rpmworks
WorkingDirectory=/opt/rpmworks/backend
EnvironmentFile=/etc/rpmworks/rpmworks.conf
ExecStart=/opt/rpmworks/backend/venv/bin/uvicorn main:app --host ${HOST} --port ${PORT}
Restart=always

[Install]
WantedBy=multi-user.target
EOF

%pre
getent group rpmworks >/dev/null || groupadd -r rpmworks
getent passwd rpmworks >/dev/null || useradd -r -g rpmworks -d /opt/rpmworks -s /sbin/nologin rpmworks
exit 0

%post
# Create Python venv with system Python
cd /opt/rpmworks/backend
python3 -m venv venv
./venv/bin/pip install --upgrade pip
./venv/bin/pip install \
    fastapi uvicorn sqlalchemy "psycopg[binary]" \
    python-jose passlib argon2-cffi python-multipart paramiko

chown -R rpmworks:rpmworks /var/lib/rpmworks /opt/rpmworks
chmod 700 /opt/rpmworks/.ssh
systemctl daemon-reload

echo ""
echo "=== RpmWorks installed ==="
echo ""
echo "1. Setup PostgreSQL database:"
echo "   sudo -u postgres createuser rpmworks"
echo "   sudo -u postgres createdb -O rpmworks rpmworks"
echo "   sudo -u postgres psql -c \"ALTER USER rpmworks WITH PASSWORD 'rpmworks';\""
echo ""
echo "2. Configure PostgreSQL authentication (pg_hba.conf):"
echo "   Edit /var/lib/pgsql/data/pg_hba.conf"
echo "   Change 'ident' to 'md5' for localhost connections:"
echo "     host  all  all  127.0.0.1/32  md5"
echo "     host  all  all  ::1/128       md5"
echo "   Then: sudo systemctl restart postgresql"
echo ""
echo "3. Edit config: /etc/rpmworks/rpmworks.conf"
echo ""
echo "4. (Optional) Setup SSH keys for remote source fetching:"
echo "   cp ~/.ssh/id_ed25519 /opt/rpmworks/.ssh/"
echo "   cp ~/.ssh/known_hosts /opt/rpmworks/.ssh/"
echo "   chown rpmworks:rpmworks /opt/rpmworks/.ssh/*"
echo "   chmod 600 /opt/rpmworks/.ssh/id_ed25519"
echo "   In RpmWorks UI, use path: /opt/rpmworks/.ssh/id_ed25519"
echo ""
echo "5. Start service:"
echo "   systemctl enable --now rpmworks"
echo ""

%preun
[ $1 -eq 0 ] && systemctl stop rpmworks 2>/dev/null || true

%files
/opt/rpmworks
%dir %attr(700,rpmworks,rpmworks) /opt/rpmworks/.ssh
%dir /var/lib/rpmworks
%dir /var/lib/rpmworks/workspace
%config(noreplace) /etc/rpmworks/rpmworks.conf
%{_unitdir}/rpmworks.service

%changelog
* Sat Feb 01 2026 Builder <builder@example.com> - 1.0.0-1
- Initial release with PostgreSQL support
