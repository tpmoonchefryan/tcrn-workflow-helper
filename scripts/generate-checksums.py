#!/usr/bin/env python3
"""Descriptor-confined generator for the three public release artifacts."""

import hashlib
import json
import os
import stat
import sys

ARTIFACTS = ("sbom.json", "skill-archive.json", "source-archive.json")
MAXIMUM_BYTES = 16 * 1024 * 1024
CHUNK_BYTES = 64 * 1024
STAGE_PREFIX = "checksums.txt.stage-"


class ChecksumError(Exception):
    def __init__(self, reason):
        self.reason = reason


def fail(reason):
    raise ChecksumError(reason)


def private_directory(info):
    return stat.S_ISDIR(info.st_mode) and info.st_uid == os.getuid() and (info.st_mode & 0o022) == 0


def private_file(info, maximum=MAXIMUM_BYTES):
    return (stat.S_ISREG(info.st_mode) and info.st_uid == os.getuid() and info.st_nlink == 1 and
            (info.st_mode & 0o022) == 0 and info.st_size <= maximum)


def identity(info, include_times=True):
    result = (info.st_dev, info.st_ino, info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode))
    if include_times:
        result += (info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)
    return result


def same_identity(one, two, include_times=True):
    return identity(one, include_times) == identity(two, include_times)


def directory_identity(info):
    return (info.st_dev, info.st_ino, info.st_uid, info.st_gid)


def same_directory(one, two):
    return directory_identity(one) == directory_identity(two)


def open_absolute_directory(path):
    if not path.startswith("/") or "\x00" in path or len(path.encode("utf-8")) > 4096:
        fail("CHECKSUM_ARTIFACTS_INVALID")
    current = os.open("/", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in (part for part in path.split("/") if part):
            before = os.stat(component, dir_fd=current, follow_symlinks=False)
            if stat.S_ISLNK(before.st_mode) or not stat.S_ISDIR(before.st_mode):
                fail("CHECKSUM_ARTIFACTS_INVALID")
            child = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current)
            opened = os.fstat(child)
            current_name = os.stat(component, dir_fd=current, follow_symlinks=False)
            if not same_directory(before, opened) or not same_directory(before, current_name):
                os.close(child)
                fail("CHECKSUM_ARTIFACTS_REPLACED")
            os.close(current)
            current = child
        return current
    except BaseException:
        try:
            os.close(current)
        except OSError:
            pass
        raise


def bounded_read(name, directory_fd):
    try:
        before = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        fail("CHECKSUM_INPUT_INVALID")
    if not private_file(before):
        fail("CHECKSUM_INPUT_INVALID")
    try:
        descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=directory_fd)
    except OSError:
        fail("CHECKSUM_INPUT_INVALID")
    try:
        descriptor_before = os.fstat(descriptor)
        if not same_identity(before, descriptor_before):
            fail("CHECKSUM_INPUT_REPLACED")
        content = bytearray()
        while True:
            part = os.read(descriptor, min(CHUNK_BYTES, MAXIMUM_BYTES - len(content) + 1))
            if not part:
                break
            content.extend(part)
            if len(content) > MAXIMUM_BYTES:
                fail("CHECKSUM_INPUT_INVALID")
        descriptor_after = os.fstat(descriptor)
        current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if not same_identity(before, descriptor_after) or not same_identity(before, current):
            fail("CHECKSUM_INPUT_REPLACED")
        return bytes(content), before
    finally:
        os.close(descriptor)


def current_capability(root, root_identity, artifacts_identity):
    current_root = open_absolute_directory(root)
    try:
        if not same_directory(os.fstat(current_root), root_identity):
            fail("CHECKSUM_ARTIFACTS_REPLACED")
        current_artifacts = os.stat("artifacts", dir_fd=current_root, follow_symlinks=False)
        if not private_directory(current_artifacts) or not same_directory(current_artifacts, artifacts_identity):
            fail("CHECKSUM_ARTIFACTS_REPLACED")
    finally:
        os.close(current_root)


def reject_reserved_stage_names(directory_fd):
    try:
        if any(name.startswith(STAGE_PREFIX) for name in os.listdir(directory_fd)):
            fail("CHECKSUM_STAGE_REPLACED")
    except OSError:
        fail("CHECKSUM_ARTIFACTS_REPLACED")


