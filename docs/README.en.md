<div align="center">

<h1><a href="https://deepfy.si"><img src="brand/icon-256.png" width="40" align="top" alt=""></a>&nbsp;Deepfy</h1>

### An agent-first family knowledge base

**Keep family health records and home-cooked recipes together on the web.**<br>
Connect your own agent over MCP, and sync Markdown files and attachments with a local Obsidian vault.

[![Release](https://img.shields.io/github/v/release/kuzicode/deepfy-family?include_prereleases&label=release&color=111111)](https://github.com/kuzicode/deepfy-family/releases) [![Stars](https://img.shields.io/github/stars/kuzicode/deepfy-family?style=flat&color=111111)](https://github.com/kuzicode/deepfy-family/stargazers) [![License](https://img.shields.io/badge/license-MIT-111111)](../LICENSE) ![Status](https://img.shields.io/badge/status-pre--release-C2410C)<br>
![Next.js](https://img.shields.io/badge/Next.js-000000?logo=nextdotjs&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) ![MCP](https://img.shields.io/badge/MCP-0F766E)

**[Website](https://deepfy.si)** &nbsp;·&nbsp; **[Docs](https://deepfy.si/en/docs)** &nbsp;·&nbsp; **[Releases](https://github.com/kuzicode/deepfy-family/releases)** &nbsp;·&nbsp; **[Roadmap](ROADMAP.md)** &nbsp;·&nbsp; **[Contributing](../.github/CONTRIBUTING.md)** &nbsp;·&nbsp; **[简体中文](../README.md)**

<br>

<img src="images/family-en.png" width="900" alt="The family overview: a card for each person with items needing attention, and upcoming checkups, rechecks and medication reviews. All data shown is fictional.">

<sub>All data shown is fictional.</sub>

</div>

<br>

> [!IMPORTANT]
> **Pre-release software under active development.** Features, APIs and data formats may change.
>
> Health analyses are for reference only and don’t replace medical advice. **Never post real health information in issues, pull requests or screenshots.**

## Is Deepfy for you?

Start with a family member’s checkups, medications and recheck dates. Or save a dish with its ingredients, method and photo for whoever cooks it next.

- **Keep the whole family in one place**: a profile, results and trends, medications and supplements for each person.
- **Family Recipes**. Search by dish or ingredient at `/kitchen`, or ask your agent to save a method. Each recipe is a Markdown file in your vault’s `Personal/菜单/` folder.
- **Hand a report to your agent**: it reads the report and enters the results. Every change is recorded, and you can undo it.
- **Know what's coming up**: overdue checkups, rechecks and supplement end dates appear on the overview and in email reminders.
- **Keep your data portable**: export your account at any time, and import it into your own instance.

Health records, recipe contents and attachments are encrypted per account on the server. This isn't end-to-end encryption, and some lookup metadata, such as report dates and titles, isn't encrypted yet. See the [architecture notes](architecture.md).

## Quick start

**Self-host it (recommended).** Run it on your own computer or home server and keep your data there. It takes three commands and no domain, HTTPS or email service: see the [self-hosting guide](self-hosting.en.md). You're welcome to help build it too: see [Contributing](#contributing).

**Need it hosted?** The hosted app at **[app.deepfy.si](https://app.deepfy.si)** is an invite-only early bird program. Request access on the sign-in page, and you'll get an email once it's approved. It's free for now, with 100 MB of attachments per account.

**Connect your agent.** Create a token on the **Agents** page, then add the MCP server. For Claude Code on the hosted app (on your own instance, use its address):

```sh
claude mcp add --transport http deepfy https://app.deepfy.si/mcp \
  --header "Authorization: Bearer kzh_…"
```

The **Agents** page has ready-to-copy setups for other agents. New tokens can write by default. Choose **Read-only** when you create one, or change it later.

## Run it locally

You need Node 22 and pnpm. With no configuration, it runs on fictional sample data:

```sh
pnpm install
pnpm dev        # http://localhost:3000, reads examples/sample-vault
pnpm test
```

Sign-in, MCP and writes need a local Postgres (Docker):

```sh
cp .env.example .env.local   # uncomment the cloud mode lines and generate the two local keys
pnpm db:up && pnpm db:migrate
pnpm dev                     # without a mail provider, sign-in codes print to the console
```

To run the database tests:

```sh
docker compose -f compose.dev.yml exec db createdb -U kzh kzh_test
pnpm test:db
```

Local development needs no production accounts or keys.

## Two modes

- **Cloud mode** (`DATABASE_URL` is set): accounts sign in, and records and recipe contents are encrypted per account in Postgres.
- **Local vault mode**: reads a folder of Markdown files directly, such as an Obsidian vault. This is mainly for development and backups.

To sync a local vault with an instance:

```sh
pnpm kzh login --server https://app.deepfy.si --token kzh_xxx
pnpm kzh push --dry-run      # preview what would be pushed
pnpm kzh push                # pushes only if validation passes; skips items newer in the cloud (--force overwrites)
pnpm kzh pull --into ./backup/Personal
```

Run `pnpm kzh --help` for all commands.

## Self-hosting

This is the recommended way to run Deepfy. The code ships with no user data, and you can import your account export from the hosted app. See the [self-hosting guide](self-hosting.en.md).

## Contributing

The best places to start are the indicator dictionary, data entry rules and translations. See [CONTRIBUTING.md](../.github/CONTRIBUTING.md) and [AGENTS.md](../AGENTS.md). To report a security issue, follow [SECURITY.md](../.github/SECURITY.md) instead of opening a public issue.

## License

The code is under the [MIT License](../LICENSE). The Deepfy name, logo and icons aren't covered by it; see [TRADEMARK.md](TRADEMARK.md).

Release notes from before this repository was public are in [docs/release-history.md](release-history.md).
