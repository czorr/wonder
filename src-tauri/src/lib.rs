// ---------------------------------------------------------------------------
// Wonder — Tauri application entry.
//
// Responsibilities:
//   1. Wire the Tauri plugins the webview talks to (fs / dialog / http / log).
//   2. Install Wonder's native menu bar. On macOS this renders in the global
//      menu bar; on Windows/Linux it renders inside the window. The menu
//      items emit a `wonder:menu` event that the frontend (see
//      `src/app/shell/useNativeMenu.ts`) routes to the right store action.
//
// Menu philosophy: accelerators declared here are the single source of truth
// on desktop builds — macOS intercepts them at the OS level before the
// webview sees the keydown, so we route the work through `on_menu_event`
// instead of DOM-level keyboard handlers. In-app `keydown` listeners (e.g.
// Topbar.tsx) still exist as a fallback for non-Tauri environments and for
// shortcuts that don't live on the menu (Monaco's own, etc.).
// ---------------------------------------------------------------------------

use tauri::menu::{
  MenuBuilder, MenuItemBuilder, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Wry};

/// Build Wonder's native menu. Returns the top-level `Menu` ready to be
/// installed via `app.set_menu(...)`.
fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<Wry>> {
  let wonder = build_app_submenu(app)?;
  let file = build_file_submenu(app)?;
  let edit = build_edit_submenu(app)?;
  let view = build_view_submenu(app)?;
  let assistant = build_assistant_submenu(app)?;
  let window = build_window_submenu(app)?;
  let help = build_help_submenu(app)?;

  MenuBuilder::new(app)
    .items(&[&wonder, &file, &edit, &view, &assistant, &window, &help])
    .build()
}

// ---------------------------------------------------------------------------
// Wonder (app) menu — on macOS the first submenu is always shown as the
// application menu using the app's bundle name, regardless of the title we
// pass here. We still label it "Wonder" so other platforms read correctly.
// ---------------------------------------------------------------------------

fn build_app_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  let about = PredefinedMenuItem::about(app, Some("About Wonder"), None)?;
  let settings = MenuItemBuilder::new("Settings…")
    .id("app.settings")
    .accelerator("CmdOrCtrl+,")
    .build(app)?;
  let services = PredefinedMenuItem::services(app, None)?;
  let hide = PredefinedMenuItem::hide(app, None)?;
  let hide_others = PredefinedMenuItem::hide_others(app, None)?;
  let show_all = PredefinedMenuItem::show_all(app, None)?;
  let quit = PredefinedMenuItem::quit(app, None)?;

  SubmenuBuilder::new(app, "Wonder")
    .item(&about)
    .separator()
    .item(&settings)
    .separator()
    .item(&services)
    .separator()
    .item(&hide)
    .item(&hide_others)
    .item(&show_all)
    .separator()
    .item(&quit)
    .build()
}

// ---------------------------------------------------------------------------
// File menu — project lifecycle. Save/SaveAs/Export require a loaded project,
// but we don't conditionally disable them here: the frontend action handlers
// are already no-ops when there's nothing to save, and keeping the menu
// state static avoids a round-trip every time the store changes.
// ---------------------------------------------------------------------------

fn build_file_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "File")
    .item(
      &MenuItemBuilder::new("New Project")
        .id("file.new")
        .accelerator("CmdOrCtrl+N")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Open Project…")
        .id("file.open")
        .accelerator("CmdOrCtrl+O")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Save")
        .id("file.save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Save As…")
        .id("file.save_as")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Export Current Component…")
        .id("file.export")
        .accelerator("CmdOrCtrl+E")
        .build(app)?,
    )
    .separator()
    // Xcode-style: ⌘⇧W closes the project (returns to launcher); the
    // native ⌘W is reserved for "Close Window" in the Window menu.
    .item(
      &MenuItemBuilder::new("Close Project")
        .id("file.close")
        .accelerator("CmdOrCtrl+Shift+W")
        .build(app)?,
    )
    .build()
}

// ---------------------------------------------------------------------------
// Edit menu — Undo/Redo are Wonder's own history (not the webview's DOM
// undo). Cut/Copy/Paste/Select-All are predefined so they route to the
// focused text input the way users expect.
// ---------------------------------------------------------------------------

fn build_edit_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "Edit")
    .item(
      &MenuItemBuilder::new("Undo")
        .id("edit.undo")
        .accelerator("CmdOrCtrl+Z")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Redo")
        .id("edit.redo")
        .accelerator("CmdOrCtrl+Shift+Z")
        .build(app)?,
    )
    .separator()
    .item(&PredefinedMenuItem::cut(app, None)?)
    .item(&PredefinedMenuItem::copy(app, None)?)
    .item(&PredefinedMenuItem::paste(app, None)?)
    .item(&PredefinedMenuItem::select_all(app, None)?)
    .build()
}

