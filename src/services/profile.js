import { request } from './api.js';

/** The signed-in person's optional details. Row-level security returns only their own row (or none yet). */
export async function fetchProfile() {
  const rows = await request('profiles?select=*&limit=1');
  return rows[0] || null;
}

export function saveProfile(userId, fields) {
  return request('profiles?on_conflict=user_id', {
    method: 'POST',
    body: { user_id: userId, ...fields, updated_at: new Date().toISOString() },
    prefer: 'resolution=merge-duplicates,return=minimal',
  });
}
