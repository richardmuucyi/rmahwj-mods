"""services.py: which outside accounts (LLM, payments, email, cloud) the code needs, and the key names it reads."""
from conftest import load, run, save

FILES = {
    "requirements.txt": "openai==1.40.0\n",
    ".env.example": "OPENAI_API_KEY=\nFOO_TOKEN=\nPORT=8000\n",
    "docker-compose.yml": "services:\n  web:\n    build: .\n    environment:\n      STRIPE_SECRET_KEY: sk_live_abc123\n",
    "app.py": 'import os\nkey = os.getenv("SENDGRID_API_KEY")\n',
}
MAP = {"manifests": ["requirements.txt", "docker-compose.yml"],
       "stack": [{"manifest": "requirements.txt", "name": "openai", "version": "==1.40.0"}]}


def scan(repo, tmp_path):
    root = repo(FILES)
    save(tmp_path / "w" / "map.json", MAP)
    r = run("services.py", root, "--map", tmp_path / "w" / "map.json", "--out", tmp_path / "w" / "services.json")
    return r, root


def test_services_counts_accounts(repo, tmp_path):
    r, _ = scan(repo, tmp_path)
    assert r.returncode == 0, r.stderr
    s = load(tmp_path / "w" / "services.json")
    assert s["accounts"] == 3
    by = {x["name"]: x for x in s["services"]}
    assert set(by) == {"OpenAI", "Stripe", "SendGrid"}
    assert {e["file"] for e in by["OpenAI"]["evidence"]} >= {"requirements.txt", ".env.example"}
    assert {e["file"] for e in by["Stripe"]["evidence"]} == {"docker-compose.yml"}
    assert by["OpenAI"]["kind"] == "llm" and by["Stripe"]["kind"] == "payments"


def test_services_never_prints_a_value(repo, tmp_path):
    r, _ = scan(repo, tmp_path)
    assert "sk_live_abc123" not in r.stdout + r.stderr
    assert "sk_live_abc123" not in (tmp_path / "w" / "services.json").read_text(encoding="utf-8")


def test_services_unknown_key_is_listed(repo, tmp_path):
    scan(repo, tmp_path)
    keys = {k["name"]: k for k in load(tmp_path / "w" / "services.json")["keys"]}
    assert "FOO_TOKEN" in keys and keys["FOO_TOKEN"].get("service") is None
    assert "PORT" not in keys                     # not a secret: no KEY, TOKEN, SECRET or PASSWORD


def test_services_leaves_repo_unchanged(repo, tmp_path):
    _, root = scan(repo, tmp_path)
    assert repo.clean()


def test_services_skips_settings_named_like_keys(repo, tmp_path):
    """Seen on a real repo: an endpoint or an expiry with TOKEN in its name is a setting, not a secret."""
    root = repo({".env.example": "INSPIRE_TOKEN_ENDPOINT=\nAPI_KEY_URL=\nINSPIRE_CLIENT_SECRET=\n",
                 "appsettings.json": '{"TokenExpiryMinutes": 5, "TokenEndpoint": "", "ClientSecret": ""}'})
    save(tmp_path / "w" / "map.json", {"stack": []})
    run("services.py", root, "--map", tmp_path / "w" / "map.json", "--out", tmp_path / "w" / "services.json")
    names = {k["name"] for k in load(tmp_path / "w" / "services.json")["keys"]}
    assert names == {"INSPIRE_CLIENT_SECRET", "ClientSecret"}



def test_services_reads_every_committed_env_file(repo, tmp_path):
    """Review 8: .env and .env.production are read for names (never values) and flagged as committed."""
    root = repo({".env": "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuv\n",
                 ".env.production": "STRIPE_SECRET_KEY=sk_live_abc123\n", ".env.example": "PORT=1\n"})
    save(tmp_path / "w" / "map.json", {"stack": []})
    r = run("services.py", root, "--map", tmp_path / "w" / "map.json", "--out", tmp_path / "w" / "services.json")
    s = load(tmp_path / "w" / "services.json")
    assert {x["name"] for x in s["services"]} == {"OpenAI", "Stripe"}
    flagged = " ".join(s["not_checked"])
    assert ".env:" in flagged and ".env.production" in flagged and ".env.example" not in flagged
    text = (tmp_path / "w" / "services.json").read_text(encoding="utf-8") + r.stdout
    assert "sk_live_abc123" not in text and "sk-abcdefghij" not in text
