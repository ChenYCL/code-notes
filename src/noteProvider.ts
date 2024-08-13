import * as vscode from "vscode";
import { Note, NoteFile } from "./types";
import * as crypto from "crypto";
import { NoteTreeView } from "./noteTreeView";
import * as fs from "fs";
import * as path from "path";
import { activeNotes } from "./extension";

export class NoteProvider {
  private notes: Map<string, NoteFile> = new Map();
  private treeView: vscode.TreeView<any> | undefined;
  private treeDataProvider: NoteTreeView | undefined;
  private notesFilePath: string;

  constructor(private context: vscode.ExtensionContext) {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      const vscodeDir = path.join(workspaceFolders[0].uri.fsPath, ".vscode");
      if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir);
      }
      this.notesFilePath = path.join(vscodeDir, ".code-notes");
    } else {
      this.notesFilePath = path.join(
        this.context.globalStoragePath,
        ".code-notes"
      );
    }
    this.loadNotes();
  }

  updateActiveNotes(fileName: string) {
    const noteFile = this.notes.get(fileName);
    if (noteFile) {
      if (!activeNotes.has(fileName)) {
        activeNotes.set(fileName, new Map());
      }
      const fileNotes = activeNotes.get(fileName)!;
      fileNotes.clear();
      for (const note of noteFile.notes) {
        const range = new vscode.Range(
          note.startLine,
          note.startCharacter,
          note.endLine,
          note.endCharacter
        );
        fileNotes.set(note.id, { range, content: note.content });
      }
    } else {
      activeNotes.delete(fileName);
    }
  }

  getNoteById(filePath: string, id: string): Note | undefined {
    const noteFile = this.notes.get(filePath);
    if (noteFile) {
      return noteFile.notes.find((note) => note.id === id);
    }
    return undefined;
  }

  async updateNoteContent(
    filePath: string,
    id: string,
    content: string
  ): Promise<void> {
    const noteFile = this.notes.get(filePath);
    if (noteFile) {
      const noteIndex = noteFile.notes.findIndex((note) => note.id === id);
      if (noteIndex !== -1) {
        noteFile.notes[noteIndex].content = content;
        noteFile.version += 1;
        await this.saveNotes();
        this.updateActiveNotes(filePath);
        this.refreshTreeView();
      }
    }
  }

  setTreeView(treeView: vscode.TreeView<any>, treeDataProvider: NoteTreeView) {
    this.treeView = treeView;
    this.treeDataProvider = treeDataProvider;
  }

  getNotes(): Map<string, NoteFile> {
    return this.notes;
  }

  addNote(
    fileName: string,
    startLine: number,
    startCharacter: number,
    endLine: number,
    endCharacter: number,
    content: string
  ): void {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      startLine,
      startCharacter,
      endLine,
      endCharacter,
      content,
      createdAt: now,
      updatedAt: now,
    };

    if (this.notes.has(fileName)) {
      const noteFile = this.notes.get(fileName)!;
      noteFile.notes.push(note);
      noteFile.version += 1;
      noteFile.fileHash = this.calculateFileHash(fileName);
    } else {
      this.notes.set(fileName, {
        version: 1,
        fileHash: this.calculateFileHash(fileName),
        notes: [note],
      });
    }

    this.saveNotes();
    this.refreshTreeView();
  }

  async deleteNote(fileName: string, noteId: string): Promise<boolean> {
    const noteFile = this.notes.get(fileName);
    if (noteFile) {
      const initialLength = noteFile.notes.length;
      noteFile.notes = noteFile.notes.filter((note) => note.id !== noteId);
      if (noteFile.notes.length < initialLength) {
        if (noteFile.notes.length === 0) {
          this.notes.delete(fileName);
        } else {
          noteFile.version += 1;
          noteFile.fileHash = await this.calculateFileHash(fileName);
        }
        await this.saveNotes();
        this.updateActiveNotes(fileName);
        this.refreshTreeView();
        return true;
      }
    }
    return false;
  }

  private loadNotes(): void {
    try {
      const data = fs.readFileSync(this.notesFilePath, "utf8");
      const savedNotes = JSON.parse(data);
      this.notes = new Map(Object.entries(savedNotes));
    } catch (error) {
      // If the file doesn't exist, create an empty notes map
      this.notes = new Map();
    }
  }

  private saveNotes(): void {
    const notesObject = Object.fromEntries(this.notes);
    fs.writeFileSync(this.notesFilePath, JSON.stringify(notesObject, null, 2));
  }

  private calculateFileHash(fileName: string): string {
    try {
      const fileContent = fs.readFileSync(fileName);
      return crypto.createHash("md5").update(fileContent).digest("hex");
    } catch (error) {
      console.error(`Error calculating file hash for ${fileName}:`, error);
      return "";
    }
  }

  private refreshTreeView(): void {
    if (this.treeDataProvider) {
      this.treeDataProvider.refresh();
    }
  }
}
