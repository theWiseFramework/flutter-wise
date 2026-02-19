import * as vscode from "vscode";

type BoolMap = Record<string, boolean>;

function pickMapKeys(map: BoolMap): string[] {
  return Object.keys(map);
}

/**
 * Add only the keys in `add` to the TARGET scope object, without copying
 * inherited keys from user/default settings into workspace settings.
 *
 * Returns the keys that were actually added (not already present in target).
 */
export async function addKeysToWorkspaceObjectSetting(params: {
  scopeUri: vscode.Uri;
  section: string; // e.g. "files"
  key: string; // e.g. "exclude"
  add: BoolMap; // the patterns we want to ensure exist
}): Promise<string[]> {
  const { scopeUri, section, key, add } = params;

  // This reads the effective config, BUT we will only write our keys.
  // We also track what we add so we can undo precisely later.
  const config = vscode.workspace.getConfiguration(section, scopeUri);
  const current = (config.get<BoolMap>(key) ?? {}) as BoolMap;

  const next: BoolMap = { ...current };
  const added: string[] = [];

  for (const [glob, value] of Object.entries(add)) {
    if (!(glob in next)) {
      next[glob] = value;
      added.push(glob);
    }
  }

  // If nothing changed, don’t write.
  if (added.length === 0) {
    return [];
  }

  await config.update(key, next, vscode.ConfigurationTarget.WorkspaceFolder);

  return added;
}

/**
 * Remove only the keys listed in `removeGlobs` from the workspace object setting.
 * Does not touch other keys (user’s custom excludes remain).
 */
export async function removeKeysFromWorkspaceObjectSetting(params: {
  scopeUri: vscode.Uri;
  section: string;
  key: string;
  removeGlobs: string[];
}): Promise<number> {
  const { scopeUri, section, key, removeGlobs } = params;

  const config = vscode.workspace.getConfiguration(section, scopeUri);
  const current = (config.get<BoolMap>(key) ?? {}) as BoolMap;

  let removedCount = 0;
  const next: BoolMap = { ...current };

  for (const glob of removeGlobs) {
    if (glob in next) {
      delete next[glob];
      removedCount++;
    }
  }

  if (removedCount === 0) {
    return 0;
  }

  await config.update(key, next, vscode.ConfigurationTarget.WorkspaceFolder);
  return removedCount;
}

export function mapKeys(map: BoolMap) {
  return pickMapKeys(map);
}
