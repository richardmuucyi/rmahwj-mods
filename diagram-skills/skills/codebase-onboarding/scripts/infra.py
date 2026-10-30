"""Infrastructure: the runtime pieces and how they connect, from the files that deploy the code.

  python -I infra.py R [--services W/services.json] --out W/infra.json

Read-only on the repo. Sources, every node and edge cited by file:
  * Compose: each service; its kind from the image (postgres, mysql → database; redis → cache; rabbitmq, kafka →
    queue; nginx, traefik → proxy; minio → storage; a `build:` → service); edges from `depends_on` and `links`;
  * Kubernetes: each Deployment / StatefulSet, with its image and container ports; a Service whose selector
    matches adds its ports;
  * Terraform: `resource "<type>" "<name>"` for known types (storage, database, cache, queue, proxy, compute);
  * services.json (from services.py): each outside service as an `external` node, plus an unknown: which part calls it.
No PyYAML: a small parser reads block mappings, lists and flow lists of scalars. A file with anchors, aliases
or flow mappings is listed under not_checked instead of being guessed at.
"""
import argparse
import json
import os
import re
import subprocess
import sys

COMPOSE = re.compile(r"(^|/)(docker-)?compose[^/]*\.ya?ml$")
K8S_KINDS = ("Deployment", "StatefulSet", "DaemonSet")
IMAGE_KINDS = [("database", r"postgres|mysql|mariadb|mongo|mssql|sqlserver|cockroach|cassandra|couchdb|oracle"),
               ("cache", r"redis|memcached|valkey"), ("queue", r"rabbitmq|kafka|nats|zookeeper|activemq|pulsar"),
               ("proxy", r"nginx|traefik|caddy|haproxy|envoy"), ("storage", r"minio|azurite|localstack")]
TF_KINDS = [("storage", r"_s3_bucket$|_storage_bucket$|_storage_account$|_blob"),
            ("database", r"_db_instance$|_rds_|_sql_|_dynamodb_table$|_cosmosdb|_documentdb"),
            ("cache", r"_elasticache|_redis_cache|_memorystore"), ("queue", r"_sqs_queue$|_sns_topic$|_pubsub|_servicebus|_eventhub|_kinesis"),
            ("proxy", r"_lb$|_alb$|_cloudfront|_api_gateway|_application_gateway|_cdn"),
            ("service", r"_lambda_function$|_ecs_service$|_instance$|_cloud_run|_function_app|_app_service|_container_app|_cloudfunctions")]


class Complex(Exception):
    pass


