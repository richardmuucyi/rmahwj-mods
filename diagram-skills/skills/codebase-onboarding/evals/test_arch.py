"""arch.py: the architecture style with its evidence, DDD and TDD as approaches beside it, and coding practices."""
import json

from conftest import load, run

PY = "x = 1\n"


def classify(repo, tmp_path, files, commits=()):
    root = repo(files)
    for f, msg in commits:
        repo.commit(f, msg)
    w = tmp_path / "w"
    r = run("map_repo.py", root, "--out", w / "map")
    assert r.returncode == 0, r.stderr
    r = run("arch.py", root, "--map", w / "map.json", "--out", w / "arch.json")
    assert r.returncode == 0, r.stderr
    assert repo.clean()
    return load(w / "arch.json")


def row(a, key, name):
    return next(x for x in a[key] if x["name"] == name)


def test_arch_layered_monolith(repo, tmp_path):
    a = classify(repo, tmp_path, {"Dockerfile": "FROM python:3.12\n",
                                  "src/controllers/orders.py": PY, "src/services/orders.py": PY,
                                  "src/repositories/orders.py": PY, "src/main.py": PY})
    assert "layered" in a["verdict"] and "monolith" in a["verdict"]
    assert len(a["units"]) == 1


def test_arch_microservices(repo, tmp_path):
    compose = ("services:\n  orders:\n    build: ./orders\n  users:\n    build: ./users\n"
               "  billing:\n    build: ./billing\n")
    files = {"docker-compose.yml": compose}
    for s in ("orders", "users", "billing"):
        files |= {f"{s}/Dockerfile": "FROM node:20\n", f"{s}/index.js": "module.exports = 1;\n"}
    a = classify(repo, tmp_path, files)
    assert a["verdict"] == "microservices"
    assert len(a["units"]) == 3


def test_arch_vertical_slice(repo, tmp_path):
    files = {}
    for f in ("orders", "users"):
        files |= {f"features/{f}/handler.py": PY, f"features/{f}/model.py": PY, f"features/{f}/test_{f}.py": PY}
    a = classify(repo, tmp_path, files)
    assert "vertical slice" in a["verdict"]


def test_arch_ddd_is_an_approach_not_a_verdict(repo, tmp_path):
    a = classify(repo, tmp_path, {"domain/order_aggregate.py": PY, "domain/money_value_object.py": PY,
                                  "app/main.py": PY, "app/api.py": PY, "app/db.py": PY})
    ddd = row(a, "approaches", "DDD")
    assert ddd["value"] == "evidence found"
    assert {e["file"] for e in ddd["evidence"]} == {"domain/order_aggregate.py", "domain/money_value_object.py"}
    assert "DDD" not in a["verdict"]


def test_arch_tests_with_code_is_a_number(repo, tmp_path):
    a = classify(repo, tmp_path, {"README.md": "# x\n"}, commits=[
        ({"src/a.py": PY, "tests/test_a.py": PY}, "a"),
        ({"src/b.py": PY}, "b"),
        ({"src/c.py": PY, "tests/test_c.py": PY}, "c")])
    assert row(a, "approaches", "TDD")["value"].startswith("2 of 4 commits")


def test_arch_thin_evidence_is_not_determined(repo, tmp_path):
    a = classify(repo, tmp_path, {"a.py": PY, "README.md": "# x\n"})
    assert a["verdict"] == "not determined" and a["confidence"] == "low"


def test_arch_monorepo_is_mixed(repo, tmp_path):
    files = {"api/Dockerfile": "FROM python:3.12\n", "web/Dockerfile": "FROM node:20\n",
             "api/controllers/x.py": PY, "api/services/x.py": PY, "api/repositories/x.py": PY}
    for f in ("cart", "search"):
        files |= {f"web/features/{f}/view.js": "1;\n", f"web/features/{f}/{f}.test.js": "1;\n"}
    a = classify(repo, tmp_path, files)
    assert a["verdict"] == "mixed"
    assert {u["path"]: u["verdict"] for u in a["units"]} == {"api": "layered", "web": "vertical slice"}


