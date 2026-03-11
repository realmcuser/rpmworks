from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, DateTime, Boolean, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

project_distributions = Table(
    'project_distributions', Base.metadata,
    Column('project_id', Integer, ForeignKey('projects.id', ondelete='CASCADE'), primary_key=True),
    Column('distribution_id', String, ForeignKey('distributions.id', ondelete='CASCADE'), primary_key=True)
)

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="pending") # pending, building, success, failed
    last_build = Column(String, nullable=True) # Timestamp or description string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    max_builds = Column(Integer, default=10)
    notes = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Project owner

    # Relationships
    owner = relationship("User", back_populates="projects")
    source_config = relationship("SourceConfig", back_populates="project", uselist=False, cascade="all, delete-orphan")
    build_config = relationship("BuildConfig", back_populates="project", uselist=False, cascade="all, delete-orphan")
    builds = relationship("Build", back_populates="project", cascade="all, delete-orphan")
    deployment_targets = relationship("DeploymentTarget", back_populates="project", cascade="all, delete-orphan")
    distributions = relationship("Distribution", secondary=project_distributions)

class SourceConfig(Base):
    __tablename__ = "source_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    host = Column(String, nullable=False)
    username = Column(String, nullable=False)
    password = Column(String, nullable=True) # Storing plain text for prototype simplicity, should be encrypted/vaulted in prod
    ssh_key_path = Column(String, nullable=True)
    path = Column(String, nullable=False)
    include_patterns = Column(JSON, default=list) # List of paths to include
    exclude_patterns = Column(JSON, default=list) # List of patterns to exclude
    pre_fetch_script = Column(String, nullable=True) # Script to run on remote BEFORE fetching files (e.g. create tar.gz)
    remote_command = Column(String, nullable=True) # Command to run on remote to get version/tag string

    project = relationship("Project", back_populates="source_config")

class BuildConfig(Base):
    __tablename__ = "build_configs"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    spec_template = Column(Text, nullable=True)
    version = Column(String, nullable=True)
    release = Column(String, nullable=True)
    build_arch = Column(String, default='x86_64')
    target_distro = Column(String, default='almalinux:9')
    build_requires = Column(JSON, nullable=True)
    rpmbuild_opts = Column(JSON, nullable=True)
    auto_increment_release = Column(Boolean, default=False)
    file_mappings = Column(JSON, default=list) # List of { source, target, mode, type, owner, group }
    
    # RPM package name (overrides project.name in spec; must be valid RPM name)
    rpm_name = Column(String, nullable=True)

    # Advanced naming options
    use_extra_name_vars = Column(Boolean, default=False)
    timestamp_format = Column(String, default="%y%m%d%H%M") # e.g. 2512191700
    extra_vars_target = Column(String, default="name")  # "name" or "version"

    # Raw spec mode - use spec template as-is without auto-injection of %install/%files
    use_raw_spec = Column(Boolean, default=False)
    
    project = relationship("Project", back_populates="build_config")

class Build(Base):
    __tablename__ = "builds"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    build_number = Column(Integer)
    version = Column(String, nullable=True)
    status = Column(String, default="pending") # pending, running, success, failed
    build_log = Column(Text, nullable=True)
    rpm_files = Column(JSON, nullable=True)
    target_distro = Column(String, nullable=True)
    started_at = Column(String, nullable=True)
    completed_at = Column(String, nullable=True)

    project = relationship("Project", back_populates="builds")
    deployments = relationship("Deployment", back_populates="build", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    role = Column(String, default="user") # admin, user, viewer

    # Relationships
    projects = relationship("Project", back_populates="owner")

class Distribution(Base):
    __tablename__ = "distributions"

    id = Column(String, primary_key=True) # e.g. "almalinux:9"
    name = Column(String, nullable=False) # e.g. "AlmaLinux 9"
    dist_suffix = Column(String, nullable=True) # e.g. ".el9"

class Repository(Base):
    __tablename__ = "repositories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    repo_type = Column(String, default="ssh")  # "ssh" or "github_releases"
    host = Column(String, nullable=True)
    username = Column(String, nullable=True)
    password = Column(String, nullable=True)
    ssh_key_path = Column(String, nullable=True)
    description = Column(String, nullable=True)
    github_repo = Column(String, nullable=True)  # e.g. "realmcuser/cockpit-nspawn"
    github_downloads = Column(Integer, default=0)  # Accumulated download count across releases

    deployments = relationship("Deployment", back_populates="repository", cascade="all, delete-orphan")
    project_targets = relationship("DeploymentTarget", back_populates="repository", cascade="all, delete-orphan")
    paths = relationship("RepositoryPath", back_populates="repository", cascade="all, delete-orphan")

class DeploymentTarget(Base):
    __tablename__ = "deployment_targets"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    repository_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    
    auto_publish = Column(Boolean, default=False)
    run_createrepo = Column(Boolean, default=False)
    custom_path = Column(String, nullable=True)
    
    project = relationship("Project", back_populates="deployment_targets")
    repository = relationship("Repository", back_populates="project_targets")

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, index=True)
    build_id = Column(Integer, ForeignKey("builds.id"), nullable=False)
    repository_id = Column(Integer, ForeignKey("repositories.id"), nullable=False)
    status = Column(String, default="pending")
    deployed_at = Column(String, nullable=True)
    log = Column(Text, nullable=True)

    build = relationship("Build", back_populates="deployments")
    repository = relationship("Repository", back_populates="deployments")

class RepositoryPath(Base):
    __tablename__ = "repository_paths"

    id = Column(Integer, primary_key=True, index=True)
    repository_id = Column(Integer, ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    distribution_id = Column(String, ForeignKey("distributions.id", ondelete="CASCADE"), nullable=False)
    base_path = Column(String, nullable=False)

    repository = relationship("Repository", back_populates="paths")
    distribution = relationship("Distribution")

class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(String, nullable=True)
