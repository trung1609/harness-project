"""Small, dependency-free checks; failures and missing inputs return nonzero."""
import argparse
import json
from pathlib import Path, PurePosixPath
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
REQUIRED_DOCS = ('AGENTS.md', 'README.md', 'docs/PROJECT.md', 'docs/ROADMAP.md', 'docs/PROGRESS.md', 'docs/CONVENTIONS.md', 'docs/SECURITY.md', 'harness/README.md', 'harness/policy/state.json')
REQUIRED_AGENT_FILES = ('.agents/rules/core.md', '.agents/rules/quality-gates.md', '.agents/workflows/task.md', '.agents/workflows/phase-gates.md', *('.agents/skills/' + name + '/SKILL.md' for name in ('project-requirements', 'project-architecture', 'project-planning', 'project-implementation', 'project-review', 'project-harness-improvement')))


def validate_scope(paths):
    if not isinstance(paths, list) or not paths:
        raise ValueError('allowed_paths must be a nonempty list')
    for path in paths:
        if not isinstance(path, str) or not path or '\\' in path or any(c in path for c in '*?[]:'):
            raise ValueError('invalid allowed path')
        parts = path.rstrip('/').split('/')
        if path.startswith('/') or any(part in ('', '.', '..') for part in parts) or parts[0] == '.git':
            raise ValueError('invalid allowed path')


def out_of_scope(paths, allowed):
    validate_scope(allowed)
    return sorted(path for path in paths if not any(path.startswith(rule) if rule.endswith('/') else path == rule for rule in allowed))


def changed_paths(root, baseline):
    def git(*args):
        result = subprocess.run(['git', '-C', str(root), *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip())
        return {item.decode('utf-8', errors='surrogateescape') for item in result.stdout.split(b'\0') if item}
    git('rev-parse', '--verify', baseline + '^{commit}')
    return sorted(git('diff', '--name-only', '--no-renames', '-z', baseline, '--') | git('ls-files', '--others', '--exclude-standard', '-z'))


def validate_state(state):
    if not isinstance(state, dict):
        return ['state must be an object']
    errors = []
    for key in ('phase', 'task'):
        if not isinstance(state.get(key), str) or not state[key].strip():
            errors.append(key + ' must be a nonempty string')
    if state.get('status') not in ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE'):
        errors.append('invalid status')
    for key in ('completed', 'blocked', 'issues', 'evidence'):
        if not isinstance(state.get(key), list) or any(not isinstance(item, str) or not item.strip() for item in state[key]):
            errors.append(key + ' must be a list of nonempty strings')
    return errors


def validate_docs(root):
    return [f'missing {name}' for name in REQUIRED_DOCS + REQUIRED_AGENT_FILES if not (root / name).is_file()]


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('context')
    scope = sub.add_parser('scope')
    scope.add_argument('--base', required=True)
    scope.add_argument('--policy', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'context':
            errors = validate_docs(ROOT)
            state_file = ROOT / 'harness/policy/state.json'
            if state_file.is_file():
                errors.extend(validate_state(json.loads(state_file.read_text(encoding='utf-8'))))
        else:
            policy = json.loads(args.policy.read_text(encoding='utf-8'))
            if not isinstance(policy, dict):
                raise ValueError('policy must be an object')
            errors = ['out of scope: ' + p for p in out_of_scope(changed_paths(ROOT, args.base), policy.get('allowed_paths'))]
        if errors:
            print('\n'.join(errors), file=sys.stderr)
            return 1
        print('PASS:', args.command)
        return 0
    except (OSError, ValueError, RuntimeError) as exc:
        print('BLOCKED:', exc, file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
