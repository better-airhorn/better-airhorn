# Commit messages

[Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`

- `<subject>`: imperative, present tense, lower case, no trailing period ("add hat wobble", not "added hat wobble.").
- `<scope>` is optional: the app or package the commit touches, e.g. `slashbackend`, `voicenode`, `entities`,
  `audio`, `structures`, `deploy`, or `deps`.
- Breaking changes get a `!` after the type or scope and a `BREAKING CHANGE:` footer.

```
feat(voicenode): post the server count to top.gg and shard automatically
docs(deploy): pin metabase to localhost, dump v4 directly, check backups
chore: remove dead bot app, shori framework, localization and hotword engine
```

| Type       | For                                                         |
| ---------- | ----------------------------------------------------------- |
| `feat`     | a new feature for users                                     |
| `fix`      | a bug fix for users                                         |
| `perf`     | a performance improvement                                   |
| `refactor` | a code change that neither fixes a bug nor adds a feature   |
| `style`    | formatting only, no code change                             |
| `test`     | adding or changing tests only                               |
| `docs`     | documentation only                                          |
| `types`    | type definitions only                                       |
| `build`    | dependencies, Dockerfiles, compose files, the workspace     |
| `ci`       | GitHub Actions                                              |
| `config`   | configuration files (lint, format, TypeScript, env example) |
| `chore`    | anything else that does not touch app code                  |
| `revert`   | reverting an earlier commit                                 |
| `wip`      | work in progress on a branch; squash before merging         |
