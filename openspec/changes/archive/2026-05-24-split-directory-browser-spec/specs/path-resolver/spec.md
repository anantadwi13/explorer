## ADDED Requirements

### Requirement: Path-traversal containment

Every endpoint that accepts a path (`/view`, `/raw`, `/api/tree`, `/api/meta`) SHALL reject any request whose resolved absolute path is not contained within the served root's absolute path. Symlinks SHALL be followed only as long as the resolved target remains within the served root.

#### Scenario: Dot-dot escape attempt

- **WHEN** a request arrives at `/api/meta?path=../../../etc/passwd` or `/raw/../../../etc/passwd`
- **THEN** the response is a typed `outside_root` error (HTTP 400)
- **AND** no file outside the served root is opened or read

#### Scenario: Symlink to outside root

- **WHEN** a file `link.txt` under the served root is a symlink whose target resolves outside the root
- **AND** a request arrives for `/api/meta?path=link.txt` or `/raw/link.txt`
- **THEN** the response is a typed `outside_root` error
- **AND** the file is not read

#### Scenario: Symlink within root

- **WHEN** a file `shortcut.md` under the served root is a symlink to another file also under the served root
- **AND** a request arrives for `/api/meta?path=shortcut.md`
- **THEN** the response is metadata for the target file (size, mtime, mime, kind)
