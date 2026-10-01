import * as fs from 'fs';
import * as path from 'path';

// Named test identities are kept out of git. Copy identities.example.json to
// identities.local.json (gitignored) and fill in real names / Stage Keys.
// Missing file or entry → empty values, so the affected tests skip.

export interface NamedIdentity {
  name: string;
  stageKey: string;
}

export interface EmailIdentity extends NamedIdentity {
  searchText?: string;
}

interface LocalIdentities {
  workdayPrehire?: NamedIdentity[];
  workdayFuturehire?: NamedIdentity;
  emailNotification?: EmailIdentity;
}

const LOCAL_FILE = path.resolve(__dirname, 'identities.local.json');

function load(): LocalIdentities {
  if (!fs.existsSync(LOCAL_FILE)) return {};
  return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8')) as LocalIdentities;
}

export const LOCAL_IDENTITIES = load();

export const EMPTY_IDENTITY: NamedIdentity = { name: '', stageKey: '' };