def test_arch_practices_found(repo, tmp_path):
    a = classify(repo, tmp_path, {"ruff.toml": "line-length = 100\n", ".prettierrc": "{}\n", "a.py": PY})
    files = {e["file"] for p in a["practices"] for e in p["evidence"]}
    assert {"ruff.toml", ".prettierrc"} <= files


def test_arch_one_app_with_two_dockerfiles_is_a_monolith(repo, tmp_path):
    """Seen on a real repo: a root Dockerfile, the API's own Dockerfile, a .dockerignore beside it and a
    Compose `build:` with a nested `context:` are one deployable app, not three services."""
    compose = "services:\n  api:\n    build:\n      context: .\n      dockerfile: src/Api/Dockerfile\n  db:\n    image: mysql:8\n"
    a = classify(repo, tmp_path, {"Dockerfile": "FROM x\n", "Dockerfile.dockerignore": "bin\n",
                                  "docker-compose.yml": compose, "src/Api/Dockerfile": "FROM x\n",
                                  "src/Api/Controllers/a.cs": "class A {}\n", "src/Api/Services/b.cs": "class B {}\n",
                                  "src/Shared/c.cs": "class C {}\n"})
    assert a["verdict"] == "layered monolith"
    assert [u["path"] for u in a["units"]] == ["src/Api"]
    assert "context:" not in json.dumps(a)


def test_arch_build_context_outside_the_repo_is_ignored(repo, tmp_path):
    compose = "services:\n  api:\n    build:\n      context: ..\n"
    a = classify(repo, tmp_path, {"docker-compose.yml": compose, "api/Dockerfile": "FROM x\n",
                                  **{f"api/m{i}.py": PY for i in range(5)}})
    assert [u["path"] for u in a["units"]] == ["api"] and a["verdict"] == "monolith"


def test_arch_dotnet_layer_projects_are_layered(repo, tmp_path):
    """Seen on a real C# repo: projects named X.Domain, X.Application, X.Infrastructure, X.Api are layers."""
    files = {f"src/Acme.{p}/{p}.cs": "class A {}\n" for p in ("Domain", "Application", "Infrastructure", "Api")}
    a = classify(repo, tmp_path, files)
    assert a["verdict"] == "layered monolith"


def test_arch_single_unit_reads_the_whole_repo(repo, tmp_path):
    """Seen on a real C# repo: the only Dockerfile sits in the Api project, the layer projects beside it."""
    files = {f"src/Acme.{p}/{p}.cs": "class A {}\n" for p in ("Domain", "Application", "Infrastructure", "Api")}
    files["src/Acme.Api/Dockerfile"] = "FROM x\n"
    a = classify(repo, tmp_path, files)
    assert a["verdict"] == "layered monolith" and a["units"] == [{"path": "src/Acme.Api", "verdict": "layered"}]



def test_arch_monorepo_without_dockerfiles_is_mixed(repo, tmp_path):
    """Review 5: apps/ with different layouts and no Docker files is still "mixed", never one label."""
    files = {"apps/api/controllers/a.py": PY, "apps/api/services/a.py": PY, "apps/api/repositories/a.py": PY}
    for f in ("cart", "search"):
        files |= {f"apps/web/features/{f}/view.js": "1;\n", f"apps/web/features/{f}/{f}.test.js": "1;\n"}
    a = classify(repo, tmp_path, files)
    assert a["verdict"] == "mixed"
    assert {u["path"]: u["verdict"] for u in a["units"]} == {"apps/api": "layered", "apps/web": "vertical slice"}


def test_arch_dockerfiles_kept_in_one_folder_are_one_app(repo, tmp_path):
    """Review 6: docker/app and docker/worker hold only Dockerfiles; the code is one app in src/."""
    a = classify(repo, tmp_path, {"docker/app/Dockerfile": "FROM x\n", "docker/worker/Dockerfile": "FROM x\n",
                                  "src/controllers/a.py": PY, "src/services/a.py": PY, "src/repositories/a.py": PY})
    assert a["verdict"] == "layered monolith"
