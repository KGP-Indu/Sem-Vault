import csv
import zipfile
from pathlib import Path

import pytest

import seed


def test_is_excluded_skips_code_build_and_backup_folders():
    for p in ['HPSC/l123_src/a.pdf', 'HPSC/backup_pre_restyle/x.pdf', 'Simulation/sim/x.pdf', 'sim/x.pdf',
              '.obsidian/x.pdf', 'HPSC/__pycache__/x.pdf', '_inbox/a.pdf', 'HPSC/learn_src/fig/f.pdf',
              'HPSC/openmp_src/preview/p.pdf', '_semvault/docs/a.pdf']:
        assert seed.is_excluded(p), p


def test_is_excluded_keeps_course_material():
    for p in ['QDC/formula-sheet/QDC_Formula_Sheet.pdf', 'Simulation/IM31006_Simulation_25-26.pdf',
              'simulation lab/Lab6_Report_Group9.pdf', 'SCM/PYQs/PYQ_2024_Solutions.pdf']:
        assert not seed.is_excluded(p), p


@pytest.mark.parametrize('path,expected', [
    ('QDC/Endsem Papers/x.pdf', 'pyq'),
    ('EE/PYQs/x.pdf', 'pyq'),
    ('EE/endsems/x.pdf', 'pyq'),
    ('Simulation/simulation notes and paperas/12834_IM31006_SIMULATION_2025_autumn_endsem.pdf', 'pyq'),
    ('QDC/formula-sheet/x.pdf', 'shortnotes'),
    ('stochastic/summaries/x.pdf', 'shortnotes'),
    ('stochastic/CTMC-1.pdf', 'shortnotes'),
    ('QDC Lab/exp1/x.pdf', 'assignment'),
    ('QDC Lab All Exps/Experiment No 2.docx', 'assignment'),
    ('simulation lab/lab7/x.pdf', 'assignment'),
    ('HPSC/assignment/x.pdf', 'assignment'),
    ('SCM/A]SCM Introduction Lect#1.pdf', 'slides'),
    ('Simulation/Event_Graphs_and_Manual_Simulation_v2.pptx', 'slides'),
    ('EE/class notes/x.pdf', 'slides'),
    ('QDC/Books/Montgomery.pdf', 'book'),
    ('HPSC/textbook.pdf', 'book'),
    ('EE/Practice_Papers/x.pdf', 'test'),
    ('QDC/class test 1.pdf', 'test'),
    ('HPSC/quiz2.pdf', 'test'),
])
def test_guess_type(path, expected):
    assert seed.guess_type(path) == expected


def test_find_source_pairs_same_stem_tex(tmp_path):
    (tmp_path / 'a.pdf').write_bytes(b'%PDF')
    (tmp_path / 'a.tex').write_text('x')
    (tmp_path / 'b.pdf').write_bytes(b'%PDF')
    assert seed.find_source(tmp_path / 'a.pdf') == tmp_path / 'a.tex'
    assert seed.find_source(tmp_path / 'b.pdf') is None


def test_needs_bundle():
    assert seed.needs_bundle(r'\includegraphics[width=3cm]{fig/a}')
    assert seed.needs_bundle(r'\input{common}')
    assert seed.needs_bundle(r'\include{ch1}')
    assert not seed.needs_bundle(r'\section{Hello} plain text')


@pytest.mark.parametrize('name,expected', [
    ('12834_IM31005_QUALITY-DESIGN-AND-CONTROL_2025_autumn_endsem.pdf',
     {'course': 'IM31005', 'year': 2025, 'term': 'autumn', 'exam': 'endsem'}),
    ('2023_End_Autumn_Industrial_and_System_IM31005_Quality_Design_and_Control_EA_2022 (1).pdf',
     {'course': 'IM31005', 'year': 2023, 'term': 'autumn', 'exam': 'endsem'}),
    ('IM21203_EngEco_MidSem_2024_Solutions.pdf', {'course': 'IM21203', 'year': 2024, 'term': None, 'exam': 'midsem'}),
    ('notes.pdf', {'course': None, 'year': None, 'term': None, 'exam': None}),
])
def test_parse_pyq_matches_site_rules(name, expected):
    assert seed.parse_pyq(name) == expected


def test_parse_pyq_ignores_leading_numeric_id():
    r = seed.parse_pyq('11311_2024_End-Autumn_Industrial_&_Systems_Engineering_IM31005_Quality_Design_and_Control_2024.pdf')
    assert (r['year'], r['exam'], r['course']) == (2024, 'endsem', 'IM31005')


def test_duplicate_copy_is_not_included_by_default(tmp_path):
    root = tmp_path / 'sem'
    (root / 'QDC').mkdir(parents=True)
    (root / 'QDC' / 'Notes.pdf').write_bytes(b'%PDF')
    (root / 'QDC' / 'Notes (1).pdf').write_bytes(b'%PDF')
    rows = seed.scan_rows(root, {'folders': {'QDC': 'IM31005'}, 'courses': []})
    inc = {r['path']: r['include'] for r in rows}
    assert inc == {'QDC/Notes.pdf': 'y', 'QDC/Notes (1).pdf': 'n'}


def _write_csv(path, rows):
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=seed.CANDIDATE_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({**{c: '' for c in seed.CANDIDATE_COLUMNS}, **r})


