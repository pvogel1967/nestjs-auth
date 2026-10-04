import { Injectable } from '@nestjs/common';
import { AuthxRegistry } from '@pvogel/nestjs-auth';
import type { AppIdentifiedBill, AppIdentity, AppRightsTree, User } from '../identity';
import { type Note, NotesRepository } from './notes.repository';

@Injectable()
export class NotesService {
  // The notes branch of the rights tree lives next to the code it protects.
  #tree: AppRightsTree = {
    children: {
      // notes/list and notes/create: people only.
      list: { right: (_scopePart, req) => req.identity.isIdentified && req.identity.kind === 'user' },
      create: { right: (_scopePart, req) => req.identity.isIdentified && req.identity.kind === 'user' },
    },
    // notes/<noteId>/...
    wildcard: {
      // Load the note once for every right below (and for the handler). A note
      // that doesn't exist is a 403, not a 404, so IDs can't be probed.
      context: async (noteId, req) => {
        const note = await this.notes.findById(noteId);
        if (!note) {
          return false;
        }
        req.locals.note = note;
        return true;
      },
      children: {
        // notes/<noteId>/view: the owner, anyone it's shared with, admins, and
        // services (which are limited by their grants).
        view: {
          right: (_scopePart, req) => {
            const identity = req.identity;
            const note: Note = req.locals.note;
            if (identity.isAnonymous) {
              return false;
            }
            if (identity.kind === 'service') {
              return true;
            }
            const user = identity.principal;
            return user.admin || note.ownerId === user.id || note.sharedWith.includes(user.id);
          },
        },
        // notes/<noteId>/edit: the owner and admins only.
        edit: {
          right: (_scopePart, req) => {
            const identity = req.identity;
            const note: Note = req.locals.note;
            return identity.isIdentified && identity.kind === 'user' && (identity.principal.admin || note.ownerId === identity.principal.id);
          },
        },
      },
    },
  };

  constructor(
    registry: AuthxRegistry<AppIdentity, AppIdentifiedBill>,
    private readonly notes: NotesRepository,
  ) {
    registry.addToRightsTree('notes', this.#tree);
  }

  listFor(user: User): Promise<Array<Note>> {
    return this.notes.findVisibleTo(user.id);
  }

  create(owner: User, text: string, sharedWith: ReadonlyArray<string> = []): Promise<Note> {
    return this.notes.save({ ownerId: owner.id, text, sharedWith });
  }

  update(note: Note, text: string): Promise<Note> {
    return this.notes.save({ ...note, text });
  }
}
