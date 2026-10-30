"""diagrams.py: four D2 diagrams, each node coloured by its report section, rendered by the sibling d2-diagram skill."""
import os
import shutil
import subprocess
import sys

import pytest

from conftest import SCRIPTS, save

sys.path.insert(0, str(SCRIPTS))
import diagrams  # noqa: E402

MAP = {"edges": [["src/api/a.py", "src/core/x.py"], ["src/api/b.py", "src/core/x.py"],
                 ["src/api/c.py", "src/core/y.py"], ["src/cli/m.py", "src/core/x.py"]],
       "folders": [], "fan_in": []}
INFRA = {"nodes": [{"id": "web", "kind": "service", "image": None, "ports": ["8000:8000"], "file": "docker-compose.yml"},
                   {"id": "db", "kind": "database", "image": "postgres:16", "ports": [], "file": "docker-compose.yml"},
                   {"id": "cache", "kind": "cache", "image": "redis:7", "ports": [], "file": "docker-compose.yml"},
                   {"id": "OpenAI", "kind": "external", "image": None, "ports": [], "file": "app.py"}],
         "edges": [{"from": "web", "to": "db", "why": "depends_on", "file": "docker-compose.yml"}],
         "unknowns": [], "not_checked": []}
SERVICES = {"accounts": 3, "services": [{"name": "OpenAI", "kind": "llm", "evidence": []},
                                        {"name": "Stripe", "kind": "payments", "evidence": []},
                                        {"name": "SendGrid", "kind": "email", "evidence": []}], "keys": []}
ARCH = {"verdict": "mixed", "confidence": "high",
        "units": [{"path": "api", "verdict": "layered"}, {"path": "web", "verdict": "vertical slice"}]}


def test_module_map_has_every_folder_edge():
    d2 = diagrams.module_map(MAP)
    assert '"src/api" -> "src/core": "3"' in d2 and '"src/cli" -> "src/core": "1"' in d2
    for folder in ("src/api", "src/core", "src/cli"):
        assert f'"{folder}": {{class: structure}}' in d2


def test_module_map_caps_at_25_folders():
    edges = [[f"pkg{i:02d}/a.py", "core/x.py"] for i in range(40)]
    d2 = diagrams.module_map({"edges": edges})
    assert d2.count("{class: structure}") == 25 and "+16 more folders" in d2    # 41 folders, 25 drawn


def test_infra_diagram_uses_section_classes():
    d2 = diagrams.infra_map(INFRA)
    for n in ("web", "db", "cache"):
        assert f'"{n}": {{class: infrastructure' in d2
    assert '"OpenAI": {class: services' in d2
    assert 'shape: cylinder' in d2                     # the database looks like one


def test_services_diagram_groups_by_kind():
    d2 = diagrams.services_map(SERVICES)
    for kind in ("llm", "payments", "email"):
        assert f'"{kind}": {{' in d2
    assert d2.count("class: services") >= 3


def test_architecture_diagram_one_node_per_unit():
    d2 = diagrams.arch_map(ARCH)
    assert d2.count("class: architecture") == 2
    assert "layered" in d2 and "vertical slice" in d2


def test_render_path_resolves_from_anywhere(tmp_path):
    r = subprocess.run([sys.executable, "-c", f"import sys; sys.path.insert(0, r'{SCRIPTS}'); import diagrams;"
                        " print(diagrams.RENDER.is_file())"], capture_output=True, text=True, cwd=tmp_path)
    assert r.stdout.strip() == "True", r.stderr


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_diagrams_render(tmp_path):
    w = tmp_path / "w"
    save(w / "map.json", MAP)
    save(w / "infra.json", INFRA)
    save(w / "services.json", SERVICES)
    save(w / "arch.json", ARCH)
    svgs = diagrams.make(str(w))
    assert len(svgs) == 8 and all(os.path.getsize(s) > 1000 for s in svgs)


def test_labels_break_lines_with_a_real_newline_escape():
    """Seen in the first render: "db/npostgres:16". A label's line break must stay D2's \\n escape."""
    d2 = diagrams.infra_map(INFRA)
    assert 'label: "db\\npostgres:16"' in d2 and "/n" not in d2


def test_kind_containers_are_quiet_zones():
    """Seen in the first render: container labels at 28px over 16px nodes (d2-diagram quality criterion 11)."""
    d2 = diagrams.with_style(diagrams.services_map(SERVICES), "dark")
    assert '"llm": {class: zone' in d2 and "zone: {" in d2 and "font-size: 14" in d2


