export interface Note {
  id: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFile {
  version: number;
  fileHash: string;
  notes: Note[];
}
