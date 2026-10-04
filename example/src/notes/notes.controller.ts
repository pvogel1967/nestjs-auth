import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthzScope, Identity, type IdentifiedExpressRequest } from '@pvogel/nestjs-auth';
import type { AppIdentity, UserBill } from '../identity';
import type { Note } from './notes.repository';
import { NotesService } from './notes.service';

type AppRequest = IdentifiedExpressRequest<AppIdentity>;

interface NoteBody {
  text: string;
  sharedWith?: ReadonlyArray<string>;
}

@Controller('notes')
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get()
  @AuthzScope('notes/list')
  list(@Identity() identity: UserBill) {
    return this.notes.listFor(identity.principal);
  }

  @Post()
  @AuthzScope('notes/create')
  create(@Identity() identity: UserBill, @Body() body: NoteBody) {
    return this.notes.create(identity.principal, body.text, body.sharedWith);
  }

  // The scope is built from the route param, so the rights tree checks this specific note.
  @Get(':noteId')
  @AuthzScope((req: AppRequest) => `notes/${req.params.noteId}/view`)
  view(@Param('noteId') _noteId: string, @Req() req: AppRequest): Note {
    return req.locals.note; // already loaded by the rights tree's `context`
  }

  @Patch(':noteId')
  @AuthzScope((req: AppRequest) => `notes/${req.params.noteId}/edit`)
  edit(@Param('noteId') _noteId: string, @Req() req: AppRequest, @Body() body: NoteBody) {
    return this.notes.update(req.locals.note, body.text);
  }
}
