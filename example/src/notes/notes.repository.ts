import { Injectable } from '@nestjs/common';

export interface Note {
  id: string;
  ownerId: string;
  text: string;
  /** Users who may read, but not edit, the note. */
  sharedWith: ReadonlyArray<string>;
}

/** In-memory stand-in for a notes table, seeded so the app is explorable right away. */
@Injectable()
export class NotesRepository {
  private readonly notes = new Map<string, Note>([
    ['1', { id: '1', ownerId: 'alice', text: "Alice's note, shared with Bob", sharedWith: ['bob'] }],
    ['2', { id: '2', ownerId: 'bob', text: "Bob's private note", sharedWith: [] }],
  ]);
  private nextId = 3;

  async findById(id: string): Promise<Note | undefined> {
    return this.notes.get(id);
  }

  async findVisibleTo(userId: string): Promise<Array<Note>> {
    return [...this.notes.values()].filter(note => note.ownerId === userId || note.sharedWith.includes(userId));
  }

  async save(note: Omit<Note, 'id'> & { id?: string }): Promise<Note> {
    const saved = { ...note, id: note.id ?? String(this.nextId++) };
    this.notes.set(saved.id, saved);
    return saved;
  }
}
