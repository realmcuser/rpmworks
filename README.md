# RPMWorks

A web-based RPM build management system — because clicking through a UI beats memorising rpmbuild flags.

## The Story Behind This

I manage a bunch of AlmaLinux and Fedora systems at work. Over time I found myself building more and more custom RPM packages — internal tools, scripts, config files that need to land in the right place with the right permissions. The standard workflow of SSH:ing into a build box, shuffling files around, and running `rpmbuild` by hand works, but it does not scale well and it is impossible to hand off to a colleague.

I wanted something I could point a browser at, set up a project, and hit build. Something that would fetch the files from where they actually live, package them up, and push the result to a repository. Something with a build history so I could see what changed and when.

I could not find anything that did all of that in a way that fit my workflow, so I built RPMWorks.

I should be transparent: I am a Linux sysadmin and IT consultant, not a professional developer. This project was built using **Claude Code**, which turned out to be an excellent tool for exactly this kind of work — turning a clear technical idea into working software. If you are a sysadmin who knows what you want but struggles to get there alone, Claude Code is worth looking at.

## What It Does

- **Project management** — create, clone, and organise RPM build projects
- **Source fetching** — fetch files from remote servers via SSH/SFTP with a point-and-click file browser
- **Pre-fetch scripts** — run a script on the source server first (compile something, create a tar.gz archive) before fetching
- **File mapping** — define exactly where each file lands, with owner, group, and permissions
- **Automatic spec generation** — RPMWorks writes the `%install` and `%files` sections for you
- **Raw spec mode** — bring your own complete spec file and RPMWorks will use it as-is
- **Isolated builds** — each build runs inside a Podman container matching your target distribution
- **Multi-distribution** — build for AlmaLinux 9, AlmaLinux 10, Fedora, or whatever you configure
- **Publishing** — push finished RPMs to a remote repository via SSH and run `createrepo` automatically
- **Build history** — browse, download, and manage past builds with configurable retention
- **REST API** — trigger builds remotely from CI/CD pipelines or cron jobs
- **User management** — admin controls for registration, user accounts, and roles
- **English and Swedish** — the UI is fully translated into both languages

## Installation

### From RPM (recommended)

Pre-built RPM packages are available on the [Releases page](../../releases).

```bash
dnf install ./rpmworks-*.rpm
```

After installation, follow the printed setup instructions or see [doc/getting-started.md](doc/getting-started.md) for the full walkthrough, including PostgreSQL setup and SSH key configuration.

### First run

Start the service and open your browser:

```bash
systemctl enable --now rpmworks
```

```
http://<your-server>:8005
```

The first user to register becomes the administrator.

## Building RPMWorks with RPMWorks

Once you have a running instance, you can use it to build new versions of itself. The repository includes `rpmworks.spec` and the project is set up for exactly this workflow.

See [doc/getting-started.md](doc/getting-started.md) — Part 2 for the full setup, including the pre-fetch script that builds the frontend and creates the source archive.

## API

RPMWorks has a REST API for remote automation. Interactive documentation is at:

```
http://<your-server>:8005/docs
```

Quick example — trigger a build from the command line:

```bash
TOKEN=$(curl -s -X POST "http://<server>:8005/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=<password>" | jq -r '.access_token')

curl -X POST "http://<server>:8005/api/build/start" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": 1}'
```

See `rpmbuild-curl.bash` in the repository for a complete script that starts a build, polls for completion, and downloads the RPM.

## A Word of Warning

This is a personal project that I use on my own systems at work. It does what I need it to do.

- **I am not accepting pull requests** at this time
- **Use this at your own risk**

If it helps you, great. If something breaks, you are a sysadmin — you know how to read logs. That said, if you find a genuine bug or want to build on this, fork it and make it your own.

## Requirements

- AlmaLinux 9/10, Fedora, or compatible RHEL-based system
- PostgreSQL (installed and configured by you — see the getting-started guide)
- Podman (used by the build engine for isolated builds)
- An SSH key if your projects fetch files from remote servers

---

*Built by a sysadmin who wanted a better way to package things.*
