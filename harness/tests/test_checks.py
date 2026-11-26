import importlib.util
import json
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('check', ROOT / 'harness/checks/check.py')
check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check)


class ScopeTests(unittest.TestCase):
    def test_scope_allows_only_exact_files_or_directories(self):
        self.assertEqual(check.out_of_scope(['docs/a.md', 'README.md'], ['docs/', 'README.md']), [])
        self.assertEqual(check.out_of_scope(['docs-old/a.md', 'secret.txt'], ['docs/']), ['docs-old/a.md', 'secret.txt'])

    def test_invalid_policy_fails_closed(self):
        for paths in ([], ['../'], ['/tmp'], ['.git/'], ['*'], ['docs/../src/'], ['docs\\x']):
            with self.subTest(paths=paths), self.assertRaises(ValueError):
                check.validate_scope(paths)

    def test_git_detects_staged_unstaged_untracked_and_renamed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            def git(*args):
                return subprocess.run(['git', '-c', 'core.autocrlf=false', *args], cwd=root, check=True, capture_output=True)
            git('init', '-q')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'user.name', 'Test')
            (root / 'old.txt').write_text('old', encoding='utf-8')
            (root / 'modified.txt').write_text('before', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'baseline')
            git('mv', 'old.txt', 'new.txt')
            (root / 'modified.txt').write_text('after', encoding='utf-8')
            (root / 'untracked.txt').write_text('new', encoding='utf-8')
            paths = check.changed_paths(root, 'HEAD')
            self.assertEqual(set(paths), {'old.txt', 'new.txt', 'modified.txt', 'untracked.txt'})

    def test_invalid_baseline_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(RuntimeError):
                check.changed_paths(pathlib.Path(directory), 'HEAD')

    def test_staged_change_cannot_be_hidden_by_restoring_worktree(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            def git(*args):
                return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)
            git('init', '-q')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'user.name', 'Test')
            path = root / 'protected.txt'
            path.write_text('baseline', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'baseline')
            path.write_text('staged change', encoding='utf-8')
            git('add', 'protected.txt')
            path.write_text('baseline', encoding='utf-8')
            self.assertIn('protected.txt', check.changed_paths(root, 'HEAD'))

    def test_policy_from_baseline_ignores_worktree_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            def git(*args):
                return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True)
            git('init', '-q')
            git('config', 'user.email', 'test@example.invalid')
            git('config', 'user.name', 'Test')
            path = root / 'policy.json'
            path.write_text('{"allowed_paths":["docs/"]}', encoding='utf-8')
            git('add', '.')
            git('commit', '-qm', 'baseline')
            path.write_text('{"allowed_paths":["src/"]}', encoding='utf-8')
            self.assertEqual(check.read_baseline_policy(root, 'HEAD', 'policy.json'), {'allowed_paths': ['docs/']})
            with self.assertRaises(ValueError):
                check.read_baseline_policy(root, 'HEAD', '../policy.json')


class StateTests(unittest.TestCase):
    def test_valid_and_invalid_state(self):
        state = {'phase': 'Phase 0', 'task': 'Harness', 'status': 'IN_PROGRESS', 'completed': [], 'blocked': [], 'issues': [], 'evidence': []}
        self.assertEqual(check.validate_state(state), [])
        for invalid in ({}, {**state, 'status': 'PASS'}, {**state, 'blocked': 'none'}, {**state, 'phase': ''}):
            self.assertTrue(check.validate_state(invalid))

    def test_missing_document_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(check.validate_docs(pathlib.Path(directory)))

    def test_missing_agent_skill_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in check.REQUIRED_DOCS + check.REQUIRED_AGENT_FILES:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('---\nname: ' + target.parent.name + '\ndescription: Test description\n---\n', encoding='utf-8')
            self.assertEqual(check.validate_docs(root), [])
            (root / '.agents/skills/project-review/SKILL.md').unlink()
            self.assertIn('missing .agents/skills/project-review/SKILL.md', check.validate_docs(root))

    def test_skill_metadata_missing_or_wrong_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / 'project-review' / 'SKILL.md'
            path.parent.mkdir()
            for content in ('', '---\nname: other\ndescription: x\n---\n', '---\nname: project-review\ndescription: \n---\n', '---\nname: project-review\ndescription: "bad\n---\n'):
                path.write_text(content, encoding='utf-8')
                self.assertTrue(check.validate_skill(path), content)
            path.write_text('---\nname: project-review\ndescription: Review project changes.\n---\n', encoding='utf-8')
            self.assertEqual(check.validate_skill(path), [])


if __name__ == '__main__':
    unittest.main()
