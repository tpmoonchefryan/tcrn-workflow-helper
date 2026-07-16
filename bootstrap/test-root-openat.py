import os
import stat
import sys

MARKER = 'tcrn-helper-test'

def bad():
    sys.stdout.write('TEST_ROOT_REQUIRED\n')
    raise SystemExit(1)

def marked(name):
    return name == MARKER or name.startswith(MARKER + '-')

def private_directory(info):
    return stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and (info.st_mode & 0o077) == 0

def same_identity(one, two):
    return (one.st_dev, one.st_ino, one.st_uid, one.st_gid, stat.S_IMODE(one.st_mode)) == (two.st_dev, two.st_ino, two.st_uid, two.st_gid, stat.S_IMODE(two.st_mode))

def main():
    test_fds = None
    cleanup_fds = None
    open_fds = None
    created_open_fds = None
    if (len(sys.argv) == 7 and sys.argv[1] == '--test-cleanup' and all(value.isdigit() for value in sys.argv[2:6])):
        test_fds = (int(sys.argv[2]), int(sys.argv[3]))
        cleanup_fds = (int(sys.argv[4]), int(sys.argv[5]))
        requested = sys.argv[6]
    elif len(sys.argv) == 5 and sys.argv[1] == '--test' and sys.argv[2].isdigit() and sys.argv[3].isdigit():
        test_fds = (int(sys.argv[2]), int(sys.argv[3]))
        requested = sys.argv[4]
    elif len(sys.argv) == 5 and sys.argv[1] == '--test-open' and sys.argv[2].isdigit() and sys.argv[3].isdigit():
        open_fds = (int(sys.argv[2]), int(sys.argv[3]))
        requested = sys.argv[4]
    elif len(sys.argv) == 5 and sys.argv[1] == '--test-created-open' and sys.argv[2].isdigit() and sys.argv[3].isdigit():
        created_open_fds = (int(sys.argv[2]), int(sys.argv[3]))
        requested = sys.argv[4]
    elif len(sys.argv) == 2:
        requested = sys.argv[1]
    else:
        bad()
    if not requested.startswith('/') or len(requested.encode('utf-8')) > 4096:
        bad()
    components = [part for part in requested.split('/') if part]
    if any(part in ('.', '..') or '\x00' in part for part in components):
        bad()
    try:
        marker = next(index for index, part in enumerate(components) if marked(part))
    except StopIteration:
        bad()
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    current = os.open('/', flags)
    created = []
    try:
        strict = False
        for index, component in enumerate(components):
            strict = strict or index == marker
            try:
                before = os.stat(component, dir_fd=current, follow_symlinks=False)
            except FileNotFoundError:
                before = None
            if before is None:
                if not strict:
                    bad()
                parent = os.fstat(current)
                if not stat.S_ISDIR(parent.st_mode) or (index > marker and not private_directory(parent)):
                    bad()
                if test_fds:
                    try:
                        os.write(test_fds[0], b'R')
                        if os.read(test_fds[1], 1) != b'G':
                            bad()
                    except OSError:
                        bad()
                try:
                    os.mkdir(component, 0o700, dir_fd=current)
                except FileExistsError:
                    child = os.stat(component, dir_fd=current, follow_symlinks=False)
                    if not private_directory(child):
                        bad()
                else:
                    child = os.stat(component, dir_fd=current, follow_symlinks=False)
                    if not private_directory(child):
                        bad()
                    if created_open_fds:
                        try:
                            os.write(created_open_fds[0], b'R')
                            if os.read(created_open_fds[1], 1) != b'G':
                                bad()
                        except OSError:
                            bad()
                    child_fd = os.open(component, flags, dir_fd=current)
                    opened = os.fstat(child_fd)
                    if (not same_identity(os.stat(component, dir_fd=current, follow_symlinks=False), opened)
                            or not private_directory(opened)):
                        os.close(child_fd); bad()
                    created.append((current, component, child, child_fd))
                    current = child_fd
                    continue
            else:
                if stat.S_ISLNK(before.st_mode) or not stat.S_ISDIR(before.st_mode) or (strict and not private_directory(before)):
                    bad()
            if strict and open_fds:
                try:
                    os.write(open_fds[0], b'R')
                    if os.read(open_fds[1], 1) != b'G':
                        bad()
                except OSError:
                    bad()
            child_fd = os.open(component, flags, dir_fd=current)
            child = os.fstat(child_fd)
            if (not same_identity(os.stat(component, dir_fd=current, follow_symlinks=False), child)
                    or (strict and not private_directory(child))):
                os.close(child_fd); bad()
            current = child_fd
        final_path = os.lstat(requested)
        if (not os.path.isdir(requested) or os.path.realpath(requested) != requested or
                not same_identity(final_path, os.fstat(current)) or not private_directory(os.fstat(current))):
            bad()
        sys.stdout.write('TEST_ROOT_OK\n')
    except (OSError, ValueError):
        bad()
    finally:
        if sys.exc_info()[0] is not None and cleanup_fds:
            for parent_fd, name, identity, child_fd in reversed(created):
                try:
                    current = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                    if same_identity(current, identity) and same_identity(os.fstat(child_fd), identity):
                        os.write(cleanup_fds[0], b'R')
                        if os.read(cleanup_fds[1], 1) != b'G':
                            bad()
                except OSError:
                    pass
        for parent_fd, _, _, child_fd in created:
            try: os.close(child_fd)
            except OSError: pass
            try: os.close(parent_fd)
            except OSError: pass

if __name__ == '__main__':
    main()
