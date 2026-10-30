"""infra.py: the runtime pieces (services, databases, caches, queues, storage) from Compose, Kubernetes, Terraform."""
from conftest import load, run, save

COMPOSE = """services:
  web:
    build: .
    ports:
      - "8000:8000"
    depends_on:
      - db
      - cache
  db:
    image: postgres:16
  cache:
    image: redis:7
"""


def scan(repo, tmp_path, files, services=None):
    root = repo(files)
    args = ["infra.py", root, "--out", tmp_path / "w" / "infra.json"]
    if services is not None:
        save(tmp_path / "w" / "services.json", services)
        args += ["--services", tmp_path / "w" / "services.json"]
    r = run(*args)
    assert r.returncode == 0, r.stderr
    assert repo.clean()
    return load(tmp_path / "w" / "infra.json")


def test_infra_compose(repo, tmp_path):
    i = scan(repo, tmp_path, {"docker-compose.yml": COMPOSE})
    nodes = {n["id"]: n for n in i["nodes"]}
    assert {k: n["kind"] for k, n in nodes.items()} == {"web": "service", "db": "database", "cache": "cache"}
    assert nodes["web"]["ports"] == ["8000:8000"] and nodes["db"]["image"] == "postgres:16"
    assert sorted((e["from"], e["to"]) for e in i["edges"]) == [("web", "cache"), ("web", "db")]
    assert {n["file"] for n in i["nodes"]} | {e["file"] for e in i["edges"]} == {"docker-compose.yml"}


def test_infra_kubernetes(repo, tmp_path):
    k8s = """apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/acme/web:1.2
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
"""
    i = scan(repo, tmp_path, {"k8s/web.yaml": k8s})
    assert len(i["nodes"]) == 1
    n = i["nodes"][0]
    assert n["id"] == "web" and n["image"] == "ghcr.io/acme/web:1.2" and set(n["ports"]) == {"8080", "80"}


def test_infra_terraform(repo, tmp_path):
    i = scan(repo, tmp_path, {"infra/main.tf": 'resource "aws_s3_bucket" "uploads" {\n  bucket = "x"\n}\n'})
    assert [(n["id"], n["kind"], n["file"]) for n in i["nodes"]] == [("uploads", "storage", "infra/main.tf")]


def test_infra_external_from_services(repo, tmp_path):
    i = scan(repo, tmp_path, {"docker-compose.yml": COMPOSE},
             services={"services": [{"name": "OpenAI", "kind": "llm", "evidence": [{"file": "app.py"}]}]})
    ext = [n for n in i["nodes"] if n["kind"] == "external"]
    assert [n["id"] for n in ext] == ["OpenAI"] and ext[0]["file"] == "app.py"
    assert any("OpenAI" in u for u in i["unknowns"])


def test_infra_none_found_says_so(repo, tmp_path):
    i = scan(repo, tmp_path, {"a.py": "x = 1\n"})
    assert i["nodes"] == []
    assert any("no Compose, Kubernetes or Terraform files" in n for n in i["not_checked"])


def test_infra_anchor_is_not_checked(repo, tmp_path):
    compose = "x-base: &base\n  image: node:20\nservices:\n  web:\n    <<: *base\n"
    i = scan(repo, tmp_path, {"docker-compose.yml": compose})
    assert any(n.startswith("docker-compose.yml") for n in i["not_checked"])


def test_infra_same_edge_in_two_compose_files_is_drawn_once(repo, tmp_path):
    """Seen on a real repo: a root and a deploy/ Compose file describe the same two services."""
    i = scan(repo, tmp_path, {"docker-compose.yml": COMPOSE, "deploy/docker-compose.yml": COMPOSE})
    assert sorted((e["from"], e["to"]) for e in i["edges"]) == [("web", "cache"), ("web", "db")]



def test_infra_comment_after_a_key_does_not_crash(repo, tmp_path):
    """Review 3: `services:  # the stack` crashed the reader."""
    i = scan(repo, tmp_path, {"docker-compose.yml": "services:  # the stack\n  web:   # api\n    image: nginx:1\n"})
    assert [(n["id"], n["kind"]) for n in i["nodes"]] == [("web", "proxy")]


def test_infra_unreadable_rest_of_file_is_not_checked(repo, tmp_path):
    """Review 4: a multi-line plain scalar used to drop every service after it, silently."""
    compose = 'services:\n  web:\n    image: x\n    command: sh -c\n      "run"\n  db:\n    image: postgres:16\n'
    i = scan(repo, tmp_path, {"docker-compose.yml": compose})
    assert any(n.startswith("docker-compose.yml") for n in i["not_checked"])
