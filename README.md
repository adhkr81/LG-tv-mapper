# LG TV UI Navigation Mapper

A manual UI mapping tool for **LG webOS TVs**. Capture screenshots from the TV, define interactive button hotspots on each screen, and build a structured navigation graph of the entire TV UI.

> **This is NOT** a navigation history tool or automatic state tracker.
> It is a **manual + semi-assisted** mapping system where every screen and button is explicitly defined by the user.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Usage Guide](#usage-guide)
  - [Importing a Screenshot](#importing-a-screenshot)
  - [Capturing from TV (Serial)](#capturing-from-tv-serial)
  - [Adding Button Hotspots](#adding-button-hotspots)
  - [Managing the Graph](#managing-the-graph)
- [Data Model](#data-model)
- [API Reference](#api-reference)
  - [Serial](#serial)
  - [Capture](#capture)
  - [Screens](#screens)
  - [Buttons](#buttons)
  - [Graph](#graph)
- [Project Structure](#project-structure)
- [Technical Details](#technical-details)
  - [Serial Connection Flow](#serial-connection-flow)
  - [State Management](#state-management)
  - [Data Persistence](#data-persistence)
- [Troubleshooting](#troubleshooting)

---

## Overview

This tool allows you to:

1. **Capture screenshots** from an LG webOS TV via RS232 serial connection (or import them manually)
2. **Create screen nodes** — each screenshot becomes a node in a visual graph
3. **Define button hotspots** — click on the screenshot to mark interactive elements
4. **Link screens together** — assign a target screen to each button, creating navigation edges
5. **Visualize the full navigation graph** — see all screens and their connections in an interactive React Flow canvas

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Frontend (React + Vite)                   │
│                     http://localhost:5173                      │
│                                                               │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │  GraphView   │  │ ScreenViewer │  │   SidebarEditor      │ │
│  │  (React Flow)│  │ (Hotspot     │  │   (Serial controls,  │ │
│  │              │  │  overlay)    │  │    screen details,   │ │
│  │              │  │              │  │    button list)      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────┘ │
│                         │                                     │
│                    Zustand Store                              │
│                         │                                     │
│                    API Client (fetch)                         │
└─────────────────────────┬────────────────────────────────────┘
                          │ HTTP
┌─────────────────────────┴────────────────────────────────────┐
│                    Backend (Node.js + Express)                │
│                    http://localhost:3001                       │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐ │
│  │ Serial   │  │ Capture  │  │ Screens  │  │   Buttons    │ │
│  │ Service  │  │ Service  │  │ Service  │  │   Service    │ │
│  └────┬─────┘  └──────────┘  └────┬─────┘  └──────────────┘ │
│       │                           │                           │
│  RS232 Serial                 screens.json                    │
│  (115200 baud)                + screenshots/                  │
│       │                                                       │
└───────┼───────────────────────────────────────────────────────┘
        │
   ┌────┴────┐
   │ LG TV   │
   │ (webOS) │
   └─────────┘
```

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- (Optional) **RS232-to-USB adapter** connected to LG TV via WEE debug device
- (Optional) USB drive plugged into the TV for screenshot storage

---

## Installation

```bash
# Clone or navigate to the project
cd LG-emulator-mapper

# Install all dependencies (server + client)
npm install
```

This uses npm workspaces to install dependencies for both `server/` and `client/` packages in a single command.

---

## Configuration

Copy the example environment file and edit it:

```bash
cp .env.example .env
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERIAL_PORT` | `COM3` | COM port where the RS232 cable is connected. Check Device Manager → Ports. |
| `SERIAL_BAUD` | `115200` | Baud rate for serial communication. Must be `115200` for LG TVs. |
| `USB_WATCH_PATH` | *(empty)* | Optional. Local folder path where USB screenshots land on your PC. |
| `PORT` | `3001` | Backend server port. |

---

## Running the App

### Start both servers (recommended)

```bash
npm run dev
```

This starts the backend and frontend concurrently:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

### Start individually

```bash
# Backend only
npm run dev:server

# Frontend only
npm run dev:client
```

---

## Usage Guide

### Importing a Screenshot

Use this when you already have a screenshot file on your PC (e.g., copied from USB).

1. Click the **Import** button in the toolbar
2. Enter a **Screen Name** (e.g., `home`, `settings`, `apps_menu`)
3. Drag & drop a screenshot file onto the dropzone, or click to browse
4. Click **Import**
5. The screen appears as a new node in the graph

### Capturing from TV (Serial)

Use this when the TV is connected via RS232 serial cable.

1. In the sidebar, click **Connect** under Serial Connection
2. Wait for status to show **Shell Ready** (the tool sends `debug` → `s` to enter the TV's shell)
3. Click the **Capture** button in the toolbar
4. Enter a **Screen Name**
5. Click **Capture** — the tool sends the `luna-send` screenshot command to the TV
6. The screenshot is saved to the USB drive on the TV at `/tmp/usb/sda/sda1/{screenName}.jpg`

> **Note**: After serial capture, you still need to get the file from the USB to your PC. You can either:
> - Physically move the USB stick from the TV to your PC
> - Configure `USB_WATCH_PATH` if the USB is network-accessible
> - Use the Import feature to manually upload the file

### Adding Button Hotspots

1. Click on a screen node in the graph to select it
2. Switch to the **Viewer** tab
3. Click **+ Add Hotspot** in the viewer header
4. Click on the screenshot where the button is located — a crosshair cursor appears
5. Enter the **button name** (e.g., `settings_btn`, `back_btn`)
6. Enter the **target screen name** (the screen this button navigates to), or leave empty
7. The hotspot appears as a glowing marker on the image:
   - **Cyan** = linked to an existing screen
   - **Amber** = target screen doesn't exist yet

### Managing the Graph

- **Select a screen**: Click any node in the graph → details appear in the sidebar
- **Rename a screen**: Click the screen name in the sidebar to edit
- **Change button targets**: Use the dropdown in the sidebar button list
- **Delete a button**: Click the ✕ next to any button in the sidebar
- **Delete a screen**: Click "Delete Screen" at the bottom of the sidebar
- **Drag nodes**: Reposition nodes freely in the graph canvas
- **Zoom/Pan**: Use scroll wheel and drag on the canvas background

---

## Data Model

### Screen

```json
{
  "id": "home",
  "image": "home.jpg",
  "buttons": [ ... ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique screen identifier (e.g., `"home"`, `"settings"`) |
| `image` | string | Screenshot filename stored in `server/src/data/screenshots/` |
| `buttons` | array | List of interactive button hotspots on this screen |

### Button

```json
{
  "id": "a1b2c3d4-...",
  "screenId": "home",
  "label": "settings_btn",
  "target": "settings",
  "x": 1200,
  "y": 300
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated UUID |
| `screenId` | string | Parent screen ID |
| `label` | string | Human-readable button name |
| `target` | string | Destination screen ID (creates a graph edge) |
| `x` | number | X coordinate on the original screenshot (pixels, relative to 3840×2160) |
| `y` | number | Y coordinate on the original screenshot (pixels, relative to 3840×2160) |

### Graph Relationships

Edges are **derived from buttons**, not stored separately:

```
Screen A  ──[button.target]──▶  Screen B
```

The `/api/graph` endpoint computes all edges at query time by iterating over every button and checking if its `target` matches an existing screen.

---

## API Reference

Base URL: `http://localhost:3001`

### Serial

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/serial/status` | Get connection status, port, and baud rate |
| `POST` | `/api/serial/connect` | Open serial port and initialize TV shell |
| `POST` | `/api/serial/disconnect` | Close serial port |

**Status response:**
```json
{
  "status": "shell-ready",
  "port": "COM3",
  "baudRate": 115200
}
```

Status values: `disconnected` → `connecting` → `connected` → `shell-ready`

---

### Capture

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/capture` | `{ "screenId": "home" }` | Capture screenshot via serial `luna-send` command |
| `POST` | `/api/capture/import` | `multipart/form-data`: `screenId` + `file` | Upload a screenshot file manually |

Both endpoints create a new screen and return the screen object.

---

### Screens

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/screens` | — | List all screens |
| `GET` | `/api/screens/:id` | — | Get a single screen by ID |
| `POST` | `/api/screens` | `{ "id": "...", "image": "..." }` | Create a new screen |
| `PUT` | `/api/screens/:id` | `{ "id": "new_name" }` | Rename a screen |
| `DELETE` | `/api/screens/:id` | — | Delete screen + its screenshot file |

---

### Buttons

All button endpoints are nested under a screen: `/api/screens/:id/buttons`

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/screens/:id/buttons` | — | List all buttons for a screen |
| `POST` | `/api/screens/:id/buttons` | `{ "label", "target", "x", "y" }` | Add a button hotspot |
| `PUT` | `/api/screens/:id/buttons/:buttonId` | `{ "label?", "target?", "x?", "y?" }` | Update a button |
| `DELETE` | `/api/screens/:id/buttons/:buttonId` | — | Delete a button |

---

### Graph

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/graph` | Get full graph: all screens + derived edges |

**Response:**
```json
{
  "screens": [ ... ],
  "edges": [
    {
      "source": "home",
      "target": "settings",
      "buttonId": "a1b2c3d4-...",
      "label": "settings_btn"
    }
  ]
}
```

---

### Static Files

| Path | Description |
|------|-------------|
| `GET /screenshots/:filename` | Serves screenshot images from `server/src/data/screenshots/` |

---

## Project Structure

```
LG-emulator-mapper/
├── package.json                # npm workspaces root
├── .env.example                # Environment configuration template
├── .gitignore
│
├── server/                     # Backend — Node.js + Express
│   ├── package.json
│   └── src/
│       ├── index.js            # Express app entry point
│       ├── config.js           # Loads env vars
│       ├── routes/
│       │   ├── serial.js       # Serial connection endpoints
│       │   ├── capture.js      # Screenshot capture + import
│       │   ├── screens.js      # Screen CRUD
│       │   ├── buttons.js      # Button CRUD (nested under screens)
│       │   └── graph.js        # Full graph query
│       ├── services/
│       │   ├── serial.js       # RS232 serial port management
│       │   ├── capture.js      # luna-send + file import logic
│       │   ├── screens.js      # Screen data access (JSON)
│       │   └── buttons.js      # Button data access (JSON)
│       └── data/
│           ├── screens.json    # Persisted screen + button data
│           └── screenshots/    # Captured/imported screenshot images
│
└── client/                     # Frontend — React + Vite
    ├── package.json
    ├── vite.config.js          # Vite config with API proxy
    ├── index.html
    └── src/
        ├── main.jsx            # React entry point
        ├── App.jsx             # Root layout (tabs + sidebar)
        ├── App.css
        ├── index.css           # Global design system
        ├── api/
        │   └── client.js       # HTTP fetch wrapper for all endpoints
        ├── store/
        │   └── useStore.js     # Zustand global state
        └── components/
            ├── GraphView/
            │   ├── GraphView.jsx   # React Flow canvas + modals
            │   ├── GraphView.css
            │   └── ScreenNode.jsx  # Custom node (thumbnail + label)
            ├── ScreenViewer/
            │   ├── ScreenViewer.jsx # Image display + hotspot overlay
            │   └── ScreenViewer.css
            └── SidebarEditor/
                ├── SidebarEditor.jsx # Serial controls + button list
                └── SidebarEditor.css
```

---

## Technical Details

### Serial Connection Flow

The LG TV is connected via RS232 serial cable through a WEE debug device:

```
PC (COM port) ──RS232──▶ WEE device ──▶ LG TV
```

The initialization sequence to reach the TV shell:

```
1. Open serial port at 115200 baud
2. Send "debug\r\n"    →  Enters debug mode
3. Wait 2 seconds
4. Send "s\r\n"         →  Enters shell mode
5. Wait 2 seconds       →  Shell ready
```

Once in shell mode, the capture command is:

```bash
luna-send -n 1 luna://com.webos.service.capture/executeOneShot \
  '{"path":"/tmp/usb/sda/sda1/{screenId}.jpg", "method":"DISPLAY", "width":3840, "height":2160, "format":"JPEG"}'
```

The screenshot is saved to a USB drive mounted at `/tmp/usb/sda/sda1/` on the TV.

### State Management

The frontend uses **Zustand** for global state:

| State | Type | Description |
|-------|------|-------------|
| `screens` | `Screen[]` | All screens loaded from the API |
| `selectedScreenId` | `string \| null` | Currently selected screen |
| `isCapturing` | `boolean` | Whether a capture/import is in progress |
| `isAddingHotspot` | `boolean` | Whether hotspot placement mode is active |
| `serialStatus` | `string` | Serial connection state |

All state mutations go through the API — the store calls the backend, then re-fetches to sync.

### Data Persistence

All data is stored in flat files — no database required:

- **`server/src/data/screens.json`** — Array of all screens with their buttons
- **`server/src/data/screenshots/`** — Directory of screenshot image files

Writes are atomic: data is written to a `.tmp` file first, then renamed to the target path, preventing corruption on crash.

---

## Troubleshooting

### "Failed to open COM3"

- Check that the RS232 cable is connected and the correct COM port is set in `.env`
- Open **Device Manager → Ports (COM & LPT)** to find the correct port number
- Make sure no other program (e.g., Tera Term) has the port open

### Serial connects but capture doesn't work

- The TV must be in debug mode for `luna-send` to work
- Try the command manually in Tera Term first to verify
- Check the server console for `[Serial RX]` output to see what the TV responds

### Screenshots don't appear in the app

- After serial capture, the image is saved to the **TV's USB drive**, not your PC
- You need to physically transfer the file or use the Import feature to upload it
- Verify the image exists in `server/src/data/screenshots/`

### Import fails

- Ensure the screen name doesn't already exist (each screen ID must be unique)
- Check that the file is a valid image format (JPEG, PNG)

### Hotspot positions look wrong

- Hotspot coordinates are recorded relative to the original image resolution (3840×2160)
- The overlay scales positions using percentage-based positioning
- If your screenshots are a different resolution, the markers may appear offset
