from fastapi import FastAPI, HTTPException, Depends, status, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import time
import os
from sqlalchemy import text
from sqlalchemy.orm import Session
from services.ssh_service import SSHService
from services.rpm_works import RPMWorks
from services.deployment_service import DeploymentService
import models
import auth_utils
from database import SessionLocal, engine
from fastapi.staticfiles import StaticFiles

# Initialize Database + run column migrations
models.Base.metadata.create_all(bind=engine)
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE repositories ADD COLUMN IF NOT EXISTS repo_type VARCHAR DEFAULT 'ssh'"))
    _conn.execute(text("ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_repo VARCHAR"))
    _conn.execute(text("ALTER TABLE repositories ADD COLUMN IF NOT EXISTS github_downloads INTEGER DEFAULT 0"))
    _conn.execute(text("ALTER TABLE repositories ALTER COLUMN host DROP NOT NULL"))
    _conn.execute(text("ALTER TABLE repositories ALTER COLUMN username DROP NOT NULL"))
    _conn.commit()

app = FastAPI(title="RPM Works API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/token")

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = auth_utils.jwt.decode(token, auth_utils.SECRET_KEY, algorithms=[auth_utils.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except auth_utils.JWTError:
        raise credentials_exception
    
    user = db.query(models.User).filter(models.User.username == username).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def get_system_setting(db: Session, key: str, default: str = None) -> str:
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    return setting.value if setting else default

def check_project_access(project: models.Project, user: models.User) -> bool:
    """Check if user has access to project. Admin can access all, others only their own."""
    if user.role == "admin":
        return True
    return project.user_id == user.id

def set_system_setting(db: Session, key: str, value: str):
    setting = db.query(models.SystemSettings).filter(models.SystemSettings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = models.SystemSettings(key=key, value=value)
        db.add(setting)
    db.commit()

# Pydantic Models (Schemas)
class Token(BaseModel):
    access_token: str
    token_type: str

class UserCreate(BaseModel):
    username: str
    password: str

class User(BaseModel):
    id: int
    username: str
    is_active: bool
    role: str

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    is_active: Optional[bool] = None
    role: Optional[str] = None

class SystemSettingsResponse(BaseModel):
    allow_registration: bool

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    max_builds: int = 10

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_builds: Optional[int] = None
    notes: Optional[str] = None

class ProjectCreate(ProjectBase):
    host: str
    username: str
    path: str
    password: Optional[str] = None
    ssh_key: Optional[str] = None

class Project(ProjectBase):
    id: int
    status: str
    last_build: Optional[str] = None
    created_at: Optional[datetime] = None
    max_builds: int = 10
    notes: Optional[str] = None
    user_id: Optional[int] = None

    class Config:
        from_attributes = True

class BuildConfig(BaseModel):
    spec_template: Optional[str] = None
    version: Optional[str] = None
    release: Optional[str] = None
    build_arch: str = "x86_64"
    target_distros: List[str] = []
    build_requires: Optional[List[str]] = None
    auto_increment_release: bool = False
    file_mappings: List[dict] = [] # List of mapping objects

    rpm_name: Optional[str] = None

    use_extra_name_vars: bool = False
    timestamp_format: str = "%y%m%d%H%M"
    extra_vars_target: str = "name"

    # Raw spec mode - use spec as-is without auto-injection
    use_raw_spec: bool = False

    class Config:
        from_attributes = True

class SourceConfig(BaseModel):
    host: str
    username: str
    path: str
    ssh_key_path: Optional[str] = None
    include_patterns: List[str] = []
    exclude_patterns: List[str] = []
    pre_fetch_script: Optional[str] = None
    remote_command: Optional[str] = None

    class Config:
        from_attributes = True

class Build(BaseModel):
    id: int
    build_number: int
    version: Optional[str]
    status: str
    target_distro: Optional[str] = None
    started_at: Optional[str]
    completed_at: Optional[str]
    build_log: Optional[str] = None
    rpm_files: Optional[List[str]] = None

    class Config:
        from_attributes = True

class ProjectDetail(Project):
    source_config: Optional[SourceConfig] = None
    build_config: Optional[BuildConfig] = None
    builds: List[Build] = []

class ConnectionRequest(BaseModel):
    host: str
    username: str
    password: Optional[str] = None
    path: Optional[str] = "."
    ssh_key: Optional[str] = None

class SourceConfigUpdate(BaseModel):
    # Connection settings (editable)
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    path: Optional[str] = None
    # File selection
    include_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None
    pre_fetch_script: Optional[str] = None
    remote_command: Optional[str] = None

class BrowseRequest(BaseModel):
    path: str

class BuildRequest(BaseModel):
    project_id: int

class BuildArtifact(BaseModel):
    id: int
    project_id: int
    project_name: str
    version: Optional[str]
    target_distro: Optional[str] = None
    completed_at: Optional[str]
    rpm_files: List[str]

    class Config:
        from_attributes = True

class RepositoryPathSchema(BaseModel):
    distribution_id: str
    base_path: str

class RepositoryCreate(BaseModel):
    name: str
    repo_type: str = "ssh"          # "ssh" or "github_releases"
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    paths: List[RepositoryPathSchema] = []
    description: Optional[str] = None
    github_repo: Optional[str] = None   # e.g. "realmcuser/cockpit-nspawn"

class RepositoryResponse(BaseModel):
    id: int
    name: str
    repo_type: str = "ssh"
    host: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    ssh_key_path: Optional[str] = None
    paths: List[RepositoryPathSchema] = []
    description: Optional[str] = None
    github_repo: Optional[str] = None
    github_downloads: int = 0
    class Config:
        from_attributes = True

class DeploymentTargetCreate(BaseModel):
    repository_id: int
    auto_publish: bool = False
    run_createrepo: bool = False
    custom_path: Optional[str] = None

class DeploymentTargetResponse(DeploymentTargetCreate):
    id: int
    repository_name: str
    repo_type: str = "ssh"
    class Config:
        from_attributes = True

class DistributionBase(BaseModel):
    id: str
    name: str
    dist_suffix: Optional[str] = None

class Distribution(DistributionBase):
    class Config:
        from_attributes = True

# API Routes

@app.get("/api/info/distributions", response_model=List[Distribution])
async def get_distributions(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    distros = db.query(models.Distribution).all()
    # If empty, maybe seed default? For now, assume migration seeded it.
    return distros

# Repository Endpoints
def _repo_to_response(repo):
    return RepositoryResponse(
        id=repo.id,
        name=repo.name,
        repo_type=getattr(repo, 'repo_type', 'ssh') or 'ssh',
        host=repo.host,
        username=repo.username,
        password=repo.password,
        ssh_key_path=repo.ssh_key_path,
        description=repo.description,
        github_repo=getattr(repo, 'github_repo', None),
        paths=[RepositoryPathSchema(distribution_id=p.distribution_id, base_path=p.base_path) for p in repo.paths]
    )

@app.get("/api/repositories", response_model=List[RepositoryResponse])
async def get_repositories(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    repos = db.query(models.Repository).all()
    return [_repo_to_response(r) for r in repos]

@app.post("/api/repositories", response_model=RepositoryResponse)
async def create_repository(repo: RepositoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_repo = models.Repository(
        name=repo.name,
        repo_type=repo.repo_type,
        host=repo.host,
        username=repo.username,
        password=repo.password,
        ssh_key_path=repo.ssh_key_path,
        description=repo.description,
        github_repo=repo.github_repo,
    )
    db.add(db_repo)
    db.commit()
    db.refresh(db_repo)

    for p in repo.paths:
        db_path = models.RepositoryPath(
            repository_id=db_repo.id,
            distribution_id=p.distribution_id,
            base_path=p.base_path
        )
        db.add(db_path)
    db.commit()
    db.refresh(db_repo)
    return _repo_to_response(db_repo)

@app.put("/api/repositories/{repo_id}", response_model=RepositoryResponse)
async def update_repository(repo_id: int, repo_data: RepositoryCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    repo = db.query(models.Repository).filter(models.Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    repo.name = repo_data.name
    repo.repo_type = repo_data.repo_type
    repo.host = repo_data.host
    repo.username = repo_data.username
    repo.password = repo_data.password
    repo.ssh_key_path = repo_data.ssh_key_path
    repo.description = repo_data.description
    repo.github_repo = repo_data.github_repo

    # Replace paths
    db.query(models.RepositoryPath).filter(models.RepositoryPath.repository_id == repo_id).delete()
    for p in repo_data.paths:
        db_path = models.RepositoryPath(
            repository_id=repo_id,
            distribution_id=p.distribution_id,
            base_path=p.base_path
        )
        db.add(db_path)

    db.commit()
    db.refresh(repo)
    return _repo_to_response(repo)

@app.delete("/api/repositories/{repo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_repository(repo_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    repo = db.query(models.Repository).filter(models.Repository.id == repo_id).first()
    if not repo:
        raise HTTPException(status_code=404, detail="Repository not found")
    db.delete(repo)
    db.commit()
    return None

# Deployment Target Endpoints
@app.get("/api/projects/{project_id}/targets", response_model=List[DeploymentTargetResponse])
async def get_project_targets(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    targets = db.query(models.DeploymentTarget).filter(models.DeploymentTarget.project_id == project_id).all()
    # Manually map to include repo name
    response = []
    for t in targets:
        response.append(DeploymentTargetResponse(
            id=t.id,
            repository_id=t.repository_id,
            repository_name=t.repository.name,
            repo_type=getattr(t.repository, 'repo_type', 'ssh') or 'ssh',
            auto_publish=bool(t.auto_publish),
            run_createrepo=bool(t.run_createrepo),
            custom_path=t.custom_path
        ))
    return response

@app.post("/api/projects/{project_id}/targets", response_model=DeploymentTargetResponse)
async def create_project_target(project_id: int, target: DeploymentTargetCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if exists
    existing = db.query(models.DeploymentTarget).filter(
        models.DeploymentTarget.project_id == project_id,
        models.DeploymentTarget.repository_id == target.repository_id
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Target already exists for this project")
        
    db_target = models.DeploymentTarget(
        project_id=project_id,
        repository_id=target.repository_id,
        auto_publish=target.auto_publish,
        run_createrepo=target.run_createrepo,
        custom_path=target.custom_path
    )
    db.add(db_target)
    db.commit()
    db.refresh(db_target)
    
    return DeploymentTargetResponse(
        id=db_target.id,
        repository_id=db_target.repository_id,
        repository_name=db_target.repository.name,
        repo_type=getattr(db_target.repository, 'repo_type', 'ssh') or 'ssh',
        auto_publish=bool(db_target.auto_publish),
        run_createrepo=bool(db_target.run_createrepo),
        custom_path=db_target.custom_path
    )

@app.delete("/api/projects/{project_id}/targets/{target_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project_target(project_id: int, target_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    target = db.query(models.DeploymentTarget).filter(models.DeploymentTarget.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    db.delete(target)
    db.commit()
    return None

class DeployRequest(BaseModel):
    target_id: int

class DeploymentResponse(BaseModel):
    id: int
    build_id: int
    repository_id: int
    repository_name: str
    status: str
    deployed_at: str
    log: Optional[str]
    
    class Config:
        from_attributes = True

@app.get("/api/projects/{project_id}/deployments", response_model=List[DeploymentResponse])
async def get_project_deployments(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    deployments = db.query(models.Deployment).join(models.Build).filter(
        models.Build.project_id == project_id
    ).order_by(models.Deployment.id.desc()).all()
    
    return [
        DeploymentResponse(
            id=d.id,
            build_id=d.build_id,
            repository_id=d.repository_id,
            repository_name=d.repository.name,
            status=d.status,
            deployed_at=d.deployed_at,
            log=d.log
        ) for d in deployments
    ]

@app.post("/api/projects/{project_id}/deploy/{build_id}")
async def deploy_build(project_id: int, build_id: int, req: DeployRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    target = db.query(models.DeploymentTarget).filter(models.DeploymentTarget.id == req.target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Deployment target not found")
        
    # Create deployment record
    deployment = models.Deployment(
        build_id=build_id,
        repository_id=target.repository_id,
        status="running",
        deployed_at=time.strftime("%Y-%m-%d %H:%M:%S")
    )
    db.add(deployment)
    db.commit()
    db.refresh(deployment)
    
    # Determine override_base_path from build's target_distro
    build = db.query(models.Build).filter(models.Build.id == build_id).first()
    override_base_path = None
    if build and build.target_distro:
        repo_path = db.query(models.RepositoryPath).filter(
            models.RepositoryPath.repository_id == target.repository_id,
            models.RepositoryPath.distribution_id == build.target_distro
        ).first()
        if repo_path:
            override_base_path = repo_path.base_path

    # Run in background
    def run_deployment(deployment_id, build_id, repo_id, run_createrepo, custom_path, override_base_path):
        db = SessionLocal()
        try:
            service = DeploymentService(db)
            success, log = service.deploy_build(build_id, repo_id, run_createrepo, custom_path, override_base_path=override_base_path)

            d = db.query(models.Deployment).filter(models.Deployment.id == deployment_id).first()
            if d:
                d.status = "success" if success else "failed"
                d.log = log
                db.commit()
        except Exception as e:
            print(f"Deployment task failed: {e}")
        finally:
            db.close()

    background_tasks.add_task(
        run_deployment,
        deployment.id,
        build_id,
        target.repository_id,
        bool(target.run_createrepo),
        target.custom_path,
        override_base_path
    )

    return {"message": "Deployment started", "deployment_id": deployment.id}

@app.get("/api/artifacts", response_model=List[BuildArtifact])
async def get_all_artifacts(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    builds = db.query(models.Build).join(models.Project).filter(
        models.Build.status == 'success',
        models.Build.rpm_files.isnot(None)
    ).order_by(models.Build.completed_at.desc()).all()
    
    artifacts = []
    for b in builds:
        if not b.rpm_files: continue
        
        artifacts.append(BuildArtifact(
            id=b.id,
            project_id=b.project_id,
            project_name=b.project.name,
            version=b.version,
            target_distro=b.target_distro,
            completed_at=b.completed_at,
            rpm_files=b.rpm_files
        ))
        
    return artifacts

@app.post("/api/info/distributions", response_model=Distribution)
async def create_distribution(distro: DistributionBase, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_distro = db.query(models.Distribution).filter(models.Distribution.id == distro.id).first()
    if db_distro:
        raise HTTPException(status_code=400, detail="Distribution ID already exists")
    
    db_distro = models.Distribution(id=distro.id, name=distro.name, dist_suffix=distro.dist_suffix)
    db.add(db_distro)
    db.commit()
    db.refresh(db_distro)
    return db_distro

@app.delete("/api/info/distributions/{distro_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_distribution(distro_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    db_distro = db.query(models.Distribution).filter(models.Distribution.id == distro_id).first()
    if not db_distro:
        raise HTTPException(status_code=404, detail="Distribution not found")
    
    db.delete(db_distro)
    db.commit()
    return None


def auto_deploy_build(build, project_id, db):
    """Auto-deploy a successful build to targets with auto_publish=True, using per-distro paths."""
    targets = db.query(models.DeploymentTarget).filter(
        models.DeploymentTarget.project_id == project_id,
        models.DeploymentTarget.auto_publish == True
    ).all()

    if not targets:
        return

    print(f"Auto-publishing build {build.id} (distro={build.target_distro}) to {len(targets)} targets...")
    deploy_service = DeploymentService(db)

    for target in targets:
        # GitHub Releases repos don't use per-distro paths — deploy directly
        repo = db.query(models.Repository).filter(models.Repository.id == target.repository_id).first()
        if repo and getattr(repo, 'repo_type', 'ssh') == 'github_releases':
            override_base_path = None
        else:
            # SSH repos: find matching RepositoryPath for this build's distro
            override_base_path = None
            if build.target_distro:
                repo_path = db.query(models.RepositoryPath).filter(
                    models.RepositoryPath.repository_id == target.repository_id,
                    models.RepositoryPath.distribution_id == build.target_distro
                ).first()

                if not repo_path:
                    # No path configured for this distro - skip with log
                    deployment = models.Deployment(
                        build_id=build.id,
                        repository_id=target.repository_id,
                        status="skipped",
                        deployed_at=time.strftime("%Y-%m-%d %H:%M:%S"),
                        log=f"No repository path configured for distribution '{build.target_distro}'. Skipping."
                    )
                    db.add(deployment)
                    db.commit()
                    print(f"Auto-publish skipped for target {target.id}: no path for {build.target_distro}")
                    continue

                override_base_path = repo_path.base_path

        deployment = models.Deployment(
            build_id=build.id,
            repository_id=target.repository_id,
            status="running",
            deployed_at=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        db.add(deployment)
        db.commit()
        db.refresh(deployment)

        success, log = deploy_service.deploy_build(
            build.id,
            target.repository_id,
            bool(target.run_createrepo),
            target.custom_path,
            override_base_path=override_base_path
        )

        deployment.status = "success" if success else "failed"
        deployment.log = log
        db.commit()
        print(f"Auto-publish to target {target.id}: {deployment.status}")


@app.post("/api/build/start")
async def start_build(req: BuildRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == req.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Get target distributions from project_distributions
    target_distros = [d.id for d in project.distributions]
    if not target_distros:
        raise HTTPException(status_code=400, detail="No target distributions configured for this project")

    # Auto-increment Release Logic (once for all distros)
    # Finds the LAST digit sequence in the release string and increments it.
    # Examples: "13%(?dist)" → "14%(?dist)", "%(timestamp).1.15%(?dist)" → "%(timestamp).1.16%(?dist)"
    build_config = project.build_config
    if build_config and build_config.auto_increment_release:
        try:
            import re
            current_release = build_config.release or "0"
            matches = list(re.finditer(r'\d+', current_release))
            if matches:
                last_match = matches[-1]
                num = int(last_match.group()) + 1
                new_release = current_release[:last_match.start()] + str(num) + current_release[last_match.end():]
                build_config.release = new_release
                db.commit()
                db.refresh(project)
                print(f"Auto-incremented release: {current_release} -> {new_release}")
        except Exception as e:
            print(f"Failed to auto-increment release: {e}")

    # Build Retention Policy - count distinct build_numbers
    max_builds = project.max_builds if project.max_builds is not None else 10

    from sqlalchemy import func as sa_func, distinct
    distinct_build_numbers = db.query(sa_func.count(distinct(models.Build.build_number))).filter(
        models.Build.project_id == req.project_id
    ).scalar() or 0

    if distinct_build_numbers >= max_builds:
        # Find oldest build_numbers to delete
        to_delete_count = distinct_build_numbers - max_builds + 1
        oldest_numbers = db.query(models.Build.build_number).filter(
            models.Build.project_id == req.project_id
        ).group_by(models.Build.build_number).order_by(models.Build.build_number.asc()).limit(to_delete_count).all()
        oldest_numbers = [r[0] for r in oldest_numbers]

        if oldest_numbers:
            builds_to_delete = db.query(models.Build).filter(
                models.Build.project_id == req.project_id,
                models.Build.build_number.in_(oldest_numbers)
            ).all()
            print(f"Retention policy: Deleting {len(builds_to_delete)} builds for {len(oldest_numbers)} build numbers (Max: {max_builds})")
            for b in builds_to_delete:
                delete_build_files(b.id)
                db.delete(b)
            db.commit()

    # Create one Build record per distribution, sharing the same build_number
    build_number = int(time.time())
    started_at = time.strftime("%Y-%m-%d %H:%M:%S")
    build_ids = []

    for distro_id in target_distros:
        new_build = models.Build(
            project_id=project.id,
            build_number=build_number,
            version=project.build_config.version,
            target_distro=distro_id,
            status="pending",
            started_at=started_at
        )
        db.add(new_build)
        db.commit()
        db.refresh(new_build)
        build_ids.append(new_build.id)

    # Update Project status and last_build
    project.status = "running"
    project.last_build = started_at
    db.commit()
    db.refresh(project)

    # Launch sequential builds in background
    def run_sequential_builds(build_ids, project_id):
        any_failed = False
        for bid in build_ids:
            db_inner = SessionLocal()
            try:
                build = db_inner.query(models.Build).filter(models.Build.id == bid).first()
                if not build:
                    continue

                build.status = "running"
                db_inner.commit()

                builder = RPMWorks()
                builder.start_build(bid, project_id, SessionLocal)

                # Refresh to get updated status
                db_inner.refresh(build)

                if build.status == "success":
                    auto_deploy_build(build, project_id, db_inner)
                else:
                    any_failed = True
            except Exception as e:
                print(f"Build {bid} error: {e}")
                any_failed = True
            finally:
                db_inner.close()

        # Update project status based on all builds
        db_final = SessionLocal()
        try:
            proj = db_final.query(models.Project).filter(models.Project.id == project_id).first()
            if proj:
                all_builds = db_final.query(models.Build).filter(
                    models.Build.build_number == build_number,
                    models.Build.project_id == project_id
                ).all()
                statuses = [b.status for b in all_builds]
                if all(s == "success" for s in statuses):
                    proj.status = "success"
                elif any(s == "failed" for s in statuses):
                    proj.status = "failed"
                db_final.commit()
        except Exception as e:
            print(f"Final status update error: {e}")
        finally:
            db_final.close()

    background_tasks.add_task(run_sequential_builds, build_ids, req.project_id)

    return {"message": "Build started", "project_id": req.project_id, "build_ids": build_ids, "build_number": build_number}

@app.get("/api/builds/{build_id}/download/{filename}")
async def download_build_artifact(build_id: int, filename: str, db: Session = Depends(get_db)):
    build = db.query(models.Build).filter(models.Build.id == build_id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    
    # Find the file in the rpm_files list
    file_path = None
    if build.rpm_files:
        for path in build.rpm_files:
            if os.path.basename(path) == filename:
                file_path = path
                break
    
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, filename=filename)

@app.post("/api/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth_utils.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = auth_utils.timedelta(minutes=auth_utils.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth_utils.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/users", response_model=User)
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    # Check if user exists
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")

    # Check if this is the first user (will become admin)
    user_count = db.query(models.User).count()
    is_first_user = user_count == 0

    # If not first user, check if registration is allowed
    if not is_first_user:
        allow_reg = get_system_setting(db, "allow_registration", "true")
        if allow_reg.lower() != "true":
            raise HTTPException(status_code=403, detail="Registration is disabled")

    hashed_password = auth_utils.get_password_hash(user.password)
    role = "admin" if is_first_user else "user"
    db_user = models.User(username=user.username, hashed_password=hashed_password, role=role)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/api/users/me", response_model=User)
async def read_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user

@app.get("/api/projects", response_model=List[Project])
async def get_projects(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Admin sees all projects, regular users see only their own
    if current_user.role == "admin":
        projects = db.query(models.Project).all()
    else:
        projects = db.query(models.Project).filter(models.Project.user_id == current_user.id).all()
    return projects

@app.post("/api/projects", response_model=Project)
async def create_project(project_in: ProjectCreate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1. Create Project entry with owner
    db_project = models.Project(
        name=project_in.name,
        description=project_in.description,
        status="pending",
        user_id=current_user.id
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    # 2. Create SourceConfig entry
    db_source = models.SourceConfig(
        project_id=db_project.id,
        host=project_in.host,
        username=project_in.username,
        password=project_in.password,
        path=project_in.path,
        ssh_key_path=project_in.ssh_key
    )
    db.add(db_source)
    db.commit()
    
    return db_project

import shutil

# ... existing imports ...

# Helper to delete build files
def delete_build_files(build_id: int):
    # Use env var for consistency
    workspace_dir = os.getenv("WORKSPACE_DIR", "build-workspace")
    build_path = os.path.abspath(os.path.join(workspace_dir, str(build_id)))
    if os.path.exists(build_path):
        shutil.rmtree(build_path)

@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Delete build directories
    if project.builds:
        for build in project.builds:
            delete_build_files(build.id)
            
    db.delete(project)
    db.commit()
    return None

@app.delete("/api/builds/{build_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_build(build_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    build = db.query(models.Build).filter(models.Build.id == build_id).first()
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    if not check_project_access(build.project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    delete_build_files(build_id)

    db.delete(build)
    db.commit()
    return None

@app.put("/api/projects/{project_id}", response_model=Project)
async def update_project(project_id: int, project_update: ProjectUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    if project_update.name is not None:
        # Check uniqueness if name changed
        if project_update.name != project.name:
            existing = db.query(models.Project).filter(models.Project.name == project_update.name).first()
            if existing:
                raise HTTPException(status_code=400, detail="Project name already exists")
        project.name = project_update.name
        
    if project_update.description is not None:
        project.description = project_update.description
        
    if project_update.max_builds is not None:
        project.max_builds = project_update.max_builds

    if project_update.notes is not None:
        project.notes = project_update.notes

    db.commit()
    db.refresh(project)
    return project

class ProjectCloneRequest(BaseModel):
    name: str

@app.post("/api/projects/{project_id}/clone", response_model=Project)
async def clone_project(project_id: int, req: ProjectCloneRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Clone a project with all its configuration to a new project"""
    # Get source project
    source_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not source_project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not check_project_access(source_project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Check if name already exists
    existing = db.query(models.Project).filter(models.Project.name == req.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project name already exists")

    # Create new project (owned by current user)
    new_project = models.Project(
        name=req.name,
        description=source_project.description,
        status="pending",
        max_builds=source_project.max_builds,
        notes=source_project.notes,
        user_id=current_user.id
    )
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    # Clone source_config
    if source_project.source_config:
        src = source_project.source_config
        new_source = models.SourceConfig(
            project_id=new_project.id,
            host=src.host,
            username=src.username,
            password=src.password,
            ssh_key_path=src.ssh_key_path,
            path=src.path,
            include_patterns=src.include_patterns.copy() if src.include_patterns else [],
            exclude_patterns=src.exclude_patterns.copy() if src.exclude_patterns else [],
            pre_fetch_script=src.pre_fetch_script,
            remote_command=src.remote_command
        )
        db.add(new_source)

    # Clone build_config
    if source_project.build_config:
        bc = source_project.build_config
        new_build_config = models.BuildConfig(
            project_id=new_project.id,
            spec_template=bc.spec_template,
            version=bc.version,
            release=bc.release,
            build_arch=bc.build_arch,
            target_distro=bc.target_distro,
            build_requires=bc.build_requires.copy() if bc.build_requires else None,
            rpmbuild_opts=bc.rpmbuild_opts.copy() if bc.rpmbuild_opts else None,
            auto_increment_release=bc.auto_increment_release,
            file_mappings=bc.file_mappings.copy() if bc.file_mappings else [],
            rpm_name=bc.rpm_name,
            use_extra_name_vars=bc.use_extra_name_vars,
            timestamp_format=bc.timestamp_format,
            extra_vars_target=bc.extra_vars_target,
            use_raw_spec=bc.use_raw_spec
        )
        db.add(new_build_config)

    # Clone project_distributions
    for distro in source_project.distributions:
        db.execute(models.project_distributions.insert().values(
            project_id=new_project.id,
            distribution_id=distro.id
        ))

    # Clone deployment_targets
    if source_project.deployment_targets:
        for target in source_project.deployment_targets:
            new_target = models.DeploymentTarget(
                project_id=new_project.id,
                repository_id=target.repository_id,
                auto_publish=target.auto_publish,
                run_createrepo=target.run_createrepo,
                custom_path=target.custom_path
            )
            db.add(new_target)

    db.commit()
    db.refresh(new_project)
    return new_project

class SpecValidationRequest(BaseModel):
    content: str

@app.post("/api/build/validate")
async def validate_spec(req: SpecValidationRequest):
    if not req.content:
        raise HTTPException(status_code=400, detail="Spec content empty")
    
    spec_content = req.content
    # Simple syntax check
    errors = []
    if "Name:" not in spec_content:
        errors.append("Missing 'Name:' directive")
    if "Version:" not in spec_content:
        errors.append("Missing 'Version:' directive")
    if "Release:" not in spec_content:
        errors.append("Missing 'Release:' directive")
    if "%description" not in spec_content:
        errors.append("Missing '%description' section")
        
    if errors:
        return {"valid": False, "errors": errors}
        
    return {"valid": True, "errors": []}

@app.get("/api/projects/{project_id}", response_model=ProjectDetail)
async def get_project(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    # Build response manually to inject target_distros from project.distributions
    bc = project.build_config
    build_config_data = None
    if bc:
        build_config_data = BuildConfig(
            spec_template=bc.spec_template,
            version=bc.version,
            release=bc.release,
            build_arch=bc.build_arch,
            target_distros=[d.id for d in project.distributions],
            build_requires=bc.build_requires,
            auto_increment_release=bc.auto_increment_release,
            file_mappings=bc.file_mappings or [],
            rpm_name=bc.rpm_name,
            use_extra_name_vars=bc.use_extra_name_vars,
            timestamp_format=bc.timestamp_format or "%y%m%d%H%M",
            extra_vars_target=bc.extra_vars_target or "name",
            use_raw_spec=bc.use_raw_spec,
        )

    return ProjectDetail(
        id=project.id,
        name=project.name,
        description=project.description,
        status=project.status,
        last_build=project.last_build,
        created_at=project.created_at,
        max_builds=project.max_builds,
        notes=project.notes,
        user_id=project.user_id,
        source_config=project.source_config,
        build_config=build_config_data,
        builds=project.builds,
    )

@app.put("/api/projects/{project_id}/source", response_model=SourceConfig)
async def update_source_config(project_id: int, config: SourceConfigUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db_source = db.query(models.SourceConfig).filter(models.SourceConfig.project_id == project_id).first()
    if not db_source:
        raise HTTPException(status_code=404, detail="Source config not found")

    # Connection settings
    if config.host is not None:
        db_source.host = config.host
    if config.username is not None:
        db_source.username = config.username
    if config.password is not None:
        db_source.password = config.password
    if config.ssh_key_path is not None:
        db_source.ssh_key_path = config.ssh_key_path
    if config.path is not None:
        db_source.path = config.path
        # Clear file selections when path changes
        db_source.include_patterns = []

    # File selection
    if config.include_patterns is not None:
        db_source.include_patterns = config.include_patterns
    if config.exclude_patterns is not None:
        db_source.exclude_patterns = config.exclude_patterns
    if config.pre_fetch_script is not None:
        db_source.pre_fetch_script = config.pre_fetch_script
    if config.remote_command is not None:
        db_source.remote_command = config.remote_command

    db.commit()
    db.refresh(db_source)
    return db_source

@app.put("/api/projects/{project_id}/build-config", response_model=BuildConfig)
async def update_build_config(project_id: int, config: BuildConfig, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db_build_config = db.query(models.BuildConfig).filter(models.BuildConfig.project_id == project_id).first()

    # Create if not exists
    if not db_build_config:
        db_build_config = models.BuildConfig(project_id=project_id)
        db.add(db_build_config)

    if config.spec_template is not None:
        db_build_config.spec_template = config.spec_template
    if config.version is not None:
        db_build_config.version = config.version
    if config.release is not None:
        db_build_config.release = config.release
    if config.build_arch is not None:
        db_build_config.build_arch = config.build_arch
    if config.build_requires is not None:
        db_build_config.build_requires = config.build_requires
    if config.auto_increment_release is not None:
        db_build_config.auto_increment_release = config.auto_increment_release
    if config.file_mappings is not None:
        db_build_config.file_mappings = config.file_mappings

    # RPM package name override
    db_build_config.rpm_name = config.rpm_name or None

    # Advanced naming options
    if config.use_extra_name_vars is not None:
        db_build_config.use_extra_name_vars = config.use_extra_name_vars
    if config.timestamp_format is not None:
        db_build_config.timestamp_format = config.timestamp_format
    if config.extra_vars_target is not None:
        db_build_config.extra_vars_target = config.extra_vars_target

    # Raw spec mode
    if config.use_raw_spec is not None:
        db_build_config.use_raw_spec = config.use_raw_spec

    # Handle target_distros: update project_distributions
    if config.target_distros is not None:
        from sqlalchemy import delete
        db.execute(delete(models.project_distributions).where(
            models.project_distributions.c.project_id == project_id
        ))
        for distro_id in config.target_distros:
            db.execute(models.project_distributions.insert().values(
                project_id=project_id,
                distribution_id=distro_id
            ))

    db.commit()
    db.refresh(db_build_config)
    db.refresh(project)

    return BuildConfig(
        spec_template=db_build_config.spec_template,
        version=db_build_config.version,
        release=db_build_config.release,
        build_arch=db_build_config.build_arch,
        target_distros=[d.id for d in project.distributions],
        build_requires=db_build_config.build_requires,
        auto_increment_release=db_build_config.auto_increment_release,
        file_mappings=db_build_config.file_mappings or [],
        rpm_name=db_build_config.rpm_name,
        use_extra_name_vars=db_build_config.use_extra_name_vars,
        timestamp_format=db_build_config.timestamp_format or "%y%m%d%H%M",
        extra_vars_target=db_build_config.extra_vars_target or "name",
        use_raw_spec=db_build_config.use_raw_spec,
    )

@app.get("/api/projects/{project_id}/files")
async def list_project_files(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    List files in the project's source root directory using saved credentials.
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db_source = db.query(models.SourceConfig).filter(models.SourceConfig.project_id == project_id).first()
    if not db_source:
        raise HTTPException(status_code=404, detail="Source config not found")

    ssh = SSHService()
    try:
        success, message = ssh.connect(db_source.host, db_source.username, db_source.password, db_source.ssh_key_path)
        if not success:
            raise HTTPException(status_code=400, detail=f"Connection failed: {message}")

        path_to_list = db_source.path
        files = ssh.list_files(path_to_list)
        
        path_name = path_to_list.split('/')[-1] if path_to_list else "root"
        
        tree = {
            "name": path_name or "root",
            "type": "directory",
            "path": path_to_list,
            "children": files
        }
        return tree
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))
    finally:
        ssh.close()

@app.post("/api/projects/{project_id}/files/browse")
async def browse_project_path(project_id: int, req: BrowseRequest, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    List files in a specific subdirectory for a project.
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if not check_project_access(project, current_user):
        raise HTTPException(status_code=403, detail="Access denied")

    db_source = db.query(models.SourceConfig).filter(models.SourceConfig.project_id == project_id).first()
    if not db_source:
        raise HTTPException(status_code=404, detail="Source config not found")

    ssh = SSHService()
    try:
        success, message = ssh.connect(db_source.host, db_source.username, db_source.password, db_source.ssh_key_path)
        if not success:
            raise HTTPException(status_code=400, detail=f"Connection failed: {message}")

        # Security check: Ensure req.path is within db_source.path? 
        # For now, we trust the authenticated user.
        
        files = ssh.list_files(req.path)
        return files
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))
    finally:
        ssh.close()

@app.post("/api/projects/{project_id}/run-prefetch")
async def run_prefetch_script(project_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project or not check_project_access(project, current_user):
        raise HTTPException(status_code=404, detail="Project not found")

    db_source = db.query(models.SourceConfig).filter(models.SourceConfig.project_id == project_id).first()
    if not db_source or not db_source.pre_fetch_script:
        raise HTTPException(status_code=400, detail="No pre-fetch script configured")

    ssh = SSHService()
    try:
        success, message = ssh.connect(db_source.host, db_source.username, db_source.password, db_source.ssh_key_path)
        if not success:
            raise HTTPException(status_code=400, detail=f"Connection failed: {message}")

        code, out, err = ssh.execute_command(db_source.pre_fetch_script, cwd=db_source.path)
        return {
            "exit_code": code,
            "stdout": out,
            "stderr": err,
            "success": code == 0
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ssh.close()

@app.post("/api/source/connect")
async def test_connection(req: ConnectionRequest, current_user: models.User = Depends(get_current_user)):
    """
    Connects to the remote server and lists files in the specified path.
    """
    ssh = SSHService()
    try:
        success, message = ssh.connect(req.host, req.username, req.password, req.ssh_key)
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        # If connection successful, list files to prove it works
        path_to_list = req.path if req.path else "."
        files = ssh.list_files(path_to_list)
        
        # Convert flat list to tree structure expected by frontend
        # Handle case where req.path might be None or empty for split()
        path_name = path_to_list.split('/')[-1] if path_to_list else "root"
        
        tree = {
            "name": path_name or "root",
            "type": "directory",
            "path": path_to_list,
            "children": files
        }

        return {
            "status": "success", 
            "message": f"Connected to {req.username}@{req.host}",
            "files": tree
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ssh.close()

@app.post("/api/source/browse")
async def browse_path(req: ConnectionRequest, current_user: models.User = Depends(get_current_user)):
    """
    List files in a specific path using provided credentials.
    Used for expanding directories in the file tree.
    """
    ssh = SSHService()
    try:
        success, message = ssh.connect(req.host, req.username, req.password, req.ssh_key)
        if not success:
            raise HTTPException(status_code=400, detail=message)
        
        path_to_list = req.path if req.path else "."
        files = ssh.list_files(path_to_list)
        return files 
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        ssh.close()

# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users", response_model=List[User])
async def list_users(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """List all users (admin only)"""
    users = db.query(models.User).all()
    return users

@app.put("/api/admin/users/{user_id}", response_model=User)
async def update_user(user_id: int, user_update: UserUpdate, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """Update a user's status or role (admin only)"""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent admin from deactivating themselves
    if user.id == current_user.id and user_update.is_active == False:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    # Prevent removing last admin
    if user.id == current_user.id and user_update.role and user_update.role != "admin":
        admin_count = db.query(models.User).filter(models.User.role == "admin").count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")

    if user_update.is_active is not None:
        user.is_active = user_update.is_active
    if user_update.role is not None:
        user.role = user_update.role

    db.commit()
    db.refresh(user)
    return user

@app.get("/api/admin/settings", response_model=SystemSettingsResponse)
async def get_admin_settings(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """Get system settings (admin only)"""
    allow_reg = get_system_setting(db, "allow_registration", "true")
    return {"allow_registration": allow_reg.lower() == "true"}

@app.put("/api/admin/settings", response_model=SystemSettingsResponse)
async def update_admin_settings(settings: SystemSettingsResponse, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_admin)):
    """Update system settings (admin only)"""
    set_system_setting(db, "allow_registration", str(settings.allow_registration).lower())
    return settings

@app.get("/api/settings/registration")
async def check_registration_allowed(db: Session = Depends(get_db)):
    """Public endpoint to check if registration is allowed"""
    # Check if any users exist
    user_count = db.query(models.User).count()
    if user_count == 0:
        # First user can always register
        return {"allowed": True, "first_user": True}

    allow_reg = get_system_setting(db, "allow_registration", "true")
    return {"allowed": allow_reg.lower() == "true", "first_user": False}

# Mount Static Files (Frontend)
# Moved to end of file to ensure API routes are matched first

# Find dist directory
dist_dir = None
# Check common locations relative to backend/
possible_dirs = ["../frontend/dist", "../frontend", "frontend/dist", "../dist", "dist"]
for d in possible_dirs:
    if os.path.exists(d):
        dist_dir = d
        break

if dist_dir:
    # 1. Mount assets explicitly to allow direct access
    assets_dir = os.path.join(dist_dir, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    # 2. Catch-all route for SPA (Single Page Application)
    # Serves index.html for any path not matched by API or assets,
    # allowing React Router to handle the routing client-side.
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow serving other static files in root (e.g. vite.svg, favicon.ico)
        file_path = os.path.join(dist_dir, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html
        return FileResponse(os.path.join(dist_dir, "index.html"))
