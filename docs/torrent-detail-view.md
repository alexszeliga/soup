# Torrent Detail View Specification

## Overview
The Torrent Detail View is a central management interface for individual torrents. It bridges the gap between raw qBittorrent data and rich media metadata from TMDB.

## Design Strategy: Material 3 Modal Dialog
Based on the project's "Google Cloud Console" aesthetic and the need for high-density information management, we will implement a **Centered Modal Dialog**.

### Why a Modal?
- **Focus:** Isolates the management task from the background list.
- **Real Estate:** Provides a large, consistent canvas for the upcoming Phase 3 "File Tree" and priority management.
- **Responsiveness:** Easily adapts from a wide desktop dialog to a full-screen mobile view.

---

## Component Architecture

### 1. Header (The "Hero" Section)
- **Visuals:** A semi-transparent "Glassmorphism" header with a blurred version of the TMDB backdrop image.
- **Metadata:** Large Poster (left), Title (H1), Year, and a "Matching Status" chip (e.g., "Matched by Soup").
- **Primary Actions:** Floating Action Buttons (FAB) or high-emphasis buttons for Start/Pause/Delete.

### 2. Information Hierarchy (Tabbed Interface)

#### **Tab 1: Overview & Metadata**
- **Rich Context:** Plot summary, Cast list (horizontal scrolling chips), and Genres.
- **Technical Stats:** 
  - Save Path (with "Copy to Clipboard").
  - Added Date & Completion Date.
  - Total Size vs. Downloaded.
  - Seeding Ratio & Tracker Information.
  - Peer/Seed counts.

#### **Tab 2: File Management (Phase 3 Roadmap)**
- **File Tree:** A hierarchical view of folders and files within the torrent.
- **Priority Controls:** Individual "Download/Skip" toggles and priority levels (High, Normal, Low).
- **Progress:** Per-file progress bars.

---

## Technical Implementation Notes

### State Management
- **Selection:** Use a `selectedTorrentHash` state in the parent `App` or a dedicated Store.
- **Live Updates:** The modal should subscribe to the same `LiveSyncService` stream as the main list to ensure speeds and progress are real-time.

### Components
- `TorrentDetailModal.tsx`: The main container.
- `FileTree.tsx`: (Future) Recursive component for rendering directory structures.
- `MetadataHero.tsx`: The branded header with TMDB assets.

---

## Roadmap Integration
- [ ] **Scaffold Modal:** Create the base M3 Dialog component and trigger logic.
- [ ] **Metadata Display:** Map existing `MediaMetadata` fields (Plot, Cast) to the UI.
- [ ] **File List API:** Expand `QBClient` and `apps/server` to fetch the specific file list for a hash (`/torrents/files`).
- [ ] **File Control:** Implement priority switching and renaming.