def test_no_d2_legend_box():
    """Seen in the first render: d2's legend is a white box on the dark theme. The report carries the colour key."""
    assert "d2-legend" not in diagrams.with_style(diagrams.infra_map(INFRA), "dark")


# ---- task 6b: the model chooses the style; the skill checks the contract ---------------------------

def drafted(tmp_path):
    w = tmp_path / "w"
    save(w / "map.json", MAP)
    save(w / "infra.json", INFRA)
    save(w / "services.json", SERVICES)
    save(w / "arch.json", ARCH)
    diagrams.make(str(w))
    diagrams.drawio(str(w))
    return w


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_check_passes_the_drafts(tmp_path):
    assert diagrams.check(str(drafted(tmp_path))) == []


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_drawio_written_for_each_diagram(tmp_path):
    d = drafted(tmp_path) / "out" / "diagrams"
    for name in ("module-map", "infra", "services", "architecture"):
        text = (d / f"{name}.drawio").read_text(encoding="utf-8")
        assert "<mxfile" in text and text.count("<mxCell") > 3


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_check_accepts_any_style_that_keeps_the_facts(tmp_path):
    """The model may restyle freely: other shapes, icons, layout, no section classes."""
    w = drafted(tmp_path)
    d = w / "out" / "diagrams"
    (d / "infra.d2").write_text('direction: down\nweb: "web" {shape: hexagon}\ndb: "db (postgres:16)" {shape: cylinder}\n'
                                'cache: "cache"\nOpenAI: "OpenAI" {shape: cloud}\nweb -> db\n', encoding="utf-8")
    assert diagrams.render(d / "infra.d2", d / "infra.svg", "light", None)
    for old in ("infra-dark.d2", "infra-dark.svg"):       # the model chose one theme for this diagram
        (d / old).unlink()
    diagrams.drawio(str(w))
    assert diagrams.check(str(w)) == []


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_check_flags_a_dropped_fact(tmp_path):
    w = drafted(tmp_path)
    d = w / "out" / "diagrams"
    (d / "infra.d2").write_text('web -> db\nOpenAI\n', encoding="utf-8")
    assert diagrams.render(d / "infra.d2", d / "infra.svg", "light", None)
    diagrams.drawio(str(w))
    assert any("infra" in p and "cache" in p for p in diagrams.check(str(w)))


@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_check_flags_a_stale_render_and_a_missing_drawio(tmp_path):
    w = drafted(tmp_path)
    d = w / "out" / "diagrams"
    os.utime(d / "services.svg", (1, 1))                  # the .d2 is newer than its render
    (d / "architecture.drawio").unlink()
    problems = diagrams.check(str(w))
    assert any("services" in p and "render" in p for p in problems)
    assert any("architecture" in p and "drawio" in p for p in problems)



@pytest.mark.skipif(shutil.which("d2") is None, reason="d2 not installed")
def test_check_flags_a_stale_dark_render(tmp_path):
    """Review 9: the model restyled infra.d2 and rendered light only; the draft's dark SVG would still show."""
    w = drafted(tmp_path)
    d = w / "out" / "diagrams"
    (d / "infra.d2").write_text('web -> db\ncache\nOpenAI\n', encoding="utf-8")
    assert diagrams.render(d / "infra.d2", d / "infra.svg", "light", None)
    diagrams.drawio(str(w))
    assert any("infra" in p and "dark" in p for p in diagrams.check(str(w)))


FOLDERS_ONLY = {"edges": [], "folders": [{"path": "(root)", "files": 3, "languages": {}},
                                         {"path": "src", "files": 40, "languages": {"C#": 38}},
                                         {"path": "src/Acme.Api", "files": 12, "languages": {"C#": 12}},
                                         {"path": "tests", "files": 9, "languages": {"C#": 9}}]}


def test_module_map_falls_back_to_folders_without_imports():
    """Seen on a real C# repo: no import data, so the draft drew only its title. Draw where things live instead."""
    d2 = diagrams.module_map(FOLDERS_ONLY)
    assert '"src" -> "src/Acme.Api"' in d2 and "12 files" in d2 and '"tests": {class: structure' in d2
    assert set(diagrams.facts("module-map", FOLDERS_ONLY)) == {"src", "src/Acme.Api", "tests"}
