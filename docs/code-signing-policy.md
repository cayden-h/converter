# Code Signing Policy

This document describes how Converter's release artifacts are produced, reviewed and signed.
It exists because the SignPath Foundation requires participating projects to publish and maintain one.

## Project and maintainers

Converter is maintained by a single maintainer, Cayden Hutcheson (GitHub `cayden-h`).

This is stated plainly rather than dressed up: there is no separate reviewer or approver, because there is no second maintainer.
Every role below currently resolves to the same person.
If the project gains maintainers, this document is updated before their first release.

| Role | Who |
|---|---|
| Author | The maintainer, or a contributor opening a pull request |
| Reviewer | The maintainer |
| Approver (may trigger a signed release) | The maintainer |

## Source control

- The canonical repository is <https://github.com/cayden-h/converter>, and it is public.
- All changes land on `main` through pull requests. Direct pushes are used only for version bumps and tags.
- Multi-factor authentication is required on the maintainer's GitHub account.
- Only the maintainer can push tags, and only a tag triggers a release build.

## How releases are built

Windows releases are built exclusively by GitHub Actions from a tagged commit.
No Windows artifact built on a developer machine is ever published.

`.github/workflows/release.yml` runs on `windows-latest` and, in order:

1. Checks out the tagged commit.
2. Downloads the bundled conversion tools from pinned URLs and verifies each against a recorded SHA-256. A changed upstream archive fails the build rather than shipping.
3. Builds the application and runs the full test suite.
4. Packages the application and runs an integration test asserting that the packaged app resolves every conversion tool from inside its own bundle, and that real conversions produce output verified by file signatures rather than exit codes.
5. Builds the installers without publishing them.
6. Submits them to SignPath for signing.
7. Asserts that each installer reports a valid Authenticode signature, and fails the release if not.
8. Creates a draft GitHub release. A human reviews it before it is made public.

Signing is deliberately placed between building and publishing, so nothing unsigned can reach the release page and nothing merely believed to be signed can either.

## What is signed

- `Converter-<version>-setup.exe`, the NSIS installer.
- `Converter-<version>-portable.exe`, the portable executable.

## Honest exception: macOS

The macOS `.dmg` is currently built on the maintainer's machine and uploaded by hand, not built in CI.
It is ad-hoc signed only and is not covered by this policy or by any SignPath certificate.
This is recorded here rather than omitted, because a policy that quietly describes only the well-controlled half of the release would be misleading.

## Bundled third-party tools

Converter ships ffmpeg, ImageMagick, pandoc, poppler, resvg, dasel and potrace inside the application.
Each is downloaded during the build from a pinned upstream URL and verified against a recorded SHA-256 digest.
Updating any of them requires changing that digest in `scripts/vendor-binaries-win.ts`, which is a reviewable change in version control.

## Reporting a problem

Security or signing concerns should be raised as a GitHub issue at <https://github.com/cayden-h/converter/issues>, or privately to the maintainer.
Accusations of policy violation will be investigated.