def git_files(repo):
    r = subprocess.run(["git", "-C", repo, "-c", "core.quotepath=off", "ls-files", "-z"],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        sys.exit(f"git ls-files failed: {r.stderr.strip()}")
    return [f for f in r.stdout.split("\0") if f]


def read(repo, f):
    try:
        with open(os.path.join(repo, f), encoding="utf-8", errors="replace") as fh:
            return fh.read(500_000)
    except OSError:
        return ""


# ---- a small YAML reader -------------------------------------------------------------------------

def scalar(text):
    text = text.strip()
    if text.startswith(("&", "*", "{")) or text == "<<":
        raise Complex("anchor, alias or flow mapping")
    if text.startswith("["):
        return [scalar(x) for x in text.strip("[]").split(",") if x.strip()]
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "'\"":
        return text[1:-1]
    return re.sub(r"\s+#.*$", "", text)


def yaml_docs(text):
    docs, lines = [], []
    for raw in text.replace("\t", "  ").splitlines() + ["---"]:
        if raw.strip() == "---" or raw.startswith("--- "):
            if lines:
                doc, i = block(lines, 0, indent_of(lines[0]))
                if i < len(lines):                    # never drop the rest of a file silently
                    raise Complex(f"cannot place line {i + 1}: {lines[i].strip()[:40]}")
                docs.append(doc)
            lines = []
        elif raw.strip() and not raw.lstrip().startswith("#"):
            lines.append(raw.rstrip())
    return docs


def indent_of(line):
    return len(line) - len(line.lstrip(" "))


def block(lines, i, ind):
    if lines[i].lstrip().startswith("- "):
        out = []
        while i < len(lines) and indent_of(lines[i]) == ind and lines[i].lstrip().startswith("-"):
            rest = lines[i].lstrip()[1:].strip()
            if re.match(r"^[^'\"\[{][^:]*:(\s|$)", rest):           # "- key: v": a mapping item
                lines[i] = " " * (ind + 2) + rest
                item, i = block(lines, i, ind + 2)
                out.append(item)
            else:
                out.append(scalar(rest))
                i += 1
        return out, i
    out = {}
    while i < len(lines) and indent_of(lines[i]) == ind and not lines[i].lstrip().startswith("- "):
        m = re.match(r"^\s*(['\"]?)([^'\"]+?)\1\s*:(?:\s+(.*))?$", lines[i])
        if not m:
            raise Complex(f"cannot read: {lines[i].strip()[:40]}")
        key, rest = m.group(2), re.sub(r"(^|\s+)#.*$", "", m.group(3) or "").strip()
        if key == "<<":
            raise Complex("merge key")
        i += 1
        if rest in ("|", ">", "|-", ">-", "|+", ">+"):
            while i < len(lines) and indent_of(lines[i]) > ind:
                i += 1
            out[key] = ""
        elif rest:
            out[key] = scalar(rest)
        elif i < len(lines) and (indent_of(lines[i]) > ind or
                                 (indent_of(lines[i]) == ind and lines[i].lstrip().startswith("- "))):
            out[key], i = block(lines, i, indent_of(lines[i]))
        else:
            out[key] = None
    return out, i


# ---- sources -------------------------------------------------------------------------------------

def image_kind(image):
    name = (image or "").split("/")[-1].lower()
    return next((k for k, rx in IMAGE_KINDS if re.match(rf"({rx})\b", name)), "service")


def from_compose(f, doc, nodes, edges):
    for name, svc in ((doc or {}).get("services") or {}).items():
        svc = svc if isinstance(svc, dict) else {}
        image = svc.get("image")
        kind = "service" if "build" in svc and not image else image_kind(image)
        ports = [str(p) for p in (svc.get("ports") or []) if not isinstance(p, dict)]
        nodes[name] = {"id": name, "kind": kind, "image": image, "ports": ports, "file": f}
        deps = svc.get("depends_on") or []
        for d in (deps if isinstance(deps, list) else list(deps)):
            edges.append({"from": name, "to": str(d), "why": "depends_on", "file": f})
        for d in svc.get("links") or []:
            edges.append({"from": name, "to": str(d).split(":")[0], "why": "link", "file": f})


def from_k8s(f, docs, nodes):
    services = []
    for d in docs:
        if not isinstance(d, dict):
            continue
        kind, meta = d.get("kind"), d.get("metadata") or {}
        spec = d.get("spec") or {}
        if kind in K8S_KINDS:
            tmpl = spec.get("template") or {}
            labels = ((tmpl.get("metadata") or {}).get("labels")) or {}
            containers = ((tmpl.get("spec") or {}).get("containers")) or []
            image = next((c.get("image") for c in containers if isinstance(c, dict)), None)
            ports = [str(p.get("containerPort")) for c in containers if isinstance(c, dict)
                     for p in (c.get("ports") or []) if isinstance(p, dict) and p.get("containerPort")]
            name = meta.get("name") or "deployment"
            nodes[name] = {"id": name, "kind": image_kind(image) if image else "service", "image": image,
                           "ports": ports, "file": f, "_labels": labels}
        elif kind == "Service":
            services.append((spec.get("selector") or {}, [str(p.get("port")) for p in spec.get("ports") or []
                                                         if isinstance(p, dict) and p.get("port")]))
    for selector, ports in services:
        for n in nodes.values():
            if selector and n.get("_labels") and all(n["_labels"].get(k) == v for k, v in selector.items()):
                n["ports"] = sorted(set(n["ports"]) | set(ports))


def from_terraform(f, text, nodes, skipped):
    for m in re.finditer(r'(?m)^\s*resource\s+"([\w-]+)"\s+"([\w-]+)"', text):
        rtype, name = m.groups()
        kind = next((k for k, rx in TF_KINDS if re.search(rx, rtype)), None)
        if kind:
            nodes[name] = {"id": name, "kind": kind, "image": None, "ports": [], "file": f, "type": rtype}
        else:
            skipped.append(rtype)


def scan(repo, services=None):
    files = git_files(repo)
    nodes, edges, unknowns, not_checked, skipped, seen = {}, [], [], [], [], False
    for f in files:
        is_compose = bool(COMPOSE.search(f))
        is_yaml = f.endswith((".yaml", ".yml"))
        if f.endswith(".tf"):
            seen = True
            from_terraform(f, read(repo, f), nodes, skipped)
        elif is_yaml:
            text = read(repo, f)
            if not is_compose and not re.search(r"(?m)^kind:\s*(" + "|".join(K8S_KINDS) + r"|Service)\b", text):
                continue
            seen = True
            try:
                docs = yaml_docs(text)
            except (Complex, IndexError, AttributeError) as e:
                not_checked.append(f"{f}: YAML too complex to read without a parser ({e})")
                continue
            try:
                if is_compose:
                    from_compose(f, docs[0] if docs else {}, nodes, edges)
                else:
                    from_k8s(f, docs, nodes)
            except (AttributeError, TypeError, KeyError) as e:
                not_checked.append(f"{f}: an unexpected shape the reader does not understand ({type(e).__name__})")
    for s in (services or {}).get("services", []):
        ev = s.get("evidence") or [{}]
        nodes[s["name"]] = {"id": s["name"], "kind": "external", "image": None, "ports": [],
                            "file": ev[0].get("file", ""), "service_kind": s.get("kind")}
        unknowns.append(f"Which part of the system calls {s['name']} ({s.get('kind')}), and with which account?")
    if not seen:
        not_checked.append("no Compose, Kubernetes or Terraform files in the repo: where it runs is not in the code")
    elif not any(f.endswith(".tf") or "kind:" in read(repo, f) for f in files if f.endswith((".tf", ".yaml", ".yml"))
                 and not COMPOSE.search(f)):
        unknowns.append("Only Compose files describe the runtime: where does production run, and what differs there?")
    if skipped:
        not_checked.append(f"{len(skipped)} Terraform resources of other types not drawn: {', '.join(sorted(set(skipped))[:8])}")
    for n in nodes.values():
        n.pop("_labels", None)
    unique = {}
    for e in edges:                                   # two Compose files often describe the same pair
        if e["to"] in nodes:
            unique.setdefault((e["from"], e["to"]), e)
    edges = list(unique.values())
    return {"nodes": list(nodes.values()), "edges": edges, "unknowns": unknowns, "not_checked": not_checked}


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("repo")
    p.add_argument("--services", help="W/services.json from services.py")
    p.add_argument("--out", required=True)
    a = p.parse_args()
    repo, out = os.path.abspath(a.repo), os.path.abspath(a.out)
    if os.path.commonpath([repo, out]) == repo:
        sys.exit("--out must be outside the repo")
    services = None
    if a.services:
        with open(a.services, encoding="utf-8") as fh:
            services = json.load(fh)
    result = scan(repo, services)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=1)
    print(f"{len(result['nodes'])} nodes, {len(result['edges'])} edges")
    for n in result["nodes"]:
        print(f"  {n['id']} ({n['kind']}) from {n['file']}")
    for n in result["not_checked"]:
        print(f"not checked: {n}")


if __name__ == "__main__":
    main()
