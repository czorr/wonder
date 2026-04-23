import {
  BaseDirectory,
  exists,
  mkdir,
  readTextFile,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { ProviderId } from "@/agent/models";

// ---------------------------------------------------------------------------
// Secrets storage.
//
// API keys live in `$APPDATA/secrets.json` in plain text — this is NOT an
// encrypted keychain integration. That's an intentional tradeoff for now:
// Tauri's macOS keychain plugin adds a permissions dance, and the threat model
// for a local dev tool is "another process with your user privileges can
// already do worse." We can upgrade to keychain later without changing the
// callsites (the `loadApiKey` / `saveApiKey` shape stays the same).
//
// The file is keyed by provider id so we can keep multiple keys around —
// you might have an OpenAI key and an Anthropic key in flight simultaneously
// when switching models.
// ---------------------------------------------------------------------------

const SECRETS_FILE = "secrets.json";

type SecretsFile = {
  version: 1;
  // Partial record: absent keys mean "user hasn't entered one yet."
  apiKeys: Partial<Record<ProviderId, string>>;
};

const EMPTY: SecretsFile = { version: 1, apiKeys: {} };

let memo: SecretsFile | null = null;

async function read(): Promise<SecretsFile> {
  if (memo) return memo;
  try {
    if (!(await exists(SECRETS_FILE, { baseDir: BaseDirectory.AppData }))) {
      memo = { ...EMPTY, apiKeys: {} };
      return memo;
    }
    const raw = await readTextFile(SECRETS_FILE, {
      baseDir: BaseDirectory.AppData,
    });
    const parsed = JSON.parse(raw) as Partial<SecretsFile>;
    memo = {
      version: 1,
      apiKeys:
        parsed.apiKeys && typeof parsed.apiKeys === "object"
          ? (parsed.apiKeys as SecretsFile["apiKeys"])
          : {},
    };
    return memo;
  } catch (err) {
    // A corrupted secrets file should not brick chat — treat as empty so the
    // user can re-enter their key from the Settings modal.
    console.warn("[wonder] Could not load secrets.json:", err);
    memo = { ...EMPTY, apiKeys: {} };
    return memo;
  }
}

async function write(next: SecretsFile): Promise<void> {
  memo = next;
  try {
    try {
      await mkdir("", { baseDir: BaseDirectory.AppData, recursive: true });
    } catch {
      // fine — already exists
    }
    await writeTextFile(SECRETS_FILE, JSON.stringify(next, null, 2) + "\n", {
      baseDir: BaseDirectory.AppData,
    });
  } catch (err) {
    // Surface to the caller so the Settings modal can show an error toast.
    throw new Error(
      `Could not save API key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Read the saved API key for a provider, or null if none has been set.
 */
export async function loadApiKey(provider: ProviderId): Promise<string | null> {
  const state = await read();
  return state.apiKeys[provider] ?? null;
}

/**
 * Persist the API key for a provider. Passing an empty string removes it —
 * that lets the Settings modal implement a "clear" action without a separate
 * API.
 */
export async function saveApiKey(
  provider: ProviderId,
  key: string,
): Promise<void> {
  const state = await read();
  const next: SecretsFile = {
    ...state,
    apiKeys: { ...state.apiKeys },
  };
  if (key) {
    next.apiKeys[provider] = key;
  } else {
    delete next.apiKeys[provider];
  }
  await write(next);
}

/** Returns the set of providers that currently have a stored key. */
export async function providersWithKey(): Promise<ProviderId[]> {
  const state = await read();
  return (Object.keys(state.apiKeys) as ProviderId[]).filter(
    (p) => !!state.apiKeys[p],
  );
}
