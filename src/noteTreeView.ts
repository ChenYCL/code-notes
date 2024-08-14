import * as vscode from "vscode";
import { NoteProvider } from "./noteProvider";
import { Note, NoteFile } from "./types";

export class NoteTreeView implements vscode.TreeDataProvider<NoteItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    NoteItem | undefined | null | void
  > = new vscode.EventEmitter<NoteItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    NoteItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private noteProvider: NoteProvider) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: NoteItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: NoteItem): Thenable<NoteItem[]> {
    if (element) {
      // This is a file, return its notes
      return Promise.resolve(
        element.noteFile?.notes.map((note) =>
          this.createNoteItem(element.resourceUri!, note)
        ) || []
      );
    } else {
      // Root of the tree, return files
      const notes = this.noteProvider.getNotes();
      return Promise.resolve(
        Array.from(notes.entries()).map(([fileName, noteFile]) =>
          this.createFileItem(fileName, noteFile)
        )
      );
    }
  }

  private createNoteItem(fileUri: vscode.Uri, note: Note): NoteItem {
    return new NoteItem(
      `${note.content.substring(0, 30)}...`,
      vscode.TreeItemCollapsibleState.None,
      {
        command: "code-notes.openNote",
        title: "Open Note",
        arguments: [fileUri, note],
      },
      this.getTooltip(fileUri.fsPath, note),
      fileUri,
      undefined,
      note,
      "note",
      {
        title: "Delete",
        command: "code-notes.deleteNote",
        arguments: [fileUri.fsPath, note.id],
      }
    );
  }

  private createFileItem(fileName: string, noteFile: NoteFile): NoteItem {
    return new NoteItem(
      fileName,
      vscode.TreeItemCollapsibleState.Collapsed,
      undefined,
      undefined,
      vscode.Uri.file(fileName),
      noteFile
    );
  }

  private formatRange(note: Note): string {
    if (note.startLine === note.endLine) {
      return `Line ${note.startLine + 1}:${note.startCharacter + 1}-${
        note.endCharacter + 1
      }`;
    }
    return `Line ${note.startLine + 1}:${note.startCharacter + 1} - ${
      note.endLine + 1
    }:${note.endCharacter + 1}`;
  }

  private getTooltip(fileName: string, note: Note): string {
    return `File: ${fileName}\nRange: ${this.formatRange(note)}\nCreated: ${
      note.createdAt
    }\nUpdated: ${note.updatedAt}\n\nContent: ${note.content}`;
  }
}

export class NoteItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly tooltip?: string,
    public readonly resourceUri?: vscode.Uri,
    public readonly noteFile?: NoteFile,
    public readonly note?: Note,
    public readonly contextValue?: string,
    public readonly deleteCommand?: vscode.Command
  ) {
    super(label, collapsibleState);
    this.tooltip = tooltip || this.label;
    if (resourceUri) {
      this.resourceUri = resourceUri;
    }
    if (deleteCommand) {
      this.contextValue = contextValue;
      this.command = command;
    }
  }
}
