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


class StateTests(unittest.TestCase):
    def test_valid_and_invalid_state(self):
        state = {'phase': 'Phase 0', 'task': 'Harness', 'status': 'IN_PROGRESS', 'completed': [], 'blocked': [], 'issues': [], 'evidence': []}
        self.assertEqual(check.validate_state(state), [])
        for invalid in ({}, {**state, 'status': 'PASS'}, {**state, 'blocked': 'none'}, {**state, 'phase': ''}):
            self.assertTrue(check.validate_state(invalid))

    def test_missing_document_is_detected(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertTrue(check.validate_docs(pathlib.Path(directory)))


if __name__ == '__main__':
    unittest.main()
