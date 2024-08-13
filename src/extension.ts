import * as vscode from "vscode";
import { NoteProvider } from "./noteProvider";
import { NoteTreeView, NoteItem } from "./noteTreeView";
import { Note } from "./types";

export let activeNotes: Map<
  string,
  Map<string, { range: vscode.Range; content: string }>
> = new Map();

function updateActiveNotes(fileName: string, note: Note) {
  if (!activeNotes.has(fileName)) {
    activeNotes.set(fileName, new Map());
  }
  const range = new vscode.Range(
    note.startLine,
    note.startCharacter,
    note.endLine,
    note.endCharacter
  );
  activeNotes.get(fileName)!.set(note.id, { range, content: note.content });
}

export function activate(context: vscode.ExtensionContext) {
  const noteProvider = new NoteProvider(context);
  const noteTreeView = new NoteTreeView(noteProvider);
  const treeView = vscode.window.createTreeView("codeNotesExplorer", {
    treeDataProvider: noteTreeView,
    showCollapseAll: true,
  });

  noteProvider.setTreeView(treeView, noteTreeView);

  const hoverProvider = vscode.languages.registerHoverProvider(
    { scheme: "file" },

    {
      provideHover(document, position, token) {
        const fileName = document.uri.fsPath;
        const fileNotes = activeNotes.get(fileName);
        if (fileNotes) {
          for (const [key, value] of fileNotes) {
            if (value.range.contains(position)) {
              const latestNote = noteProvider.getNoteById(fileName, key);
              if (latestNote) {
                return new vscode.Hover(latestNote.content);
              }
            }
          }
        }
        return null;
      },
    }
  );

  context.subscriptions.push(hoverProvider);

  context.subscriptions.push(
    vscode.commands.registerCommand("code-notes.addNote", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const document = editor.document;
        const selection = editor.selection;

        const content = await vscode.window.showInputBox({
          prompt: "Enter note content",
        });
        if (content) {
          await noteProvider.addNote(
            document.fileName,
            selection.start.line,
            selection.start.character,
            selection.end.line,
            selection.end.character,
            content
          );

          noteTreeView.refresh();

          vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Note added successfully",
              cancellable: false,
            },
            async (progress) => {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          );
        }
      } else {
        vscode.window.showErrorMessage("No active text editor");
      }
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const fileName = event.document.uri.fsPath;
      if (noteProvider.getNotes().has(fileName)) {
        noteProvider.updateActiveNotes(fileName);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "code-notes.deleteNote",
      async (item: NoteItem) => {
        if (item.note && item.resourceUri) {
          console.log(
            `Deleting note: ${item.note.id} from ${item.resourceUri.fsPath}`
          );
          const deleted = await noteProvider.deleteNote(
            item.resourceUri.fsPath,
            item.note.id
          );
          if (deleted) {
            console.log("Note deleted, refreshing view");
            noteTreeView.refresh();

            vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Note deleted successfully",
                cancellable: false,
              },
              async (progress) => {
                await new Promise((resolve) => setTimeout(resolve, 500));
              }
            );
          } else {
            console.log("Failed to delete note");
            vscode.window.showErrorMessage("Failed to delete note");
          }
        } else {
          console.log("Invalid item for deletion");
          vscode.window.showErrorMessage("Invalid item selected for deletion");
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "code-notes.openNote",
      async (uri: vscode.Uri, note: Note) => {
        try {
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document);

          const range = new vscode.Range(
            note.startLine,
            note.startCharacter,
            note.endLine,
            note.endCharacter
          );

          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range);

          const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: "rgba(255,255,0,0.3)", // yellow background
          });

          // applay decoration
          editor.setDecorations(decorationType, [range]);

          // update active notes Map
          updateActiveNotes(uri.fsPath, note);

          // remove decoration after 5 seconds
          setTimeout(() => {
            editor.setDecorations(decorationType, []);
          }, 1500);
        } catch (error) {
          console.error("Error opening note:", error);
          vscode.window.showErrorMessage(
            "Failed to open the note. The file may have been moved or deleted."
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      activeNotes.delete(doc.uri.fsPath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "code-notes.openNoteEditor",
      (item: NoteItem) => {
        if (item.note && item.resourceUri) {
          const noteUri = vscode.Uri.parse(
            `untitled:Note-${item.note.id}.codenote`
          ).with({
            query: `noteId=${item.note.id}&filePath=${encodeURIComponent(
              item.resourceUri.fsPath
            )}`,
          });
          vscode.commands.executeCommand(
            "vscode.openWith",
            noteUri,
            "codeNotes.noteEditor"
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "codeNotes.noteEditor",
      new (class implements vscode.CustomTextEditorProvider {
        async resolveCustomTextEditor(
          document: vscode.TextDocument,
          webviewPanel: vscode.WebviewPanel,
          _token: vscode.CancellationToken
        ): Promise<void> {
          const params = new URLSearchParams(document.uri.query);
          const noteId = params.get("noteId");
          const filePath = params.get("filePath");

          let content = "";
          if (noteId && filePath) {
            const note = await noteProvider.getNoteById(
              decodeURIComponent(filePath),
              noteId
            );
            if (note) {
              content = note.content;
            }
          }

          webviewPanel.webview.options = {
            enableScripts: true,
          };
          webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            content
          );

          const updateWebview = () => {
            webviewPanel.webview.postMessage({
              type: "update",
              text: content,
            });
          };

          webviewPanel.webview.onDidReceiveMessage((e) => {
            switch (e.type) {
              case "edit":
                content = e.content;
                if (noteId && filePath) {
                  noteProvider.updateNoteContent(
                    decodeURIComponent(filePath),
                    noteId,
                    content
                  );
                }
                return;
            }
          });

          updateWebview();
        }

        private getHtmlForWebview(
          webview: vscode.Webview,
          content: string
        ): string {
          return `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Code Note Editor</title>
                  <style>
                      body {
                          font-family: Arial, sans-serif;
                          padding: 10px;
                      }
                      #editor {
                          width: 100%;
                          height: 300px;
                          border: 1px solid #ccc;
                          padding: 5px;
                      }
                  </style>
              </head>
              <body>
                  <textarea id="editor">${content}</textarea>
                  <script>
                      const vscode = acquireVsCodeApi();
                      const editor = document.getElementById('editor');
                      editor.addEventListener('input', () => {
                          vscode.postMessage({
                              type: 'edit',
                              content: editor.value
                          });
                      });
                      window.addEventListener('message', event => {
                          const message = event.data;
                          switch (message.type) {
                              case 'update':
                                  editor.value = message.text;
                                  break;
                          }
                      });
                  </script>
              </body>
              </html>
            `;
        }
      })(),
      {
        supportsMultipleEditorsPerDocument: false,
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );
}

export function deactivate() {
  activeNotes.clear();
}