// ---------------------------------------------------------------------------
// View menu — panel visibility, center view switcher, canvas zoom. Shortcuts
// mirror the ones Topbar.tsx registers, but the native menu version is what
// fires under Tauri (the OS eats the keystroke before it reaches the
// webview).
// ---------------------------------------------------------------------------

fn build_view_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "View")
    .item(
      &MenuItemBuilder::new("Toggle Left Sidebar")
        .id("view.toggle_left")
        .accelerator("CmdOrCtrl+1")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Toggle Right Sidebar")
        .id("view.toggle_right")
        .accelerator("CmdOrCtrl+2")
        .build(app)?,
    )
    // No accelerator — ⌘/ would steal Monaco's "Toggle Line Comment" and
    // other natural picks (⌘J, ⌘P) are already taken. Users reach this via
    // the menu.
    .item(
      &MenuItemBuilder::new("Toggle Code Panel")
        .id("view.toggle_bottom")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Design Canvas")
        .id("view.canvas")
        .accelerator("CmdOrCtrl+Alt+1")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Tokens Studio")
        .id("view.tokens")
        .accelerator("CmdOrCtrl+Alt+2")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Zoom In")
        .id("view.zoom_in")
        .accelerator("CmdOrCtrl+=")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Zoom Out")
        .id("view.zoom_out")
        .accelerator("CmdOrCtrl+-")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Reset Zoom")
        .id("view.zoom_reset")
        .accelerator("CmdOrCtrl+0")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Reset Layout")
        .id("view.reset_layout")
        .build(app)?,
    )
    .build()
}

// ---------------------------------------------------------------------------
// Assistant menu — Wonder's own surface: chat, preview, design-system
// extraction. Lives as a top-level menu so users learn these are "Wonder
// things" rather than buried under View.
// ---------------------------------------------------------------------------

fn build_assistant_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "Assistant")
    .item(
      &MenuItemBuilder::new("Toggle Chat")
        .id("assistant.toggle_chat")
        .accelerator("CmdOrCtrl+J")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Open Preview")
        .id("assistant.preview")
        .accelerator("CmdOrCtrl+P")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::new("Extract Design System…")
        .id("assistant.extract_ds")
        .build(app)?,
    )
    .build()
}

// ---------------------------------------------------------------------------
// Window menu — standard macOS behaviours. We use the predefined items so
// ⌘M / ⌘W / zoom all do exactly what the OS expects.
// ---------------------------------------------------------------------------

fn build_window_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "Window")
    .item(&PredefinedMenuItem::minimize(app, None)?)
    .item(&PredefinedMenuItem::maximize(app, None)?)
    .separator()
    .item(&PredefinedMenuItem::close_window(app, None)?)
    .build()
}

// ---------------------------------------------------------------------------
// Help menu — custom items that fire menu events (the frontend decides where
// "docs" and "report issue" navigate to, so we don't hardcode URLs here).
// ---------------------------------------------------------------------------

fn build_help_submenu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
  SubmenuBuilder::new(app, "Help")
    .item(
      &MenuItemBuilder::new("Wonder Documentation")
        .id("help.docs")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::new("Report an Issue")
        .id("help.issue")
        .build(app)?,
    )
    .build()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // File system + native dialogs power the project open/save flow.
    // The JS side uses @tauri-apps/plugin-fs and @tauri-apps/plugin-dialog;
    // permissions are declared in src-tauri/capabilities/default.json.
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_dialog::init())
    // HTTP plugin powers LLM API calls from the webview without CORS
    // restrictions. Allowed URL scopes are declared in the capabilities file;
    // JS side uses @tauri-apps/plugin-http.
    .plugin(tauri_plugin_http::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Install the native menu. Failure here is non-fatal — the app still
      // works, the user just loses the top-bar menu.
      match build_menu(app.handle()) {
        Ok(menu) => {
          if let Err(e) = app.set_menu(menu) {
            log::warn!("[wonder] failed to install native menu: {e}");
          }
        }
        Err(e) => log::warn!("[wonder] failed to build native menu: {e}"),
      }
      Ok(())
    })
    .on_menu_event(|app, event| {
      // Every custom menu item emits its string id to the webview. The
      // frontend (useNativeMenu) maintains the mapping from id → store
      // action. Predefined items (Cut/Copy/Paste/etc.) are handled by the
      // OS and never reach this callback.
      let id = event.id().as_ref().to_string();
      if let Err(e) = app.emit("wonder:menu", id.clone()) {
        log::warn!("[wonder] failed to emit menu event {id}: {e}");
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
