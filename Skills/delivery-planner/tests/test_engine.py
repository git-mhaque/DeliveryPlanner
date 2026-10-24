"""Behavioral checks against the maintained plan and isolated workspaces."""
from copy import deepcopy
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import subprocess
import sys

import pytest
import yaml
from jsonschema import Draft202012Validator

from delivery_planner import create_plan, main, slugify
from planner import publishing
from planner.rendering import render_plan
from planner.validation import SKILL_ROOT, read_plan, validate_data

WORKSPACE = SKILL_ROOT.parents[1]
EXAMPLE = WORKSPACE / 'Plans/north-star-platform/plan.yaml'


@pytest.fixture
def plan():
    return deepcopy(read_plan(EXAMPLE).data)


def errors(result):
    return {item.code for item in result.diagnostics if item.severity == 'error'}


def warnings(result):
    return {item.code for item in result.diagnostics if item.severity == 'warning'}


def test_schema_and_realistic_example():
    Draft202012Validator.check_schema(json.loads((SKILL_ROOT/'references/plan.schema.json').read_text()))
    result = read_plan(EXAMPLE)
    assert result.valid and not result.diagnostics
    assert len(result.data['milestones']) == 32
    assert {m['status'] for m in result.data['milestones']} == {'not_started','on_track','at_risk','blocked','done'}
    assert {e['kind'] for e in result.data['dependencies']} == {'requires','enables','relates_to'}


@pytest.mark.parametrize('change', [
    lambda p: p['periods'][0].pop('start'),
    lambda p: p['periods'][0].update(start='2026-02-30'),
    lambda p: p['milestones'][0].update(status='green'),
    lambda p: p['milestones'][0].update(epic_ids=['NS-101','NS-101']),
    lambda p: p['milestones'][0].update(epic_ids=[' NS-101']),
    lambda p: p['milestones'][0].update(epic_ids=[123]),
    lambda p: p.update(epics=[]),
    lambda p: p['plan'].update(as_of='tomorrow'),
    lambda p: p['view'].update(default_audience='board'),
    lambda p: p['dependencies'][0].update(kind='finish_to_start'),
])
def test_schema_rejects_unsupported_data(plan, change):
    change(plan)
    assert 'schema' in errors(validate_data(plan))


@pytest.mark.parametrize('change,code', [
    (lambda p: p['milestones'][1].update(id=p['milestones'][0]['id']), 'duplicate-id'),
    (lambda p: p['milestones'][0].update(stream='missing-stream'), 'unknown-reference'),
    (lambda p: p['milestones'][0].update(owner_team='missing-team'), 'unknown-reference'),
    (lambda p: p['milestones'][0].update(target_period='missing-period'), 'unknown-reference'),
    (lambda p: p['milestones'][0].update(target_date='2027-03-03'), 'target-date'),
    (lambda p: p['periods'][1].update(start='2026-11-30'), 'period-overlap'),
    (lambda p: p['periods'][0].update(end='2026-08-31'), 'period-range'),
    (lambda p: p['dependencies'].append(deepcopy(p['dependencies'][0])), 'duplicate-edge'),
    (lambda p: p['dependencies'].append({'from':'search-pilot','to':'search-pilot','kind':'enables'}), 'self-link'),
    (lambda p: p['dependencies'].append({'from':'search-pilot','to':'missing','kind':'requires'}), 'unknown-reference'),
])
def test_semantic_errors(plan, change, code):
    change(plan)
    assert code in errors(validate_data(plan))


def test_only_hard_cycles_fail(plan):
    plan['dependencies'] = [
        {'from':'indexing-foundation','to':'search-pilot','kind':'requires'},
        {'from':'search-pilot','to':'indexing-foundation','kind':'requires'},
    ]
    assert 'dependency-cycle' in errors(validate_data(plan))
    plan['dependencies'][1]['kind'] = 'enables'
    assert validate_data(plan).valid


