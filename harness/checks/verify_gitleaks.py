"""Exercise the real scanner with ephemeral synthetic data, never real credentials."""
import json
import pathlib
import secrets
import string
import subprocess
import sys
import tempfile


def main():
    if len(sys.argv) != 2:
        print('Usage: python harness/checks/verify_gitleaks.py <gitleaks executable>', file=sys.stderr)
        return 2
    executable = str(pathlib.Path(sys.argv[1]).resolve())
    alphabet = string.ascii_letters + string.digits
    fake = 'gh' + 'p_' + ''.join(secrets.choice(alphabet) for _ in range(36))
    with tempfile.TemporaryDirectory(prefix='harness-gitleaks-') as temp:
        root = pathlib.Path(temp)
        fixture = root / 'fixture.txt'
        report = root / 'report.json'
        def scan(*args):
            return subprocess.run([executable, 'dir', '--no-banner', '--no-color', '--redact=100', *args], capture_output=True, text=True)
        fixture.write_text('no credentials in this file\n', encoding='utf-8')
        clean = scan(str(fixture))
        if clean.returncode != 0:
            print('FAIL: clean fixture did not pass', file=sys.stderr)
            return 1
        fixture.write_text('token = ' + fake + '\n', encoding='utf-8')
        finding = scan('--verbose', '--report-format', 'json', '--report-path', str(report), str(fixture))
        if finding.returncode != 1 or not report.exists():
            print('FAIL: synthetic token was not reported', file=sys.stderr)
            return 1
        raw = report.read_text(encoding='utf-8')
        findings = json.loads(raw)
        if not any(item.get('RuleID') == 'github-pat' for item in findings):
            print('FAIL: expected github-pat rule did not match', file=sys.stderr)
            return 1
        if fake in (finding.stdout + finding.stderr + raw):
            print('FAIL: synthetic token was not redacted', file=sys.stderr)
            return 1
        bad = root / 'invalid.toml'
        bad.write_text('invalid = [', encoding='utf-8')
        invalid = scan('--config', str(bad), str(fixture))
        if invalid.returncode == 0:
            print('FAIL: invalid configuration succeeded', file=sys.stderr)
            return 1
    print('PASS: clean fixture, synthetic finding, redaction and invalid configuration')
    return 0


if __name__ == '__main__':
    sys.exit(main())