def pause(test_pause, boundary):
    if test_pause is None or test_pause[0] != boundary:
        return
    _, ready_fd, go_fd = test_pause
    try:
        os.write(ready_fd, b"R")
        if os.read(go_fd, 1) != b"G":
            fail("CHECKSUM_TEST_HANDSHAKE_INVALID")
    except OSError:
        fail("CHECKSUM_TEST_HANDSHAKE_INVALID")


def revalidate_bindings(root, root_identity, artifacts_identity, directory_fd, bindings):
    current_capability(root, root_identity, artifacts_identity)
    for name, expected in bindings:
        try:
            current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except OSError:
            fail("CHECKSUM_INPUT_REPLACED")
        if not same_identity(current, expected):
            fail("CHECKSUM_INPUT_REPLACED")


def create_final_output(root, root_identity, artifacts_identity, directory_fd, bindings, output_bytes, test_pause):
    # The only creation is at the final name with O_EXCL|O_NOFOLLOW.  There is no
    # mutable staging source and no validation-to-pathname-delete cleanup window.
    try:
        descriptor = os.open("checksums.txt", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o000, dir_fd=directory_fd)
    except FileExistsError:
        return False
    except OSError:
        fail("CHECKSUM_OUTPUT_INVALID")
    try:
        initial = os.fstat(descriptor)
        if (not stat.S_ISREG(initial.st_mode) or stat.S_IMODE(initial.st_mode) != 0o000 or
                initial.st_uid != os.getuid() or initial.st_nlink != 1):
            fail("CHECKSUM_OUTPUT_INVALID")
        pause(test_pause, "after-output-created")
        write_all(descriptor, output_bytes)
        os.fsync(descriptor)
        final = os.fstat(descriptor)
        current = os.stat("checksums.txt", dir_fd=directory_fd, follow_symlinks=False)
        if (not private_file(final, len(output_bytes)) or not same_identity(final, current) or
                final.st_size != len(output_bytes)):
            fail("CHECKSUM_OUTPUT_REPLACED")
        pause(test_pause, "before-output-publish")
        revalidate_bindings(root, root_identity, artifacts_identity, directory_fd, bindings)
        current = os.stat("checksums.txt", dir_fd=directory_fd, follow_symlinks=False)
        if not same_identity(final, current) or final.st_size != len(output_bytes):
            fail("CHECKSUM_OUTPUT_REPLACED")
        os.fchmod(descriptor, 0o600)
        os.fsync(descriptor)
        pause(test_pause, "after-output-publish")
        published = os.fstat(descriptor)
        current = os.stat("checksums.txt", dir_fd=directory_fd, follow_symlinks=False)
        if (not private_file(published, len(output_bytes)) or stat.S_IMODE(published.st_mode) != 0o600 or
                not same_identity(published, current) or published.st_size != len(output_bytes)):
            fail("CHECKSUM_OUTPUT_REPLACED")
    finally:
        os.close(descriptor)
    os.fsync(directory_fd)
    return True