def test_undirected_reverse_duplicate(plan):
    plan['dependencies'] = [
        {'from':'indexing-foundation','to':'search-pilot','kind':'relates_to'},
        {'from':'search-pilot','to':'indexing-foundation','kind':'enables'},
    ]
    assert 'duplicate-edge' in errors(validate_data(plan))


def test_snapshot_date_controls_warnings(plan):
    plan['plan']['as_of'] = '2027-03-01'
    result = validate_data(plan)
    assert result.valid
    assert {'overdue','overdue-decision'} <= warnings(result)
    plan['plan']['as_of'] = '2026-10-24'
    assert not {'overdue','overdue-decision'} & warnings(validate_data(plan))


def test_timing_and_completion_conflicts_are_warnings(plan):
    plan['dependencies'] = [{'from':'search-ga','to':'relevance-baseline','kind':'requires'}]
    result = validate_data(plan)
    assert result.valid
    assert {'dependency-timing','unfinished-prerequisite'} <= warnings(result)


def test_direct_keys_can_be_shared_and_empty(plan):
    plan['milestones'][0]['epic_ids']=['COMMON-1']
    plan['milestones'][1]['epic_ids']=['COMMON-1','E123']
    plan['milestones'][2]['epic_ids']=[]
    result=validate_data(plan)
    assert result.valid and not result.diagnostics


def test_yaml_duplicates_and_aliases_report_errors(tmp_path):
    path=tmp_path/'plan.yaml'
    path.write_text('schema_version: 1\nschema_version: 1\n')
    result=read_plan(path)
    assert 'yaml' in errors(result)
    assert 'line 2' in result.diagnostics[0].message
    path.write_text('value: &cycle\n  parent: *cycle\n')
    assert 'yaml' in errors(read_plan(path))


def test_diagnostics_identify_line_and_entity(tmp_path, plan):
    plan['milestones'][0]['status']='bad-status'
    path=tmp_path/'plan.yaml';path.write_text(yaml.safe_dump(plan,sort_keys=False))
    result=read_plan(path)
    diagnostic=next(d for d in result.diagnostics if d.severity=='error')
    assert diagnostic.object_id=='relevance-baseline'
    assert diagnostic.line and diagnostic.path=='$.milestones[0].status'


def test_create_empty_draft_and_publication_gate(tmp_path):
    path=create_plan(tmp_path,'A New Plan')
    result=read_plan(path)
    assert result.valid and result.data['plan']['id']=='a-new-plan'
    assert 'status: not_started # Valid options:' in path.read_text()
    assert not read_plan(path,for_publish=True).valid
    assert 'Draft plan' in render_plan(result)[0].decode()
    old=path.read_bytes()
    with pytest.raises(FileExistsError): create_plan(tmp_path,'A New Plan')
    assert path.read_bytes()==old


@pytest.mark.parametrize('name',['../outside','abc/def','..','123','!!!','a'*101])
def test_reject_pathlike_or_invalid_names(name):
    with pytest.raises(ValueError): slugify(name)


def test_plan_symlink_is_rejected(tmp_path):
    (tmp_path/'Plans').mkdir()
    (tmp_path/'Plans/escaped').symlink_to(tmp_path,target_is_directory=True)
    with pytest.raises(ValueError): publishing.plan_directory(tmp_path,'escaped')


def test_same_inputs_produce_identical_html():
    result=read_plan(EXAMPLE)
    first,fingerprint=render_plan(result)
    second,_=render_plan(result)
    assert first==second
    assert fingerprint==hashlib.sha256(EXAMPLE.read_bytes()).hexdigest()
    assert b'<script src=' not in first and b'<link rel="stylesheet"' not in first


