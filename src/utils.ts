import * as vscode from "vscode";
import * as crypto from "crypto";

export async function getFileHash(fileUri: vscode.Uri): Promise<string> {
  const fileContent = await vscode.workspace.fs.readFile(fileUri);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileContent);
  return hashSum.digest("hex");
}
