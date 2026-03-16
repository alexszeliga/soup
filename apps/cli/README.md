# Soup CLI

The Soup CLI is a standalone terminal interface for managing your Soup media library. It operates as a "thin client," communicating with your remote Soup server over the network.

## Installation

### Prerequisites
- Node.js 20 or higher.
- A running Soup server instance.

### Global Setup
To install the `soup` command globally on your machine:
```bash
# From the root of the soup repository
cd apps/cli
pnpm build
pnpm link --global
```

## Configuration

The CLI requires the URL of your Soup server. You can provide this via an `.env` file in your current working directory or as an environment variable.

**Example .env:**
```bash
SOUP_URL=https://soup.your-domain.com
```

## Command Reference

### General Commands
| Command | Description |
|---------|-------------|
| `soup list` | List all torrents with progress and media titles. |
| `soup show <hash>` | Show detailed metadata and technical stats for a torrent. |
| `soup stats` | Display real-time global speeds and disk space. |

### Torrent Management
| Command | Description |
|---------|-------------|
| `soup add <source>` | Add a torrent via magnet link, HTTP URL, or local path to a `.torrent` file. |
| `soup start <hash>` | Resume a paused/stopped torrent. |
| `soup stop <hash>` | Pause/stop a running torrent. |
| `soup delete <hash>` | Remove a torrent from the server. |
| `soup delete <hash> --files` | Remove a torrent and delete its downloaded data from disk. |
| `soup recheck <hash>` | Trigger a hash recheck of the torrent data. |

### Media Metadata
| Command | Description |
|---------|-------------|
| `soup search <query>` | Search TMDB for metadata candidates. |
| `soup match <hash> <id>` | Manually link a torrent to a TMDB ID (e.g., `tmdb-movie-123`). |
| `soup unmatch <hash>` | Clear all media metadata for a torrent. |
| `soup mark-non-media <hash>` | Mark an item as non-media to prevent automatic matching. |
| `soup mark-media <hash>` | Unmark a non-media item to re-enable matching. |

### File Management
| Command | Description |
|---------|-------------|
| `soup files <hash>` | List all individual files, their sizes, and download priorities. |
| `soup priority <hash> <idx> <lv>`| Set priority (`skip`, `normal`, `high`, `max`) for file indices (comma-separated). |

### Ingestion & Tasks
| Command | Description |
|---------|-------------|
| `soup libraries` | List configured media library root paths. |
| `soup ingest <hash>` | Preview and queue an automated ingestion task. |
| `soup ingest <hash> -l <path>` | Ingest into a specific library subdirectory. |
| `soup tasks` | Monitor the progress of active ingestion tasks. |
| `soup tasks --clear` | Remove completed or failed tasks from the history. |

### System
| Command | Description |
|---------|-------------|
| `soup settings` | View core application preferences. |
| `soup settings --set <json>` | Update preferences (e.g., `--set '{"alt_dl_limit": 1048576}'`). |

## Development

To run the CLI from source without global linking:
```bash
pnpm start <command>
```
