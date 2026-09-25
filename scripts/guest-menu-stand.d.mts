import type { BarData } from '../src/barbar/domain/types';

export interface GuestMenuStand {
  origin: string;
  serverRendering: boolean;
  data: BarData;
  changed(): void;
  use(kind: 'page' | 'api', data: Pick<BarData, 'alcohol' | 'cocktails'> | undefined): void;
  close(): Promise<void>;
}
export function startGuestMenuStand(options?: {
  root?: string;
  dist?: string;
  /** Folder of owner photo files served at `/api/photos/`. */
  photos?: string;
}): Promise<GuestMenuStand>;