def test_build_writes_only_included_rows_and_bundles_sources(tmp_path):
    root = tmp_path / 'sem'
    d = root / 'QDC' / 'sheet'
    (d / 'fig').mkdir(parents=True)
    (d / 'Sheet.pdf').write_bytes(b'%PDF')
    (d / 'Sheet.tex').write_text(r'\includegraphics{fig/chart}\input{defs}')
    (d / 'defs.tex').write_text('defs')
    (d / 'fig' / 'chart.png').write_bytes(b'png')
    for junk in ['Sheet.aux', 'Sheet.log', 'Sheet.out', 'Sheet.synctex.gz']:
        (d / junk).write_text('junk')
    (root / 'QDC' / 'Other.pdf').write_bytes(b'%PDF')
    cands = tmp_path / 'candidates.csv'
    _write_csv(cands, [
        {'include': 'y', 'path': 'QDC/sheet/Sheet.pdf', 'course': 'IM31005', 'type': 'shortnotes', 'title': 'Sheet',
         'source': 'QDC/sheet/Sheet.tex'},
        {'include': 'n', 'path': 'QDC/Other.pdf', 'course': 'IM31005', 'type': 'slides', 'title': 'Other'},
    ])
    staging = tmp_path / 'staging'
    conf = {'folders': {}, 'courses': [{'code': 'IM31005', 'name': 'Quality Design and Control', 'short': 'QDC', 'semester': 5}]}
    seed.build(cands, root, staging, conf)

    with open(staging / 'manifest.csv', encoding='utf-8') as f:
        manifest = list(csv.DictReader(f))
    assert len(manifest) == 1
    m = manifest[0]
    assert m['source_file'].endswith('.src.zip')
    assert m['source_name'] == 'Sheet.zip'
    assert 'start_here' not in m  # Start here was removed in revision 2
    assert m['type'] == 'shortnotes'
    assert (staging / m['file']).exists()
    names = set(zipfile.ZipFile(staging / m['source_file']).namelist())
    assert names == {'Sheet.tex', 'defs.tex', 'fig/chart.png'}
    with open(staging / 'courses.csv', encoding='utf-8') as f:
        assert [r['code'] for r in csv.DictReader(f)] == ['IM31005']


def test_build_ids_are_stable_across_runs(tmp_path):
    root = tmp_path / 'sem'
    (root / 'QDC').mkdir(parents=True)
    (root / 'QDC' / 'A.pdf').write_bytes(b'%PDF')
    cands = tmp_path / 'c.csv'
    _write_csv(cands, [{'include': 'y', 'path': 'QDC/A.pdf', 'course': 'IM31005', 'type': 'shortnotes', 'title': 'A'}])
    conf = {'folders': {}, 'courses': []}
    seed.build(cands, root, tmp_path / 's1', conf)
    seed.build(cands, root, tmp_path / 's2', conf)
    read = lambda p: list(csv.DictReader(open(p / 'manifest.csv', encoding='utf-8')))[0]['id']
    assert read(tmp_path / 's1') == read(tmp_path / 's2')


def test_build_refuses_rows_without_a_course(tmp_path):
    root = tmp_path / 'sem'
    root.mkdir()
    (root / 'A.pdf').write_bytes(b'%PDF')
    cands = tmp_path / 'c.csv'
    _write_csv(cands, [{'include': 'y', 'path': 'A.pdf', 'course': '', 'type': 'shortnotes', 'title': 'A'}])
    with pytest.raises(SystemExit) as e:
        seed.build(cands, root, tmp_path / 's', {'folders': {}, 'courses': []})
    assert 'A.pdf' in str(e.value)


def test_build_ships_plain_tex_when_referenced_files_are_missing(tmp_path):
    root = tmp_path / 'sem'
    (root / 'QDC').mkdir(parents=True)
    (root / 'QDC' / 'A.pdf').write_bytes(b'%PDF')
    (root / 'QDC' / 'A.tex').write_text(r'\includegraphics{not_here}')
    cands = tmp_path / 'c.csv'
    _write_csv(cands, [{'include': 'y', 'path': 'QDC/A.pdf', 'course': 'IM31005', 'type': 'shortnotes', 'title': 'A',
                        'source': 'QDC/A.tex'}])
    m = seed.build(cands, root, tmp_path / 's', {'folders': {}, 'courses': []})[0]
    assert m['source_file'].endswith('.src.tex')
    assert m['source_name'] == 'A.tex'


@pytest.mark.parametrize('kind,ok', [('book', True), ('slides', True), ('shortnotes', True), ('pyq', True),
                                     ('test', True), ('assignment', True), ('formula', False), ('notes', False)])
def test_build_accepts_only_the_six_section_types(tmp_path, kind, ok):
    root = tmp_path / 'sem'
    (root / 'QDC').mkdir(parents=True)
    (root / 'QDC' / 'A.pdf').write_bytes(b'%PDF')
    cands = tmp_path / 'c.csv'
    _write_csv(cands, [{'include': 'y', 'path': 'QDC/A.pdf', 'course': 'IM31005', 'type': kind, 'title': 'A'}])
    if ok:
        seed.build(cands, root, tmp_path / 's', {'folders': {}, 'courses': []})
    else:
        with pytest.raises(SystemExit):
            seed.build(cands, root, tmp_path / 's', {'folders': {}, 'courses': []})


def test_scan_no_longer_suggests_latex_sources(tmp_path):
    root = tmp_path / 'sem'
    (root / 'QDC').mkdir(parents=True)
    (root / 'QDC' / 'Sheet.pdf').write_bytes(b'%PDF')
    (root / 'QDC' / 'Sheet.tex').write_text('x')
    rows = seed.scan_rows(root, {'folders': {'QDC': 'IM31005'}, 'courses': []})
    assert [r['source'] for r in rows] == ['']
