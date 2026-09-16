/** Index rows by id once, instead of scanning the list again inside a render loop. */
export const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));