def existing_output_matches(directory_fd, output_bytes):
    try:
        existing = os.stat("checksums.txt", dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        return False
    except OSError:
        fail("CHECKSUM_OUTPUT_INVALID")
    if stat.S_IMODE(existing.st_mode) == 0o000 and private_file(existing, len(output_bytes)):
        fail("CHECKSUM_OUTPUT_RETAINED")
    if not private_file(existing, len(output_bytes)):
        fail("CHECKSUM_OUTPUT_INVALID")
    existing_bytes, existing_bound = bounded_read("checksums.txt", directory_fd)
    if existing_bytes != output_bytes or not same_identity(existing, existing_bound):
        fail("CHECKSUM_OUTPUT_CONFLICT")
    return True


def write_all(descriptor, value):
    offset = 0
    while offset < len(value):
        written = os.write(descriptor, value[offset:])
        if written <= 0:
            fail("CHECKSUM_OUTPUT_INVALID")
        offset += written


def write_checksums(root, test_pause=None):
    root_fd = open_absolute_directory(root)
    artifacts_fd = None
    output = None
    try:
        root_info = os.fstat(root_fd)
        try:
            before_artifacts = os.stat("artifacts", dir_fd=root_fd, follow_symlinks=False)
        except FileNotFoundError:
            fail("CHECKSUM_ARTIFACTS_INVALID")
        if not private_directory(before_artifacts):
            fail("CHECKSUM_ARTIFACTS_INVALID")
        try:
            artifacts_fd = os.open("artifacts", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        except OSError:
            fail("CHECKSUM_ARTIFACTS_INVALID")
        opened_artifacts = os.fstat(artifacts_fd)
        named_artifacts = os.stat("artifacts", dir_fd=root_fd, follow_symlinks=False)
        if (not private_directory(opened_artifacts) or not same_directory(before_artifacts, opened_artifacts) or
                not same_directory(before_artifacts, named_artifacts)):
            fail("CHECKSUM_ARTIFACTS_REPLACED")
        pause(test_pause, "after-directory-open")
        reject_reserved_stage_names(artifacts_fd)
        bindings = []
        for name in ARTIFACTS:
            content, info = bounded_read(name, artifacts_fd)
            bindings.append((name, info))
            if output is None:
                output = []
            output.append(f"{hashlib.sha256(content).hexdigest()}  {name}")
        output_bytes = ("\n".join(output) + "\n").encode("utf-8")
        if existing_output_matches(artifacts_fd, output_bytes):
            current_capability(root, root_info, opened_artifacts)
            for name, expected in bindings:
                current = os.stat(name, dir_fd=artifacts_fd, follow_symlinks=False)
                if not same_identity(current, expected):
                    fail("CHECKSUM_INPUT_REPLACED")
            final_output, final_info = bounded_read("checksums.txt", artifacts_fd)
            if final_output != output_bytes or final_info.st_nlink != 1:
                fail("CHECKSUM_OUTPUT_REPLACED")
            current_capability(root, root_info, opened_artifacts)
            return {"reasonCode": "CHECKSUMS_GENERATED"}
        revalidate_bindings(root, root_info, opened_artifacts, artifacts_fd, bindings)
        if existing_output_matches(artifacts_fd, output_bytes):
            fail("CHECKSUM_OUTPUT_CONFLICT")
        pause(test_pause, "before-output-create")
        if not create_final_output(root, root_info, opened_artifacts, artifacts_fd, bindings, output_bytes, test_pause):
            fail("CHECKSUM_OUTPUT_CONFLICT")
        current_capability(root, root_info, opened_artifacts)
        for name, expected in bindings:
            current = os.stat(name, dir_fd=artifacts_fd, follow_symlinks=False)
            if not same_identity(current, expected):
                fail("CHECKSUM_INPUT_REPLACED")
        final_output, final_info = bounded_read("checksums.txt", artifacts_fd)
        if final_output != output_bytes or final_info.st_nlink != 1:
            fail("CHECKSUM_OUTPUT_REPLACED")
        current_capability(root, root_info, opened_artifacts)
        return {"reasonCode": "CHECKSUMS_GENERATED"}
    finally:
        if artifacts_fd is not None:
            os.close(artifacts_fd)
        os.close(root_fd)


def parse(argv):
    if len(argv) == 1:
        return argv[0], None
    if len(argv) == 5 and argv[0] == "--test-pause" and argv[1] in ("after-directory-open", "before-output-create", "after-output-created", "before-output-publish", "after-output-publish") and argv[2].isdigit() and argv[3].isdigit():
        ready, go = int(argv[2]), int(argv[3])
        if ready < 3 or go < 3 or ready == go:
            fail("CHECKSUM_TEST_HANDSHAKE_INVALID")
        return argv[4], (argv[1], ready, go)
    fail("CHECKSUM_CLI_INVALID")


def main():
    try:
        root, test_pause = parse(sys.argv[1:])
        receipt = write_checksums(root, test_pause)
        sys.stdout.write(json.dumps(receipt, separators=(",", ":"), sort_keys=True) + "\n")
    except ChecksumError as error:
        sys.stderr.write(json.dumps({"reasonCode": error.reason}, separators=(",", ":"), sort_keys=True) + "\n")
        raise SystemExit(1)
    except (OSError, ValueError, UnicodeError):
        sys.stderr.write('{"reasonCode":"CHECKSUM_GENERATION_FAILED"}\n')
        raise SystemExit(1)


if __name__ == "__main__":
    main()