def test_authored_html_and_script_terminators_are_data(plan):
    attack='</script><script>alert("unsafe")</script><img src=x onerror=alert(1)>'
    plan['plan']['title']=attack
    plan['milestones'][0]['notes']=attack
    result=validate_data(plan,source=b'fixed-input')
    html,_=render_plan(result)
    class Scripts(HTMLParser):
        def __init__(self): super().__init__();self.scripts=[];self.active=False
        def handle_starttag(self,tag,attrs):
            if tag=='script': self.active=True;self.scripts.append('')
        def handle_endtag(self,tag):
            if tag=='script':self.active=False
        def handle_data(self,text):
            if self.active:self.scripts[-1]+=text
    parser=Scripts();parser.feed(html.decode())
    assert len(parser.scripts)==2
    assert json.loads(parser.scripts[0])['data']['milestones'][0]['notes']==attack
    assert '<img src=x onerror=alert(1)>' not in html.decode()


def test_update_publish_and_failure_preservation(tmp_path, plan):
    directory=tmp_path/'Plans/north-star-platform';directory.mkdir(parents=True)
    source=directory/'plan.yaml';source.write_text(yaml.safe_dump(plan,sort_keys=False))
    base=['--root',str(tmp_path)]
    assert main(base+['update','north-star-platform','--json'])==0
    output=directory/'delivery_plan.html';before=output.read_bytes()
    assert main(base+['publish','north-star-platform','--to','Published','--json'])==0
    published=tmp_path/'Published/north-star-platform/delivery_plan.html'
    assert published.read_bytes()==before
    plan['plan']['summary']='A changed reporting snapshot.'
    source.write_text(yaml.safe_dump(plan,sort_keys=False))
    assert main(base+['publish','north-star-platform','--to','Published','--json'])==0
    after=published.read_bytes();assert after!=before and after==output.read_bytes()
    source.write_text('broken: [')
    assert main(base+['update','north-star-platform','--json'])==1
    assert main(base+['publish','north-star-platform','--to','Published','--json'])==1
    assert output.read_bytes()==after and published.read_bytes()==after


def test_atomic_replace_failure_preserves_previous_file(tmp_path, monkeypatch):
    path=tmp_path/'delivery_plan.html';path.write_bytes(b'previous')
    def fail(*args): raise OSError('Simulated replace failure')
    monkeypatch.setattr(publishing.os,'replace',fail)
    with pytest.raises(OSError): publishing.atomic_write(path,b'new')
    assert path.read_bytes()==b'previous'
    assert sorted(p.name for p in tmp_path.iterdir())==['delivery_plan.html']


def test_failed_render_preserves_previous_file(tmp_path, plan, monkeypatch):
    import delivery_planner
    directory=tmp_path/'Plans/north-star-platform';directory.mkdir(parents=True)
    (directory/'plan.yaml').write_text(yaml.safe_dump(plan,sort_keys=False))
    output=directory/'delivery_plan.html';output.write_bytes(b'previous')
    def fail(result): raise RuntimeError('Simulated template failure')
    monkeypatch.setattr(delivery_planner,'render_plan',fail)
    assert main(['--root',str(tmp_path),'update','north-star-platform','--json'])==2
    assert output.read_bytes()==b'previous'


def test_cli_independent_of_current_directory(tmp_path):
    process=subprocess.run([sys.executable,str(SKILL_ROOT/'scripts/delivery_planner.py'),'--root',str(WORKSPACE),'validate','north-star-platform','--json'],cwd=tmp_path,capture_output=True,text=True)
    assert process.returncode==0
    assert json.loads(process.stdout)['ok'] is True


def test_template_comments_match_supported_enums():
    schema=json.loads((SKILL_ROOT/'references/plan.schema.json').read_text())
    template=(SKILL_ROOT/'assets/skeleton.yaml').read_text()
    enum_fields=[schema['$defs']['milestone']['properties']['status'],schema['$defs']['milestone']['properties']['tag'],schema['$defs']['dependency']['properties']['kind'],schema['properties']['view']['properties']['default_audience']]
    for field in enum_fields:
        assert f"Valid options: {', '.join(field['enum'])}" in template
