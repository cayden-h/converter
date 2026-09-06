# Windows code signing

The Windows installers are unsigned today, so SmartScreen warns on first run.
`.github/workflows/release.yml` already contains the signing steps; they are skipped until the repository is configured, so a release cut right now behaves exactly as before.

## Why SignPath

SignPath Foundation signs open-source projects for free.
Converter meets some of the criteria: AGPL-3.0-or-later is OSI-approved with no commercial dual-licensing, releases are built in CI, and every bundled tool is itself open source.

Two criteria are NOT met yet, and applying before they are will get the application declined.

**The repository is private.** SignPath Foundation requires a publicly accessible repository. `cayden-h/converter` is private, so the application cannot be assessed at all.

**There is no reputation to show.** The application form has a required "Reputation" field asking for links or evidence that the project is widely used or trusted - media coverage, download statistics, GitHub insights, community discussion. The repository was created on 2026-09-04 and currently has no stars, forks or watchers. There is nothing to put in that field.

Make the repository public and let the project accumulate some real usage first. The application is a human review, so a premature one is worth avoiding.

The trade to understand before applying: the certificate belongs to SignPath Foundation, not to you.
Windows will show the verified publisher as **SignPath Foundation**, not your name or Converter's.

If you want your own name on the publisher line, Azure Artifact Signing is about $120 a year and individual sign-ups are limited to the USA and Canada.
Nothing in the workflow depends on which one you pick, but the steps below are SignPath's.

## Enabling it

1. Make the repository public, and be able to answer the "Reputation" field honestly. See the section above.
2. Apply at <https://signpath.org/apply>. They review the project and its build setup, and the form ends with a reCAPTCHA, so it has to be submitted by hand.

   Required fields: Project Name, Repository URL, Homepage URL, Tagline, Description, Reputation, First Name, Last Name, Email, Primary Discovery Channel.
   Optional: Download URL, Privacy Policy URL, Wikipedia URL, Maintainer Type, Build System, Company Name.

   Note the Download URL rule: that page must state the project uses SignPath Foundation for code signing, so the README or the release page needs a line saying so before you submit it.
3. In SignPath, create a project and an artifact configuration describing the two files to sign, `Converter-<version>-setup.exe` and `Converter-<version>-portable.exe`, then a signing policy for releases.
4. Add one repository **secret**:
   - `SIGNPATH_API_TOKEN`
5. Add four repository **variables** (not secrets - none of these are sensitive):
   - `SIGNPATH_ORGANIZATION_ID`
   - `SIGNPATH_PROJECT_SLUG`
   - `SIGNPATH_SIGNING_POLICY_SLUG`
   - `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG`

The presence of `SIGNPATH_API_TOKEN` is what turns signing on.
If the token is set but a variable is missing, the run fails rather than quietly publishing unsigned.

6. Update `README.md`: remove the SmartScreen paragraph once a signed release has actually been verified on a real machine, not before.

## How the workflow handles it

Building and publishing are separate steps, because signing has to happen between them.

1. `electron-builder --win --publish never` builds the installers.
2. They are uploaded as a GitHub Actions artifact. SignPath reads what it signs from that artifact, so the upload is a required input to signing rather than a convenience.
3. The signing step submits the request and waits for the signed files.
4. The signed copies replace the originals.
5. `Get-AuthenticodeSignature` asserts each installer reports `Valid`. A signing step that silently did nothing would otherwise publish binaries only believed to be signed.
6. Only on a `v*` tag, a draft release is created with the two installers.

## Two consequences worth knowing

**`latest.yml` and the `.blockmap` files are no longer published.**
electron-builder emits them, but they describe the unsigned bytes and are stale the moment signing rewrites the binaries.
Nothing consumes them today because no auto-updater is wired up.
Whoever adds one has to regenerate them after signing rather than trusting what electron-builder produced before it.

**electron-builder no longer publishes the release.**
Its own publisher created a second, blockmap-only draft release for every tag, which had to be cleaned up by hand after v0.1.1 and v0.1.2.
`gh release create` publishes exactly the two assets instead.

## Reputation

Signing does not remove the SmartScreen warning immediately.
Reputation accrues to the certificate over downloads and time.
The real benefit is that it accrues at all: unsigned, reputation attaches to each file hash, so every release starts from zero.
